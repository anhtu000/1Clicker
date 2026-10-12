import { startGame } from '@core';
import game from './game.json';
import en from './i18n/en.json';
import { save } from './save';
import { HomeScene } from './scenes/HomeScene';
import { PlayScene } from './scenes/PlayScene';

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
    scene.load.setPath('audio');
    scene.load.audio('tap', 'tap.wav');
    scene.load.audio('ui-tap', 'ui-tap.wav');
    scene.load.audio('buy', 'buy.wav');
    scene.load.audio('reward', 'reward.wav');
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
