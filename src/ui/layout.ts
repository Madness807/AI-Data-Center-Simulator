/**
 * Disposition du HUD. Le CSS ne voit pas le zoom de l'interface dans ses media queries : la
 * disposition se décide ici, sur la largeur « effective » (fenêtre ÷ zoom), et components.css
 * réagit aux classes lt-* posées sur #hud.
 */

/** Tailles d'interface proposées dans les options. */
export const UI_SCALES = [0.9, 1, 1.15] as const;
export type UiScale = (typeof UI_SCALES)[number];

/**
 * Le HUD est conçu pour au moins cette surface, en px effectifs : le zoom est plafonné en
 * conséquence. 1 080 de large : même resserrée (lt-1100), la barre du haut atteint 1 035 px en fin
 * de carrière.
 */
export const MIN_HUD = { width: 1080, height: 680 };

/**
 * Largeurs effectives sous lesquelles la disposition se resserre (classes lt-1760, lt-1420,
 * lt-1200, lt-1100). La barre du haut fait jusqu'à 1 130 px environ avec les grands nombres de
 * fin de carrière : sous 1 760 px, elle ne tient plus entre les deux colonnes et les contrats
 * passent dessous ; sous 1 420 px, la colonne de gauche aussi. lt-1200 ne sert qu'au panneau
 * Recherche, plus large que les autres.
 */
export const BREAKPOINTS = [1760, 1420, 1200, 1100] as const;

/** Applique le zoom choisi (plafonné à ce que la fenêtre permet) et les classes de disposition. */
export function applyLayout(hud: HTMLElement, uiScale: UiScale): void {
  const scale = Math.max(UI_SCALES[0], Math.min(uiScale, innerWidth / MIN_HUD.width, innerHeight / MIN_HUD.height));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  const width = innerWidth / scale;
  for (const limit of BREAKPOINTS) hud.classList.toggle(`lt-${limit}`, width <= limit);
}
