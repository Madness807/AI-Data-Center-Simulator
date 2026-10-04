import * as THREE from 'three';
import type { GameState } from '../sim/state';
import { paintOverlay, type OverlayMode } from './overlay-colors';

/**
 * Calque posé au ras du sol : une texture w×h recalculée à chaque image tant qu'il est
 * affiché. Les couleurs viennent de paintOverlay ; ici, seulement la copie et le filtrage.
 */
export class FloorOverlay {
  readonly mesh: THREE.Mesh;
  /** Calque affiché, ou null. */
  mode: OverlayMode | null = null;
  private readonly grid: Uint8Array;
  private readonly data: Uint8Array;
  private readonly texture: THREE.DataTexture;

  constructor(private readonly w: number, private readonly h: number) {
    this.grid = new Uint8Array(w * h * 4);
    this.data = new Uint8Array(w * h * 4);
    this.texture = new THREE.DataTexture(this.data, w, h, THREE.RGBAFormat);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(w / 2, 0.02, h / 2);
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  update(s: GameState): void {
    this.mesh.visible = this.mode !== null;
    if (!this.mode) return;
    paintOverlay(this.mode, s, this.grid);
    // La texture a v=0 en bas du plan, soit z max une fois couché : on inverse les lignes.
    const rowBytes = this.w * 4;
    for (let y = 0; y < this.h; y++) {
      this.data.set(this.grid.subarray(y * rowBytes, (y + 1) * rowBytes), (this.h - 1 - y) * rowBytes);
    }
    // La chaleur se diffuse : dégradé lissé. Les autres calques décrivent des cases nettes.
    const filter = this.mode === 'heat' ? THREE.LinearFilter : THREE.NearestFilter;
    this.texture.magFilter = filter;
    this.texture.minFilter = filter;
    this.texture.needsUpdate = true;
  }
}
