import { isColorblind, PALETTE, statusColor } from '../render/assets';
import { hexCss as hex } from './color';

const rgb = (n: number) => `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
/** Teinte claire d'une couleur, pour un texte posé sur un fond de la même couleur. */
const light = (n: number) => {
  const mix = (c: number) => Math.round(c + (255 - c) * 0.72);
  return hex((mix((n >> 16) & 255) << 16) | (mix((n >> 8) & 255) << 8) | mix(n & 255));
};

/**
 * Écrit les couleurs sémantiques de la palette 3D dans des variables CSS (et leur triplet
 * *-rgb) : les LEDs des racks, la mini-carte et le HUD partagent une seule source de vérité.
 */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  const set = (name: string, color: number) => {
    root.style.setProperty(`--${name}`, hex(color));
    root.style.setProperty(`--${name}-rgb`, rgb(color));
  };
  set('ok', statusColor('busy'));
  set('accent', PALETTE.blueprint);
  root.style.setProperty('--status-repairing', hex(statusColor('repairing')));
  // En mode daltonien, les teintes « alerte » et « danger » et leurs textes suivent la palette adaptée.
  const adapted = ['warn', 'danger', 'ok-text', 'warn-text', 'danger-text'];
  if (isColorblind()) {
    set('warn', statusColor('shed'));
    set('danger', statusColor('failed'));
    root.style.setProperty('--ok-text', light(statusColor('busy')));
    root.style.setProperty('--warn-text', light(statusColor('shed')));
    root.style.setProperty('--danger-text', light(statusColor('failed')));
  } else {
    for (const name of adapted) root.style.removeProperty(`--${name}`);
    root.style.removeProperty('--warn-rgb');
    root.style.removeProperty('--danger-rgb');
  }
}
