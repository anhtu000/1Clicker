# Generates the game's sound effects. Original sounds made from code, no third-party rights (ASSETS.md).
# Usage: python3 tools/make_sfx.py public/audio            (needs numpy, scipy and ffmpeg)
#
# Every pitched sound uses the A-flat major pentatonic scale (Ab Bb C Eb F). Both music tracks are in
# F minor / C minor, which contain those notes, so effects never clash with the music (checked 21/10).
# Merges climb the scale tier by tier, so going up the chain sounds like progress.
# Each file is normalised to the same loudness (loudest 50 ms at -12 dBFS RMS, peaks under -1 dBFS);
# how loud each one plays in the game is set in src/content/sounds.json.
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
rng = np.random.default_rng(21)

NOTES = {'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}


def hz(name):
    """'Ab5' -> frequency (A4 = 440)."""
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTES[pitch] + 12 * (octave + 1) - 69) / 12)


# A-flat major pentatonic from C5 upwards.
SCALE = [hz(n) for n in ['C5', 'Eb5', 'F5', 'Ab5', 'Bb5', 'C6', 'Eb6', 'F6', 'Ab6', 'Bb6', 'C7', 'Eb7', 'F7', 'Ab7']]


def time(dur):
    return np.arange(int(SR * dur)) / SR


def fade_end(sig, ms=30):
    """Ramps the last few ms to zero. A tone cut off while still ringing makes an audible click."""
    sig = sig.copy()
    n = min(len(sig), int(SR * ms / 1000))
    if n > 1:
        sig[-n:] *= np.linspace(1, 0, n) ** 2
    return sig


def place(dur, *parts):
    """Mix (signal, start seconds, gain) parts into one buffer of dur seconds."""
    out = np.zeros(int(SR * dur))
    for sig, start, gain in parts:
        i = int(SR * start)
        n = min(len(sig), len(out) - i)
        if n > 0:
            out[i:i + n] += fade_end(sig[:n]) * gain
    return fade_end(out)


def phase(freq):
    """Phase of an oscillator whose frequency may change over time (array or number)."""
    return 2 * np.pi * np.cumsum(freq) / SR


def env(t, attack, decay):
    return (1 - np.exp(-t / max(attack, 1e-5))) * np.exp(-t / decay)


def lowpass(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR / 2 - 100), 'low', fs=SR, output='sos'), x)


def highpass(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)


def bandpass_sweep(dur, f0, f1, q=4.0):
    """White noise through a band-pass filter whose centre glides from f0 to f1 (block by block)."""
    n = int(SR * dur)
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    block = 256
    for i in range(0, n, block):
        c = f0 * (f1 / f0) ** (i / n)
        lo, hi = c / (1 + 0.5 / q), c * (1 + 0.5 / q)
        sos = butter(2, [lo, min(hi, SR / 2 - 200)], 'band', fs=SR, output='sos')
        seg = noise[max(0, i - 2048):i + block]
        out[i:i + block] = sosfilt(sos, seg)[-len(noise[i:i + block]):]
    return out


def bell(f, dur, decay=0.5, bright=1.0):
    """Struck metal bar: a few slightly inharmonic partials, the high ones dying first."""
    t = time(dur)
    ratios = [1.0, 2.0, 3.0, 4.07, 5.42, 6.79]
    amps = [1.0, 0.42, 0.2, 0.11 * bright, 0.06 * bright, 0.03 * bright]
    out = np.zeros_like(t)
    for k, (r, a) in enumerate(zip(ratios, amps)):
        if f * r > SR / 2 - 500:
            continue
        out += a * np.sin(2 * np.pi * f * r * t + k) * env(t, 0.002, decay / (1 + 0.9 * k))
    return fade_end(out)


def fm(f, dur, ratio=3.5, index=2.0, decay=0.4):
    """Two-operator FM. Ratio 3.5 gives a glassy, crystal-like tone; 1.0 or 2.0 a rounder one."""
    t = time(dur)
    mod = index * np.exp(-t / (decay * 0.35)) * np.sin(2 * np.pi * f * ratio * t)
    return fade_end(np.sin(2 * np.pi * f * t + mod) * env(t, 0.002, decay))


