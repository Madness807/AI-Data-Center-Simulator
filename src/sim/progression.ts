import { CRAC, GENERATOR, PDU, REPAIR, SPARE_PARTS, TECH, UPS } from './balance';
import type { BuildingKind, Gen, Job } from './entities';
import { RESEARCH, RESEARCH_POINTS_PER_CU, researchById } from './research';
import { notify, type GameState } from './state';

/** Paliers de la carrière : la réputation les fait passer, chacun ouvre de plus gros clients. */
export interface Tier {
  name: string;
  /** Réputation à atteindre. */
  reputation: number;
  /** Débit maximal d'une offre, en racks. */
  maxUnits: number;
  /** Multiplicateur des paiements : les gros clients paient mieux. */
  priceMult: number;
  /** Ce que le palier apporte, pour la fenêtre de passage. */
  perks: string[];
}

export const TIERS: readonly Tier[] = [
  { name: 'Start-up', reputation: 0, maxUnits: 4, priceMult: 1, perks: [] },
  {
    name: 'Scale-up',
    reputation: 150,
    maxUnits: 8,
    priceMult: 1.1,
    perks: [
      'Contrats jusqu’à 8 racks, payés 10 % de plus',
      'Recherche de niveau 2 : GPU G2, onduleurs, groupes électrogènes, confinement d’allée',
      'Attention : le réseau électrique peut désormais être coupé',
      'Les racks s’usent : un entretien (clic droit sur un rack) évite bien des pannes',
    ],
  },
  {
    name: 'Labo d’IA',
    reputation: 450,
    maxUnits: 12,
    priceMult: 1.2,
    perks: [
      'Contrats jusqu’à 12 racks, payés 20 % de plus',
      'Contrats d’entraînement (blocs de racks contigus) et contrats avec SLA',
      'Recherche de niveau 3 : GPU G3, points de contrôle, refroidissement liquide, free cooling, énergie verte',
      'Attention : la météo compte désormais, et les canicules affaiblissent les CRAC',
    ],
  },
  {
    name: 'Hyperscaler',
    reputation: 1000,
    maxUnits: 20,
    priceMult: 1.3,
    perks: ['Contrats jusqu’à 20 racks, payés 30 % de plus', 'Recherche de niveau 4'],
  },
];

export const LATE_REPUTATION = -25;

/** Réputation d'une livraison à l'heure : un gros contrat compte davantage. */
export function deliveryReputation(job: Job, s?: GameState): number {
  const base = 10 + Math.round(job.rateCU / 10);
  return s ? Math.round(base * modifiers(s).reputationMult) : base;
}

/** Paliers franchis d'un coup si besoin ; le dernier donne la victoire de la carrière. */
export function gainReputation(s: GameState, delta: number): void {
  const c = s.career;
  c.reputation = Math.max(0, c.reputation + delta);
  while (c.tier < TIERS.length - 1 && c.reputation >= TIERS[c.tier + 1].reputation) {
    c.tier++;
    const tier = TIERS[c.tier];
    if (c.tier === TIERS.length - 1) {
      if (s.outcome === 'playing') s.outcome = 'won';
      notify(s, 'success', `${tier.name} : votre data center est au sommet !`, { code: 'won' });
    } else {
      notify(s, 'success', `Nouveau palier : ${tier.name}`, { code: 'tierUp' });
    }
  }
}

/** Ce que la recherche change aux règles de base. */
export interface Modifiers {
  cracCoolingKW: number;
  pduCapacityKW: number;
  /** Cases par seconde. */
  techSpeed: number;
  /** Multiplicateur de l'avancement des chantiers et des réparations. */
  workRate: number;
  autoRepair: boolean;
  opportunistic: boolean;
  /** Multiplicateur de la facture d'électricité. */
  electricityMult: number;
  reputationMult: number;
  upsStoreKJ: number;
  generatorStartS: number;
  containment: boolean;
  freeCooling: boolean;
  heatReuse: boolean;
  /** Génération de GPU la plus récente constructible. */
  maxGen: Gen;
  retrofit: boolean;
  checkpoints: boolean;
  optical: boolean;
  autoMaintain: boolean;
  specialties: boolean;
  predictive: boolean;
  /** Réparation : prix et durée (le stock de pièces les réduit). */
  repairCost: number;
  repairSeconds: number;
}

const BASE: Modifiers = {
  cracCoolingKW: CRAC.coolingKW,
  pduCapacityKW: PDU.capacityKW,
  techSpeed: TECH.speed,
  workRate: 1,
  autoRepair: false,
  opportunistic: false,
  electricityMult: 1,
  reputationMult: 1,
  upsStoreKJ: UPS.storeKJ,
  generatorStartS: GENERATOR.startS,
  containment: false,
  freeCooling: false,
  heatReuse: false,
  maxGen: 1,
  retrofit: false,
  checkpoints: false,
  optical: false,
  autoMaintain: false,
  specialties: false,
  predictive: false,
  repairCost: REPAIR.cost,
  repairSeconds: REPAIR.seconds,
};

