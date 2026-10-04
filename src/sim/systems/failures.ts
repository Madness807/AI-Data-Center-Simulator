import { FAILURE, PREDICTIVE, WEAR } from '../balance';
import { rackTemp } from '../climate';
import { isRackActive, type Building } from '../entities';
import { modifiers } from '../progression';
import { notify, type GameState } from '../state';
import { nextRandom } from '../rng';

/** Pannes par seconde d'un rack actif à la température donnée. */
export function failureRate(tempC: number): number {
  const over = Math.max(0, tempC - FAILURE.thresholdC);
  return FAILURE.baseRate + FAILURE.quadRate * over * over;
}

/** Forme exponentielle : dix ticks de 0,1 s donnent exactement la même probabilité qu'un tick de 1 s. */
export function failureProbability(tempC: number, dt: number): number {
  return 1 - Math.exp(-failureRate(tempC) * dt);
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
  return 1 - Math.exp(-rackFailureRate(s, b) * 60);
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
  for (const b of s.buildings) {
    // Les réparations avancent avec les techniciens (systems/technicians.ts).
    if (b.kind !== 'rack') continue;
    if (b.status === 'ok' && b.powered) {
      const t = rackTemp(s, b);
      if (nextRandom(s) < 1 - Math.exp(-failureRate(t) * wearMultiplier(s, b) * dt)) {
        b.status = 'failed';
        b.failures++;
        s.economy.failures++;
        notify(s, 'warning', `Panne du rack ${b.x},${b.y} (${t.toFixed(0)} °C)`, { cell: b, code: 'failure' });
      }
    }
  }
}
