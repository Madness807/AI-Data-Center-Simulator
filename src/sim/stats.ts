import type { GameState } from './state';

export function tempStats(s: GameState): { max: number; avg: number } {
  let max = -Infinity;
  let sum = 0;
  for (const t of s.temp) {
    if (t > max) max = t;
    sum += t;
  }
  return { max, avg: sum / s.temp.length };
}

/** Débit réservé par les contrats en cours (CU/s). */
export function committedCompute(s: GameState): number {
  let total = 0;
  for (const j of s.jobs) if (j.status === 'active') total += j.rateCU;
  return total;
}

/** Calcul disponible pour une nouvelle offre : négatif si les contrats en cours dépassent déjà le parc. */
export function freeCapacity(s: GameState): number {
  return s.compute.total - committedCompute(s);
}
