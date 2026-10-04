import { isColorblind, PALETTE, statusColor, type StatusName } from '../render/assets';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Écrit les couleurs d'état de la palette 3D dans des variables CSS : les LEDs des racks,
 * la mini-carte et les pastilles du HUD partagent ainsi une seule source de vérité.
 */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const name of Object.keys(PALETTE.status) as StatusName[]) root.style.setProperty(`--status-${kebab(name)}`, hex(statusColor(name)));
  for (const [name, value] of Object.entries(PALETTE.ping)) root.style.setProperty(`--ping-${name}`, hex(value));
  root.style.setProperty('--ok', hex(statusColor('busy')));
  root.style.setProperty('--accent', hex(PALETTE.blueprint));
  // En mode daltonien, les teintes « alerte » et « danger » du HUD suivent la palette adaptée.
  if (isColorblind()) {
    root.style.setProperty('--warn', hex(statusColor('shed')));
    root.style.setProperty('--danger', hex(statusColor('failed')));
  } else {
    root.style.removeProperty('--warn');
    root.style.removeProperty('--danger');
  }
}
