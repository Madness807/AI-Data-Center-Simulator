import { FAILURE } from '../balance';
import { idx, type GameState } from '../state';
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

export function updateFailures(s: GameState, dt: number): void {
  for (const b of s.buildings) {
    if (b.kind !== 'rack') continue;
    if (b.status === 'repairing') {
      b.repairLeft -= dt;
      if (b.repairLeft <= 0) {
        b.status = 'ok';
        b.repairLeft = 0;
        s.events.push({ type: 'info', message: `Rack ${b.x},${b.y} réparé` });
      }
    } else if (b.status === 'ok' && b.powered) {
      const t = s.temp[idx(s, b.x, b.y)];
      if (nextRandom(s) < failureProbability(t, dt)) {
        b.status = 'failed';
        s.events.push({ type: 'warning', message: `Panne du rack ${b.x},${b.y} (${t.toFixed(0)} °C)` });
      }
    }
  }
}
