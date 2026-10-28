// Copies the shared framework from this repo to the other game's repo.
// Rule: edit core/ only in Game1_Clicker, then run this to bring Game2 up to date.
//   npm run sync-core                       -> ../Game2_Tycoon_cafe
//   npm run sync-core -- ../SomeOtherGame   -> another folder
// Copied: core/, scripts/, tests/, tsconfig.json, vite.config.ts.
// Never touched: src/, public/, index.html, package.json, README.md.
// This script is copied into the other repos along with scripts/, so it checks that it runs in Game #1.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const SHARED_DIRS = ['core', 'scripts', 'tests'];
const SHARED_FILES = ['tsconfig.json', 'vite.config.ts'];

const source = process.cwd();

// core/ is edited only in Game #1 (package name "clicker"). A copy of this script in another
// repo would delete and overwrite ../Game2_Tycoon_cafe/core with that repo's older core/.
const OWNER_PACKAGE = 'clicker';
let packageName = '';
try {
  packageName = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8')).name;
} catch {
  // No readable package.json: treated as the wrong repo below.
}
if (packageName !== OWNER_PACKAGE) {
  console.error(`sync-core only runs in Game #1 (package "${OWNER_PACKAGE}"); this is "${packageName || 'unknown'}". Nothing was copied.`);
  console.error('Edit core/ in Game1_Clicker and run "npm run sync-core" there.');
  process.exit(1);
}
const target = resolve(source, process.argv[2] ?? '../Game2_Tycoon_cafe');

if (target === source) {
  console.error('Target is this folder. Pass the other game folder.');
  process.exit(1);
}
if (!existsSync(resolve(target, 'src/game.json'))) {
  console.error(`${target} does not look like a game repo (no src/game.json).`);
  process.exit(1);
}

for (const dir of SHARED_DIRS) {
  // Remove first, so files deleted here are deleted there too.
  rmSync(resolve(target, dir), { recursive: true, force: true });
  cpSync(resolve(source, dir), resolve(target, dir), { recursive: true });
  console.log(`copied ${dir}/`);
}
for (const file of SHARED_FILES) {
  cpSync(resolve(source, file), resolve(target, file));
  console.log(`copied ${file}`);
}
console.log(`\nDone. In ${target}: run "npm install" if package.json versions differ, then "npm run build", then commit.`);
