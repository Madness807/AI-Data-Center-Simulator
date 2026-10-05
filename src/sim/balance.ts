import type { Building, BuildingKind, Gen } from './entities';

export const TICK_HZ = 10;
export const DT = 1 / TICK_HZ;
/** Évite la spirale de rattrapage si l'onglet a été en arrière-plan. */
export const MAX_TICKS_PER_FRAME = 40;

export const GRID_W = 24;
export const GRID_H = 16;
/** Cases réservées à l'entrée de la salle : les techniciens y arrivent et doivent pouvoir en partir. */
export const ENTRANCE: ReadonlyArray<readonly [number, number]> = [
  [0, 7],
  [0, 8],
];

export const START_MONEY = 30_000;
export const DEMOLISH_REFUND = 0.5;
/** Salle de départ, la même dans les deux modes : un PDU au fond, un CRAC au centre. */
export const START_LAYOUT = { pdu: { x: 1, y: 1 }, crac: { x: 8, y: 8 } };

export const RACK = { cost: 3000, powerKW: 10, heatKW: 10, computeCU: 10 };

/**
 * Générations de GPU (carrière) : chaque génération donne plus de calcul par kW, mais plus de
 * chaleur par case ; la troisième demande en pratique un refroidissement liquide.
 */
export const GPU: Record<Gen, { cost: number; powerKW: number; heatKW: number; computeCU: number }> = {
  1: RACK,
  2: { cost: 6500, powerKW: 18, heatKW: 18, computeCU: 25 },
  3: { cost: 14000, powerKW: 36, heatKW: 36, computeCU: 60 },
};

/** Dernière génération de GPU. */
export const MAX_GEN = Math.max(...Object.keys(GPU).map(Number)) as Gen;

/** Caractéristiques d'un rack selon sa génération. */
export function rackSpec(b: Pick<Building, 'gen'>): (typeof GPU)[Gen] {
  return GPU[b.gen ?? 1];
}

/**
 * Usure (carrière, à partir du palier minTier) : un rack en service s'use (deux fois plus vite
 * quand il aspire de l'air chaud) ; à 100 % d'usure, son taux de panne est triplé. L'âge
 * l'augmente aussi lentement (+60 % par heure de service).
 */
export const WEAR = { minTier: 1, perS: 100 / 1500, hotC: 32, hotMult: 2, failureMult: 2, agePerHour: 0.6 };
/** Entretien : court et peu cher ; la maintenance planifiée s'en charge au-delà de autoAbove. */
export const MAINTENANCE = { cost: 100, seconds: 4, autoAbove: 50 };
/** Stock de pièces (recherche) : réparations moins chères et plus courtes. */
export const SPARE_PARTS = { cost: 250, seconds: 5 };
/** Un spécialiste va deux fois plus vite dans son domaine. */
export const SPECIALTY = { speed: 2 };
/**
 * Maintenance prédictive (recherche) : pannes −30 %, alerte au-delà de 5 % de risque par minute,
 * réarmée sous la moitié de ce seuil (après un entretien, typiquement).
 */
const PREDICTIVE_WARN_PER_MIN = 0.05;
export const PREDICTIVE = { failureMult: 0.7, warnPerMin: PREDICTIVE_WARN_PER_MIN, resetPerMin: PREDICTIVE_WARN_PER_MIN / 2 };

/** Moderniser un rack coûte la différence de prix, majorée. */
export const RETROFIT = { surcharge: 1.2 };

/** Contrats d'entraînement (carrière) : un bloc de racks contigus, dédié au contrat. */
export const TRAINING = {
  minTier: 2,
  share: 0.35,
  cluster: { 2: [3, 6], 3: [4, 8] } as Record<number, readonly [number, number]>,
  duration: [150, 300] as const,
  /** Délai = durée × marge, plus large que pour l'inférence. */
  slack: [1.5, 2.2] as const,
  priceMult: 1.4,
  /** Variation aléatoire du prix : de min à min + spread. */
  priceJitter: { min: 0.9, spread: 0.3 },
  /** Génération minimale des racks du bloc. */
  minGen: 1 as Gen,
  /** Progression perdue quand le bloc est rompu (panne) : sans, puis avec les points de contrôle. */
  rollback: 0.25,
  rollbackCheckpoints: 0.05,
};

/** Inférence avec engagement de disponibilité (SLA) : payée plus, pénalisée si le débit manque. */
export const SLA = { minTier: 2, share: 0.3, priceMult: 1.3, tolerance: 0.01 };
export const CRAC = { cost: 4000, powerKW: 4, coolingKW: 30, radius: 3 };
/** Racks G1 qu'un CRAC refroidit à lui seul (pour les conseils affichés). */
export const RACKS_PER_CRAC = Math.round(CRAC.coolingKW / RACK.heatKW);
export const PDU = { cost: 2500, capacityKW: 40 };
/** Onduleur : batterie qui prend le relais dès la première seconde d'une coupure. */
export const UPS = { cost: 3500, storeKJ: 2400, powerKW: 40, rechargeKW: 8, heatKW: 1 };
/** Groupe électrogène : démarre en quelques secondes et tient toute la coupure, au prix du carburant. */
export const GENERATOR = { cost: 6000, powerKW: 60, startS: 15, fuelPerKWs: 0.25 };
/** CDU : refroidissement liquide des racks proches, rejeté dehors (pas dans la salle). */
export const CDU = { cost: 7000, radius: 2, capacityKW: 80, powerKW: 6, captured: 0.75 };

