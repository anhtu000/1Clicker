import { startGame } from '@core';
import sounds from './content/sounds.json';
import game from './game.json';
import en from './i18n/en.json';
import { save } from './save';
import { HomeScene } from './scenes/HomeScene';
import { PlayScene } from './scenes/PlayScene';

/** A file from public/. A single-file build (npm run build:single) carries them inline in window.__ASSETS. */
const asset = (path: string) => (window as unknown as { __ASSETS?: Record<string, string> }).__ASSETS?.[path] ?? path;

startGame({
  id: game.id,
  title: game.title,
  // English only in v1 (CLAUDE.md 4b). Russian and Turkish come with Yandex.
  languages: { en },
  scenes: [HomeScene, PlayScene],
  playScene: 'Play',
  // New players go straight into the game; returning players see the home screen (CLAUDE.md 4b).
  menu: 'returning',
  menuScene: 'Home',
  save,
  preload: (scene) => {
    for (const [key, sound] of Object.entries(sounds.sfx)) scene.load.audio(key, asset(`audio/${sound.file}`));
  },
  // Levels and pitch spread per sound, and the music, all in src/content/sounds.json (sources in ASSETS.md).
  sounds: sounds.sfx,
  music: {
    volume: sounds.music.volume,
    crossfadeSec: sounds.music.crossfadeSec,
    tracks: sounds.music.tracks.map((t) => ({ ...t, url: asset(`audio/${t.file}`) })),
  },
  theme: {
    background: game.background,
    primary: 0xffc23d,
    primaryText: '#2a1a00',
    surface: 0x221d52,
    surfaceText: '#ffffff',
    text: '#ffffff',
    textDim: '#b9b4d9',
    reward: 0x36d68a,
    rewardText: '#052b17',
  },
});
