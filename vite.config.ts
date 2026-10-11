import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import game from './src/game.json' with { type: 'json' };

// Build targets. Pick one with --mode:
//   web         no portal SDK (local play, phone test, artifact preview). Default for `npm run dev`.
//   crazygames  loads the CrazyGames SDK v3 in <head>, before the game code.
const SDK_TAGS: Record<string, string> = {
  web: '',
  crazygames: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
};

function targetFor(mode: string) {
  // "development" is `vite`, "production" is `vite preview`. Both only serve files, so no SDK.
  if (mode === 'development' || mode === 'production') return 'web';
  if (!(mode in SDK_TAGS)) throw new Error(`Unknown mode "${mode}". Use: ${Object.keys(SDK_TAGS).join(', ')}`);
  return mode;
}

function pageTokens(target: string): Plugin {
  return {
    name: 'page-tokens',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replace('<!-- PORTAL_SDK -->', SDK_TAGS[target])
          .replaceAll('%GAME_TITLE%', game.title)
          .replaceAll('%GAME_BG%', game.background),
    },
  };
}

export default defineConfig(({ mode }) => {
  const target = targetFor(mode);
  return {
    // Portals serve the game from a sub-folder, so every path must be relative.
    base: './',
    resolve: {
      alias: { '@core': fileURLToPath(new URL('./core', import.meta.url)) },
    },
    define: {
      __TARGET__: JSON.stringify(target),
      __GAME_ID__: JSON.stringify(game.id),
    },
    plugins: [pageTokens(target)],
    // host: true lets a phone on the same Wi-Fi open the dev server.
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
    build: {
      outDir: `dist/${target}`,
      emptyOutDir: true,
      target: 'es2020',
      // Phaser alone is about 1.4 MB minified, so the default 500 kB warning is noise.
      chunkSizeWarningLimit: 2000,
    },
  };
});
