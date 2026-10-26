/** One music file. */
export interface MusicTrack {
  /** Where the file is (an asset path or a data URI in a single-file build). */
  url: string;
  /** Exact length of the music in the file, in seconds (MP3 files can be a little longer: encoder padding). */
  lengthSec: number;
  /** Times to play it before the next track. Default 1. */
  loops?: number;
  /** The end runs straight into the start. Repeats of it join without a gap or a fade. */
  seamless?: boolean;
}

export interface MusicConfig {
  /** Music level under the sound effects, 0-1. */
  volume: number;
  /** Overlap when one track hands over to another. Default 3. */
  crossfadeSec?: number;
  tracks: MusicTrack[];
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

const SCHEDULE_AHEAD = 1.5;
const FIRST_FADE_IN = 2.5;

/**
 * Background music, played on the Web Audio graph Phaser already uses. It is connected to Phaser's master
 * mute node, so the player's mute, the portal's mute and pauses (ads, hidden tab) silence it like any sound.
 *
 * - Tracks play in order and the list repeats. A seamless track joins its own repeats sample-exact; going to
 *   another track, the old one fades out while the new one fades in.
 * - Files load one at a time in the background after the loading screen, so they never delay the start.
 *   The first note waits for the browser to allow sound (first tap or key), like every other sound.
 * - Decoders may add a short silence before an MP3 (encoder delay). For seamless tracks the player finds
 *   where the sound really starts and uses the exact length from the config, so a repeat has no gap.
 */
export class MusicPlayer {
  private out: GainNode;
  private duckNode: GainNode;
  private buffers = new Map<number, AudioBuffer>();
  private leads = new Map<number, number>();
  private loading = new Set<number>();
  private failed = new Set<number>();
  private timer: number | null = null;
  private enabled = true;
  /** Track playing now (-1 before the first note). */
  private index = -1;
  private playsLeft = 0;
  private voice: Voice | null = null;
  /** Context time when the music in the current voice ends. */
  private segmentEnd = 0;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
    private config: MusicConfig,
  ) {
    this.duckNode = ctx.createGain();
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.duckNode.connect(this.out);
    this.out.connect(destination);
  }

  /** Starts loading and playing. Nothing loads while the music is switched off. */
  start() {
    if (this.timer !== null || this.config.tracks.length === 0) return;
    this.timer = window.setInterval(() => this.tick(), 250);
    this.tick();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.ramp(this.out.gain, on ? this.config.volume : 0, 0.4);
    if (on) this.tick();
  }

  /** Lowers the music for a moment, under a big sound (rare find, finish fanfare). */
  duck(level = 0.35, holdSec = 2) {
    const g = this.duckNode.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(level, now + 0.15);
    g.setValueAtTime(level, now + 0.15 + holdSec);
    g.linearRampToValueAtTime(1, now + 0.15 + holdSec + 1.5);
  }

