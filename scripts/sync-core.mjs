// Copies the shared framework from this repo to the other game's repo.
// Rule: edit core/ only in Game1_Clicker, then run this to bring Game2 up to date.
//   npm run sync-core                       -> ../Game2_Tycoon_cafe
//   npm run sync-core -- ../SomeOtherGame   -> another folder
// Copied: core/, scripts/, tests/, tsconfig.json, vite.config.ts.
// Never touched: src/, public/, index.html, package.json, README.md.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const SHARED_DIRS = ['core', 'scripts', 'tests'];
const SHARED_FILES = ['tsconfig.json', 'vite.config.ts'];

const source = process.cwd();
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
