import { DT } from './balance';
import { processCommands } from './commands';
import type { GameState } from './state';
import { updateHeat } from './systems/heat';
import { updatePower } from './systems/power';

/** Un tick de simulation. Ordre fixe : commandes → énergie → chaleur. */
export function step(s: GameState): void {
  processCommands(s);
  updatePower(s);
  updateHeat(s, DT);
  s.tick++;
  s.time = s.tick * DT;
}
