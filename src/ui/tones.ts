import { ALERTS, FAILURE, MAINTENANCE } from '../sim/balance';
import { LOAD_WARN } from '../render/overlay-colors';

/**
 * Teinte d'une valeur affichée ('' : neutre). Une même grandeur prend la même teinte dans tous
 * les panneaux (bandeau, tableau de bord, inspecteur), aux mêmes seuils que les alertes du jeu.
 */
export type Tone = 'ok' | 'warn' | 'danger' | '';

/** Air aspiré par un rack : alerte à l'approche du seuil de panne, danger au-delà. */
export function intakeTone(c: number): Tone {
  return c >= FAILURE.thresholdC ? 'danger' : c >= ALERTS.hotC ? 'warn' : '';
}

/**
 * Point le plus chaud de la salle, allées chaudes comprises (l'arrière des racks est normalement
 * plus chaud que l'air qu'ils aspirent) : alerte au seuil de panne, danger quand les pannes
 * deviennent fréquentes (environ une par minute).
 */
export const ROOM_DANGER_C = FAILURE.thresholdC + 15;
export function roomTone(c: number, calm: Tone = ''): Tone {
  return c >= ROOM_DANGER_C ? 'danger' : c >= FAILURE.thresholdC ? 'warn' : calm;
}

/** Risque de panne d'un rack, par minute. */
export const RISK = { warn: 0.02, danger: 0.15 };
export function riskTone(r: number): Tone {
  return r >= RISK.danger ? 'danger' : r >= RISK.warn ? 'warn' : '';
}

/** Charge électrique, en part de la capacité : danger dès qu'un équipement est délesté. */
export function loadTone(ratio: number, shed: boolean): Tone {
  return shed ? 'danger' : ratio > LOAD_WARN ? 'warn' : 'ok';
}

/** Usure d'un rack (%) : la maintenance planifiée intervient dès l'alerte. */
export const WEAR_DANGER = 70;
export function wearTone(w: number): Tone {
  return w >= WEAR_DANGER ? 'danger' : w >= MAINTENANCE.autoAbove ? 'warn' : 'ok';
}

/** Autonomie des onduleurs pendant une coupure (s) : danger sous le seuil de l'alerte. */
export function batteryTone(seconds: number): Tone {
  return seconds < ALERTS.upsLowS ? 'danger' : seconds < ALERTS.upsLowS * 1.5 ? 'warn' : '';
}
