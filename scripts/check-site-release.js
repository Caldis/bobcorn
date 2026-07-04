const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const docsIndexPath = path.join(rootDir, 'docs', 'index.html');
const releaseJsonPath = path.join(rootDir, 'docs', 'release.json');
const changelogJsonPath = path.join(rootDir, 'docs', 'changelog.json');

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

// A stable release MUST ship user-facing release notes. Enforce that
// docs/changelog.json carries an entry (with a non-empty summary) for the
// current version, so the release body / in-app update card never end up empty.
// Pre-releases (beta/alpha/rc — any version containing "-") are exempt.
const isPrerelease = expectedVersion.includes('-');
if (!isPrerelease) {
  try {
    const changelog = JSON.parse(fs.readFileSync(changelogJsonPath, 'utf8'));
    if (!Array.isArray(changelog)) {
      failures.push('docs/changelog.json must be a JSON array of entries.');
    } else {
      const entry = changelog.find((e) => e && e.version === expectedVersion);
      if (!entry) {
        failures.push(
          `docs/changelog.json has no entry for version "${expectedVersion}". ` +
            'Add a changelog entry before releasing (see docs/RELEASE.md).'
        );
      } else if (!entry.summary || (!entry.summary.en && !entry.summary.zh)) {
        failures.push(
          `docs/changelog.json entry for "${expectedVersion}" has an empty summary.`
        );
      }
    }
  } catch (err) {
    failures.push(`Failed to read docs/changelog.json: ${err.message}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`Site release metadata matches package.json version ${expectedVersion}\n`);
