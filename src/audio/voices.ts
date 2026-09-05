import type { Scene } from './engine';

/**
 * THE SONIC VOCABULARY.
 *
 * Six families, and a deliberately small one. The brief for Sonic Architecture
 * was "keep the musical system constrained; do not produce random noise", and
 * the way to honour that is to decide up front what the Lab is allowed to sound
 * like — then only ever play those things, at pitches drawn from one scale.
 *
 *   SIGNAL     a struck sine. the orange mark, heard.
 *   PAPER      filtered noise burst. a sheet moving.
 *   INK        low sine with a slow bloom. weight settling.
 *   STRUCTURE  a plucked triangle. a rule being drawn.
 *   MACHINE    a short square blip. the instrument reporting.
 *   CULTURE    two detuned saws, soft. the room after dark.
 *
 * Everything is synthesised. There are no audio files in this project, which
 * means nothing to download, nothing to license and nothing to keep in sync.
 */

export type Family = 'SIGNAL' | 'PAPER' | 'INK' | 'STRUCTURE' | 'MACHINE' | 'CULTURE';

export const FAMILIES: Family[] = ['SIGNAL', 'PAPER', 'INK', 'STRUCTURE', 'MACHINE', 'CULTURE'];

export const FAMILY_NOTE: Record<Family, string> = {
  SIGNAL: 'A struck sine. The orange mark, heard.',
  PAPER: 'Filtered noise. A sheet moving.',
  INK: 'Low weight, blooming slowly.',
  STRUCTURE: 'A plucked rule.',
  MACHINE: 'The instrument reporting.',
  CULTURE: 'The room, after dark.',
};

/**
 * One scale for the whole Lab: D minor pentatonic across three octaves.
 *
 * A fixed scale is what stops an interactive instrument becoming noise. Any
 * position on screen can be mapped to a degree of this and the result is always
 * musical, without anyone having to be careful.
 */
export const SCALE = [
  146.83, 164.81, 196.0, 220.0, 261.63, // D3 E3 G3 A3 C4
  293.66, 329.63, 392.0, 440.0, 523.25, // D4 E4 G4 A4 C5
  587.33, 659.25, 783.99, 880.0, 1046.5, // D5 E5 G5 A5 C6
];

export function degree(t: number): number {
  const i = Math.max(0, Math.min(SCALE.length - 1, Math.round(t * (SCALE.length - 1))));
  return SCALE[i];
}

export interface VoiceOptions {
  /** 0..1 — how loud, before the scene's own gain. */
  level?: number;
  /** -1..1 — stereo position. */
  pan?: number;
  /** 0..1 — distance. Attenuates and dulls, like real distance does. */
  distance?: number;
  /** Seconds from now. */
  when?: number;
}

/** Short shared noise buffer, made once per scene and reused by every burst. */
const noiseCache = new WeakMap<AudioContext, AudioBuffer>();

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const len = Math.floor(ctx.sampleRate * 0.6);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic: the same noise every session, so PAPER always sounds
  // like the same paper.
  let s = 0x9e3779b9;
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = (s / 2147483648 - 1) * 0.9;
  }
  noiseCache.set(ctx, buf);
  return buf;
}

/**
 * The shared output chain for one voice: distance → tone → pan → scene out.
 *
 * Distance attenuation and filtering are the same operation here on purpose —
 * things far away are quieter *and* duller, and doing only the first is the
 * thing that makes browser "3D audio" sound flat.
 */
function chain(scene: Scene, opts: VoiceOptions) {
  const { pan = 0, distance = 0, level = 0.5 } = opts;
  const d = Math.max(0, Math.min(1, distance));

  const gain = scene.track(scene.ctx.createGain());
  gain.gain.value = 0;

  const tone = scene.track(scene.ctx.createBiquadFilter());
  tone.type = 'lowpass';
  tone.frequency.value = 18000 - d * 15800;
  tone.Q.value = 0.6;

  const panner = scene.track(scene.ctx.createStereoPanner());
  panner.pan.value = Math.max(-1, Math.min(1, pan));

  gain.connect(tone);
  tone.connect(panner);
  panner.connect(scene.out);

  // Inverse-square-ish, floored so a distant voice is quiet, not absent.
  const amp = level * (0.18 + 0.82 / (1 + d * d * 5));
  return { gain, tone, panner, amp };
}

/** Plays one voice from a family. Returns nothing — voices are fire-and-forget. */
export function play(scene: Scene, family: Family, pitch: number, opts: VoiceOptions = {}): void {
  const t = scene.now + (opts.when ?? 0);
  const { gain, amp } = chain(scene, opts);

  switch (family) {
    case 'SIGNAL': {
      const osc = scene.source(scene.ctx.createOscillator());
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(amp, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 1.0);
      break;
    }
    case 'PAPER': {
      const src = scene.source(scene.ctx.createBufferSource());
      src.buffer = noiseBuffer(scene.ctx);
      src.playbackRate.value = 0.8 + (pitch / 880) * 0.9;
      const bp = scene.track(scene.ctx.createBiquadFilter());
      bp.type = 'bandpass';
      bp.frequency.value = Math.max(400, pitch * 3);
      bp.Q.value = 1.1;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(amp * 0.9, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      src.connect(bp);
      bp.connect(gain);
      src.start(t);
      src.stop(t + 0.3);
      break;
    }
    case 'INK': {
      const osc = scene.source(scene.ctx.createOscillator());
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch * 0.5, t);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.48, t + 2.4);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(amp * 1.1, t + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 3.0);
      break;
    }
    case 'STRUCTURE': {
      const osc = scene.source(scene.ctx.createOscillator());
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(pitch, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(amp, t + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.5);
      break;
    }
    case 'MACHINE': {
      const osc = scene.source(scene.ctx.createOscillator());
      osc.type = 'square';
      osc.frequency.setValueAtTime(pitch * 2, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(amp * 0.42, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.12);
      break;
    }
    case 'CULTURE': {
      // Two saws, slightly apart. The beat between them is the whole character.
      for (const detune of [-7, 7]) {
        const osc = scene.source(scene.ctx.createOscillator());
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(pitch * 0.5, t);
        osc.detune.setValueAtTime(detune, t);
        osc.connect(gain);
        osc.start(t);
        osc.stop(t + 2.6);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(amp * 0.4, t + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
      break;
    }
  }
}

/**
 * A slow held bed. Used by After Dark, which needs a room tone rather than
 * events. Returns a stop function so the caller can end it before scene
 * teardown if it wants to.
 */
export function bed(scene: Scene, pitch: number, level = 0.12): () => void {
  const gain = scene.track(scene.ctx.createGain());
  gain.gain.value = 0.0001;
  const filter = scene.track(scene.ctx.createBiquadFilter());
  filter.type = 'lowpass';
  filter.frequency.value = 620;

  const oscs = [0, -5, 7].map((detune) => {
    const o = scene.source(scene.ctx.createOscillator());
    o.type = 'sawtooth';
    o.frequency.value = pitch * 0.25;
    o.detune.value = detune;
    o.connect(gain);
    o.start();
    return o;
  });

  gain.connect(filter);
  filter.connect(scene.out);
  gain.gain.setTargetAtTime(level, scene.now, 1.4);

  return () => {
    gain.gain.setTargetAtTime(0.0001, scene.now, 0.4);
    for (const o of oscs) {
      try {
        o.stop(scene.now + 1.2);
      } catch {
        /* already stopped */
      }
    }
  };
}
