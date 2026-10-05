import type { KeyValueStore } from '../src/settings';
import { DT, GRID_H, GRID_W } from '../src/sim/balance';
import type { GameMode } from '../src/sim/career';
import type { Job } from '../src/sim/entities';
import { step } from '../src/sim/sim';
import { addBuilding, createEmptyState, type GameState } from '../src/sim/state';

export function runSeconds(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) step(s);
}

/** Avance jusqu'à ce que la condition soit vraie ; renvoie false si le délai est écoulé. */
export function runUntil(s: GameState, cond: () => boolean, maxSeconds: number): boolean {
  for (let i = 0; i < Math.round(maxSeconds / DT); i++) {
    if (cond()) return true;
    step(s);
  }
  return cond();
}

/** Plus aucune offre de contrat (une valeur finie : elle survit au JSON d'une sauvegarde). */
export function noOffers(s: GameState): GameState {
  s.nextOfferAt = Number.MAX_SAFE_INTEGER;
  return s;
}

/**
 * Salle de test à la taille du jeu : une rangée de `pdus` PDU en y = 0, sans offres (sauf
 * `offers`). Chaque fichier garde sa graine : plusieurs tests dépendent de leur hasard.
 */
export function room(seed: number, o: { mode?: GameMode; pdus?: number; money?: number; tier?: number; offers?: boolean } = {}): GameState {
  const s = createEmptyState(seed, GRID_W, GRID_H, o.mode ?? 'career');
  if (!o.offers) noOffers(s);
  if (o.money !== undefined) s.money = o.money;
  if (o.tier !== undefined) s.career.tier = o.tier;
  for (let x = 0; x < (o.pdus ?? 0); x++) addBuilding(s, 'pdu', x, 0);
  return s;
}

/** Contrat de test : tous les champs obligatoires, à compléter selon le besoin. */
export function testJob(o: Partial<Job> & Pick<Job, 'id'>): Job {
  return {
    name: `C${o.id}`,
    status: 'active',
    rateCU: 10,
    durationS: 100,
    work: 1000,
    progress: 0,
    deadlineInS: 1000,
    payment: 1000,
    penalty: 500,
    offeredAt: 0,
    expiresAt: 0,
    deadline: 1000,
    allocated: 0,
    ...o,
  };
}

/** Stockage en mémoire, à la place de celui du navigateur. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
