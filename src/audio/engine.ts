import type { SoundId } from './director';
import { RECIPES } from './sfx';

/**
 * Moteur audio : un contexte WebAudio créé au premier geste du joueur (règle des
 * navigateurs), trois bus (général, effets, ambiance) et l'ambiance continue de la salle.
 * Sans WebAudio, tout devient silencieux sans erreur.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ambience!: GainNode;
  private noise!: AudioBuffer;
  private hum: { air: GainNode; airFilter: BiquadFilterNode; drone: GainNode } | null = null;
  private volumes = { master: 0.8, sfx: 0.8, ambience: 0.5 };

  /** À appeler sur un geste du joueur (clic, touche) : crée ou relance le contexte audio. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.ambience = this.ctx.createGain();
      this.sfx.connect(this.master);
      this.ambience.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise(this.ctx);
      this.startHum(this.ctx);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(v: { master: number; sfx: number; ambience: number }): void {
    this.volumes = v;
    this.applyVolumes();
  }

  play(id: SoundId): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    RECIPES[id](this.ctx, this.sfx, this.ctx.currentTime + 0.005, this.noise);
  }

  /**
   * Ambiance de la salle : `load` (0 à 1) suit le nombre de racks qui tournent, `heat`
   * (0 à 1) ouvre le souffle des ventilateurs ; en pause, l'ambiance se fait discrète.
   */
  setAmbience(load: number, heat: number, paused: boolean): void {
    if (!this.ctx || !this.hum) return;
    const t = this.ctx.currentTime;
    const k = paused ? 0.35 : 1;
    this.hum.air.gain.setTargetAtTime((0.04 + load * 0.16 + heat * 0.08) * k, t, 0.6);
    this.hum.airFilter.frequency.setTargetAtTime(500 + heat * 900, t, 0.8);
    this.hum.drone.gain.setTargetAtTime((0.02 + load * 0.07) * k, t, 0.6);
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
    this.ambience.gain.setTargetAtTime(this.volumes.ambience, t, 0.05);
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Souffle d'air (bruit filtré, en boucle) et bourdonnement électrique grave. */
  private startHum(ctx: AudioContext): void {
    const air = ctx.createGain();
    air.gain.value = 0;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.value = 600;
    airFilter.Q.value = 0.6;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.connect(airFilter).connect(air).connect(this.ambience);
    src.start();

    const drone = ctx.createGain();
    drone.gain.value = 0;
    for (const [freq, level] of [
      [55, 1],
      [110, 0.5],
      [165, 0.18],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(drone);
      osc.start();
    }
    drone.connect(this.ambience);
    this.hum = { air, airFilter, drone };
  }
}
