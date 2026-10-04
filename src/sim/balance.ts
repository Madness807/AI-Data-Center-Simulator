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
/** Onduleur : batterie qui prend le relais dès la première seconde d'une coupure. */
export const UPS = { cost: 3500, storeKJ: 2400, powerKW: 40, rechargeKW: 8, heatKW: 1 };
/** Groupe électrogène : démarre en quelques secondes et tient toute la coupure, au prix du carburant. */
export const GENERATOR = { cost: 6000, powerKW: 60, startS: 15, fuelPerKWs: 0.25 };
/** CDU : refroidissement liquide des racks proches, rejeté dehors (pas dans la salle). */
export const CDU = { cost: 7000, radius: 2, capacityKW: 80, powerKW: 6, captured: 0.75 };

/** Allées (carrière) : part de la chaleur d'un rack soufflée sur la case arrière. */
export const AISLE = { exhaustShare: 0.7, containmentBoost: 1.25 };

/** Météo (carrière, à partir du palier minTier) : cycle de la température extérieure et canicules. */
export const WEATHER = {
  minTier: 2,
  meanC: 20,
  swingC: 8,
  periodS: 720,
  /** Efficacité des CRAC : +1,5 % par °C sous 20 °C, −1,5 % au-dessus, bornée. */
  cracPerC: 0.015,
  cracMin: 0.7,
  cracMax: 1.15,
  /** En dessous, le free cooling (recherche) divise par deux la consommation des CRAC. */
  freeCoolingBelowC: 18,
};
export const HEATWAVE = { firstDelayS: 360, interval: [600, 1080] as const, duration: [120, 240] as const, boostC: 14 };

/** Récupération de chaleur (recherche) : $ par kW·s de chaleur captée par les CDU. */
export const HEAT_REUSE = { pricePerKWs: 0.03 };

/**
 * Coupures du réseau (carrière, à partir du palier minTier). La première, plus tardive et
 * courte, laisse le temps d'étudier et de poser des onduleurs après l'avertissement du palier.
 */
export const OUTAGE = {
  minTier: 1,
  firstDelayS: 480,
  firstDurationS: 30,
  interval: [360, 720] as const,
  duration: [30, 120] as const,
  /** Risque de panne d'un rack qui perd brutalement le courant (non couvert par les onduleurs). */
  crashChance: 0.2,
};

export const BUILD_COST: Record<BuildingKind, number> = {
  rack: RACK.cost,
  crac: CRAC.cost,
  pdu: PDU.cost,
  ups: UPS.cost,
  generator: GENERATOR.cost,
  cdu: CDU.cost,
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
  /** Pannes/s d'un rack actif à froid (usure normale, ~0,8 %/min) : la chaleur reste la vraie menace. */
  baseRate: 1 / 7200,
  /** Pannes/s par °C² au-dessus du seuil : ~1/min à 50 °C, ~1/20 s à 60 °C. */
  quadRate: 7.5e-5,
};

export const REPAIR = { cost: 400, seconds: 8 };

export const ECONOMY = {
  /** $ par kW et par seconde de jeu, facturé sur la charge servie. */
  electricityPerKWs: 0.09,
  goalMoney: 100_000,
  bankruptcySeconds: 30,
};

export const JOBS = {
  maxOffers: 3,
  /** Secondes entre deux offres. */
  offerInterval: [20, 40] as const,
  offerExpiry: 45,
  firstOfferExpiry: 150,
  /** Débit demandé, en multiples de RACK.computeCU : de quoi occuper un grand parc. */
  maxUnits: 12,
  duration: [60, 180] as const,
  /** Délai = durée × marge ; une marge serrée paie plus. */
  slack: [1.3, 2.0] as const,
  /** $ par CU livré : un rack bien occupé se rembourse en une dizaine de minutes. */
  pricePerCU: 0.8,
  penaltyRatio: 0.5,
};

/** Secondes de travail d'un technicien pour terminer un chantier. */
export const BUILD_TIME: Record<BuildingKind, number> = { rack: 6, crac: 8, pdu: 5, ups: 6, generator: 10, cdu: 9 };

export const TECH = {
  /** Cases par seconde. */
  speed: 3,
  start: 2,
  max: 10,
  hireCost: 2000,
  salaryPerS: 0.4,
};
