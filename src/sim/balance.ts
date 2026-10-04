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

export const FAILURE = {
  /** °C au-delà duquel le taux de panne grimpe. */
  thresholdC: 35,
  /** Pannes/s d'un rack actif à froid (usure normale). */
  baseRate: 1 / 3600,
  /** Pannes/s par °C² au-dessus du seuil : ~1/min à 50 °C, ~1/20 s à 60 °C. */
  quadRate: 7.5e-5,
};

export const REPAIR = { cost: 400, seconds: 8 };

export const ECONOMY = {
  /** $ par kW et par seconde de jeu, facturé sur la charge servie. */
  electricityPerKWs: 0.09,
  goalMoney: 50_000,
  bankruptcySeconds: 30,
};

export const JOBS = {
  maxOffers: 3,
  /** Secondes entre deux offres. */
  offerInterval: [20, 40] as const,
  offerExpiry: 45,
  firstOfferExpiry: 150,
  /** Débit demandé, en multiples de RACK.computeCU. */
  maxUnits: 8,
  duration: [60, 180] as const,
  /** Délai = durée × marge ; une marge serrée paie plus. */
  slack: [1.3, 2.0] as const,
  pricePerCU: 0.4,
  penaltyRatio: 0.5,
};

/** Secondes de travail d'un technicien pour terminer un chantier. */
export const BUILD_TIME: Record<BuildingKind, number> = { rack: 6, crac: 8, pdu: 5 };

export const TECH = {
  /** Cases par seconde. */
  speed: 3,
  start: 2,
  max: 10,
  hireCost: 2000,
  salaryPerS: 0.4,
};
