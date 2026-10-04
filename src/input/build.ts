import * as THREE from 'three';
import { CRAC } from '../sim/balance';
import { canBuild, type Command } from '../sim/commands';
import type { BuildingKind } from '../sim/entities';
import { buildingAt, type GameState } from '../sim/state';
import { cellCenter } from '../render/meshes';
import { createRadiusRing } from '../render/overlays';
import { pickGroundCell, rayFromScreen, type Cell } from './picking';

export type Tool = BuildingKind | 'demolish' | null;

const GHOST_SIZE: Record<BuildingKind, [number, number, number]> = {
  rack: [0.8, 1.6, 0.8],
  crac: [0.9, 1.4, 0.9],
  pdu: [0.7, 1.0, 0.55],
};

/**
 * Mode construction : fantôme sur la case survolée, clic gauche pour poser
 * (maintenir et glisser pour en poser plusieurs), clic droit ou Échap pour sortir.
 */
export class BuildController {
  tool: Tool = null;
  private groundHover: Cell | null = null;
  private buildingHover: Cell | null = null;
  onToolChange: (tool: Tool) => void = () => {};
  private painting = false;
  private lastPainted = '';
  private readonly ghost = new THREE.Group();
  private readonly ghostBox: THREE.Mesh;
  private readonly ghostMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false });
  private readonly ring = createRadiusRing(CRAC.radius);
  private readonly hoverRing = createRadiusRing(CRAC.radius);

  constructor(
    scene: THREE.Scene,
    private readonly camera: () => THREE.Camera,
    dom: HTMLElement,
    private readonly getState: () => GameState,
    private readonly enqueue: (c: Command) => void,
    private readonly pickBuilding: (ray: THREE.Raycaster) => Cell | null,
  ) {
    this.ghostBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMat);
    this.ghost.add(this.ghostBox, this.ring);
    this.ghost.visible = false;
    (this.hoverRing.material as THREE.MeshBasicMaterial).opacity = 0.4;
    this.hoverRing.visible = false;
    scene.add(this.ghost, this.hoverRing);

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

  setTool(tool: Tool): void {
    this.tool = tool;
    this.painting = false;
    this.onToolChange(tool);
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
    if (explicit || canBuild(s, tool, cell.x, cell.y) === null) {
      this.enqueue({ type: 'build', kind: tool, ...cell });
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
      this.ghost.visible = false;
      return;
    }
    this.ghost.visible = true;
    cellCenter(cell.x, cell.y, this.ghost.position);

    if (this.tool === 'demolish') {
      this.ghostBox.scale.set(1, 2, 1);
      this.ghostBox.position.y = 1;
      this.ghostMat.color.set(hovered ? 0xff4040 : 0x666666);
      this.ghostBox.visible = true;
      this.ring.visible = false;
      return;
    }
    const [sx, sy, sz] = GHOST_SIZE[this.tool];
    this.ghostBox.scale.set(sx, sy, sz);
    this.ghostBox.position.y = sy / 2;
    this.ghostMat.color.set(canBuild(s, this.tool, cell.x, cell.y) === null ? 0x40ff80 : 0xff4040);
    this.ring.visible = this.tool === 'crac';
  }
}
