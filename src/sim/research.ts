import type { BuildingKind, Gen } from './entities';

/** Branches de l'arbre, une colonne chacune dans le panneau Recherche. */
export type Branch = 'compute' | 'cooling' | 'power' | 'ops';

export const BRANCHES: { id: Branch; name: string }[] = [
  { id: 'compute', name: 'Calcul' },
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

/**
 * L'arbre. Les nœuds de niveau 1 modifient les systèmes existants ; les niveaux suivants
 * arrivent avec les lots qui créent leurs systèmes (énergie de secours, refroidissement…).
 */
export const RESEARCH: readonly ResearchNode[] = [
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
    description: 'Rack G2 : 25 CU/s pour 18 kW (×2,5 de calcul pour moins de deux fois la chaleur).',
    cost: 900,
    requires: [],
    effect: { gen: 2 },
  },
  {
    id: 'retrofit',
    branch: 'compute',
    level: 2,
    name: 'Modernisation',
    description: 'Un technicien remplace les GPU d’un rack sur place, pour la différence de prix plus 20 %.',
    cost: 600,
    requires: ['gpu-g2'],
    effect: { retrofit: true },
  },
  {
    id: 'checkpoints',
    branch: 'compute',
    level: 3,
    name: 'Points de contrôle',
    description: 'Un entraînement interrompu par une panne ne perd que 5 % de sa progression, au lieu de 25 %.',
    cost: 1000,
    requires: [],
    effect: { checkpoints: true },
  },
  {
    id: 'gpu-g3',
    branch: 'compute',
    level: 3,
    name: 'GPU génération 3',
    description: 'Rack G3 : 60 CU/s pour 36 kW. Trop dense pour l’air seul : prévoyez un CDU.',
    cost: 2200,
    requires: ['gpu-g2', 'liquid-cooling'],
    effect: { gen: 3 },
  },
  {
    id: 'optical',
    branch: 'compute',
    level: 4,
    name: 'Interconnexion optique',
    description: 'Les blocs d’entraînement peuvent enjamber une allée : des racks à 2 cases comptent comme voisins.',
    cost: 2500,
    requires: ['checkpoints'],
    effect: { optical: true },
  },
  {
    id: 'crac-he',
    branch: 'cooling',
    level: 1,
    name: 'CRAC haute efficacité',
    description: 'Chaque CRAC retire 20 % de chaleur en plus.',
    cost: 400,
    requires: [],
    effect: { cracCooling: 1.2 },
  },
  {
    id: 'containment',
    branch: 'cooling',
    level: 2,
    name: 'Confinement d’allée chaude',
    description: 'Des panneaux enferment l’air soufflé : un CRAC près d’une allée chaude refroidit 25 % de plus.',
    cost: 700,
    requires: ['crac-he'],
    effect: { containment: true },
  },
  {
    id: 'liquid-cooling',
    branch: 'cooling',
    level: 3,
    name: 'Refroidissement liquide',
    description: 'Le CDU capte 75 % de la chaleur des racks à 2 cases, et la rejette dehors.',
    cost: 1200,
    requires: [],
    effect: { unlocks: ['cdu'] },
  },
  {
    id: 'free-cooling',
    branch: 'cooling',
    level: 3,
    name: 'Free cooling',
    description: 'Quand il fait moins de 18 °C dehors, les CRAC consomment moitié moins.',
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
    description: 'Chaque PDU alimente 50 % de puissance en plus.',
    cost: 400,
    requires: [],
    effect: { pduCapacity: 1.5 },
  },
  {
    id: 'ups',
    branch: 'power',
    level: 2,
    name: 'Onduleurs',
    description: 'Batteries qui prennent le relais dès la première seconde d’une coupure (environ une minute).',
    cost: 600,
    requires: [],
    effect: { unlocks: ['ups'] },
  },
  {
    id: 'generators',
    branch: 'power',
    level: 2,
    name: 'Groupes électrogènes',
    description: 'Démarrent en 15 s et tiennent toute la coupure, au prix d’un carburant cher.',
    cost: 800,
    requires: ['ups'],
    effect: { unlocks: ['generator'] },
  },
  {
    id: 'green-power',
    branch: 'power',
    level: 3,
    name: 'Énergie verte',
    description: 'Contrat d’électricité renouvelable : facture −15 %, et les clients apprécient (réputation +10 %).',
    cost: 1500,
    requires: [],
    effect: { electricity: 0.85, reputation: 1.1 },
  },
  {
    id: 'switchover-2n',
    branch: 'power',
    level: 4,
    name: 'Bascule 2N',
    description: 'Chaîne de secours doublée : les groupes démarrent en 3 s, les onduleurs stockent 50 % de plus.',
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
    description: 'Les techniciens libres entretiennent d’eux-mêmes les racks usés à plus de 50 %.',
    cost: 900,
    requires: ['auto-repair'],
    effect: { autoMaintain: true },
  },
  {
    id: 'spare-parts',
    branch: 'ops',
    level: 2,
    name: 'Stock de pièces',
    description: 'Des pièces d’avance : une réparation coûte 250 $ au lieu de 400 et dure 5 s au lieu de 8.',
    cost: 600,
    requires: [],
    effect: { spareParts: true },
  },
  {
    id: 'specialties',
    branch: 'ops',
    level: 3,
    name: 'Spécialités',
    description: 'Embauchez des électriciens, frigoristes et informaticiens : deux fois plus rapides dans leur domaine.',
    cost: 1200,
    requires: [],
    effect: { specialties: true },
  },
  {
    id: 'predictive',
    branch: 'ops',
    level: 4,
    name: 'Maintenance prédictive',
    description: 'Les capteurs annoncent les pannes : alerte avant la casse, et 30 % de pannes en moins.',
    cost: 2000,
    requires: ['planned-maintenance'],
    effect: { predictive: true },
  },
  {
    id: 'fast-techs',
    branch: 'ops',
    level: 1,
    name: 'Techniciens aguerris',
    description: 'Les techniciens se déplacent et travaillent 30 % plus vite.',
    cost: 500,
    requires: ['auto-repair'],
    effect: { techSpeed: 1.3, workRate: 1.3 },
  },
];

export function researchById(id: string): ResearchNode | undefined {
  return RESEARCH.find((n) => n.id === id);
}
