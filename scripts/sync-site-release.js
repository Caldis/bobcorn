const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const docsIndexPath = path.join(rootDir, 'docs', 'index.html');
const releaseJsonPath = path.join(rootDir, 'docs', 'release.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function replaceOnce(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Could not find ${label} in ${docsIndexPath}`);
  }
  return source.replace(pattern, replacement);
}

const changelogJsonPath = path.join(rootDir, 'docs', 'changelog.json');

const pkg = readJson(packageJsonPath);
const publish = pkg.build?.publish ?? {};
const owner = publish.owner || 'Caldis';
const repo = publish.repo || pkg.name;
const version = pkg.version;
const tag = `v${version}`;

// Validate changelog.json has an entry for this version
const changelog = readJson(changelogJsonPath);
if (!Array.isArray(changelog) || !changelog.length || changelog[0].version !== version) {
  const found = changelog[0]?.version || '(empty)';
  process.stderr.write(
    `\n❌ docs/changelog.json top entry is "${found}", expected "${version}".\n\n` +
    `To fix, prepend a new entry to docs/changelog.json:\n` +
    `  {\n` +
    `    "version": "${version}",\n` +
    `    "date": "YYYY-MM-DD",\n` +
    `    "summary": { "zh": "简短摘要", "en": "Brief summary" },\n` +
    `    "changes": { "zh": ["条目..."], "en": ["Items..."] }\n` +
    `  }\n\n` +
    `Generate from: git log ${found ? 'v' + found : 'HEAD~5'}..HEAD --oneline\n` +
    `Then commit and re-run npm version.\n\n`
  );
  process.exit(1);
}

const releasesUrl = `https://github.com/${owner}/${repo}/releases`;
const latestUrl = `${releasesUrl}/latest`;
const releaseUrl = `${releasesUrl}/tag/${tag}`;

const dlBase = `${releasesUrl}/download/${tag}`;
const releaseMeta = {
  version,
  tag,
  repo: `${owner}/${repo}`,
  releasesUrl,
  latestUrl,
  releaseUrl,
  downloads: {
    windows: `${dlBase}/Bobcorn-Setup-${version}.exe`,
    mac: `${dlBase}/Bobcorn-${version}.dmg`,
    'mac-arm64': `${dlBase}/Bobcorn-${version}-arm64.dmg`,
    linux: `${dlBase}/Bobcorn-${version}.AppImage`,
    default: latestUrl,
  },
};

fs.writeFileSync(releaseJsonPath, `${JSON.stringify(releaseMeta, null, 2)}\n`);

let docsIndex = fs.readFileSync(docsIndexPath, 'utf8');

docsIndex = replaceOnce(
  docsIndex,
  /"softwareVersion":\s*"[^"]+"/,
  `"softwareVersion": "${version}"`,
  'structured data softwareVersion'
);
docsIndex = replaceOnce(
  docsIndex,
  /"downloadUrl":\s*"[^"]+"/,
  `"downloadUrl": "${latestUrl}"`,
  'structured data downloadUrl'
);
docsIndex = replaceOnce(
  docsIndex,
  /"installUrl":\s*"[^"]+"/,
  `"installUrl": "${latestUrl}"`,
  'structured data installUrl'
);
docsIndex = replaceOnce(
  docsIndex,
  /(<span class="tag" id="versionBadge">)v[^<]+(<\/span>)/,
  `$1v${version}$2`,
  'version badge'
);
docsIndex = replaceOnce(
  docsIndex,
  /(<a id="downloadBtn" href=")[^"]+(" class="btn-download">)/,
  `$1${latestUrl}$2`,
  'primary download button href'
);

fs.writeFileSync(docsIndexPath, docsIndex);

process.stdout.write(
  `Synced site release metadata to ${version} (${tag}) in docs/index.html and docs/release.json\n`
);
