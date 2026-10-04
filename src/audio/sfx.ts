import type { SoundId } from './director';

/**
 * Recettes des effets sonores, synthétisés en WebAudio (aucun fichier) : oscillateurs,
 * bruit et enveloppes. Chaque recette joue dans `out` à partir de `t`.
 */
type Recipe = (ctx: AudioContext, out: AudioNode, t: number, noise: AudioBuffer) => void;

const NOTE = { C4: 261.63, E4: 329.63, G4: 392, A4: 440, C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

/** Note simple avec attaque et extinction exponentielle. */
function tone(ctx: AudioContext, out: AudioNode, t: number, freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number } = {}): void {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
  const peak = opts.gain ?? 0.25;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Souffle de bruit filtré (clics mécaniques, coupures). */
function hiss(ctx: AudioContext, out: AudioNode, t: number, noise: AudioBuffer, dur: number, freq: number, gain: number): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const RECIPES: Record<SoundId, Recipe> = {
  click: (c, o, t) => tone(c, o, t, 1200, 0.04, { gain: 0.08 }),
  order: (c, o, t) => tone(c, o, t, 660, 0.07, { gain: 0.1, to: 880 }),
  place: (c, o, t, n) => {
    tone(c, o, t, 220, 0.12, { type: 'triangle', gain: 0.22, to: 140 });
    hiss(c, o, t, n, 0.06, 2500, 0.12);
  },
  built: (c, o, t) => {
    tone(c, o, t, NOTE.C5, 0.18, { type: 'triangle', gain: 0.16 });
    tone(c, o, t + 0.09, NOTE.G5, 0.26, { type: 'triangle', gain: 0.16 });
  },
  accept: (c, o, t) => {
    tone(c, o, t, NOTE.A4, 0.12, { gain: 0.14 });
    tone(c, o, t + 0.07, NOTE.E5, 0.2, { gain: 0.14 });
  },
  delivered: (c, o, t) => {
    [NOTE.C6, NOTE.E6, NOTE.G6].forEach((f, i) => tone(c, o, t + i * 0.07, f, 0.5, { gain: 0.12 }));
    tone(c, o, t + 0.21, NOTE.C6 * 2, 0.6, { gain: 0.05 });
  },
  late: (c, o, t) => {
    tone(c, o, t, NOTE.E4, 0.2, { type: 'square', gain: 0.07 });
    tone(c, o, t + 0.16, NOTE.C4, 0.32, { type: 'square', gain: 0.07 });
  },
  failure: (c, o, t) => {
    for (let i = 0; i < 2; i++) {
      tone(c, o, t + i * 0.22, NOTE.A5, 0.12, { type: 'square', gain: 0.09 });
      tone(c, o, t + i * 0.22 + 0.11, 660, 0.1, { type: 'square', gain: 0.09 });
    }
  },
  repaired: (c, o, t) => {
    tone(c, o, t, NOTE.G5, 0.15, { type: 'triangle', gain: 0.14 });
    tone(c, o, t + 0.08, NOTE.C6, 0.3, { type: 'triangle', gain: 0.14 });
  },
  shed: (c, o, t, n) => {
    tone(c, o, t, 320, 0.35, { type: 'sawtooth', gain: 0.07, to: 70 });
    hiss(c, o, t, n, 0.25, 600, 0.08);
  },
  refused: (c, o, t) => tone(c, o, t, 150, 0.1, { type: 'square', gain: 0.07 }),
  bankruptTick: (c, o, t) => tone(c, o, t, 220, 0.14, { type: 'sine', gain: 0.18 }),
  victory: (c, o, t) => {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone(c, o, t + i * 0.12, f, i === 3 ? 1.1 : 0.3, { type: 'triangle', gain: 0.16 }));
  },
  defeat: (c, o, t) => {
    [NOTE.A4, NOTE.E4, NOTE.C4].forEach((f, i) => tone(c, o, t + i * 0.25, f, 0.6, { type: 'triangle', gain: 0.14 }));
  },
  saved: (c, o, t) => tone(c, o, t, NOTE.E5, 0.15, { gain: 0.1, to: NOTE.A5 }),
  offer: (c, o, t) => tone(c, o, t, NOTE.G5, 0.12, { gain: 0.06 }),
  // Alerte préventive : deux notes douces qui descendent, plus discrètes qu'une panne.
  caution: (c, o, t) => {
    tone(c, o, t, NOTE.A5, 0.12, { type: 'triangle', gain: 0.08 });
    tone(c, o, t + 0.14, NOTE.E5, 0.16, { type: 'triangle', gain: 0.08 });
  },
};