def pluck(f, dur, damp=0.996):
    """Karplus-Strong string: a soft plucked tone."""
    n = int(SR * dur)
    period = max(2, int(round(SR / f)))
    buf = rng.uniform(-1, 1, period)
    buf = lowpass(buf, f * 6, 1)
    out = np.zeros(n)
    for i in range(n):
        j = i % period
        out[i] = buf[j]
        buf[j] = damp * 0.5 * (buf[j] + buf[(j + 1) % period])
    return fade_end(out)


def supersaw(freqs, dur, detune=0.006, voices=3):
    """Soft pad: a few detuned saw waves per note, filtered later."""
    t = time(dur)
    out = np.zeros_like(t)
    for f in freqs:
        for v in range(voices):
            fr = f * (1 + detune * (v - (voices - 1) / 2))
            ph = (fr * t + rng.uniform()) % 1.0
            out += 2 * ph - 1
    return out / (len(freqs) * voices)


def thump(dur, f0, f1, decay):
    """Low body hit: a sine that drops in pitch."""
    t = time(dur)
    f = f1 + (f0 - f1) * np.exp(-t / (decay * 0.5))
    return fade_end(np.sin(phase(f)) * env(t, 0.001, decay))


def click(dur, fc, decay):
    t = time(dur)
    return highpass(rng.standard_normal(len(t)), fc) * np.exp(-t / decay)


def sparkle(dur, start_note, count, gap, amp=0.18, decay=0.18, seed=0):
    """A run of tiny glassy pings climbing the scale."""
    r = np.random.default_rng(seed)
    parts = []
    for k in range(count):
        note = SCALE[min(len(SCALE) - 1, start_note + k)]
        parts.append((fm(note, decay * 3, ratio=3.5, index=1.2, decay=decay), k * gap + r.uniform(0, gap * 0.25), amp * (1 - 0.5 * k / max(1, count))))
    return place(dur, *parts)


def reverb(x, rt=0.8, wet=0.15, tone=5000.0, tail=None):
    """Simple room: decaying filtered noise as the impulse response, mixed under the dry sound."""
    length = rt * 1.2
    t = time(length)
    ir = rng.standard_normal(len(t)) * np.exp(-6.9 * t / rt)
    ir = lowpass(ir, tone, 1)
    ir[: int(SR * 0.01)] = 0  # 10 ms pre-delay keeps the attack clean
    ir /= np.sqrt(np.sum(ir ** 2))
    pad = np.concatenate([x, np.zeros(int(SR * (tail if tail is not None else length * 0.6)))])
    wet_sig = fftconvolve(pad, ir)[: len(pad)]
    dry = np.concatenate([x, np.zeros(len(pad) - len(x))])
    return dry + wet * wet_sig * 3


def finish_tail(x, ms=20):
    """Short fade at the end so no file ends with a click, and trims trailing silence."""
    level = np.abs(x)
    last = np.where(level > level.max() * 10 ** (-50 / 20))[0]
    end = min(len(x), (last[-1] if len(last) else len(x)) + int(SR * 0.01))
    x = x[:end].copy()
    n = min(len(x), int(SR * ms / 1000))
    x[-n:] *= np.linspace(1, 0, n) ** 2
    return x


def normalise(x, target_db=-12.0, ceiling_db=-1.0):
    """Loudest 50 ms at target_db RMS (lightly weighted towards the ear's sensitive range), peaks soft-limited."""
    weighted = highpass(x, 120)
    weighted = weighted + 0.6 * highpass(weighted, 2000)
    win = int(SR * 0.05)
    power = np.convolve(weighted ** 2, np.ones(win) / win, 'same')
    loud = np.sqrt(power.max())
    y = x * (10 ** (target_db / 20) / max(loud, 1e-9))
    ceiling = 10 ** (ceiling_db / 20)
    peak = np.abs(y).max()
    if peak > ceiling * 0.8:
        knee = ceiling * 0.8
        over = np.abs(y) > knee
        y[over] = np.sign(y[over]) * (knee + (ceiling - knee) * np.tanh((np.abs(y[over]) - knee) / (ceiling - knee)))
    return y


