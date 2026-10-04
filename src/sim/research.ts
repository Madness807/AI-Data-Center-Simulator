import type { BuildingKind } from './entities';

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

/** Points de recherche produits par CU·s consacré à la R&D. */
export const RESEARCH_POINTS_PER_CU = 0.1;

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
