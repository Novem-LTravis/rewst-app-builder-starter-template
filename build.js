#!/usr/bin/env node
/**
 * Build Script — Rewst App Builder Starter Template
 * Combines all source files into a single compiled HTML file for pasting
 * into a Rewst App Builder HTML container.
 *
 * Usage: node build.js
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = __dirname;
const TEMPLATE_PATH = path.join(REPO_ROOT, 'app-template.html');
const OUTPUT_PATH   = path.join(REPO_ROOT, 'dist/app-compiled.html');
const DIST_DIR      = path.dirname(OUTPUT_PATH);

const MARKERS = {
  '{{ CSS_THEME }}':       './src/theme.css',
  '{{ CONFIG }}':          './src/config.js',
  '{{ MOCK_DATA }}':       null, // generated below from mock/*.json
  '{{ DATA_CLIENT }}':     './src/data-client.js',
  '{{ PAGE_APP }}':        './pages/app.js',
  '{{ PAGE_OVERVIEW }}':   './pages/overview.js',
  '{{ PAGE_SITE }}':       './pages/site.js',
};

// Guards against accidentally reintroducing Jinja-collision sequences into
// the compiled output: after substitution, no double-curly or curly-percent
// sequences may remain anywhere in the file.
const JINJA_COLLISION_PATTERN = /\{\{|\}\}|\{%|%\}/;

// The fixtures in mock/ are inlined as NAT_MOCK, and only when USE_MOCK_DATA
// is true in src/config.js — a live build carries no sample data.
function buildMockData() {
  const config = fs.readFileSync(path.join(REPO_ROOT, 'src/config.js'), 'utf8');
  if (!/USE_MOCK_DATA:\s*true/.test(config)) return 'var NAT_MOCK = null;';
  const load = (name) => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'mock', name), 'utf8'));
  const mock = { overview: load('overview.json'), site_detail: load('site_detail.json'), drilldown: load('drilldown.json') };
  return 'var NAT_MOCK = ' + JSON.stringify(mock, null, 1) + ';';
}
console.log('Building Novem Patch Insights...\n');

if (!fs.existsSync(TEMPLATE_PATH)) {
  console.error('Template not found:', TEMPLATE_PATH);
  process.exit(1);
}

let template     = fs.readFileSync(TEMPLATE_PATH, 'utf8');
let replacements = 0;

for (const [marker, filePath] of Object.entries(MARKERS)) {
  const fullPath = filePath && path.join(REPO_ROOT, filePath);

  if (!template.includes(marker)) {
    console.error(`  ERROR: Marker not found in template: ${marker}`);
    process.exit(1);
  }

  if (filePath && !fs.existsSync(fullPath)) {
    console.error(`  ERROR: File not found: ${filePath}`);
    process.exit(1);
  }

  const label = filePath || 'mock/*.json';
  const content = filePath ? fs.readFileSync(fullPath, 'utf8') : buildMockData();
  if (JINJA_COLLISION_PATTERN.test(content)) {
    console.error(`  ERROR: ${label} contains a Jinja-collision sequence ({{ }} or {% %}). Fix before building.`);
    process.exit(1);
  }

  template = template.replaceAll(marker, () => content);
  console.log(`  ${marker} -> ${label}`);
  replacements++;
}

const expected = Object.keys(MARKERS).length;
if (replacements !== expected) {
  console.error(`\nERROR: expected ${expected} replacements but made ${replacements} — aborting.`);
  process.exit(1);
}

if (JINJA_COLLISION_PATTERN.test(template)) {
  console.error('\nERROR: compiled output still contains a Jinja-collision sequence after substitution — aborting.');
  process.exit(1);
}

fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_PATH, template);

const ASSETS_SRC = path.join(REPO_ROOT, 'assets');
const ASSETS_DST = path.join(DIST_DIR, 'assets');
if (fs.existsSync(ASSETS_SRC)) {
  fs.cpSync(ASSETS_SRC, ASSETS_DST, { recursive: true });
}

console.log(`\nDone: ${replacements} replacements made`);
console.log(`Output: ${OUTPUT_PATH}`);

const stats  = fs.statSync(OUTPUT_PATH);
const sizeKB = (stats.size / 1024).toFixed(1);
console.log(`Size: ${sizeKB} KB`);
