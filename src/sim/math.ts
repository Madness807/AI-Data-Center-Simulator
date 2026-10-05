/** Petits calculs partagés par les systèmes de la simulation. */

/** Valeur entre a et b selon t (de 0 à 1) : sert aux tirages dans une fourchette. */
export function lerp([a, b]: readonly [number, number], t: number): number {
  return a + (b - a) * t;
}

/**
 * Probabilité qu'un événement de taux `rate` (par seconde) survienne pendant `dt` : la forme
 * exponentielle donne la même probabilité en dix ticks de 0,1 s qu'en un tick de 1 s.
 */
export function chance(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Distance de Manhattan entre deux points de la grille. */
export function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Les 4 voisines d'une case, dans l'ordre d'exploration (il départage les chemins de même longueur). */
export const DIRS4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Arrondi à la dizaine : les durées et les prix des contrats. */
export function roundTo10(n: number): number {
  return Math.round(n / 10) * 10;
}
