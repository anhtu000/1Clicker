// Checks a finished build against the portal limits in CLAUDE.md section 6.
// Run on its own: node scripts/check-build.mjs dist/demo/crazygames
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MB = 1024 * 1024;
const LIMITS = {
  targetTotal: 8 * MB, // own target, keeps the Poki door open
  crazyInitial: 50 * MB,
  crazyTotal: 250 * MB,
  crazyFiles: 1500,
};

// Domains that may appear as plain strings without causing a request.
const HARMLESS_DOMAINS = new Set(['www.w3.org', 'phaser.io', 'github.com', 'www.phaser.io']);
const SDK_DOMAINS = { crazygames: ['sdk.crazygames.com'], poki: ['game-cdn.poki.com'], web: [] };

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const fmt = (bytes) => `${(bytes / MB).toFixed(2)} MB`;

export function checkBuild(dir, { target = 'crazygames' } = {}) {
  const files = walk(dir).map((path) => ({ path, rel: relative(dir, path), size: statSync(path).size }));
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const code = files.filter((f) => /\.(html|js|css)$/.test(f.rel)).reduce((sum, f) => sum + f.size, 0);
  const problems = [];
  const warnings = [];

  if (files.length > LIMITS.crazyFiles) problems.push(`${files.length} files, CrazyGames allows ${LIMITS.crazyFiles}`);
  if (total > LIMITS.crazyTotal) problems.push(`total ${fmt(total)} is over the CrazyGames 250 MB limit`);
  if (total > LIMITS.crazyInitial) warnings.push(`total ${fmt(total)} is over 50 MB, make sure the initial download stays under it`);
  if (total > LIMITS.targetTotal) {
    // Poki wants the initial download under 8 MB; for the other portals it is our own target.
    if (target === 'poki') problems.push(`total ${fmt(total)} is over the 8 MB Poki limit`);
    else warnings.push(`total ${fmt(total)} is over our 8 MB target`);
  }

  // Yandex rejects file and folder names with spaces or non-ASCII characters.
  for (const f of files) {
    if (/[^\x21-\x7e]/.test(f.rel)) problems.push(`bad file name (space or non-ASCII): ${f.rel}`);
  }

  // Every asset must ship inside the build. List any outside domain found in code.
  const allowed = new Set([...HARMLESS_DOMAINS, ...(SDK_DOMAINS[target] ?? [])]);
  const found = new Set();
  for (const f of files.filter((f) => /\.(html|js|css)$/.test(f.rel))) {
    const text = readFileSync(f.path, 'utf8');
    for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) found.add(m[1].toLowerCase());
  }
  const unknown = [...found].filter((d) => !allowed.has(d));
  if (unknown.length) warnings.push(`outside domains in code, check none is fetched: ${unknown.join(', ')}`);

  const largest = [...files].sort((a, b) => b.size - a.size).slice(0, 5);
  console.log(`\nBuild check: ${dir}`);
  console.log(`  files: ${files.length}   total: ${fmt(total)}   html+js+css: ${fmt(code)}`);
  console.log(`  largest: ${largest.map((f) => `${f.rel} (${fmt(f.size)})`).join(', ')}`);
  for (const w of warnings) console.log(`  WARN  ${w}`);
  for (const p of problems) console.log(`  FAIL  ${p}`);
  if (!warnings.length && !problems.length) console.log('  OK');
  return problems.length === 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/check-build.mjs <build folder> [target]');
    process.exit(1);
  }
  process.exitCode = checkBuild(dir, { target: process.argv[3] ?? 'crazygames' }) ? 0 : 1;
}