const cache = new WeakMap<GameState, { key: string; value: Modifiers }>();

/** Effets cumulés des nœuds terminés ; la partie rapide garde les valeurs de base. */
export function modifiers(s: GameState): Modifiers {
  if (!s.rules.progression || s.research.done.length === 0) return BASE;
  const key = s.research.done.join(',');
  const hit = cache.get(s);
  if (hit?.key === key) return hit.value;
  const m = { ...BASE };
  for (const id of s.research.done) {
    const e = researchById(id)?.effect;
    if (!e) continue;
    if (e.cracCooling) m.cracCoolingKW *= e.cracCooling;
    if (e.pduCapacity) m.pduCapacityKW *= e.pduCapacity;
    if (e.techSpeed) m.techSpeed *= e.techSpeed;
    if (e.workRate) m.workRate *= e.workRate;
    if (e.autoRepair) m.autoRepair = true;
    if (e.opportunistic) m.opportunistic = true;
    if (e.electricity) m.electricityMult *= e.electricity;
    if (e.reputation) m.reputationMult *= e.reputation;
    if (e.upsStore) m.upsStoreKJ *= e.upsStore;
    if (e.generatorStartS !== undefined) m.generatorStartS = Math.min(m.generatorStartS, e.generatorStartS);
    if (e.containment) m.containment = true;
    if (e.freeCooling) m.freeCooling = true;
    if (e.heatReuse) m.heatReuse = true;
    if (e.gen && e.gen > m.maxGen) m.maxGen = e.gen;
    if (e.retrofit) m.retrofit = true;
    if (e.checkpoints) m.checkpoints = true;
    if (e.optical) m.optical = true;
    if (e.autoMaintain) m.autoMaintain = true;
    if (e.specialties) m.specialties = true;
    if (e.predictive) m.predictive = true;
    if (e.spareParts) {
      m.repairCost = SPARE_PARTS.cost;
      m.repairSeconds = SPARE_PARTS.seconds;
    }
  }
  cache.set(s, { key, value: m });
  return m;
}

/** Raison pour laquelle un nœud ne peut pas être lancé, ou null. */
export function researchBlocker(s: GameState, id: string): string | null {
  const node = researchById(id);
  if (!node) return 'Recherche inconnue';
  if (!s.rules.progression) return 'Recherche réservée à la carrière';
  if (s.research.done.includes(id)) return 'Déjà terminée';
  if (node.level > s.career.tier + 1) return `Palier ${TIERS[node.level - 1].name} requis`;
  const missing = node.requires.filter((r) => !s.research.done.includes(r));
  if (missing.length) return `Nécessite : ${missing.map((r) => researchById(r)?.name ?? r).join(', ')}`;
  return null;
}

/** Calcul (CU/s) prélevé pour la R&D avant les contrats. */
export function researchReserve(s: GameState): number {
  return s.rules.progression && s.research.current ? s.compute.total * s.research.share : 0;
}

/** Avance le nœud en cours avec le calcul qui lui a été consacré pendant dt. */
export function advanceResearch(s: GameState, cu: number, dt: number): void {
  const r = s.research;
  r.ratePerS = r.current ? cu * RESEARCH_POINTS_PER_CU : 0;
  if (!r.current) return;
  const node = researchById(r.current);
  if (!node) {
    r.current = null;
    return;
  }
  r.progress[node.id] = (r.progress[node.id] ?? 0) + cu * RESEARCH_POINTS_PER_CU * dt;
  if (r.progress[node.id] + 1e-9 < node.cost) return;
  r.done.push(node.id);
  delete r.progress[node.id];
  r.current = null;
  notify(s, 'success', `Recherche terminée : ${node.name}`, { code: 'researchDone' });
}

/** Nœuds qu'on peut lancer tout de suite. */
export function availableResearch(s: GameState): string[] {
  return RESEARCH.filter((n) => researchBlocker(s, n.id) === null).map((n) => n.id);
}

/** Équipements de la bêta, disponibles dans tous les modes. */
const BASE_KINDS: readonly BuildingKind[] = ['rack', 'crac', 'pdu'];

/** Nœud de recherche qui débloque cet équipement. */
export function unlockedBy(kind: BuildingKind) {
  return RESEARCH.find((n) => n.effect.unlocks?.includes(kind));
}

/** Équipement constructible : ceux de la bêta, plus ceux que la recherche a débloqués (carrière). */
export function isUnlocked(s: GameState, kind: BuildingKind): boolean {
  if (BASE_KINDS.includes(kind)) return true;
  if (!s.rules.progression) return false;
  const node = unlockedBy(kind);
  return !!node && s.research.done.includes(node.id);
}
