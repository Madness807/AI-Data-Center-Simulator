import { ECONOMY, TECH } from '../balance';
import { isRackActive } from '../entities';
import { spend } from '../ledger';
import { notify, type GameState } from '../state';

/** Électricité et salaires, compte à rebours de faillite et objectif. */
export function updateEconomy(s: GameState, dt: number): void {
  const perS = s.power.loadKW * ECONOMY.electricityPerKWs;
  const salaries = s.techs.length * TECH.salaryPerS;
  s.economy.electricityPerS = perS;
  s.economy.salariesPerS = salaries;
  spend(s, 'electricity', perS * dt);
  spend(s, 'salaries', salaries * dt);

  // Disponibilité : temps de service des racks installés (une panne ou un délestage la fait baisser).
  for (const b of s.buildings) {
    if (b.kind !== 'rack' || b.status === 'construction') continue;
    s.economy.rackSecondsInstalled += dt;
    if (isRackActive(b)) s.economy.rackSecondsActive += dt;
  }

  if (s.money < 0) {
    s.economy.bankruptTimer += dt;
    if (s.economy.bankruptTimer >= ECONOMY.bankruptcySeconds) {
      s.outcome = 'lost';
      s.speed = 0;
      notify(s, 'error', 'Faillite : le data center ferme ses portes', { code: 'bankrupt' });
    }
  } else {
    s.economy.bankruptTimer = 0;
  }

  if (!s.rules.progression && s.outcome === 'playing' && s.money >= ECONOMY.goalMoney) {
    s.outcome = 'won';
    notify(s, 'success', 'Objectif atteint ! La partie continue en mode libre.', { code: 'won' });
  }
}
