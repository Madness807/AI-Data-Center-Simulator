import { ENTRANCE } from '../../sim/balance';
import type { GameState } from '../../sim/state';
import { busyRackIds } from '../../sim/stats';
import { PALETTE, statusColor } from '../../render/assets';
import { HEAT_STOPS, tempToRgb } from '../../render/overlay-colors';
import { el, icon } from '../dom';

/** Ce dont la mini-carte a besoin de la caméra. */
export interface MinimapCamera {
  footprint(): { x: number; z: number }[];
  setTarget(x: number, z: number): void;
}

const CELL = 8;
const LAYER_HZ = 4;
const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/**
 * Mini-carte vue de dessus (nord en haut) : équipements colorés par état, techniciens,
 * chaleur si la heatmap est active, et cadre de la caméra. Cliquer ou glisser déplace la vue.
 */
export class Minimap {
  readonly root: HTMLElement;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  /** Couche des équipements, redessinée quelques fois par seconde seulement. */
  private readonly layer = document.createElement('canvas');
  private readonly layerCtx: CanvasRenderingContext2D;
  private readonly width: number;
  private readonly height: number;
  private lastLayer = -Infinity;

  constructor(private readonly w: number, private readonly h: number, private readonly camera: MinimapCamera) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = w * CELL;
    this.height = h * CELL;
    for (const c of [this.canvas, this.layer]) {
      c.width = this.width * dpr;
      c.height = this.height * dpr;
    }
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.layerCtx = this.layer.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.layerCtx.scale(dpr, dpr);

    let dragging = false;
    const go = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.camera.setTarget(((e.clientX - r.left) / r.width) * this.w, ((e.clientY - r.top) / r.height) * this.h);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      go(e);
    });
    this.canvas.addEventListener('pointermove', (e) => dragging && go(e));
    this.canvas.addEventListener('pointerup', () => (dragging = false));

    this.root = el('div', 'minimap glass', el('div', 'panel-title', icon('minimap', 14), 'Salle'), this.canvas);
  }

  update(s: GameState, heatmap: boolean, selected: ReadonlySet<number>, now: number): void {
    if (now - this.lastLayer > 1000 / LAYER_HZ) {
      this.drawLayer(s, heatmap, selected);
      this.lastLayer = now;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.drawImage(this.layer, 0, 0, this.width, this.height);
    const pts = this.camera.footprint();
    if (pts.length === 4) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x * CELL, p.z * CELL) : ctx.moveTo(p.x * CELL, p.z * CELL)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(79, 209, 255, 0.08)';
      ctx.fill();
      ctx.strokeStyle = css(PALETTE.blueprint);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private drawLayer(s: GameState, heatmap: boolean, selected: ReadonlySet<number>): void {
    const ctx = this.layerCtx;
    ctx.fillStyle = css(PALETTE.floorSeam);
    ctx.fillRect(0, 0, this.width, this.height);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = s.temp[y * this.w + x];
        if (heatmap && t > HEAT_STOPS[0][0] + 0.5) {
          const [r, g, b] = tempToRgb(t);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else ctx.fillStyle = css(PALETTE.floorTile);
        ctx.fillRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
      }
    }
    ctx.fillStyle = css(PALETTE.hazardA);
    for (const [x, y] of ENTRANCE) ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);

    const busy = busyRackIds(s);
    for (const b of s.buildings) {
      const px = b.x * CELL + 1;
      const py = b.y * CELL + 1;
      if (b.status === 'construction') {
        ctx.strokeStyle = css(PALETTE.scaffold);
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 3, CELL - 3);
        continue;
      }
      let color: number;
      if (b.kind === 'crac') color = PALETTE.cracBody;
      else if (b.kind === 'pdu') color = PALETTE.pduBody;
      else if (b.kind === 'ups') color = PALETTE.upsBody;
      else if (b.kind === 'generator') color = PALETTE.genBody;
      else if (b.kind === 'cdu') color = PALETTE.cduBody;
      else if (b.status === 'failed') color = statusColor('failed');
      else if (b.status === 'repairing') color = statusColor('repairing');
      else if (!b.powered) color = statusColor('shed');
      else color = statusColor(busy.has(b.id) ? 'busy' : 'idle');
      ctx.fillStyle = css(color);
      ctx.fillRect(px, py, CELL - 2, CELL - 2);
    }
    for (const t of s.techs) {
      ctx.beginPath();
      ctx.arc((t.x + 0.5) * CELL, (t.y + 0.5) * CELL, selected.has(t.id) ? 3 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = css(selected.has(t.id) ? PALETTE.selection : PALETTE.techVest);
      ctx.fill();
    }
  }
}
