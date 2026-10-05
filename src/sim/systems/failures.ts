import { FAILURE, PREDICTIVE, WEAR } from '../balance';
import { rackTemp } from '../climate';
import { isRackActive, type Building } from '../entities';
import { modifiers } from '../progression';
import { chance } from '../math';
import { nextRandom } from '../rng';
import { notify, type GameState } from '../state';

/** Pannes par seconde d'un rack actif à la température donnée. */
export function failureRate(tempC: number): number {
  const over = Math.max(0, tempC - FAILURE.thresholdC);
  return FAILURE.baseRate + FAILURE.quadRate * over * over;
}

/** Probabilité de panne pendant dt (forme exponentielle, indépendante du pas). */
export function failureProbability(tempC: number, dt: number): number {
  return chance(failureRate(tempC), dt);
}

/** Probabilité qu'un rack actif tombe en panne dans la minute, à cette température. */
export function failureRiskPerMinute(tempC: number): number {
  return failureProbability(tempC, 60);
}

/** L'usure et le vieillissement comptent-ils dans cette partie (carrière, palier atteint) ? */
export function wearActive(s: GameState): boolean {
  return s.rules.wear && s.career.tier >= WEAR.minTier;
}

/** Multiplicateur du taux de panne d'un rack : usure, âge, maintenance prédictive (1 en partie rapide). */
export function wearMultiplier(s: GameState, b: Building): number {
  let m = 1;
  if (wearActive(s)) {
    m *= 1 + ((b.wear ?? 0) / 100) * WEAR.failureMult;
    if (b.builtAt !== null) m *= 1 + ((s.time - b.builtAt) / 3600) * WEAR.agePerHour;
  }
  if (modifiers(s).predictive) m *= PREDICTIVE.failureMult;
  return m;
}

/** Pannes par seconde d'un rack en service : air aspiré, puis usure et âge. */
export function rackFailureRate(s: GameState, b: Building): number {
  return failureRate(rackTemp(s, b)) * wearMultiplier(s, b);
}

/** Probabilité qu'un rack tombe en panne dans la minute qui vient. */
export function rackRiskPerMinute(s: GameState, b: Building): number {
  return chance(rackFailureRate(s, b), 60);
}

/** Un rack tombe en panne : statut, compteurs, alerte ; `detail` complète le message. */
export function failRack(s: GameState, b: Building, detail: string): void {
  b.status = 'failed';
  b.failures++;
  s.economy.failures++;
  notify(s, 'warning', `Panne du rack ${b.x},${b.y}${detail}`, { cell: b, code: 'failure' });
}

/** Usure : chaque rack en service s'use, deux fois plus vite quand il aspire de l'air chaud. */
export function updateWear(s: GameState, dt: number): void {
  if (!wearActive(s)) return;
  for (const b of s.buildings) {
    if (!isRackActive(b)) continue;
    const rate = WEAR.perS * (rackTemp(s, b) >= WEAR.hotC ? WEAR.hotMult : 1);
    b.wear = Math.min(100, (b.wear ?? 0) + rate * dt);
  }
}

export function updateFailures(s: GameState, dt: number): void {
  updateWear(s, dt);
  // Seuls les racks en service tombent en panne ; les réparations avancent avec les techniciens.
  for (const b of s.buildings) {
    if (!isRackActive(b)) continue;
    if (nextRandom(s) < chance(rackFailureRate(s, b), dt)) failRack(s, b, ` (${rackTemp(s, b).toFixed(0)} °C)`);
  }
}
