/**
 * Disposition du HUD. Le CSS ne voit pas le zoom de l'interface dans ses media queries : la
 * disposition se décide ici, sur la largeur « effective » (fenêtre ÷ zoom), et components.css
 * réagit aux classes lt-* posées sur #hud.
 */

/** Tailles d'interface proposées dans les options. */
export const UI_SCALES = [0.9, 1, 1.15] as const;
export type UiScale = (typeof UI_SCALES)[number];

/** Le HUD est conçu pour au moins cette surface, en px effectifs : le zoom est plafonné en conséquence. */
export const MIN_HUD = { width: 1000, height: 680 };

/** Largeurs effectives sous lesquelles la disposition se resserre (classes lt-1520, lt-1320, lt-1100). */
export const BREAKPOINTS = [1520, 1320, 1100] as const;

/** Applique le zoom choisi (plafonné à ce que la fenêtre permet) et les classes de disposition. */
export function applyLayout(hud: HTMLElement, uiScale: UiScale): void {
  const scale = Math.max(UI_SCALES[0], Math.min(uiScale, innerWidth / MIN_HUD.width, innerHeight / MIN_HUD.height));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  const width = innerWidth / scale;
  for (const limit of BREAKPOINTS) hud.classList.toggle(`lt-${limit}`, width <= limit);
}
