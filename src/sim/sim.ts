import { DT } from './balance';
import { processCommands } from './commands';
import type { GameState } from './state';
import { updateAlerts } from './systems/alerts';
import { autoAcceptOffers } from './systems/commercial';
import { updateEconomy } from './systems/economy';
import { updateFailures } from './systems/failures';
import { updateHeat } from './systems/heat';
import { updateJobs } from './systems/jobs';
import { updateIncidents } from './systems/incidents';
import { updateNetwork } from './network';
import { updateBackup, updatePower } from './systems/power';
import { updateTechnicians } from './systems/technicians';

/**
 * Un tick de simulation, dans un ordre fixe : commandes → incidents → techniciens → pannes →
 * énergie → secours → réseau → contrats → commercial → chaleur → économie, puis alertes préventives. Une
 * partie perdue est figée.
 */
export function step(s: GameState): void {
  processCommands(s);
  if (s.outcome === 'lost') return;
  updateIncidents(s);
  updateTechnicians(s, DT);
  updateFailures(s, DT);
  updatePower(s);
  updateBackup(s, DT);
  updateNetwork(s);
  updateJobs(s, DT);
  autoAcceptOffers(s);
  updateHeat(s, DT);
  updateEconomy(s, DT);
  s.tick++;
  s.time = s.tick * DT;
  updateAlerts(s);
}
