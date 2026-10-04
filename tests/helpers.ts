import { DT } from '../src/sim/balance';
import { step } from '../src/sim/sim';
import type { GameState } from '../src/sim/state';

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
