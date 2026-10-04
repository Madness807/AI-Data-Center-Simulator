/** Partie rapide : les règles de la bêta, objectif d'argent. Carrière : paliers et recherche. */
export type GameMode = 'quick' | 'career';

/** Mécaniques actives, fixées à la création de la partie (la partie rapide les garde éteintes). */
export interface Rules {
  /** Réputation, paliers et arbre de recherche. */
  progression: boolean;
  /** Incidents (coupures du réseau…), selon le palier atteint. */
  incidents: boolean;
}

export interface CareerState {
  /** Gagnée en livrant à l'heure, perdue en retard ; elle fait passer les paliers. */
  reputation: number;
  /** Indice du palier atteint dans TIERS (0 = Start-up). */
  tier: number;
}

export interface ResearchState {
  /** Part du calcul réservée à la R&D, de 0 à MAX_RESEARCH_SHARE. */
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
}

export const MAX_RESEARCH_SHARE = 0.5;

export function rulesFor(mode: GameMode): Rules {
  return { progression: mode === 'career', incidents: mode === 'career' };
}

export function emptyCareer(): CareerState {
  return { reputation: 0, tier: 0 };
}

export function emptyResearch(): ResearchState {
  return { share: 0.2, current: null, progress: {}, done: [], ratePerS: 0 };
}

export function defaultPolicies(): Policies {
  return { autoRepair: true };
}
