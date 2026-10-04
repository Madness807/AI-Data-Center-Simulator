import type { BuildingKind } from './entities';

export const TICK_HZ = 10;
export const DT = 1 / TICK_HZ;
/** Évite la spirale de rattrapage si l'onglet a été en arrière-plan. */
export const MAX_TICKS_PER_FRAME = 40;

export const GRID_W = 24;
export const GRID_H = 16;
/** Cases réservées à l'entrée de la salle (accès des techniciens en v0.1c). */
export const ENTRANCE: ReadonlyArray<readonly [number, number]> = [
  [0, 7],
  [0, 8],
];

export const START_MONEY = 30_000;
export const DEMOLISH_REFUND = 0.5;

export const RACK = { cost: 3000, powerKW: 10, heatKW: 10, computeCU: 10 };
export const CRAC = { cost: 4000, powerKW: 4, coolingKW: 30, radius: 3 };
export const PDU = { cost: 2500, capacityKW: 40 };

export const BUILD_COST: Record<BuildingKind, number> = {
  rack: RACK.cost,
  crac: CRAC.cost,
  pdu: PDU.cost,
};

export const HEAT = {
  /** °C, température de l'air neuf et plancher de refroidissement. */
  ambient: 22,
  /** kJ/°C par case : inertie thermique de l'air d'une case. */
  cellCapacity: 1.5,
  /** 1/s, échange avec chacune des 4 voisines. k·dt doit rester ≤ 0.2. */
  diffusion: 0.3,
  /** 1/s, fuite lente vers l'ambiant (murs, renouvellement d'air). */
  ambientLoss: 0.004,
  /** °C, un CRAC ne refroidit pas une case en dessous. */
  cracTarget: 22,
};
