import { OPERATING, type ExpenseKind, type Ledger } from '../sim/ledger';

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
