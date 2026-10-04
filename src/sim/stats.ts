import { RACK } from './balance';
import { isRackActive, type Building } from './entities';
import type { GameState } from './state';
import { inCoolingRange } from './systems/heat';

export function tempStats(s: GameState): { max: number; avg: number } {
  let max = -Infinity;
  let sum = 0;
  for (const t of s.temp) {
    if (t > max) max = t;
    sum += t;
  }
  return { max, avg: sum / s.temp.length };
}

/**
 * PUE (Power Usage Effectiveness) : énergie totale ÷ énergie des racks. 1 serait parfait ;
 * les CRAC l'augmentent. null sans rack en service.
 */
export function pue(s: GameState): number | null {
  let itKW = 0;
  for (const b of s.buildings) if (isRackActive(b)) itKW += RACK.powerKW;
  return itKW > 0 ? s.power.loadKW / itKW : null;
}

/** Part du temps où les racks installés ont fonctionné, depuis le début de la partie. */
export function availability(s: GameState): number | null {
  const e = s.economy;
  return e.rackSecondsInstalled > 0 ? e.rackSecondsActive / e.rackSecondsInstalled : null;
}

/** Débit réservé par les contrats en cours (CU/s). */
export function committedCompute(s: GameState): number {
  let total = 0;
  for (const j of s.jobs) if (j.status === 'active') total += j.rateCU;
  return total;
}

/** Calcul disponible pour une nouvelle offre : négatif si les contrats en cours dépassent déjà le parc. */
export function freeCapacity(s: GameState): number {
  return s.compute.total - committedCompute(s);
}

/**
 * Racks considérés « en calcul ». Le pool n'attribue pas le travail à des racks précis :
 * on désigne les plus anciens racks actifs, à hauteur du calcul utilisé. LEDs, mini-carte
 * et inspecteur partagent cette règle.
 */
export function busyRackIds(s: GameState): Set<number> {
  const busy = new Set<number>();
  let left = Math.ceil(s.compute.used / RACK.computeCU);
  for (const b of s.buildings) {
    if (left <= 0) break;
    if (isRackActive(b)) {
      busy.add(b.id);
      left--;
    }
  }
  return busy;
}

/** CRAC alimentés dont la portée couvre la case (x, y). */
export function coolersCovering(s: GameState, x: number, y: number): Building[] {
  return s.buildings.filter((b) => b.kind === 'crac' && b.status === 'ok' && b.powered && inCoolingRange(b.x, b.y, x, y));
}

/** Racks actifs dans la portée d'un CRAC et chaleur qu'ils dégagent (kW). */
export function cracHeatLoad(s: GameState, crac: Building): { racks: number; heatKW: number } {
  let racks = 0;
  for (const b of s.buildings) if (isRackActive(b) && inCoolingRange(crac.x, crac.y, b.x, b.y)) racks++;
  return { racks, heatKW: racks * RACK.heatKW };
}
