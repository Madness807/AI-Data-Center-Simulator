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
