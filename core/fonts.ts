// Bundled font files. Vite copies the .woff2 files into the build, so nothing loads from the web.
// Nunito, SIL Open Font License 1.1 (see ASSETS.md).
// Each CSS file only covers one character range, and the browser downloads a range only when it is used.
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-900.css';
import '@fontsource/nunito/latin-ext-700.css';
import '@fontsource/nunito/latin-ext-900.css';
import '@fontsource/nunito/cyrillic-700.css';
import '@fontsource/nunito/cyrillic-900.css';

/**
 * Canvas text does not wait for web fonts, so we load the faces before Phaser draws any text.
 * sample is the text we are about to show. It makes the browser fetch the right character ranges.
 */
export async function loadFonts(family: string, sample: string, timeoutMs = 3000): Promise<void> {
  if (!document.fonts?.load) return;
  const name = family.split(',')[0].trim();
  const text = sample + 'ABCabc0123456789';
  const loads = Promise.all(['700', '900'].map((w) => document.fonts.load(`${w} 32px ${name}`, text)));
  // A slow font must never block the game: after the timeout we start with the fallback font.
  await Promise.race([loads.catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
}
