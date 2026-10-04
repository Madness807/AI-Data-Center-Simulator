import * as THREE from 'three';
import type { GameState } from '../sim/state';

/** Paliers de la rampe de couleurs de la heatmap (°C → RGB). */
export const HEAT_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [22, 40, 80, 200],
  [30, 40, 190, 170],
  [40, 230, 210, 50],
  [55, 235, 70, 40],
  [75, 255, 230, 230],
];

export function tempToRgb(t: number): [number, number, number] {
  const stops = HEAT_STOPS;
  if (t <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]];
  for (let i = 1; i < stops.length; i++) {
    const [t1, r1, g1, b1] = stops[i];
    if (t <= t1) {
      const [t0, r0, g0, b0] = stops[i - 1];
      const f = (t - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

/** Une seule texture w×h mise à jour, posée sur un plan au ras du sol. */
export class Heatmap {
  readonly mesh: THREE.Mesh;
  private readonly data: Uint8Array;
  private readonly texture: THREE.DataTexture;

  constructor(private readonly w: number, private readonly h: number) {
    this.data = new Uint8Array(w * h * 4);
    this.texture = new THREE.DataTexture(this.data, w, h, THREE.RGBAFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
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

  get visible(): boolean {
    return this.mesh.visible;
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  update(s: GameState): void {
    if (!this.mesh.visible) return;
    for (let y = 0; y < this.h; y++) {
      // La texture a v=0 en bas du plan, soit z max une fois couché : on inverse les lignes.
      const row = this.h - 1 - y;
      for (let x = 0; x < this.w; x++) {
        const t = s.temp[y * this.w + x];
        const [r, g, b] = tempToRgb(t);
        const o = (row * this.w + x) * 4;
        this.data[o] = r;
        this.data[o + 1] = g;
        this.data[o + 2] = b;
        // Discret à l'ambiant, opaque dès que ça chauffe : le sol reste lisible.
        this.data[o + 3] = 90 + 165 * Math.min(Math.max((t - HEAT_STOPS[0][0]) / 12, 0), 1);
      }
    }
    this.texture.needsUpdate = true;
  }
}