def write(name, x, mp3=False):
    """Short sounds stay WAV (no decoder delay before a tap). Long ones become 96 kbps MP3 to keep the
    download small; an MP3 may start ~25 ms late, which is fine for chimes that follow an animation."""
    x = finish_tail(x)
    x = normalise(x)
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    # The WAV for an MP3 is only an intermediate step: it goes to the system temp folder, not the game.
    wav_path = os.path.join(tempfile.gettempdir() if mp3 else OUT, f'{name}.wav')
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    path = wav_path
    if mp3:
        path = os.path.join(OUT, f'{name}.mp3')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav_path, '-codec:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', path], check=True)
    print(f'{os.path.basename(path):14s} {len(x) / SR:5.2f} s  {os.path.getsize(path) / 1024:6.1f} KB')


# ---------------------------------------------------------------- sounds

def make_tap():
    # Tapping the core: a soft rounded "pok" with a small low body. Heard many times a second, so it is
    # short, has no sharp highs, and the game adds a little random pitch each time.
    d = 0.14
    t = time(d)
    f = hz('Eb5') * (1 + 0.45 * np.exp(-t / 0.007))
    body = (np.sin(phase(f)) + 0.16 * np.sin(2 * phase(f))) * env(t, 0.0015, 0.04)
    x = place(d, (body, 0, 1.0), (thump(d, 220, 110, 0.03), 0, 0.45), (click(0.01, 2500, 0.0012), 0, 0.12))
    return reverb(lowpass(x, 7000), rt=0.35, wet=0.05, tail=0.12)


def make_tap_crit():
    # 6x tap: the same tap, a bright bell on top and a heavier body.
    d = 0.6
    x = place(d,
              (make_tap(), 0, 0.8),
              (bell(hz('Eb6'), 0.6, decay=0.28, bright=0.8), 0.0, 0.55),
              (fm(hz('Bb6'), 0.4, ratio=2.0, index=1.0, decay=0.14), 0.035, 0.3),
              (thump(0.2, 160, 70, 0.07), 0, 0.5))
    return reverb(x, rt=0.6, wet=0.1)


def make_scan():
    # Scan: a short rising sweep, like a scanner beam, landing on a soft note when the body appears.
    d = 0.5
    t = time(0.26)
    f = 300 * (3.2 ** np.minimum(t / 0.22, 1.0))
    sweep = (np.sin(phase(f)) + 0.25 * np.sin(2 * phase(f))) * env(t, 0.03, 0.12)
    air = bandpass_sweep(0.26, 900, 5000, q=3) * env(t, 0.04, 0.09)
    blip = fm(hz('C6'), 0.3, ratio=2.0, index=1.2, decay=0.1)
    x = place(d, (sweep, 0, 0.55), (air, 0, 0.35), (blip, 0.19, 0.6))
    return reverb(lowpass(x, 8000), rt=0.55, wet=0.12)


def make_pick():
    # Picking a body up: a light tick.
    d = 0.06
    t = time(d)
    f = 1500 * (1 + 0.25 * np.exp(-t / 0.004))
    x = np.sin(phase(f)) * env(t, 0.0008, 0.012) + 0.25 * click(d, 3000, 0.001)
    return highpass(x, 300)


def make_place():
    # Putting a body down on an empty space or swapping: a soft wooden "tok".
    d = 0.1
    t = time(d)
    x = place(d, (np.sin(2 * np.pi * hz('Ab4') * t) * env(t, 0.001, 0.025), 0, 0.8), (thump(d, 200, 120, 0.02), 0, 0.5), (click(0.01, 1800, 0.001), 0, 0.12))
    return lowpass(x, 5000)


def make_merge(tier):
    # Merge: two bodies pop together and a chime rings out. Tiers 2-10 climb the pentatonic scale; higher
    # tiers ring longer and pick up sparkles, then a soft chord.
    i = tier - 2
    note = SCALE[i]
    upper = SCALE[i + 2]
    d = min(2.6, 3 * (0.35 + 0.07 * i))
    pop_t = time(0.08)
    pop = np.sin(phase(note * 0.5 * (1 + 0.6 * (pop_t / 0.08)))) * env(pop_t, 0.001, 0.025)  # rising "bloop"
    parts = [
        (pop, 0, 0.45),
        (thump(0.25, 140, 55, 0.06 + 0.01 * i), 0, 0.35 + 0.04 * i),
        (bell(note, d, decay=0.35 + 0.07 * i), 0.03, 0.8),
        (bell(upper, d, decay=0.3 + 0.06 * i, bright=0.7), 0.09, 0.45),
    ]
    if i >= 4:
        parts.append((sparkle(d, i + 4, 3 + (i - 4), 0.045, amp=0.16), 0.14, 1.0))
    if i >= 6:
        t = time(d)
        pad = lowpass(supersaw([note / 2, note * 0.75, note], d), 2200) * env(t, 0.08, 0.5 + 0.1 * i)
        parts.append((pad, 0.05, 0.35))
    x = place(d + 0.1, *parts)
    return reverb(x, rt=0.7 + 0.12 * i, wet=0.12 + 0.015 * i)


