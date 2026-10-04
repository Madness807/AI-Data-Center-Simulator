import { DT } from './balance';
import { processCommands } from './commands';
import type { GameState } from './state';
import { updateEconomy } from './systems/economy';
import { updateFailures } from './systems/failures';
import { updateHeat } from './systems/heat';
import { updateJobs } from './systems/jobs';
import { updatePower } from './systems/power';
import { updateTechnicians } from './systems/technicians';

/**
 * Un tick de simulation, dans un ordre fixe : commandes → techniciens → pannes →
 * énergie → contrats → chaleur → économie. Une partie perdue est figée.
 */
export function step(s: GameState): void {
  processCommands(s);
  if (s.outcome === 'lost') return;
  updateTechnicians(s, DT);
  updateFailures(s, DT);
  updatePower(s);
  updateJobs(s, DT);
  updateHeat(s, DT);
  updateEconomy(s, DT);
  s.tick++;
  s.time = s.tick * DT;
}
