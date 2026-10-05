import { GENERATOR, rackSpec } from './balance';
import { isRackActive, type Building } from './entities';
import { buildingById, type GameState } from './state';
import { cracWeatherFactor } from './climate';
import { modifiers, researchReserve } from './progression';
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
  for (const b of s.buildings) if (isRackActive(b)) itKW += rackSpec(b).powerKW;
  return itKW > 0 ? s.power.loadKW / itKW : null;
}

/** Part du temps où les racks installés ont fonctionné, depuis le début de la partie. */
export function availability(s: GameState): number | null {
  const e = s.economy;
  return e.rackSecondsInstalled > 0 ? e.rackSecondsActive / e.rackSecondsInstalled : null;
}

/**
 * Redondance N+1 : la perte du plus gros élément (un PDU, un groupe électrogène) ne
 * délesterait rien. `backup` vaut null sans groupe électrogène.
 */
export function redundancy(s: GameState): { pdu: boolean; backup: boolean | null } {
  const count = (kind: Building['kind']) => s.buildings.filter((b) => b.kind === kind && b.status === 'ok').length;
  const demand = s.power.demandKW;
  const gens = count('generator');
  return {
    pdu: (count('pdu') - 1) * modifiers(s).pduCapacityKW >= demand,
    backup: gens ? (gens - 1) * GENERATOR.powerKW >= demand : null,
  };
}

/** Débit réservé par les contrats en cours (CU/s). */
export function committedCompute(s: GameState): number {
  let total = 0;
  for (const j of s.jobs) if (j.status === 'active') total += j.rateCU;
  return total;
}

/**
 * Calcul disponible pour une nouvelle offre (hors part réservée à la recherche) : négatif si
 * les contrats en cours dépassent déjà le parc.
 */
export function freeCapacity(s: GameState): number {
  return s.compute.total - researchReserve(s) - committedCompute(s);
}

/** Puissance de froid d'un CRAC, recherche et météo comprises. */
export function cracCoolingKW(s: GameState): number {
  return modifiers(s).cracCoolingKW * cracWeatherFactor(s);
}

/**
 * Racks considérés « en calcul ». Le pool n'attribue pas le travail à des racks précis :
 * on désigne les plus anciens racks actifs, à hauteur du calcul utilisé. LEDs, mini-carte
 * et inspecteur partagent cette règle.
 */
export function busyRackIds(s: GameState): Set<number> {
  // Les blocs d'entraînement d'abord : leurs racks sont dédiés.
  const busy = new Set<number>();
  let left = s.compute.used;
  for (const j of s.jobs) {
    if (j.status !== 'active' || !j.assigned) continue;
    for (const id of j.assigned) {
      const b = buildingById(s, id);
      if (!b || busy.has(id)) continue;
      busy.add(id);
      left -= rackSpec(b).computeCU;
    }
  }
  for (const b of s.buildings) {
    if (left <= 1e-6) break;
    if (isRackActive(b) && !busy.has(b.id)) {
      busy.add(b.id);
      left -= rackSpec(b).computeCU;
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
  let heatKW = 0;
  for (const b of s.buildings) {
    if (!isRackActive(b) || !inCoolingRange(crac.x, crac.y, b.x, b.y)) continue;
    racks++;
    heatKW += rackSpec(b).heatKW;
  }
  return { racks, heatKW };
}
