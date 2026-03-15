#!/usr/bin/env node
// Sets the app version in tauri.conf.json and Cargo.toml from a git tag.
// Usage: node scripts/set-version.js v0.1.0-beta9
//
// Tag format:  v{semver}         e.g. v1.2.3
//              v{semver}-beta{n} e.g. v0.1.0-beta9  →  0.1.0-beta.9

const fs  = require('fs');
const tag = process.argv[2] || '';

// Strip leading 'v', then normalise betaN → beta.N (semver pre-release).
const version = tag
  .replace(/^v/, '')
  .replace(/beta(\d+)$/, 'beta.$1');

if (!version) {
  console.error('Usage: node scripts/set-version.js <tag>');
  process.exit(1);
}

// tauri.conf.json
const confPath = 'src-tauri/tauri.conf.json';
const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
conf.version = version;
fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');

// Cargo.toml — replace the first `version = "..."` line in [package]
const cargoPath = 'src-tauri/Cargo.toml';
const cargo = fs.readFileSync(cargoPath, 'utf8');
const updated = cargo.replace(/^version = "[^"]*"/m, `version = "${version}"`);
fs.writeFileSync(cargoPath, updated);

console.log('Version set to:', version);
