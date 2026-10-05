import { svg } from '../svg';

/**
 * Petite courbe (SVG) : aire, tracé et ligne de seuil pointillée. L'échelle s'élargit
 * pour toujours inclure le seuil, afin de voir d'un coup d'œil si on s'en approche.
 */
export class Sparkline {
  readonly root: SVGSVGElement;
  private readonly area: SVGPathElement;
  private readonly line: SVGPolylineElement;
  private readonly threshold: SVGLineElement;
  private readonly dot: SVGCircleElement;

  constructor(private readonly width = 268, private readonly height = 46) {
    this.root = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'sparkline' });
    this.area = svg('path', { class: 'spark-area' });
    this.threshold = svg('line', { class: 'spark-threshold', x1: 0, x2: width });
    this.line = svg('polyline', { class: 'spark-line' });
    this.dot = svg('circle', { class: 'spark-dot', r: 2.6 });
    this.root.append(this.area, this.threshold, this.line, this.dot);
  }

  update(values: number[], threshold: number, floor: number): void {
    if (values.length < 2) values = [values[0] ?? floor, values[0] ?? floor];
    const lo = Math.min(floor, ...values);
    const hi = Math.max(threshold + 5, ...values);
    const x = (i: number) => (i / (values.length - 1)) * this.width;
    const y = (v: number) => this.height - 3 - ((v - lo) / (hi - lo)) * (this.height - 6);
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    this.line.setAttribute('points', pts.join(' '));
    this.area.setAttribute('d', `M0,${this.height} L${pts.join(' L')} L${this.width},${this.height} Z`);
    const ty = y(threshold).toFixed(1);
    this.threshold.setAttribute('y1', ty);
    this.threshold.setAttribute('y2', ty);
    const last = values[values.length - 1];
    this.dot.setAttribute('cx', String(this.width));
    this.dot.setAttribute('cy', y(last).toFixed(1));
    this.root.classList.toggle('hot', last >= threshold);
  }
}
