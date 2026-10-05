import { AISLE, CDU, GENERATOR, GPU, MAINTENANCE, NETWORK, OPTICAL, PREDICTIVE, REPAIR, RETROFIT, SPARE_PARTS, SPECIALTY, TRAINING, UPS, WEATHER } from './balance';
import type { BuildingKind, Gen } from './entities';

/** Branches de l'arbre, une colonne chacune dans le panneau Recherche. */
export type Branch = 'compute' | 'network' | 'cooling' | 'power' | 'ops';

export const BRANCHES: { id: Branch; name: string }[] = [
  { id: 'compute', name: 'Calcul' },
  { id: 'network', name: 'Réseau' },
  { id: 'cooling', name: 'Refroidissement' },
  { id: 'power', name: 'Énergie' },
  { id: 'ops', name: 'Exploitation' },
];

/** Effets d'un nœud, cumulés par modifiers() (progression.ts). */
export interface ResearchEffect {
  /** Multiplicateurs. */
  cracCooling?: number;
  pduCapacity?: number;
  techSpeed?: number;
  workRate?: number;
  electricity?: number;
  reputation?: number;
  upsStore?: number;
  /** Démarrage des groupes électrogènes (secondes), remplace la valeur de base. */
  generatorStartS?: number;
  /** Capacités nouvelles. */
  autoRepair?: true;
  opportunistic?: true;
  containment?: true;
  freeCooling?: true;
  heatReuse?: true;
  /** Génération de GPU qui devient constructible. */
  gen?: Gen;
  retrofit?: true;
  checkpoints?: true;
  optical?: true;
  autoMaintain?: true;
  spareParts?: true;
  specialties?: true;
  predictive?: true;
  /** Équipements qui deviennent constructibles. */
  unlocks?: BuildingKind[];
}

export interface ResearchNode {
  id: string;
  branch: Branch;
  /** Niveau, débloqué par le palier de même rang (1 = Start-up). */
  level: number;
  name: string;
  /** Ce que le nœud change, en une phrase. */
  description: string;
  /** Points de recherche (1 point = 10 CU·s consacrés à la R&D). */
  cost: number;
  requires: string[];
  effect: ResearchEffect;
}

/** Textes des descriptions : les nombres viennent des réglages, jamais recopiés à la main. */
const pct = (x: number) => `${Math.round(x * 100)} %`;
const num = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** Un nœud dont la description peut dépendre de son propre effet (évaluée une fois, au chargement). */
type NodeSpec = Omit<ResearchNode, 'description'> & { description: string | ((effect: ResearchEffect) => string) };

/**
 * L'arbre. Les nœuds de niveau 1 modifient les systèmes existants ; les niveaux suivants
 * arrivent avec les lots qui créent leurs systèmes (énergie de secours, refroidissement…).
 */
