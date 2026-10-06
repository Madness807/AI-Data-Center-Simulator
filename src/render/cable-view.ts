import * as THREE from 'three';
import type { GameState } from '../sim/state';
import { BUILDING_SIZE, bundleThickness, createCableTrays, TRAY_Y, type CableTrays } from './assets';
import { cableLayout, type CableLayout } from './cable-paths';

/** Où un câble arrive sur un équipement : près du bord d'un rack, au passage de câbles d'un switch. */
const LANDING = { rack: 0.3, switch: 0.15 };
/** Haut d'un rack (couronnes des G2 et G3 comprises, à peu près) : bas de sa descente. */
const RACK_TOP = 1.64;
/** Prolongement d'un tronçon au-delà du centre d'une case libre : les angles se referment d'eux-mêmes. */
const OVERLAP = 0.1;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Chemins de câbles au plafond, au-dessus des allées qu'empruntent les câbles. Reconstruits
 * seulement quand le câblage change (cableLayout rend alors un autre objet).
 */
export class CableView {
  readonly root: THREE.Group;
  private readonly meshes: CableTrays;
  private layout: CableLayout | null = null;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();

  constructor(w: number, h: number) {
    this.meshes = createCableTrays(w * h * 4);
    this.root = this.meshes.root;
  }

  /** Met les chemins à jour si besoin ; renvoie le câblage affiché (les voyants des switchs en dépendent). */
  sync(s: GameState): CableLayout {
    const layout = cableLayout(s);
    if (layout !== this.layout) {
      this.layout = layout;
      this.rebuild(s, layout);
    }
    return layout;
  }

  private rebuild(s: GameState, layout: CableLayout): void {
    const { trays, bundles, drops } = this.meshes;
    const capacity = trays.instanceMatrix.count;
    const equipment = new Map(layout.drops.map((d) => [d.cell, d.kind]));
    const center = (i: number) => new THREE.Vector2((i % s.w) + 0.5, Math.floor(i / s.w) + 0.5);
    // Extrémité d'un tronçon : point d'arrivée sur un équipement, ou un peu au-delà du centre d'une case libre.
    const end = (cell: number, toward: THREE.Vector2) => {
      const kind = equipment.get(cell);
      return center(cell).addScaledVector(toward, kind ? LANDING[kind] : -OVERLAP);
    };
    const placed = new Set<string>();
    let n = 0;
    let nd = 0;
    for (const seg of layout.segments) {
      if (n >= capacity) break;
      const dir = center(seg.b).sub(center(seg.a)).normalize();
      const pa = end(seg.a, dir);
      const pb = end(seg.b, dir.clone().negate());
      const length = pa.distanceTo(pb);
      // Rotation autour de Y qui amène +X sur la direction du tronçon.
      this.quat.setFromAxisAngle(UP, Math.atan2(-(pb.y - pa.y), pb.x - pa.x));
      this.matrix.compose(this.pos.set(pa.x, TRAY_Y, pa.y), this.quat, this.scale.set(length, 1, 1));
      trays.setMatrixAt(n, this.matrix);
      const t = bundleThickness(seg.count);
      this.matrix.compose(this.pos.set(pa.x, TRAY_Y + 0.012, pa.y), this.quat, this.scale.set(length, t * 0.75, t));
      bundles.setMatrixAt(n++, this.matrix);
      for (const [cell, p] of [
        [seg.a, pa],
        [seg.b, pb],
      ] as const) {
        const kind = equipment.get(cell);
        const key = `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        if (!kind || placed.has(key) || nd >= capacity) continue;
        placed.add(key);
        const top = kind === 'rack' ? RACK_TOP : BUILDING_SIZE.switch[1];
        const w = bundleThickness(kind === 'switch' ? seg.count : 1) * 0.8;
        this.matrix.compose(this.pos.set(p.x, top, p.y), this.quat.identity(), this.scale.set(w, TRAY_Y + 0.02 - top, w));
        drops.setMatrixAt(nd++, this.matrix);
      }
    }
    trays.count = bundles.count = n;
    drops.count = nd;
    for (const mesh of [trays, bundles, drops]) mesh.instanceMatrix.needsUpdate = true;
  }
}