/** Interconnexion optique (recherche) : deux racks d'un même bloc peuvent être à `reach` cases, et un câble réseau porte à `cableReach` cases. */
export const OPTICAL = { reach: 2, cableReach: 16 };

/**
 * Réseau (carrière) : chaque rack se câble seul au switch le plus proche qui a un port libre, par
 * les cases libres (au plus `reach` cases de câble). À partir du palier minTier, chaque rack d'un
 * bloc d'entraînement doit être relié à un switch en service ; un bloc réparti sur plusieurs
 * switchs entraîne à `crossSwitch` de sa vitesse, sauf avec la recherche Fabric. Un switch ne
 * tombe jamais en panne et ne s'use pas.
 */
export const NETWORK = { minTier: TRAINING.minTier, cost: 2000, powerKW: 1, heatKW: 1, ports: 8, reach: 10, crossSwitch: 0.7 };

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
  /** En dessous, le free cooling (recherche) réduit la consommation des CRAC. */
  freeCoolingBelowC: 18,
  freeCoolingPowerMult: 0.5,
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

/** Prix d'un équipement (d'un rack selon sa génération). */
export function buildCost(kind: BuildingKind, gen: Gen = 1): number {
  return kind === 'rack' ? GPU[gen].cost : BUILD_COST[kind];
}

export const BUILD_COST: Record<BuildingKind, number> = {
  rack: RACK.cost,
  crac: CRAC.cost,
  pdu: PDU.cost,
  ups: UPS.cost,
  generator: GENERATOR.cost,
  cdu: CDU.cost,
  switch: NETWORK.cost,
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

/** Seuils des alertes préventives : prévenir avant la casse, une fois par épisode. */
export const ALERTS = {
  /** °C : un rack approche du seuil de panne ; l'alerte se réarme quand il a refroidi. */
  hotC: FAILURE.thresholdC - 3,
  hotResetC: FAILURE.thresholdC - 5,
  /** Part de la capacité électrique demandée. */
  power: 0.9,
  powerReset: 0.85,
  /** Secondes de dépenses courantes (électricité, salaires) couvertes par la trésorerie. */
  cashS: 60,
  cashResetS: 120,
  /** Secondes d'une panne sans technicien affecté avant l'alerte. */
  unattendedS: 20,
  /** Un contrat tout juste accepté n'est pas jugé avant que le calcul lui soit attribué. */
  lateGraceS: 5,
  /** Secondes d'autonomie des onduleurs en coupure. */
  upsLowS: 20,
  /** Les alertes se calculent une fois par seconde de jeu. */
  everyTicks: TICK_HZ,
};

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
  /** Taille d'une offre : au moins minUnits racks, au plus unitsPerRack × le parc (et le plafond du palier). */
  minUnits: 2,
  unitsPerRack: 0.6,
  /** Une échéance serrée paie plus : +tightBonus par point de marge sous le maximum. */
  tightBonus: 0.6,
  /** Variation aléatoire du prix : de min à min + spread. */
  priceJitter: { min: 0.85, spread: 0.35 },
  /** Premier contrat, proposé dès l'ouverture (débit en racks), puis première offre suivante. */
  firstJob: { units: 2, durationS: 60, deadlineInS: 150, payment: 6000, penalty: 1500 },
  firstOfferAt: 60,
};

/**
 * Paliers de la carrière (noms et nouveautés dans progression.ts) : réputation et calcul en
 * service exigés, taille maximale des offres (en racks) et multiplicateur des prix.
 */
export const TIER_LEVELS = [
  { reputation: 0, maxUnits: 4, priceMult: 1 },
  { reputation: 150, maxUnits: 8, priceMult: 1.1 },
  { reputation: 500, computeCU: 150, maxUnits: 12, priceMult: 1.2 },
  { reputation: 2000, computeCU: 400, maxUnits: 20, priceMult: 1.3 },
] as const;

/** Réputation (carrière) : une livraison à l'heure rapporte delivery + 1 point par cuPerPoint CU/s ; un retard coûte late. */
export const REPUTATION = { delivery: 10, cuPerPoint: 10, late: -25 };

/** Recherche (carrière) : points par CU·s consacré à la R&D, part du calcul réservée (au départ et au plus). */
export const RESEARCH_RATE = { pointsPerCU: 0.1, defaultShare: 0.2, maxShare: 0.5 };

/** Secondes de travail d'un technicien pour terminer un chantier. */
export const BUILD_TIME: Record<BuildingKind, number> = { rack: 6, crac: 8, pdu: 5, ups: 6, generator: 10, cdu: 9, switch: 5 };

export const TECH = {
  /** Cases par seconde. */
  speed: 3,
  start: 2,
  max: 10,
  hireCost: 2000,
  salaryPerS: 0.4,
};
