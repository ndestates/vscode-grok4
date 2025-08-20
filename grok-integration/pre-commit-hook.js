const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHANGELOG_PATH = './docs/CHANGELOG.md';  // Adjust the file name

const changedFiles = execSync('git diff --cached --name-only').toString().trim().split('\n');
const extensionTsChanged = changedFiles.includes('extension.ts');

if (extensionTsChanged) {
  // Bump the patch version in package.json
  execSync('npm version patch --no-git-tag-version');

  // Append to CHANGELOG.md
  const changelogPath = path.join(__dirname, CHANGELOG_PATH);  // Uses the defined constant
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const logEntry = `\n## [Unreleased]\n\n### Changes:\n- Minor update to extension.ts on ${date}\n`;

  fs.appendFileSync(changelogPath, logEntry);
  console.log('Version bumped and changelog updated.');
}