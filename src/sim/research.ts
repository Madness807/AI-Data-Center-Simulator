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
  /** Capacités nouvelles. */
  autoRepair?: true;
  opportunistic?: true;
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
