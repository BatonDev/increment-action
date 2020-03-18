'use strict';

const core = require('@actions/core');
const exec = require('@actions/exec');
const github = require('@actions/github');
const fs = require('fs-extra');
const path = require('path');

const token = core.getInput('token');

if (!token) {
  throw new Error('Input required and not supplied: token');
}

const throwErrors = err => {
  if (err) {
    throw err;
  }
};

async function main() {
  try {

    // the following is for shell output capture
    let myOutput = '';
    let myError = '';
    const options = {};
    options.listeners = {
      stdout: (data) => {
        myOutput += data.toString();
      },
      stderr: (data) => {
        myError += data.toString();
      }
    };
    // options.cwd = './lib';

    // configure git context
    console.log('Configuring git...');
    await exec.exec('git', ['config', '--local', 'user.name', core.getInput('authorName')]);
    await exec.exec('git', ['config', '--local', 'user.email', core.getInput('authorEmail')]);
    fs.writeFileSync(path.join(process.env.HOME, '.netrc'), `
      machine github.com
      login ${process.env.GITHUB_REPOSITORY.replace(/\/.+/, '')}
      password ${token}
      `, throwErrors);

    // get all the required values
    const CURRENT_REF = github.context.ref;
    let refSplit = CURRENT_REF.split('/');
    const CURRENT_BRANCH = refSplit[refSplit.length - 1];
    console.log(`CURRENT_BRANCH = ${CURRENT_BRANCH}`);
    await exec.exec('mvn', ['org.apache.maven.plugins:maven-help-plugin:3.2.0:evaluate', '-Dexpression=project.version', '-q', '-DforceStdout'], options);
    const CURRENT_VERSION = myOutput.trim(); myOutput = '';
    console.log(`CURRENT_VERSION = ${CURRENT_VERSION}`);
    const CURRENT_VERSION_YEAR = CURRENT_VERSION.split('.')[0];
    const CURRENT_VERSION_MONTH = CURRENT_VERSION.split('.')[1];
    const CURRENT_VERSION_PATCH = CURRENT_VERSION.split('.')[2];
    console.log(`CURRENT_VERSION_YEAR = ${CURRENT_VERSION_YEAR}`);
    console.log(`CURRENT_VERSION_MONTH = ${CURRENT_VERSION_MONTH}`);
    console.log(`CURRENT_VERSION_PATCH = ${CURRENT_VERSION_PATCH}`);
    await exec.exec('date', ['+%-m'], options);
    const CURRENT_MONTH = myOutput.trim(); myOutput = '';
    console.log(`CURRENT_MONTH = ${CURRENT_MONTH}`);
    await exec.exec('date', ['+%y'], options);
    const CURRENT_YEAR = (myOutput - 18).toString().trim(); myOutput = '';
    console.log(`CURRENT_YEAR = ${CURRENT_YEAR}`);

    // determine next version
    console.log('Incrementing version...');
    let NEW_VERSION_YEAR = CURRENT_YEAR;
    let NEW_VERSION_MONTH = CURRENT_MONTH;
    let NEW_VERSION_PATCH = CURRENT_VERSION_PATCH;
    if(CURRENT_BRANCH.endsWith('-hotfix')) {
      console.log('incrementing a hotfix branch');
      NEW_VERSION_YEAR = CURRENT_VERSION_YEAR;
      NEW_VERSION_MONTH = CURRENT_VERSION_MONTH;
      // if we are incrementing on a hotfix branch, look for the hotfix ID [-HF#]
      if (CURRENT_VERSION_PATCH.split('-HF').length < 2) {
        NEW_VERSION_PATCH = CURRENT_VERSION_PATCH + '-HF0';
      } else {
        const HOTFIX_VERSION_ID = Number(CURRENT_VERSION_PATCH.split('-HF')[1]) + 1;
        NEW_VERSION_PATCH = CURRENT_VERSION_PATCH.split('-')[0] + '-HF' + HOTFIX_VERSION_ID;
      }
    } else{
      NEW_VERSION_PATCH = (Number(CURRENT_VERSION_PATCH) + 1).toString();
      if(CURRENT_VERSION_MONTH != CURRENT_MONTH || CURRENT_VERSION_YEAR != CURRENT_YEAR) {
        NEW_VERSION_PATCH = '0';
      }
    }
    const NEW_VERSION = NEW_VERSION_YEAR + '.' + NEW_VERSION_MONTH + '.' + NEW_VERSION_PATCH;
    console.log(`NEW_VERSION = ${NEW_VERSION}`);

    // determine tag 
    await exec.exec('mvn', ['org.apache.maven.plugins:maven-help-plugin:3.2.0:evaluate', '-Dexpression=project.name', '-q', '-DforceStdout'], options);
    const PROJECT_NAME = myOutput; myOutput = '';
    await exec.exec('mvn', ['org.apache.maven.plugins:maven-help-plugin:3.2.0:evaluate', '-Dexpression=project.version', '-q', '-DforceStdout'], options);
    const PROJECT_VERSION = myOutput; myOutput = '';
    const TAG_NAME = PROJECT_NAME + '-' + PROJECT_VERSION;

    // commit new version
    console.log('committing new version');
    await exec.exec('git', ['checkout', CURRENT_BRANCH]);
    await exec.exec('mvn', ['build-helper:parse-version', 'versions:set', `-DnewVersion=${NEW_VERSION}`, 'versions:commit', '--no-transfer-progress']);
    await exec.exec('git', ['add', 'pom.xml']);
    await exec.exec('git', ['commit', '-m', TAG_NAME]);

    // tag new version
    console.log(`tagging version ${TAG_NAME}`);
    await exec.exec('git', ['tag', '-a', TAG_NAME, '-m', TAG_NAME]);
    await exec.exec('git', ['push', '--follow-tags']);
    console.log('...done');
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();
