#!/usr/bin/env node
/**
 * Migration Status — reads src/core/registry.ts and prints progress table.
 *
 * Usage: node scripts/migration-status.js
 *
 * Parses the registry file as text (no TypeScript runtime needed).
 */

const { readFileSync } = require('fs');
const { join } = require('path');

const registryPath = join(__dirname, '..', 'src', 'core', 'registry.ts');
const source = readFileSync(registryPath, 'utf8');

// Parse OPERATIONS array entries from the TypeScript source.
// Strategy: extract the OPERATIONS array body, then parse each { ... } block.
const opsMatch = source.match(/export const OPERATIONS[^=]*=\s*\[([\s\S]*)\];/);
if (!opsMatch) {
  console.error('Error: Could not find OPERATIONS array in registry.ts');
  process.exit(1);
}

// Split into individual entry blocks by matching balanced braces at depth 1
const opsBody = opsMatch[1];
const operations = [];
const blockPattern = /\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
let blockMatch;
while ((blockMatch = blockPattern.exec(opsBody)) !== null) {
  const block = blockMatch[1];
  const idMatch = block.match(/id:\s*'([^']+)'/);
  const descMatch = block.match(/description:\s*'([^']+)'/);
  const statusMatch = block.match(/status:\s*OpStatus\.(\w+)/);
  const cliMatch = block.match(/cliCommand:\s*(null|'[^']*')/);
  const legacyMatch = block.match(/legacyPaths:\s*\[([\s\S]*?)\]/);

  if (!idMatch || !statusMatch) continue; // skip non-entry blocks (e.g. interface)

  const legacyPaths = legacyMatch
    ? (legacyMatch[1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, ''))
    : [];

  operations.push({
    id: idMatch[1],
    description: descMatch ? descMatch[1] : '',
    status: statusMatch[1].toLowerCase(),
    legacyPaths,
    cliCommand: cliMatch && cliMatch[1] !== 'null'
      ? cliMatch[1].replace(/'/g, '')
      : null,
  });
}

if (operations.length === 0) {
  console.error('Error: Could not parse any operations from registry.ts');
  console.error('File path:', registryPath);
  process.exit(1);
}

const statusEmoji = { core: '\u2705', legacy: '\uD83D\uDD34', migrating: '\uD83D\uDFE1' };

console.log('# Core Migration Status\n');
console.log('| Operation | Status | Legacy locations | CLI command |');
console.log('|-----------|--------|-----------------|-------------|');
for (const op of operations) {
  const emoji = statusEmoji[op.status] || '?';
  const legacy = op.legacyPaths?.join(', ') || '\u2014';
  const cli = op.cliCommand || '(internal)';
  console.log(`| ${op.id} | ${emoji} ${op.status} | ${legacy} | ${cli} |`);
}

const total = operations.length;
const core = operations.filter((o) => o.status === 'core').length;
const legacy = operations.filter((o) => o.status === 'legacy').length;
const migrating = operations.filter((o) => o.status === 'migrating').length;

console.log('');
console.log(`Total: ${total} | Core: ${core} | Migrating: ${migrating} | Legacy: ${legacy}`);
console.log(`Progress: ${Math.round((core / total) * 100)}%`);
