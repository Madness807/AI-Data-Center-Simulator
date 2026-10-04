import { step } from '../src/sim/sim';
import type { GameState } from '../src/sim/state';

export function runSeconds(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 10); i++) step(s);
}
