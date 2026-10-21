// Checks src/content/sounds.json against the files in public/audio and the keys the code plays. Run: npm test
// Lives in src/, not tests/: tests/ is shared with game 2 by sync-core, and this file is game 1 only.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const sounds = JSON.parse(readFileSync('src/content/sounds.json', 'utf8')) as {
  music: { volume: number; tracks: { file: string; lengthSec: number; loops?: number }[] };
  sfx: Record<string, { file: string; volume?: number; pitchJitter?: number }>;
};

const codeFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return codeFiles(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });

test('every sound and music file exists, and nothing in public/audio is unused', () => {
  const used = new Set([...Object.values(sounds.sfx).map((s) => s.file), ...sounds.music.tracks.map((t) => t.file)]);
  for (const file of used) assert.ok(existsSync(join('public/audio', file)), `missing public/audio/${file}`);
  for (const file of readdirSync('public/audio')) assert.ok(used.has(file), `public/audio/${file} is shipped but not in sounds.json`);
});

test('levels are in range and music tracks have a length', () => {
  assert.ok(sounds.music.volume > 0 && sounds.music.volume <= 1);
  for (const t of sounds.music.tracks) assert.ok(t.lengthSec > 10 && (t.loops ?? 1) >= 1, t.file);
  for (const [key, s] of Object.entries(sounds.sfx)) {
    assert.ok((s.volume ?? 1) > 0 && (s.volume ?? 1) <= 1, `${key} volume`);
    assert.ok((s.pitchJitter ?? 0) >= 0 && (s.pitchJitter ?? 0) <= 200, `${key} pitchJitter`);
  }
});

test('every sound the code plays is in sounds.json', () => {
  const keys = new Set<string>();
  for (const file of [...codeFiles('src'), ...codeFiles('core')]) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/audio\.play\('([a-z0-9-]+)'/g)) keys.add(m[1]);
    for (const m of code.matchAll(/audio\.play\(\w+ \? '([a-z0-9-]+)' : '([a-z0-9-]+)'/g)) keys.add(m[1]).add(m[2]);
    for (const m of code.matchAll(/sound: '([a-z0-9-]+)'/g)) keys.add(m[1]);
  }
  keys.delete('coin'); // example in a doc comment of core/app.ts
  for (let tier = 2; tier <= 10; tier++) keys.add(`merge-${tier}`);
  for (const key of keys) assert.ok(sounds.sfx[key], `"${key}" is played but has no entry in sounds.json`);
});
