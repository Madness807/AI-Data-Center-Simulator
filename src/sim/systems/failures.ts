import { FAILURE } from '../balance';
import { idx, notify, type GameState } from '../state';
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

export function updateFailures(s: GameState, dt: number): void {
  for (const b of s.buildings) {
    // Les réparations avancent avec les techniciens (systems/technicians.ts).
    if (b.kind !== 'rack') continue;
    if (b.status === 'ok' && b.powered) {
      const t = s.temp[idx(s, b.x, b.y)];
      if (nextRandom(s) < failureProbability(t, dt)) {
        b.status = 'failed';
        b.failures++;
        notify(s, 'warning', `Panne du rack ${b.x},${b.y} (${t.toFixed(0)} °C)`, b);
      }
    }
  }
}