const NODES: readonly NodeSpec[] = [
  {
    id: 'opportunistic',
    branch: 'compute',
    level: 1,
    name: 'Ordonnanceur opportuniste',
    description: 'Le calcul que les contrats laissent inactif part aussi en recherche.',
    cost: 300,
    requires: [],
    effect: { opportunistic: true },
  },
  {
    id: 'gpu-g2',
    branch: 'compute',
    level: 2,
    name: 'GPU génération 2',
    description: `Rack G2 : ${GPU[2].computeCU} CU/s pour ${GPU[2].powerKW} kW (×${num(GPU[2].computeCU / GPU[1].computeCU)} de calcul pour ×${num(GPU[2].heatKW / GPU[1].heatKW)} de chaleur).`,
    cost: 900,
    requires: [],
    effect: { gen: 2 },
  },
  {
    id: 'retrofit',
    branch: 'compute',
    level: 2,
    name: 'Modernisation',
    description: `Un technicien remplace les GPU d’un rack sur place, pour la différence de prix plus ${pct(RETROFIT.surcharge - 1)}.`,
    cost: 600,
    requires: ['gpu-g2'],
    effect: { retrofit: true },
  },
  {
    id: 'checkpoints',
    branch: 'compute',
    level: 3,
    name: 'Points de contrôle',
    description: `Un entraînement interrompu par une panne ne perd que ${pct(TRAINING.rollbackCheckpoints)} de sa progression, au lieu de ${pct(TRAINING.rollback)}.`,
    cost: 1000,
    requires: [],
    effect: { checkpoints: true },
  },
  {
    id: 'gpu-g3',
    branch: 'compute',
    level: 3,
    name: 'GPU génération 3',
    description: `Rack G3 : ${GPU[3].computeCU} CU/s pour ${GPU[3].powerKW} kW. Trop dense pour l’air seul : prévoyez un CDU.`,
    cost: 2200,
    requires: ['gpu-g2', 'liquid-cooling'],
    effect: { gen: 3 },
  },
  {
    id: 'optical',
    branch: 'compute',
    level: 4,
    name: 'Interconnexion optique',
    description: `Les blocs d’entraînement peuvent enjamber une allée : des racks à ${OPTICAL.reach} cases comptent comme voisins.`,
    cost: 2500,
    requires: ['checkpoints'],
    effect: { optical: true },
  },
  {
    id: 'switches',
    branch: 'network',
    level: 2,
    name: 'Switchs réseau',
    description: `Débloque le switch : chaque rack s’y câble seul par les allées libres (${NETWORK.reach} cases de câble au plus, ${NETWORK.ports} racks par switch). Un bloc d’entraînement doit être entièrement relié.`,
    cost: 600,
    requires: [],
    effect: { unlocks: ['switch'] },
  },
  {
    id: 'crac-he',
    branch: 'cooling',
    level: 1,
    name: 'CRAC haute efficacité',
    description: (e) => `Chaque CRAC retire ${pct((e.cracCooling ?? 1) - 1)} de chaleur en plus.`,
    cost: 400,
    requires: [],
    effect: { cracCooling: 1.2 },
  },
  {
    id: 'containment',
    branch: 'cooling',
    level: 2,
    name: 'Confinement d’allée chaude',
    description: `Des panneaux enferment l’air soufflé : un CRAC près d’une allée chaude refroidit ${pct(AISLE.containmentBoost - 1)} de plus.`,
    cost: 700,
    requires: ['crac-he'],
    effect: { containment: true },
  },
  {
    id: 'liquid-cooling',
    branch: 'cooling',
    level: 3,
    name: 'Refroidissement liquide',
    description: `Le CDU capte ${pct(CDU.captured)} de la chaleur des racks à ${CDU.radius} cases, et la rejette dehors.`,
    cost: 1200,
    requires: [],
    effect: { unlocks: ['cdu'] },
  },
  {
    id: 'free-cooling',
    branch: 'cooling',
    level: 3,
    name: 'Free cooling',
    description: `Quand il fait moins de ${WEATHER.freeCoolingBelowC} °C dehors, les CRAC consomment ${pct(1 - WEATHER.freeCoolingPowerMult)} de moins.`,
    cost: 1000,
    requires: [],
    effect: { freeCooling: true },
  },
  {
    id: 'heat-reuse',
    branch: 'cooling',
    level: 4,
    name: 'Récupération de chaleur',
    description: 'La chaleur captée par les CDU chauffe le quartier : elle est revendue au réseau de chaleur urbain.',
    cost: 2000,
    requires: ['liquid-cooling'],
    effect: { heatReuse: true },
  },
  {
    id: 'pdu-hc',
    branch: 'power',
    level: 1,
    name: 'PDU haute capacité',
    description: (e) => `Chaque PDU alimente ${pct((e.pduCapacity ?? 1) - 1)} de puissance en plus.`,
    cost: 400,
    requires: [],
    effect: { pduCapacity: 1.5 },
  },
  {
    id: 'ups',
    branch: 'power',
    level: 2,
    name: 'Onduleurs',
    description: `Batteries qui prennent le relais dès la première seconde d’une coupure (environ ${Math.round(UPS.storeKJ / UPS.powerKW)} s à pleine puissance).`,
    cost: 600,
    requires: [],
    effect: { unlocks: ['ups'] },
  },
  {
    id: 'generators',
    branch: 'power',
    level: 2,
    name: 'Groupes électrogènes',
    description: `Démarrent en ${GENERATOR.startS} s et tiennent toute la coupure, au prix d’un carburant cher.`,
    cost: 800,
    requires: ['ups'],
    effect: { unlocks: ['generator'] },
  },
  {
    id: 'green-power',
    branch: 'power',
    level: 3,
    name: 'Énergie verte',
    description: (e) => `Contrat d’électricité renouvelable : facture −${pct(1 - (e.electricity ?? 1))}, et les clients apprécient (réputation +${pct((e.reputation ?? 1) - 1)}).`,
    cost: 1500,
    requires: [],
    effect: { electricity: 0.85, reputation: 1.1 },
  },
  {
    id: 'switchover-2n',
    branch: 'power',
    level: 4,
    name: 'Bascule 2N',
    description: (e) => `Chaîne de secours doublée : les groupes démarrent en ${e.generatorStartS} s, les onduleurs stockent ${pct((e.upsStore ?? 1) - 1)} de plus.`,
    cost: 2500,
    requires: ['generators'],
    effect: { generatorStartS: 3, upsStore: 1.5 },
  },
  {
    id: 'auto-repair',
    branch: 'ops',
    level: 1,
    name: 'Réparations automatiques',
    description: 'Les techniciens libres partent d’eux-mêmes réparer la panne la plus proche.',
    cost: 300,
    requires: [],
    effect: { autoRepair: true },
  },
  {
    id: 'planned-maintenance',
    branch: 'ops',
    level: 2,
    name: 'Maintenance planifiée',
    description: `Les techniciens libres entretiennent d’eux-mêmes les racks usés à plus de ${MAINTENANCE.autoAbove} %.`,
    cost: 900,
    requires: ['auto-repair'],
    effect: { autoMaintain: true },
  },
  {
    id: 'spare-parts',
    branch: 'ops',
    level: 2,
    name: 'Stock de pièces',
    description: `Des pièces d’avance : une réparation coûte ${SPARE_PARTS.cost} $ au lieu de ${REPAIR.cost} et dure ${SPARE_PARTS.seconds} s au lieu de ${REPAIR.seconds}.`,
    cost: 600,
    requires: [],
    effect: { spareParts: true },
  },
  {
    id: 'specialties',
    branch: 'ops',
    level: 3,
    name: 'Spécialités',
    description: `Embauchez des électriciens, frigoristes et informaticiens : ${SPECIALTY.speed} fois plus rapides dans leur domaine.`,
    cost: 1200,
    requires: [],
    effect: { specialties: true },
  },
  {
    id: 'predictive',
    branch: 'ops',
    level: 4,
    name: 'Maintenance prédictive',
    description: `Les capteurs annoncent les pannes : alerte avant la casse, et ${pct(1 - PREDICTIVE.failureMult)} de pannes en moins.`,
    cost: 2000,
    requires: ['planned-maintenance'],
    effect: { predictive: true },
  },
  {
    id: 'fast-techs',
    branch: 'ops',
    level: 1,
    name: 'Techniciens aguerris',
    description: (e) => `Les techniciens se déplacent et travaillent ${pct((e.techSpeed ?? 1) - 1)} plus vite.`,
    cost: 500,
    requires: ['auto-repair'],
    effect: { techSpeed: 1.3, workRate: 1.3 },
  },
];

export const RESEARCH: readonly ResearchNode[] = NODES.map((n) => ({
  ...n,
  description: typeof n.description === 'function' ? n.description(n.effect) : n.description,
}));

export function researchById(id: string): ResearchNode | undefined {
  return RESEARCH.find((n) => n.id === id);
}
