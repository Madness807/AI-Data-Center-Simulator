import * as THREE from 'three';
import type { Building } from '../sim/entities';
import { switchReach } from '../sim/network';
import type { GameState } from '../sim/state';
import { BUILDING_SIZE, bundleThickness, createCableTrays, TRAY_Y, type CableTrays } from './assets';
import { MATERIALS } from './assets/materials';
import { cableLayout, trayGraph, type CableLayout, type CablePreview } from './cable-paths';

/** Où un câble arrive sur un équipement : près du bord d'un rack, au passage de câbles d'un switch. */
const LANDING = { rack: 0.3, switch: 0.15 };
/** Haut d'un rack (couronnes des G2 et G3 comprises, à peu près) : bas de sa descente. */
const RACK_TOP = 1.64;
/** Prolongement d'un tronçon au-delà du centre d'une case libre : les angles se referment d'eux-mêmes. */
const OVERLAP = 0.1;
const UP = new THREE.Vector3(0, 1, 0);

/** Maillages qui reçoivent des tronçons : le chemin lui-même (absent d'un aperçu), le faisceau, les descentes. */
interface Targets {
  trays: THREE.InstancedMesh | null;
  bundles: THREE.InstancedMesh;
  drops: THREE.InstancedMesh;
  /** Faisceaux grossis (surlignage), ou d'épaisseur fixe (aperçu). */
  thickness: (cables: number) => number;
}

/**
 * Chemins de câbles au plafond, au-dessus des allées qu'empruntent les câbles. Reconstruits
 * seulement quand le câblage change (cableLayout rend alors un autre objet). Par-dessus, un
 * aperçu : la portée et les câbles d'un switch pas encore posé, ou ceux de l'équipement inspecté.
 */
export class CableView {
  readonly root = new THREE.Group();
  private readonly meshes: CableTrays;
  private layout: CableLayout | null = null;
  private readonly reach: THREE.InstancedMesh;
  private readonly ghostBundles: THREE.InstancedMesh;
  private readonly ghostDrops: THREE.InstancedMesh;
  /** Ce que montre l'aperçu : il n'est reconstruit que si l'un des trois change. */
  private shown: { key: string; layout: CableLayout | null; preview: CablePreview | null } = { key: '', layout: null, preview: null };
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();

