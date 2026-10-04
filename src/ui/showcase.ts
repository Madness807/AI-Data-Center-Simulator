import { addBuilding, addTech, createInitialState, type GameState } from '../sim/state';
import { updatePower } from '../sim/systems/power';

/**
 * Décor de l'écran titre : une salle bien remplie (rangées de racks, CRAC, PDU) qui tourne
 * lentement derrière le menu. Purement visuel : la simulation reste en pause.
 */
export function createShowcaseState(): GameState {
  const s = createInitialState(7);
  s.speed = 0;
  s.jobs = [];
  // Assez de PDU pour tout alimenter : pas de rack délesté (rouge) sur l'écran titre.
  for (let x = 2; x <= 10; x++) addBuilding(s, 'pdu', x, 1);
  for (const y of [4, 5, 10, 11]) {
    for (let x = 8; x <= 15; x++) addBuilding(s, 'rack', x, y);
  }
  for (const [x, y] of [[6, 4], [17, 5], [6, 11], [17, 10], [12, 7], [12, 14]]) addBuilding(s, 'crac', x, y);
  addTech(s, { x: 10, y: 7 });
  addTech(s, { x: 15, y: 9 });
  addBuilding(s, 'rack', 21, 13, true).workLeft = 3; // un chantier en cours
  updatePower(s);
  const powered = s.buildings.filter((b) => b.kind === 'rack' && b.powered).length;
  s.compute = { total: powered * 10, used: Math.round(powered * 0.7) * 10 };
  s.techs[2].working = true;
  return s;
}
