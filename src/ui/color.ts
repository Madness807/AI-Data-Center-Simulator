import { tempToRgb, type Rgb } from '../render/overlay-colors';

/** Couleur de la palette (0xRRGGBB) en CSS. */
export function hexCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** Composantes RGB (éventuellement fractionnaires, issues d'un dégradé) en CSS. */
export function rgbCss([r, g, b]: Rgb): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Couleur d'une température, celle de la rampe du calque chaleur. */
export function tempCss(t: number): string {
  return rgbCss(tempToRgb(t));
}