def make_rare():
    # Epic find on the board: a quick shimmering run up the scale.
    d = 1.3
    notes = [3, 5, 6, 7, 8, 10]  # Ab5 C6 Eb6 F6 Ab6 C7
    parts = [(fm(SCALE[n], 0.7, ratio=3.5, index=1.6, decay=0.32), k * 0.055, 0.45 + 0.06 * k) for k, n in enumerate(notes)]
    t = time(0.8)
    shimmer = highpass(rng.standard_normal(len(t)), 6000) * env(t, 0.1, 0.25) * (0.6 + 0.4 * np.sin(2 * np.pi * 18 * t))
    parts.append((shimmer, 0.05, 0.05))
    parts.append((bell(hz('Ab5'), 1.0, decay=0.5), 0, 0.35))
    return reverb(place(d, *parts), rt=1.2, wet=0.22)


def make_reveal():
    # Legendary or Mythic: a deep hit, a bright chord and a rising sparkle; the music dips under it.
    d = 2.6
    t = time(d)
    boom = thump(d, 110, 42, 0.45)
    dust = lowpass(rng.standard_normal(len(t)), 350) * env(t, 0.002, 0.12)
    chord = sum(bell(hz(n), d, decay=1.2) for n in ['Ab4', 'Eb5', 'Ab5', 'C6'])
    pad_sig = supersaw([hz(n) for n in ['Ab3', 'Eb4', 'C5', 'Eb5', 'Bb5']], d)
    cutoff_env = env(t, 0.25, 1.4)
    pad = lowpass(pad_sig, 2600) * cutoff_env
    run = sparkle(d, 8, 6, 0.07, amp=0.22, decay=0.22, seed=4)
    x = place(d, (boom, 0, 0.9), (dust, 0, 0.25), (chord, 0.0, 0.32), (pad, 0.02, 0.5), (run, 0.18, 1.0))
    return reverb(x, rt=2.0, wet=0.24)


def make_star():
    # Catching a shooting star: a clear "ting" with a little sparkle.
    d = 0.7
    x = place(d, (bell(hz('F6'), d, decay=0.26, bright=1.2), 0, 0.7), (bell(hz('C7'), d, decay=0.2), 0.04, 0.35), (sparkle(d, 10, 3, 0.04, amp=0.12, seed=2), 0.06, 1.0))
    return reverb(x, rt=0.8, wet=0.16)


def make_star_gold():
    # Golden star: a fast run up to a bright high note.
    d = 1.1
    run = [(bell(SCALE[n], 0.8, decay=0.22 + 0.04 * k, bright=1.1), k * 0.045, 0.5) for k, n in enumerate([5, 6, 7, 8, 10])]
    x = place(d, *run, (sparkle(d, 9, 5, 0.05, amp=0.14, seed=3), 0.2, 1.0))
    return reverb(x, rt=1.0, wet=0.2)


def make_buy():
    # Buying an upgrade: two plucked notes a fifth apart and a small coin-like ping.
    d = 0.55
    x = place(d,
              (pluck(hz('Eb5'), 0.4), 0, 0.6),
              (pluck(hz('Bb5'), 0.45), 0.07, 0.6),
              (fm(hz('Eb7'), 0.25, ratio=2.0, index=0.8, decay=0.07), 0.07, 0.22),
              (click(0.01, 2000, 0.001), 0, 0.15))
    return reverb(lowpass(x, 9000), rt=0.5, wet=0.1)


def make_reward():
    # A reward arrives (daily gift, ad reward, timed-run record): a bright major arpeggio.
    d = 1.2
    parts = []
    for k, n in enumerate(['Ab5', 'C6', 'Eb6', 'Ab6']):
        parts.append((bell(hz(n), 0.9, decay=0.35 + 0.05 * k), k * 0.065, 0.55))
        parts.append((pluck(hz(n) / 2, 0.5), k * 0.065, 0.25))
    parts.append((sparkle(d, 9, 4, 0.05, amp=0.12, seed=5), 0.26, 1.0))
    return reverb(place(d, *parts), rt=1.0, wet=0.18)


