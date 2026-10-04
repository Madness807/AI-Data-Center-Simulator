import { el, setText } from '../dom';

export interface ChartSeries {
  label: string;
  /** Couleur CSS, variables du thème comprises (var(--ok)…). */
  color: string;
  /** Une valeur par instant ; null interrompt la courbe. */
  values: readonly (number | null)[];
  dashed?: boolean;
}

export interface ChartOptions {
  /** Format des graduations verticales. */
  format: (v: number) => string;
  /** Bornes imposées ; sinon, celles des données. */
  min?: number;
  max?: number;
  /** Repère horizontal (seuil de panne…). */
  threshold?: { value: number; label: string };
}

const NS = 'http://www.w3.org/2000/svg';
const W = 600;
const H = 140;

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Courbes SVG légères : échelle automatique, graduations aux extrémités, légende en pastilles. */
export class LineChart {
  readonly root: HTMLElement;
  private readonly plot: SVGSVGElement;
  private readonly legend = el('div', 'chart-legend');
  private readonly yMax = el('span', 'chart-y chart-y-max mono');
  private readonly yMin = el('span', 'chart-y chart-y-min mono');
  private readonly xStart = el('span', 'mono');
  private readonly xEnd = el('span', 'mono');
  private readonly empty = el('div', 'chart-empty', 'Pas encore assez de mesures.');
  private legendKey = '';

  constructor(title: string, private readonly opts: ChartOptions) {
    this.plot = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'chart-svg' });
    this.root = el(
      'figure',
      'chart',
      el('figcaption', 'chart-head', el('span', 'chart-title', title), this.legend),
      el('div', 'chart-plot', this.yMax, this.yMin, this.plot, this.empty),
      el('div', 'chart-x', this.xStart, this.xEnd),
    );
  }

  update(times: readonly number[], series: ChartSeries[], formatTime: (t: number) => string): void {
    const key = series.map((s) => `${s.label}|${s.color}|${s.dashed}`).join(';') + (this.opts.threshold?.label ?? '');
    if (key !== this.legendKey) {
      this.legendKey = key;
      const items = series.map((s) => {
        const dot = el('span', `swatch ${s.dashed ? 'dashed' : ''}`);
        dot.style.background = s.color;
        return el('span', 'legend-item', dot, s.label);
      });
      if (this.opts.threshold) items.push(el('span', 'legend-item', el('span', 'swatch threshold'), this.opts.threshold.label));
      this.legend.replaceChildren(...items);
    }

    this.plot.replaceChildren();
    const n = times.length;
    this.empty.hidden = n >= 2;
    if (n < 2) {
      setText(this.yMax, '');
      setText(this.yMin, '');
      setText(this.xStart, '');
      setText(this.xEnd, '');
      return;
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of series) {
      for (const v of s.values) {
        if (v === null || !Number.isFinite(v)) continue;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (this.opts.threshold) {
      lo = Math.min(lo, this.opts.threshold.value);
      hi = Math.max(hi, this.opts.threshold.value);
    }
    if (!Number.isFinite(lo)) [lo, hi] = [0, 1];
    lo = this.opts.min ?? lo;
    hi = this.opts.max ?? hi;
    if (hi - lo < 1e-9) hi = lo + 1;

    const t0 = times[0];
    const span = Math.max(times[n - 1] - t0, 1e-9);
    const X = (t: number) => ((t - t0) / span) * W;
    const Y = (v: number) => H - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * H;

    for (const g of [0.25, 0.5, 0.75]) this.plot.append(svg('line', { x1: 0, x2: W, y1: H * g, y2: H * g, class: 'chart-grid' }));
    if (this.opts.threshold) {
      const y = Y(this.opts.threshold.value);
      this.plot.append(svg('line', { x1: 0, x2: W, y1: y, y2: y, class: 'chart-threshold' }));
    }
    for (const s of series) {
      let d = '';
      let pen = false;
      s.values.forEach((v, i) => {
        if (v === null || !Number.isFinite(v)) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${X(times[i]).toFixed(1)} ${Y(v).toFixed(1)}`;
        pen = true;
      });
      if (!d) continue;
      const path = svg('path', { d, class: `chart-line ${s.dashed ? 'dashed' : ''}` });
      path.style.stroke = s.color;
      this.plot.append(path);
    }
    setText(this.yMax, this.opts.format(hi));
    setText(this.yMin, this.opts.format(lo));
    setText(this.xStart, formatTime(t0));
    setText(this.xEnd, formatTime(times[n - 1]));
  }
}
