import { FAILURE } from '../../sim/balance';
import { HEAT_STOPS } from '../../render/overlays';
import { el, icon } from '../dom';

/** Légende de la heatmap, avec le seuil au-delà duquel les pannes se multiplient. */
export function createHeatLegend(): HTMLElement {
  const [t0, tN] = [HEAT_STOPS[0][0], HEAT_STOPS[HEAT_STOPS.length - 1][0]];
  const pct = (t: number) => `${((t - t0) / (tN - t0)) * 100}%`;
  const ramp = el('div', 'legend-ramp');
  ramp.style.background = `linear-gradient(to right, ${HEAT_STOPS.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${pct(t)}`).join(', ')})`;
  const threshold = el('div', 'legend-threshold');
  threshold.style.left = pct(FAILURE.thresholdC);
  ramp.append(threshold);
  const ticks = el('div', 'legend-ticks');
  for (const [t] of HEAT_STOPS) {
    const tick = el('span', undefined, `${t}°`);
    tick.style.left = pct(t);
    ticks.append(tick);
  }
  const root = el('div', 'legend glass', el('div', 'panel-title', icon('heatmap', 14), `Température · pannes au-delà de ${FAILURE.thresholdC} °C`), ramp, ticks);
  root.hidden = true;
  return root;
}