  constructor(w: number, h: number) {
    this.meshes = createCableTrays(w * h * 4);
    const ghost = createCableTrays(w * h * 4);
    this.ghostBundles = ghost.bundles;
    this.ghostDrops = ghost.drops;
    const tile = new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2);
    this.reach = new THREE.InstancedMesh(tile, MATERIALS.networkReach(), w * h);
    this.reach.count = 0;
    this.reach.frustumCulled = false;
    this.reach.renderOrder = 2;
    this.root.add(this.meshes.root, this.ghostBundles, this.ghostDrops, this.reach);
  }

  /** Met les chemins à jour si besoin ; renvoie le câblage affiché (les voyants des switchs en dépendent). */
  sync(s: GameState): CableLayout {
    const layout = cableLayout(s);
    if (layout !== this.layout) {
      this.layout = layout;
      const { trays, bundles, drops } = this.meshes;
      this.place(s, trayGraph(s, layout.view), { trays, bundles, drops, thickness: bundleThickness });
    }
    return layout;
  }

  /**
   * Chemins au plafond affichés ou non : le calque Réseau montre les câbles au sol, à leur vraie
   * case ; vus en perspective, les chemins au plafond sembleraient décalés et se doubleraient.
   */
  setTraysVisible(visible: boolean): void {
    this.meshes.root.visible = visible;
  }

  /** Aperçu d'un switch à poser (portée, câbles fantômes), sinon câbles de l'équipement inspecté surlignés. */
  syncOverlay(s: GameState, preview: CablePreview | null, inspected: Building | null): void {
    const layout = this.layout ?? cableLayout(s);
    const sw = preview?.kind === 'switch' ? preview : null;
    const focus = !preview && inspected && (inspected.kind === 'switch' || inspected.kind === 'rack') && inspected.status !== 'construction' ? inspected : null;
    const key = sw ? 'preview' : focus ? `inspect|${focus.id}` : '';
    // cablePreview et cableLayout rendent le même objet tant que rien ne change.
    if (key === this.shown.key && layout === this.shown.layout && sw === this.shown.preview) return;
    this.shown = { key, layout, preview: sw };
    let cells: number[] = [];
    let cables = layout.view.cables.filter((c) => focus && (c.sw === focus.id || c.rack === focus.id));
    if (sw) {
      cells = sw.reach;
      cables = sw.cables;
    } else if (focus?.kind === 'switch') cells = switchReach(s, focus);
    this.reach.count = 0;
    for (const i of cells) {
      if (this.reach.count >= this.reach.instanceMatrix.count) break;
      this.matrix.makeTranslation((i % s.w) + 0.5, 0.028, Math.floor(i / s.w) + 0.5);
      this.reach.setMatrixAt(this.reach.count++, this.matrix);
    }
    this.reach.instanceMatrix.needsUpdate = true;
    const material = sw ? MATERIALS.cablePreview() : MATERIALS.cableHighlight();
    this.ghostBundles.material = this.ghostDrops.material = material;
    const graph = trayGraph(s, { cables, unlinked: new Map(), ports: new Map() });
    // Un aperçu reste fin ; un surlignage enveloppe les vrais faisceaux.
    const thickness = sw ? () => 0.18 : (n: number) => bundleThickness(n) * 1.3;
    this.place(s, graph, { trays: null, bundles: this.ghostBundles, drops: this.ghostDrops, thickness });
  }

  /** Pose les tronçons et les descentes d'un graphe de chemins dans les maillages donnés. */
  private place(s: GameState, graph: ReturnType<typeof trayGraph>, t: Targets): void {
    const capacity = t.bundles.instanceMatrix.count;
    const equipment = new Map(graph.drops.map((d) => [d.cell, d.kind]));
    const center = (i: number) => new THREE.Vector2((i % s.w) + 0.5, Math.floor(i / s.w) + 0.5);
    // Extrémité d'un tronçon : point d'arrivée sur un équipement, ou un peu au-delà du centre d'une case libre.
    const end = (cell: number, toward: THREE.Vector2) => {
      const kind = equipment.get(cell);
      return center(cell).addScaledVector(toward, kind ? LANDING[kind] : -OVERLAP);
    };
    const placed = new Set<string>();
    let n = 0;
    let nd = 0;
    for (const seg of graph.segments) {
      if (n >= capacity) break;
      const dir = center(seg.b).sub(center(seg.a)).normalize();
      const pa = end(seg.a, dir);
      const pb = end(seg.b, dir.clone().negate());
      const length = pa.distanceTo(pb);
      // Rotation autour de Y qui amène +X sur la direction du tronçon.
      this.quat.setFromAxisAngle(UP, Math.atan2(-(pb.y - pa.y), pb.x - pa.x));
      if (t.trays) {
        this.matrix.compose(this.pos.set(pa.x, TRAY_Y, pa.y), this.quat, this.scale.set(length, 1, 1));
        t.trays.setMatrixAt(n, this.matrix);
      }
      const k = t.thickness(seg.count);
      this.matrix.compose(this.pos.set(pa.x, TRAY_Y + 0.012, pa.y), this.quat, this.scale.set(length, k * 0.75, k));
      t.bundles.setMatrixAt(n++, this.matrix);
      for (const [cell, p] of [
        [seg.a, pa],
        [seg.b, pb],
      ] as const) {
        const kind = equipment.get(cell);
        const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        if (!kind || placed.has(key) || nd >= capacity) continue;
        placed.add(key);
        const top = kind === 'rack' ? RACK_TOP : BUILDING_SIZE.switch[1];
        const w = t.thickness(kind === 'switch' ? seg.count : 1) * 0.8;
        this.matrix.compose(this.pos.set(p.x, top, p.y), this.quat.identity(), this.scale.set(w, TRAY_Y + 0.02 - top, w));
        t.drops.setMatrixAt(nd++, this.matrix);
      }
    }
    if (t.trays) t.trays.count = n;
    t.bundles.count = n;
    t.drops.count = nd;
    for (const mesh of [t.trays, t.bundles, t.drops]) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  }
}