def make_finish():
    # The Galaxy is made: a short fanfare, IV - V - I in A-flat, with a sustained last chord.
    d = 3.2
    def stab(names, dur, attack=0.01, decay=0.25, cutoff=3000):
        t = time(dur)
        sig = supersaw([hz(n) for n in names], dur, detune=0.008)
        return lowpass(sig, cutoff) * env(t, attack, decay)
    x = place(d,
              (stab(['Db4', 'F4', 'Ab4', 'Db5'], 0.4, decay=0.12), 0.0, 0.8),
              (stab(['Eb4', 'G4', 'Bb4', 'Eb5'], 0.4, decay=0.12), 0.18, 0.8),
              (stab(['Ab3', 'Eb4', 'Ab4', 'C5', 'Eb5', 'Ab5'], 2.8, attack=0.02, decay=1.1, cutoff=3400), 0.36, 1.0),
              (thump(1.0, 120, 48, 0.35), 0.36, 0.8),
              (sparkle(d, 3, 8, 0.07, amp=0.25, decay=0.3, seed=6), 0.42, 1.0),
              (bell(hz('Ab6'), 2.0, decay=0.9), 0.95, 0.25))
    return reverb(x, rt=2.2, wet=0.22)


def make_absorb():
    # Feeding a body to the core: a whoosh pulled inwards, ending in a low swallow and a soft note.
    d = 0.75
    t = time(0.3)
    whoosh = bandpass_sweep(0.3, 4500, 500, q=2.5) * env(t, 0.12, 0.25)
    f = 900 * (250 / 900) ** (t / 0.3)
    tone = np.sin(phase(f)) * env(t, 0.08, 0.15)
    x = place(d, (whoosh, 0, 0.5), (tone, 0, 0.3), (thump(0.4, 130, 60, 0.1), 0.26, 0.7), (bell(hz('Ab4'), 0.5, decay=0.25), 0.27, 0.35))
    return reverb(x, rt=0.7, wet=0.14)


def make_crystal():
    # Crystals gained (selling a hidden body): glassy pings.
    d = 0.9
    x = place(d, (fm(hz('Eb6'), 0.6, ratio=3.5, index=2.2, decay=0.25), 0, 0.6), (fm(hz('Ab6'), 0.6, ratio=3.5, index=2.0, decay=0.25), 0.08, 0.55), (fm(hz('C7'), 0.6, ratio=3.5, index=1.8, decay=0.3), 0.16, 0.5))
    return reverb(x, rt=1.0, wet=0.2)


def make_ui_tap():
    # Buttons: a short, soft click with a hint of pitch.
    d = 0.06
    t = time(d)
    f = hz('Ab5') * 1.5 * (1 + 0.3 * np.exp(-t / 0.003))
    x = place(d, (np.sin(phase(f)) * env(t, 0.0008, 0.014), 0, 0.7), (thump(d, 320, 200, 0.01), 0, 0.3), (click(0.01, 2500, 0.0012), 0, 0.25))
    return lowpass(x, 9000)


def make_deny():
    # Something cannot happen (the board is full): two soft notes going down.
    d = 0.35
    x = place(d, (pluck(hz('Bb4'), 0.2, damp=0.99), 0, 0.6), (pluck(hz('F4'), 0.3, damp=0.99), 0.09, 0.6))
    return lowpass(x, 3000)


if __name__ == '__main__':
    OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/audio'
    os.makedirs(OUT, exist_ok=True)
    write('tap', make_tap())
    write('tap-crit', make_tap_crit())
    write('scan', make_scan())
    write('pick', make_pick())
    write('place', make_place())
    for tier in range(2, 11):
        write(f'merge-{tier}', make_merge(tier), mp3=True)
    write('rare', make_rare(), mp3=True)
    write('reveal', make_reveal(), mp3=True)
    write('star', make_star(), mp3=True)
    write('star-gold', make_star_gold(), mp3=True)
    write('buy', make_buy())
    write('reward', make_reward(), mp3=True)
    write('finish', make_finish(), mp3=True)
    write('absorb', make_absorb(), mp3=True)
    write('crystal', make_crystal(), mp3=True)
    write('ui-tap', make_ui_tap())
    write('deny', make_deny())
