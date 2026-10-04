import { PALETTE } from './palette';

export type StatusName = keyof typeof PALETTE.status;

/**
 * Variante pour les daltoniens (palette Okabe-Ito) : aucun état ne repose sur une
 * opposition rouge / vert. Le calcul devient bleu ciel, le délestage orange, la panne
 * vermillon et la réparation jaune.
 */
const COLORBLIND: Record<StatusName, number> = {
  busy: 0x56b4e9,
  idle: 0x7d8899,
  shed: 0xe69f00,
  shedOff: 0x3d2a08,
  dead: 0x111419,
  failed: 0xd55e00,
  repairing: 0xf0e442,
};

let colorblind = false;
let version = 0;

/** Bascule la palette d'état ; les consommateurs détectent le changement via statusVersion(). */
export function setColorblind(on: boolean): void {
  if (on === colorblind) return;
  colorblind = on;
  version++;
}

export function isColorblind(): boolean {
  return colorblind;
}

export function statusColor(name: StatusName): number {
  return colorblind ? COLORBLIND[name] : PALETTE.status[name];
}

/** Incrémenté à chaque bascule : permet de ne recalculer les couleurs que si nécessaire. */
export function statusVersion(): number {
  return version;
}
