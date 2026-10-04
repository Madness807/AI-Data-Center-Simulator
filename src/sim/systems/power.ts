import { CRAC, PDU, RACK } from '../balance';
import type { Building } from '../entities';
import type { GameState } from '../state';

/**
 * Capacité globale = somme des PDU. Les CRAC sont servis en premier,
 * puis les racks par priorité ; ceux qui ne rentrent plus sont délestés.
 */
export function updatePower(s: GameState): void {
  let capacity = 0;
  const cracs: Building[] = [];
  const racks: Building[] = [];
  for (const b of s.buildings) {
    if (b.status !== 'ok') b.powered = false; // chantier, panne, réparation : ne consomme rien
    else if (b.kind === 'pdu') {
      capacity += PDU.capacityKW;
      b.powered = true;
    } else if (b.kind === 'crac') cracs.push(b);
    else racks.push(b);
  }

  let remaining = capacity;
  let shed = 0;
  const serve = (b: Building, kw: number) => {
    b.powered = remaining >= kw;
    if (b.powered) remaining -= kw;
    else shed++;
  };
  for (const c of cracs) serve(c, CRAC.powerKW);
  for (const r of racks.sort(byRackPriority)) serve(r, RACK.powerKW);

  s.power = {
    capacityKW: capacity,
    demandKW: cracs.length * CRAC.powerKW + racks.length * RACK.powerKW,
    loadKW: capacity - remaining,
    shedCount: shed,
  };
}

/** Les contrats puisent dans un pool commun : les racks les plus récents sont délestés d'abord. */
function byRackPriority(a: Building, b: Building): number {
  return a.id - b.id;
}
