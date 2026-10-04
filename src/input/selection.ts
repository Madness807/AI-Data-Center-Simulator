import type { Command } from '../sim/commands';
import type { Building, Cell, TechTask } from '../sim/entities';
import type { GameState } from '../sim/state';
import type { PingKind } from '../render/assets';

const CLICK_SLOP = 5;
const TECH_HIT_RADIUS = 22;

export interface SelectionDeps {
  getState: () => GameState;
  /** Un outil de construction actif garde la main sur la souris. */
  isToolActive: () => boolean;
  techScreenPositions: () => { id: number; x: number; y: number }[];
  /** Bâtiment visé (par son volume 3D) ou case du sol sous le curseur. */
  pickTarget: (clientX: number, clientY: number) => { building?: Building; cell: Cell | null };
  enqueue: (c: Command) => void;
  ping: (cell: Cell, kind: PingKind) => void;
}

/**
 * Micro RTS : clic ou rectangle pour sélectionner les techniciens (Maj pour ajouter),
 * clic droit pour donner un ordre (Maj pour l'ajouter à la file). Un clic sur un
 * équipement l'inspecte : sélection exclusive avec celle des techniciens.
 */
export class SelectionController {
  readonly selected = new Set<number>();
  /** Équipement inspecté (id), ou null. */
  inspected: number | null = null;
  private drag: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private readonly rect: HTMLDivElement;

  constructor(dom: HTMLElement, private readonly deps: SelectionDeps) {
    this.rect = document.createElement('div');
    this.rect.className = 'select-rect';
    document.body.append(this.rect);

    dom.addEventListener('pointerdown', (e) => {
      if (deps.isToolActive()) return;
      if (e.button === 0) this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      else if (e.button === 2) this.order(e.clientX, e.clientY, e.shiftKey);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.drag.x1 = e.clientX;
      this.drag.y1 = e.clientY;
      this.drawRect();
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button !== 0 || !this.drag) return;
      const d = this.drag;
      this.drag = null;
      this.rect.style.display = 'none';
      if (Math.abs(d.x1 - d.x0) < CLICK_SLOP && Math.abs(d.y1 - d.y0) < CLICK_SLOP) this.click(d.x0, d.y0, e.shiftKey);
      else this.boxSelect(d, e.shiftKey);
    });
  }

  clear(): void {
    this.selected.clear();
    this.inspected = null;
  }

  /** Inspecte un équipement (depuis une alerte, par exemple). */
  inspect(id: number): void {
    this.selected.clear();
    this.inspected = id;
  }

  /** Retire ce qui n'existe plus (équipement démoli, nouvelle partie). */
  prune(s: GameState): void {
    for (const id of this.selected) if (!s.techs.some((t) => t.id === id)) this.selected.delete(id);
    if (this.inspected !== null && !s.buildings.some((b) => b.id === this.inspected)) this.inspected = null;
  }

  private click(x: number, y: number, add: boolean): void {
    let best: { id: number; d: number } | null = null;
    for (const p of this.deps.techScreenPositions()) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < TECH_HIT_RADIUS && (!best || d < best.d)) best = { id: p.id, d };
    }
    if (best) {
      this.inspected = null;
      if (!add) this.selected.clear();
      if (add && this.selected.has(best.id)) this.selected.delete(best.id);
      else this.selected.add(best.id);
      return;
    }
    const { building } = this.deps.pickTarget(x, y);
    if (building) {
      this.inspect(building.id);
      return;
    }
    if (!add) this.clear();
  }

  private boxSelect(d: { x0: number; y0: number; x1: number; y1: number }, add: boolean): void {
    const [l, r] = [Math.min(d.x0, d.x1), Math.max(d.x0, d.x1)];
    const [t, b] = [Math.min(d.y0, d.y1), Math.max(d.y0, d.y1)];
    if (!add) this.selected.clear();
    this.inspected = null;
    for (const p of this.deps.techScreenPositions()) {
      if (p.x >= l && p.x <= r && p.y >= t && p.y <= b) this.selected.add(p.id);
    }
  }

  private order(x: number, y: number, append: boolean): void {
    if (this.selected.size === 0) return;
    const { building, cell } = this.deps.pickTarget(x, y);
    let task: TechTask;
    if (building?.status === 'construction') {
      task = { type: 'build', target: building.id };
    } else if (building?.status === 'failed' || building?.status === 'repairing') {
      task = { type: 'repair', target: building.id };
    } else if (building?.kind === 'rack' && building.status === 'ok' && (building.wear ?? 0) >= 1) {
      // Carrière : un rack usé en service, c'est un entretien.
      task = { type: 'maintain', target: building.id };
    } else if (building) {
      task = { type: 'move', x: building.x, y: building.y };
    } else if (cell) {
      task = { type: 'move', x: cell.x, y: cell.y };
    } else return;
    this.deps.enqueue({ type: 'order', techs: [...this.selected], task, append });
    this.deps.ping(building ?? cell!, task.type);
  }

  private drawRect(): void {
    const d = this.drag!;
    if (Math.abs(d.x1 - d.x0) < CLICK_SLOP && Math.abs(d.y1 - d.y0) < CLICK_SLOP) return;
    Object.assign(this.rect.style, {
      display: 'block',
      left: `${Math.min(d.x0, d.x1)}px`,
      top: `${Math.min(d.y0, d.y1)}px`,
      width: `${Math.abs(d.x1 - d.x0)}px`,
      height: `${Math.abs(d.y1 - d.y0)}px`,
    });
  }
}
