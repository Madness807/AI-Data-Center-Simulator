import { FAILURE } from '../../sim/balance';
import type { GameState } from '../../sim/state';
import { statusVersion } from '../../render/assets/status-colors';
import { HEAT_STOPS, overlayLegend, powerLoadLabel, type OverlayMode } from '../../render/overlay-colors';
import { rgbCss } from '../color';
import { el, icon, setText } from '../dom';
import type { IconName } from '../icons';

/** Nom (menu), nom court (bouton de la barre) et icône de chaque calque. */
export const OVERLAY_INFO: Record<OverlayMode, { label: string; short: string; icon: IconName }> = {
  heat: { label: 'Chaleur', short: 'Chaleur', icon: 'heatmap' },
  power: { label: 'Énergie', short: 'Énergie', icon: 'power' },
  cooling: { label: 'Couverture des CRAC', short: 'Froid', icon: 'crac' },
  occupancy: { label: 'Activité des racks', short: 'Activité', icon: 'compute' },
  risk: { label: 'Risque de panne', short: 'Risque', icon: 'alert' },
};

/** Rampe des températures, avec le seuil au-delà duquel les pannes se multiplient. */
function heatScale(): HTMLElement {
  const [t0, tN] = [HEAT_STOPS[0][0], HEAT_STOPS[HEAT_STOPS.length - 1][0]];
  const pct = (t: number) => `${((t - t0) / (tN - t0)) * 100}%`;
  const ramp = el('div', 'legend-ramp');
  ramp.style.background = `linear-gradient(to right, ${HEAT_STOPS.map(([t, r, g, b]) => `${rgbCss([r, g, b])} ${pct(t)}`).join(', ')})`;
  const threshold = el('div', 'legend-threshold');
  threshold.style.left = pct(FAILURE.thresholdC);
  ramp.append(threshold);
  const ticks = el('div', 'legend-ticks');
  for (const [t] of HEAT_STOPS) {
    const tick = el('span', undefined, `${t}°`);
    tick.style.left = pct(t);
    ticks.append(tick);
  }
  return el('div', 'legend-scale', ramp, ticks);
}

/** Légende du calque affiché : rampe pour la chaleur, pastilles pour les autres. */
export class OverlayLegend {
  readonly root: HTMLElement;
  private readonly iconSlot = el('span', 'legend-icon');
  private readonly title = el('span');
  private readonly heat = heatScale();
  private readonly swatches = el('div', 'legend-swatches');
  private readonly note = el('div', 'legend-note mono');
  private mode: OverlayMode | null = null;
  private colors = -1;

  constructor() {
    this.root = el('div', 'legend glass', el('div', 'panel-title', this.iconSlot, this.title), this.heat, this.swatches, this.note);
    this.root.hidden = true;
  }

  update(mode: OverlayMode | null, s: GameState): void {
    this.root.hidden = mode === null;
    if (!mode) return;
    // Le mode daltonien change les couleurs : la légende se reconstruit aussi dans ce cas.
    if (mode !== this.mode || statusVersion() !== this.colors) {
      this.mode = mode;
      this.colors = statusVersion();
      this.iconSlot.replaceChildren(icon(OVERLAY_INFO[mode].icon, 14));
      this.heat.hidden = mode !== 'heat';
      this.swatches.hidden = mode === 'heat';
      if (mode === 'heat') {
        setText(this.title, `Chaleur · pannes > ${FAILURE.thresholdC} °C`);
        this.swatches.replaceChildren();
      } else {
        const legend = overlayLegend(mode);
        setText(this.title, legend.title);
        this.swatches.replaceChildren(
          ...legend.items.map((item) => {
            const dot = el('span', 'swatch');
            dot.style.background = rgbCss(item.rgb);
            return el('span', 'legend-item', dot, item.label);
          }),
        );
      }
    }
    this.note.hidden = mode !== 'power';
    if (mode === 'power') setText(this.note, powerLoadLabel(s));
  }
}
