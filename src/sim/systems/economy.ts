import { ECONOMY } from '../balance';
import type { GameState } from '../state';

/** Facture d'électricité, compte à rebours de faillite et objectif. */
export function updateEconomy(s: GameState, dt: number): void {
  const perS = s.power.loadKW * ECONOMY.electricityPerKWs;
  s.economy.electricityPerS = perS;
  s.money -= perS * dt;

  if (s.money < 0) {
    s.economy.bankruptTimer += dt;
    if (s.economy.bankruptTimer >= ECONOMY.bankruptcySeconds) {
      s.outcome = 'lost';
      s.speed = 0;
      s.events.push({ type: 'error', message: 'Faillite : le data center ferme ses portes' });
    }
  } else {
    s.economy.bankruptTimer = 0;
  }

  if (s.outcome === 'playing' && s.money >= ECONOMY.goalMoney) {
    s.outcome = 'won';
    s.events.push({ type: 'success', message: 'Objectif atteint ! La partie continue en mode libre.' });
  }
}
