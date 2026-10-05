import type * as THREE from 'three';
import { CRAC } from '../sim/balance';
import { canBuild, type Command } from '../sim/commands';
import type { BuildingKind, Facing, Gen } from '../sim/entities';
import { buildingAt, type GameState } from '../sim/state';
import { createBuildGhost, createRangeRing } from '../render/assets';
import { cellCenter } from '../render/grid';
import { pickGroundCell, rayFromScreen, type Cell } from './picking';

export type Tool = BuildingKind | 'rack2' | 'rack3' | 'demolish' | null;

/** Équipement et génération posés par un outil (les racks G2 et G3 sont des variantes du rack). */
export function toolBuild(tool: Exclude<Tool, null | 'demolish'>): { kind: BuildingKind; gen: Gen } {
  if (tool === 'rack2') return { kind: 'rack', gen: 2 };
  if (tool === 'rack3') return { kind: 'rack', gen: 3 };
  return { kind: tool, gen: 1 };
}

/**
 * Mode construction : fantôme sur la case survolée, clic gauche pour poser
 * (maintenir et glisser pour en poser plusieurs), clic droit ou Échap pour sortir.
 */
export class BuildController {
  tool: Tool = null;
  /** Orientation des racks posés (carrière) : F la fait tourner d'un quart de tour. */
  facing: Facing = 0;
  private groundHover: Cell | null = null;
  private buildingHover: Cell | null = null;
  private painting = false;
  private lastPainted = '';
  private readonly ghost = createBuildGhost();
  private readonly hoverRing = createRangeRing(CRAC.radius, 'soft');

  constructor(
    scene: THREE.Scene,
    private readonly camera: () => THREE.Camera,
    dom: HTMLElement,
    private readonly getState: () => GameState,
    private readonly enqueue: (c: Command) => void,
    private readonly pickBuilding: (ray: THREE.Raycaster) => Cell | null,
    /** Techniciens sélectionnés : chaque chantier posé leur est confié. */
    private readonly getAssigned: () => number[],
  ) {
    this.hoverRing.visible = false;
    scene.add(this.ghost.root, this.hoverRing);

    dom.addEventListener('pointermove', (e) => {
      const s = this.getState();
      const ray = rayFromScreen(this.camera(), dom, e.clientX, e.clientY);
      this.groundHover = pickGroundCell(ray, s.w, s.h);
      this.buildingHover = this.pickBuilding(ray);
      if (this.painting) this.apply(false);
    });
    dom.addEventListener('pointerleave', () => (this.groundHover = this.buildingHover = null));
    dom.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        this.setTool(null);
        return;
      }
      if (e.button !== 0 || !this.tool) return;
      dom.setPointerCapture(e.pointerId);
      this.painting = true;
      this.lastPainted = '';
      this.apply(true);
    });
    dom.addEventListener('pointerup', () => (this.painting = false));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Case visée. Pour poser, c'est le sol ; sinon on vise d'abord le volume
   * d'un bâtiment, car cliquer sur le haut d'un CRAC touche le sol derrière lui.
   */
  get hover(): Cell | null {
    if (this.tool && this.tool !== 'demolish') return this.groundHover;
    return this.buildingHover ?? this.groundHover;
  }

  rotate(): void {
    this.facing = ((this.facing + 1) % 4) as Facing;
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.painting = false;
  }

  /** Le premier clic envoie toujours la commande (pour afficher le refus) ; le glisser ne pose que là où c'est valide. */
  private apply(explicit: boolean): void {
    const tool = this.tool;
    const cell = this.hover;
    if (!tool || !cell) return;
    const key = `${cell.x},${cell.y}`;
    if (key === this.lastPainted) return;
    this.lastPainted = key;
    const s = this.getState();
    if (tool === 'demolish') {
      if (buildingAt(s, cell.x, cell.y)) this.enqueue({ type: 'demolish', ...cell });
      return;
    }
    const { kind, gen } = toolBuild(tool);
    if (explicit || canBuild(s, kind, cell.x, cell.y, gen) === null) {
      const assign = this.getAssigned();
      const facing = kind === 'rack' && s.rules.aisles ? { facing: this.facing } : {};
      this.enqueue({ type: 'build', kind, ...cell, ...facing, ...(gen > 1 ? { gen } : {}), ...(assign.length ? { assign } : {}) });
    }
  }

  update(): void {
    const s = this.getState();
    const cell = this.hover;
    const hovered = cell ? buildingAt(s, cell.x, cell.y) : undefined;

    // Survoler un CRAC existant montre sa portée.
    this.hoverRing.visible = !this.tool && hovered?.kind === 'crac';
    if (hovered && this.hoverRing.visible) cellCenter(hovered.x, hovered.y, this.hoverRing.position).setY(0.03);

    if (!this.tool || !cell) {
      this.ghost.root.visible = false;
      return;
    }
    this.ghost.root.visible = true;
    cellCenter(cell.x, cell.y, this.ghost.root.position);
    if (this.tool === 'demolish') this.ghost.set('demolish', hovered !== undefined);
    else {
      const { kind, gen } = toolBuild(this.tool);
      this.ghost.set(kind, canBuild(s, kind, cell.x, cell.y, gen) === null, s.rules.aisles && kind === 'rack' ? this.facing : undefined);
    }
  }
}
