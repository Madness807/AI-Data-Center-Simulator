import { OPERATING, type ExpenseKind, type Ledger } from '../sim/ledger';
import type { GameState } from '../sim/state';
import { availability, pue, tempStats } from '../sim/stats';

/** Fenêtre glissante du bilan affiché (secondes de jeu). */
export const BALANCE_WINDOW = 60;

export interface Balance {
  /** Durée réellement couverte (plus courte en début de partie). */
  seconds: number;
  revenue: number;
  /** Dépenses d'exploitation par poste sur la fenêtre. */
  operating: Record<(typeof OPERATING)[number], number>;
  /** Construction et embauche : des investissements, montrés à part. */
  investment: number;
  /** Recettes − dépenses d'exploitation, par seconde. */
  netPerSecond: number;
}

/**
 * Historique du grand livre, échantillonné une fois par seconde de jeu. Le bilan
 * se calcule par différence entre l'échantillon le plus récent et celui d'il y a 60 s.
 */
export class LedgerHistory {
  private samples: { time: number; ledger: Ledger }[] = [];

  record(time: number, ledger: Ledger): void {
    const last = this.samples[this.samples.length - 1];
    if (last && time < last.time) this.samples = []; // nouvelle partie
    if (last && time - last.time < 1 && this.samples.length > 1) {
      this.samples[this.samples.length - 1] = { time, ledger: { ...ledger } };
      return;
    }
    this.samples.push({ time, ledger: { ...ledger } });
    while (this.samples.length > 2 && time - this.samples[1].time >= BALANCE_WINDOW) this.samples.shift();
  }

  balance(): Balance | null {
    if (this.samples.length < 2) return null;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    return balanceBetween(a.ledger, b.ledger, b.time - a.time);
  }
}

export function balanceBetween(a: Ledger, b: Ledger, seconds: number): Balance | null {
  if (seconds < 1) return null;
  const delta = (k: ExpenseKind | 'revenue') => b[k] - a[k];
  const operating = Object.fromEntries(OPERATING.map((k) => [k, delta(k)])) as Balance['operating'];
  const spent = OPERATING.reduce((sum, k) => sum + operating[k], 0);
  const revenue = delta('revenue');
  return {
    seconds,
    revenue,
    operating,
    investment: delta('construction') + delta('hiring'),
    netPerSecond: (revenue - spent) / seconds,
  };
}

/** Nombre de mesures gardées par case : une par seconde de jeu sur la dernière minute. */
export const TEMP_HISTORY = 60;

/**
 * Historique des températures de toutes les cases, une mesure par seconde de jeu. L'inspecteur
 * y lit la courbe d'un équipement dès qu'on le sélectionne, sans attendre de nouvelles mesures.
 */
export class TemperatureHistory {
  private frames: Float32Array[] = [];
  private lastSecond = -1;

  record(time: number, temps: ArrayLike<number>): void {
    const second = Math.floor(time);
    if (second < this.lastSecond) this.frames = []; // nouvelle partie
    if (second === this.lastSecond) return;
    this.lastSecond = second;
    this.frames.push(Float32Array.from(temps));
    if (this.frames.length > TEMP_HISTORY) this.frames.shift();
  }

  /** Températures d'une case, de la plus ancienne à la plus récente. */
  series(cell: number): number[] {
    return this.frames.map((f) => f[cell]);
  }
}

/** Mesure du tableau de bord, prise toutes les HISTORY_STEP secondes de jeu. */
export interface Sample {
  time: number;
  /** Grand livre cumulé : les montants par minute se calculent par différence. */
  ledger: Ledger;
  computeUsed: number;
  computeTotal: number;
  pue: number | null;
  availability: number | null;
  avgTemp: number;
  maxTemp: number;
}

export const HISTORY_STEP = 5;
/** Au-delà (4 h de jeu), on ne garde qu'une mesure sur deux des plus anciennes. */
export const HISTORY_MAX = 2880;

/** Historique de la partie pour le tableau de bord ; repart de zéro quand le temps recule. */
export class GameHistory {
  private list: Sample[] = [];

  get samples(): readonly Sample[] {
    return this.list;
  }

  clear(): void {
    this.list = [];
  }

  record(s: GameState): void {
    const last = this.list[this.list.length - 1];
    if (last && s.time < last.time) this.list = [];
    else if (last && s.time - last.time < HISTORY_STEP) return;
    const t = tempStats(s);
    this.list.push({
      time: s.time,
      ledger: { ...s.economy.ledger },
      computeUsed: s.compute.used,
      computeTotal: s.compute.total,
      pue: pue(s),
      availability: availability(s),
      avgTemp: t.avg,
      maxTemp: t.max,
    });
    if (this.list.length > HISTORY_MAX) {
      const half = Math.floor(HISTORY_MAX / 2);
      this.list = [...this.list.slice(0, half).filter((_, i) => i % 2 === 0), ...this.list.slice(half)];
    }
  }

  /**
   * Revenus et dépenses d'exploitation par minute, sur la minute qui précède chaque mesure
   * (moins en tout début de partie). Les investissements n'y figurent pas.
   */
  flows(): { time: number; revenue: number; operating: number }[] {
    const out: { time: number; revenue: number; operating: number }[] = [];
    let j = 0;
    for (const b of this.list) {
      while (j < this.list.length - 1 && b.time - this.list[j + 1].time >= BALANCE_WINDOW) j++;
      const a = this.list[j];
      const bal = balanceBetween(a.ledger, b.ledger, b.time - a.time);
      if (!bal) continue;
      const perMinute = 60 / bal.seconds;
      const spent = OPERATING.reduce((sum, k) => sum + bal.operating[k], 0);
      out.push({ time: b.time, revenue: bal.revenue * perMinute, operating: spent * perMinute });
    }
    return out;
  }
}
