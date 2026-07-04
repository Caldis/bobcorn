#!/usr/bin/env node
/**
 * Extract the curated release-notes markdown for a given version from
 * docs/changelog.json and print it to stdout.
 *
 * Usage:
 *   node scripts/changelog-to-release-notes.js <version>
 *
 * <version> may include a leading "v" (e.g. "v1.13.0" or "1.13.0").
 * If omitted, package.json's version is used.
 *
 * The output feeds the GitHub Release body (via `gh release create
 * --notes-file`), which electron-updater then delivers to clients as
 * `updateInfo.releaseNotes`. So the in-app update card and the GitHub
 * releases page share one curated source of truth.
 *
 * Exit codes (non-zero all print a clear message to stderr so the release
 * workflow fails loudly instead of publishing an update with no notes):
 *   0  success
 *   1  changelog.json missing / invalid JSON / not an array
 *   2  no entry found for the requested version
 *   3  entry found but summary is empty
 *   4  generated notes came out empty
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const changelogPath = path.join(rootDir, 'docs', 'changelog.json');

function normalizeVersion(v) {
  return String(v || '')
    .trim()
    .replace(/^v/, '');
}

let version = normalizeVersion(process.argv[2]);
if (!version) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    version = normalizeVersion(pkg.version);
  } catch (err) {
    process.stderr.write(`Failed to read package.json for version fallback: ${err.message}\n`);
    process.exit(1);
  }
}

let entries;
try {
  entries = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
} catch (err) {
  process.stderr.write(`Failed to read/parse docs/changelog.json: ${err.message}\n`);
  process.exit(1);
}

if (!Array.isArray(entries)) {
  process.stderr.write('docs/changelog.json must be a JSON array of entries.\n');
  process.exit(1);
}

const entry = entries.find((e) => e && normalizeVersion(e.version) === version);
if (!entry) {
  process.stderr.write(
    `No changelog entry found for version "${version}" in docs/changelog.json.\n` +
      `Add an entry before releasing (see docs/RELEASE.md).\n`
  );
  process.exit(2);
}

const summaryEn = entry.summary && entry.summary.en ? String(entry.summary.en).trim() : '';
const summaryZh = entry.summary && entry.summary.zh ? String(entry.summary.zh).trim() : '';
if (!summaryEn && !summaryZh) {
  process.stderr.write(`Changelog entry for "${version}" has an empty summary.\n`);
  process.exit(3);
}

const changesEn =
  entry.changes && Array.isArray(entry.changes.en) ? entry.changes.en.filter(Boolean) : [];
const changesZh =
  entry.changes && Array.isArray(entry.changes.zh) ? entry.changes.zh.filter(Boolean) : [];

const lines = [];

// English section first (GitHub releases page is English by default).
if (summaryEn) {
  lines.push(summaryEn, '');
}
if (changesEn.length) {
  lines.push("## What's Changed", '');
  for (const c of changesEn) lines.push(`- ${String(c).trim()}`);
  lines.push('');
}

// Chinese section.
if (summaryZh || changesZh.length) {
  lines.push('---', '');
  lines.push('## 更新内容', '');
  if (summaryZh) lines.push(summaryZh, '');
  for (const c of changesZh) lines.push(`- ${String(c).trim()}`);
  lines.push('');
}

const out =
  lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';

if (!out.trim()) {
  process.stderr.write(`Generated empty release notes for "${version}".\n`);
  process.exit(4);
}

process.stdout.write(out);
