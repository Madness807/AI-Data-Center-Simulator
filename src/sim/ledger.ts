import type { GameState } from './state';

/** Postes de dépense, cumulés depuis le début de la partie. */
export type ExpenseKind = 'penalties' | 'electricity' | 'salaries' | 'repairs' | 'construction' | 'hiring';

/** Grand livre : tout l'argent gagné et dépensé, par poste (montants positifs). */
export interface Ledger extends Record<ExpenseKind, number> {
  revenue: number;
}

export function emptyLedger(): Ledger {
  return { revenue: 0, penalties: 0, electricity: 0, salaries: 0, repairs: 0, construction: 0, hiring: 0 };
}

/**
 * Seuls points d'entrée pour faire bouger la trésorerie : le grand livre reste donc
 * toujours cohérent avec elle (trésorerie = départ + recettes − dépenses).
 */
export function earn(s: GameState, amount: number): void {
  s.money += amount;
  s.economy.ledger.revenue += amount;
}

export function spend(s: GameState, kind: ExpenseKind, amount: number): void {
  s.money -= amount;
  s.economy.ledger[kind] += amount;
}

/** Remboursement d'une dépense (démolition) : vient en déduction du poste. */
export function refund(s: GameState, kind: ExpenseKind, amount: number): void {
  s.money += amount;
  s.economy.ledger[kind] -= amount;
}

/** Dépenses d'exploitation (hors investissements : construction et embauche). */
export const OPERATING: readonly ExpenseKind[] = ['penalties', 'electricity', 'salaries', 'repairs'];
