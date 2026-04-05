const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const docsIndexPath = path.join(rootDir, 'docs', 'index.html');
const releaseJsonPath = path.join(rootDir, 'docs', 'release.json');

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const docsIndex = fs.readFileSync(docsIndexPath, 'utf8');
const releaseMeta = JSON.parse(fs.readFileSync(releaseJsonPath, 'utf8'));

const expectedVersion = pkg.version;
const versionInStructuredData = docsIndex.match(/"softwareVersion":\s*"([^"]+)"/)?.[1];
const versionInBadge = docsIndex.match(
  /<span class="tag" id="versionBadge">v([^<]+)<\/span>/
)?.[1];

const failures = [];

if (versionInStructuredData !== expectedVersion) {
  failures.push(
    `docs/index.html structured data version is "${versionInStructuredData}", expected "${expectedVersion}".`
  );
}

if (versionInBadge !== expectedVersion) {
  failures.push(
    `docs/index.html badge version is "${versionInBadge}", expected "${expectedVersion}".`
  );
}

if (releaseMeta.version !== expectedVersion) {
  failures.push(
    `docs/release.json version is "${releaseMeta.version}", expected "${expectedVersion}".`
  );
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`Site release metadata matches package.json version ${expectedVersion}\n`);