  private ramp(param: AudioParam, value: number, sec: number) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + sec);
  }

  private load(i: number) {
    if (this.buffers.has(i) || this.loading.has(i) || this.failed.has(i)) return;
    const track = this.config.tracks[i];
    this.loading.add(i);
    fetch(track.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => this.ctx.decodeAudioData(data))
      .then((buffer) => {
        this.buffers.set(i, buffer);
        this.leads.set(i, findLead(buffer, track));
      })
      .catch((err) => {
        this.failed.add(i);
        console.warn(`[music] could not load ${track.url.slice(0, 60)}`, err);
      })
      .finally(() => {
        this.loading.delete(i);
        this.tick();
      });
  }

  private tick() {
    if (!this.enabled && this.index < 0) return;
    const tracks = this.config.tracks;
    if (this.index < 0) this.load(0);
    // Locked (no tap yet), paused by Phaser on blur, or interrupted on iOS: scheduled notes wait with the clock.
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (this.index < 0) {
      if (!this.buffers.has(0)) return;
      this.begin(0, now + 0.05, FIRST_FADE_IN);
      return;
    }
    if (this.segmentEnd - now > SCHEDULE_AHEAD + (this.config.crossfadeSec ?? 3)) return;

    const current = tracks[this.index];
    if (this.playsLeft > 1 || tracks.length === 1) {
      if (current.seamless) {
        this.playsLeft = Math.max(1, this.playsLeft - 1);
        this.join(this.index);
      } else {
        this.playsLeft = Math.max(1, this.playsLeft - 1);
        this.crossTo(this.index);
      }
      return;
    }
    const next = this.nextIndex();
    if (next < 0) {
      // Nothing else loaded or loadable: keep the current track going.
      if (current.seamless) this.join(this.index);
      else this.crossTo(this.index);
      return;
    }
    if (!this.buffers.has(next)) {
      this.load(next);
      // Still loading when the track runs out: repeat it rather than leave silence.
      if (this.segmentEnd - now < (this.config.crossfadeSec ?? 3) + 0.3) {
        if (current.seamless) this.join(this.index);
        else this.crossTo(this.index);
      }
      return;
    }
    this.crossTo(next);
  }

  /** The next track in the list that has not failed to load, or -1. */
  private nextIndex() {
    const n = this.config.tracks.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.index + k) % n;
      if (i !== this.index && !this.failed.has(i)) return i;
    }
    return -1;
  }

  private play(i: number, at: number): Voice {
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get(i)!;
    const gain = this.ctx.createGain();
    src.connect(gain);
    gain.connect(this.duckNode);
    src.onended = () => {
      src.disconnect();
      gain.disconnect();
    };
    src.start(at, this.leads.get(i) ?? 0);
    return { src, gain };
  }

  private begin(i: number, at: number, fadeIn: number) {
    const track = this.config.tracks[i];
    this.index = i;
    this.playsLeft = track.loops ?? 1;
    const voice = this.play(i, at);
    voice.gain.gain.setValueAtTime(0, at);
    voice.gain.gain.linearRampToValueAtTime(1, at + fadeIn);
    this.voice = voice;
    this.segmentEnd = at + track.lengthSec;
    if (this.enabled) this.ramp(this.out.gain, this.config.volume, 0.05);
    // Fetch the next track while this one plays.
    const next = this.nextIndex();
    if (next >= 0) this.load(next);
  }

  /** Seamless repeat: the new copy starts exactly where the music of the old one ends. */
  private join(i: number) {
    const at = this.segmentEnd;
    const old = this.voice;
    const voice = this.play(i, at);
    if (old) {
      old.gain.gain.setValueAtTime(1, at);
      old.gain.gain.linearRampToValueAtTime(0, at + 0.004);
      old.src.stop(at + 0.05);
    }
    this.voice = voice;
    this.segmentEnd = at + this.config.tracks[i].lengthSec;
  }

  /** Hand over: the old voice fades out over its last seconds while the new one fades in. */
  private crossTo(i: number) {
    const fade = this.config.crossfadeSec ?? 3;
    const at = Math.max(this.ctx.currentTime + 0.05, this.segmentEnd - fade);
    const old = this.voice;
    if (old) {
      old.gain.gain.setValueAtTime(1, at);
      old.gain.gain.linearRampToValueAtTime(0, at + fade);
      old.src.stop(at + fade + 0.05);
    }
    const keepPlays = i === this.index ? this.playsLeft : -1;
    this.begin(i, at, fade);
    if (keepPlays > 0) this.playsLeft = keepPlays;
  }
}

/**
 * Seconds of silence a decoder put before the music (MP3 encoder delay), for seamless tracks.
 * Chrome trims it (checked 21/10: decoded length is exact, lead 0); other browsers may not. The first
 * clearly audible sample marks the start: for the current main track that is within 18 samples
 * (0.4 ms) of the true start at this threshold, too small to hear at the join.
 */
function findLead(buffer: AudioBuffer, track: MusicTrack) {
  if (!track.seamless) return 0;
  const extra = buffer.duration - track.lengthSec;
  if (extra < 0.002) return 0;
  const limit = Math.min(buffer.length, Math.ceil(extra * buffer.sampleRate) + 1);
  let first = limit;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let s = 0; s < Math.min(first, limit); s++) {
      if (Math.abs(data[s]) > 0.003) {
        first = s;
        break;
      }
    }
  }
  return first >= limit ? 0 : first / buffer.sampleRate;
}
