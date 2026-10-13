"""Store preview videos for CrazyGames (CLAUDE.md 4.1): 1920x1080 (16:9) and 1080x1620 (2:3), 30 fps, no sound.

The first second is the static cover, then the game plays a fixed script (tools/capture/director.ts)
with the ?clean view (no ad buttons, toasts or mouse cursor). The game is stepped frame by frame,
so the video runs at real speed however slow the headless renderer is.

Needs: the dev server (npm run dev, default port 5173 or PORT below), Python Playwright with Chromium,
ffmpeg with libx264. Covers come from tools/capture/cover.html (see covers in marketing/).

  python tools/capture/video.py [port] [landscape|portrait|all]
"""
import asyncio
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'marketing'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
WHICH = sys.argv[2] if len(sys.argv) > 2 else 'all'
FPS = 30
COVER_HOLD = 1.0  # seconds of still cover before the game fades in
FADE = 0.3

JOBS = {
    'landscape': (1920, 1080, 'cover_landscape_1920x1080.png', 'preview_landscape_1920x1080.mp4'),
    'portrait': (1080, 1620, 'video_start_portrait_1080x1620.png', 'preview_portrait_1080x1620.mp4'),
}


async def record(browser, layout: str) -> Path:
    w, h, _, _ = JOBS[layout]
    frames = ROOT / '.tmp' / f'frames_{layout}'
    shutil.rmtree(frames, ignore_errors=True)
    frames.mkdir(parents=True)
    ctx = await browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1)
    page = await ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    await page.goto(f'http://127.0.0.1:{PORT}/?clean&fixedres#video+reset')
    await page.evaluate("async () => { await import('/tools/capture/director.ts'); }")
    await page.wait_for_function('() => window.director.ready()', timeout=120000)
    await page.wait_for_timeout(2500)  # entry animations
    size = await page.evaluate('() => window.director.start()')
    assert size == {'w': w, 'h': h}, f'canvas is {size}, expected {w}x{h}'
    n = 0
    t0 = time.time()
    while True:
        more = await page.evaluate('() => window.director.frame()')
        # JPEG at 95: a PNG screenshot takes over a second per frame at 1080p.
        await page.screenshot(path=str(frames / f'f_{n:05d}.jpg'), type='jpeg', quality=95)
        n += 1
        if not more:
            break
    print(f'{layout}: {n} frames ({n / FPS:.1f} s) in {time.time() - t0:.0f} s, errors: {errors[:3]}', flush=True)
    await ctx.close()
    if errors:
        raise SystemExit(f'{layout}: page errors {errors[:3]}')
    return frames


def encode(layout: str, frames: Path):
    w, h, cover, name = JOBS[layout]
    out = OUT / name
    cover_len = COVER_HOLD + FADE
    graph = (
        f'[0:v]scale={w}:{h},fps={FPS},format=yuv420p,setsar=1,settb=AVTB[c];'
        f'[1:v]fps={FPS},format=yuv420p,setsar=1,settb=AVTB[g];'
        f'[c][g]xfade=transition=fade:duration={FADE}:offset={COVER_HOLD},format=yuv420p[v]'
    )
    cmd = [
        'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
        '-loop', '1', '-framerate', str(FPS), '-t', f'{cover_len}', '-i', str(OUT / cover),
        '-framerate', str(FPS), '-i', str(frames / 'f_%05d.jpg'),
        '-filter_complex', graph, '-map', '[v]',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
        '-r', str(FPS), '-movflags', '+faststart', '-an', str(out),
    ]
    subprocess.run(cmd, check=True)
    print(f'{layout}: wrote {out.name}', flush=True)


async def main():
    layouts = list(JOBS) if WHICH == 'all' else [WHICH]
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'])
        recorded = [(layout, await record(browser, layout)) for layout in layouts]
        await browser.close()
    for layout, frames in recorded:
        encode(layout, frames)


asyncio.run(main())
