import * as THREE from 'three';
import { once, onceBy } from '../cache';
import { merge } from '../geometry';
import { MATERIALS } from '../materials';
import type { PALETTE } from '../palette';

export type PingKind = keyof typeof PALETTE.ping;

/** Couche les anneaux au sol, juste au-dessus du plancher et de la heatmap. */
function layOnFloor(mesh: THREE.Mesh, y: number, renderOrder: number): THREE.Mesh {
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.renderOrder = renderOrder;
  return mesh;
}

const selectionGeometry = once(() => new THREE.RingGeometry(0.28, 0.36, 32));

/** Cercle vert sous un technicien sélectionné (masqué par défaut). */
export function createSelectionRing(): THREE.Mesh {
  const ring = layOnFloor(new THREE.Mesh(selectionGeometry(), MATERIALS.selectionRing()), 0.025, 0);
  ring.visible = false;
  return ring;
}

const rangeGeometry = onceBy((radius: number) => new THREE.RingGeometry(radius + 0.45, radius + 0.55, 64));

/** Portée d'un CRAC : `strong` pour le fantôme de construction, `soft` au survol. */
export function createRangeRing(radius: number, emphasis: 'strong' | 'soft' = 'strong'): THREE.Mesh {
  return layOnFloor(new THREE.Mesh(rangeGeometry(radius), MATERIALS.rangeRing(emphasis)), 0.03, 2);
}

const pingGeometry = once(() => new THREE.RingGeometry(0.3, 0.42, 32));
const PING_SECONDS = 0.6;

export interface Ping {
  readonly mesh: THREE.Mesh;
  /** Avance l'animation ; renvoie false quand le ping est terminé. */
  update(dt: number): boolean;
  /** Libère le matériau propre au ping (la géométrie est partagée). */
  dispose(): void;
}

/** Cercle bref au sol qui confirme un ordre : il se resserre et s'efface. */
export function createPing(kind: PingKind): Ping {
  const material = MATERIALS.ping(kind).clone();
  const mesh = layOnFloor(new THREE.Mesh(pingGeometry(), material), 0.04, 3);
  let age = 0;
  return {
    mesh,
    update(dt) {
      age += dt;
      const k = age / PING_SECONDS;
      if (k >= 1) return false;
      mesh.scale.setScalar(1.4 - 0.6 * k);
      material.opacity = 1 - k;
      return true;
    },
    dispose() {
      material.dispose();
    },
  };
}

/** Quatre coins en L, posés au sol autour de la case : géométrie partagée. */
const bracketsGeometry = once(() => {
  const arm = 0.22;
  const thick = 0.045;
  const half = 0.5;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (half - thick / 2);
      const cz = sz * (half - thick / 2);
      parts.push(new THREE.BoxGeometry(arm, 0.02, thick).translate(cx - (sx * (arm - thick)) / 2, 0.01, cz));
      parts.push(new THREE.BoxGeometry(thick, 0.02, arm).translate(cx, 0.01, cz - (sz * (arm - thick)) / 2));
    }
  }
  return merge(parts);
});

/** Crochets lumineux autour de l'équipement inspecté (masqués par défaut). */
export function createSelectionBrackets(): THREE.Mesh {
  const mesh = new THREE.Mesh(bracketsGeometry(), MATERIALS.inspectBrackets());
  mesh.position.y = 0.012;
  mesh.renderOrder = 3;
  mesh.visible = false;
  return mesh;
}
