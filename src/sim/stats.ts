import { RACK } from './balance';
import type { GameState } from './state';

export function computeCU(s: GameState): number {
  let n = 0;
  for (const b of s.buildings) if (b.kind === 'rack' && b.powered) n++;
  return n * RACK.computeCU;
}

export function tempStats(s: GameState): { max: number; avg: number } {
  let max = -Infinity;
  let sum = 0;
  for (const t of s.temp) {
    if (t > max) max = t;
    sum += t;
  }
  return { max, avg: sum / s.temp.length };
}
