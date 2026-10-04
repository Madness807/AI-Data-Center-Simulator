import * as THREE from 'three';
import { once, onceBy } from '../cache';
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
