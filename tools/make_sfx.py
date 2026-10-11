# Generates the demo's sound effects as small WAV files. Original sounds, no license needed.
# Usage: python3 tools/make_sfx.py public/audio
import sys, wave, struct, math, random

RATE = 22050

def write(path, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(max(-1, min(1, s / peak * 0.9)) * 32767)) for s in samples))

def env(i, n, attack=0.005, curve=4.0):
    t = i / RATE
    a = min(1.0, t / attack) if attack > 0 else 1.0
    return a * (1 - i / n) ** curve

def tone(freq_fn, dur, curve=4.0, attack=0.004, harmonics=((1, 1.0),)):
    n = int(RATE * dur); out = []; phase = 0.0
    for i in range(n):
        f = freq_fn(i / n)
        phase += 2 * math.pi * f / RATE
        s = sum(amp * math.sin(phase * h) for h, amp in harmonics)
        out.append(s * env(i, n, attack, curve))
    return out

def mix(*parts):
    n = max(len(p) for p, _ in parts); out = [0.0] * n
    for p, offset in parts:
        for i, s in enumerate(p):
            if offset + i < n: out[offset + i] += s
    return out

def pad(samples, n):
    return samples + [0.0] * max(0, n - len(samples))

out = sys.argv[1]
random.seed(7)
# tap: soft "pop", pitch drops quickly
write(f'{out}/tap.wav', tone(lambda p: 520 + 380 * (1 - p) ** 3, 0.09, curve=3, harmonics=((1, 1), (2, 0.25))))
# ui-tap: short dry click for buttons
write(f'{out}/ui-tap.wav', tone(lambda p: 1300 - 500 * p, 0.035, curve=2, attack=0.001, harmonics=((1, 1), (3, 0.2))))
# buy: two quick rising notes
a = tone(lambda p: 880, 0.11, curve=2.5, harmonics=((1, 1), (2, 0.3), (3, 0.1)))
b = tone(lambda p: 1318.5, 0.2, curve=3, harmonics=((1, 1), (2, 0.3), (3, 0.1)))
write(f'{out}/buy.wav', mix((a, 0), (b, int(RATE * 0.07)), (pad([], int(RATE * 0.28)), 0)))
# reward: bright arpeggio
notes = [784, 988, 1175, 1568]
parts = [(tone(lambda p, f=f: f, 0.22, curve=3, harmonics=((1, 1), (2, 0.35))), int(RATE * 0.06 * i)) for i, f in enumerate(notes)]
write(f'{out}/reward.wav', mix(*parts, (pad([], int(RATE * 0.45)), 0)))
