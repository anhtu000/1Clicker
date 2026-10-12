// Packs a web build into ONE html file that runs without a server: open it on a phone straight
// from Downloads (Chrome on Android), or send it as a file. Scripts, styles, fonts and sounds are
// all inlined. Sounds are handed to the game as window.__ASSETS["audio/x.wav"] = data URI, so
// the game's loader must look there first (see preload in src/main.ts).
//   node scripts/build-single.mjs dist/web dist/single/Game_PhoneTest_v1.html
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const [srcArg = 'dist/web', outArg = 'dist/single/index.html'] = process.argv.slice(2);
const src = resolve(srcArg);
const out = resolve(outArg);

const MIME = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};
const dataUri = (file) => `data:${MIME[extname(file)] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;

let html = readFileSync(join(src, 'index.html'), 'utf8');

// Styles, with every url(...) inside them turned into a data URI.
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, href) => {
  const cssPath = join(src, href);
  const css = readFileSync(cssPath, 'utf8').replace(/url\((?:'|")?\.\/([^)'"]+)(?:'|")?\)/g, (__, file) => `url(${dataUri(join(dirname(cssPath), file))})`);
  return `<style>${css}</style>`;
});

// Every file outside assets/ (public folder: sounds, images) becomes window.__ASSETS[path].
const assets = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else assets[relative(src, full).split('\\').join('/')] = full;
  }
};
walk(src);
const publicFiles = Object.keys(assets).filter((p) => !p.startsWith('assets/') && p !== 'index.html');
const table = Object.fromEntries(publicFiles.map((p) => [p, dataUri(assets[p])]));
const assetScript = `<script>window.__ASSETS=${JSON.stringify(table)};</script>`;

// The game itself, inline. "</script" inside the code would end the tag early.
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, file) => {
  const js = readFileSync(join(src, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `${assetScript}<script type="module">${js}</script>`;
});

if (/(?:src|href)="\.\//.test(html)) throw new Error('A relative file reference is left in the page; it would not load from a single file.');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`single file: ${relative(process.cwd(), out)}  ${(Buffer.byteLength(html) / 1e6).toFixed(2)} MB  (inlined: ${publicFiles.join(', ') || 'none'})`);
