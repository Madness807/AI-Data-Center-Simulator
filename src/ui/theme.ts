import { PALETTE } from '../render/assets';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Écrit les couleurs d'état de la palette 3D dans des variables CSS : les LEDs des racks,
 * la mini-carte et les pastilles du HUD partagent ainsi une seule source de vérité.
 */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(PALETTE.status)) root.style.setProperty(`--status-${kebab(name)}`, hex(value));
  for (const [name, value] of Object.entries(PALETTE.ping)) root.style.setProperty(`--ping-${name}`, hex(value));
  root.style.setProperty('--ok', hex(PALETTE.status.busy));
  root.style.setProperty('--accent', hex(PALETTE.blueprint));
}
