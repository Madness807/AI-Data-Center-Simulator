import { RESEARCH_RATE } from './balance';

/** Partie rapide : les règles de la bêta, objectif d'argent. Carrière : paliers et recherche. */
export const GAME_MODES = ['quick', 'career'] as const;
export type GameMode = (typeof GAME_MODES)[number];

/** Mécaniques actives, fixées à la création de la partie (la partie rapide les garde éteintes). */
export interface Rules {
  /** Réputation, paliers et arbre de recherche. */
  progression: boolean;
  /** Incidents (coupures du réseau, canicules), selon le palier atteint. */
  incidents: boolean;
  /** Orientation des racks : prise d'air à l'avant, chaleur soufflée à l'arrière. */
  aisles: boolean;
  /** Température extérieure qui agit sur les CRAC (selon le palier). */
  weather: boolean;
  /** Usure et vieillissement des racks (selon le palier). */
  wear: boolean;
  /** Réseau de calcul : switchs et câblage ; les blocs d'entraînement doivent être reliés (selon le palier). */
  network: boolean;
}

export interface CareerState {
  /** Gagnée en livrant à l'heure, perdue en retard ; elle fait passer les paliers. */
  reputation: number;
  /** Indice du palier atteint dans TIERS (0 = Start-up). */
  tier: number;
}

export interface ResearchState {
  /** Part du calcul réservée à la R&D, de 0 à RESEARCH_RATE.maxShare. */
  share: number;
  /** Nœud en cours, ou null (la part réservée retourne alors aux contrats). */
  current: string | null;
  /** Points accumulés par nœud : changer de nœud ne fait rien perdre. */
  progress: Record<string, number>;
  /** Nœuds terminés, dans l'ordre. */
  done: string[];
  /** Points produits par seconde au dernier tick, pour l'affichage. */
  ratePerS: number;
}

/** Réglages de conduite du joueur (débloqués par la recherche). */
export interface Policies {
  /** Les techniciens libres partent d'eux-mêmes réparer les pannes. */
  autoRepair: boolean;
  /** Les techniciens libres entretiennent d'eux-mêmes les racks usés. */
  autoMaintain: boolean;
}

export function rulesFor(mode: GameMode): Rules {
  const career = mode === 'career';
  return { progression: career, incidents: career, aisles: career, weather: career, wear: career, network: career };
}

export function emptyCareer(): CareerState {
  return { reputation: 0, tier: 0 };
}

export function emptyResearch(): ResearchState {
  return { share: RESEARCH_RATE.defaultShare, current: null, progress: {}, done: [], ratePerS: 0 };
}

export function defaultPolicies(): Policies {
  return { autoRepair: true, autoMaintain: true };
}
