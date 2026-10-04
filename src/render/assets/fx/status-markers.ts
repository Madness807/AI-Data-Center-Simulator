import * as THREE from 'three';
import { once } from '../cache';
import { bake, box } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';

/**
 * Panneau « ! » : triangle blanc (teinté par instance : rouge en panne, orange en réparation)
 * et point d'exclamation sombre, lisible des deux côtés. Centré sur l'origine.
 */
const signGeometry = once(() => {
  const triangle = new THREE.Shape([new THREE.Vector2(-0.27, 0), new THREE.Vector2(0.27, 0), new THREE.Vector2(0, 0.46)]);
  return bake([
    {
      geometry: new THREE.ExtrudeGeometry(triangle, { depth: 0.05, bevelEnabled: false }).translate(0, -0.2, -0.025),
      color: 0xffffff,
    },
    { geometry: box(0.055, 0.16, 0.07, 0, -0.07), color: PALETTE.markerSymbol },
    { geometry: box(0.055, 0.05, 0.07, 0, -0.15), color: PALETTE.markerSymbol },
  ]);
});

/** Panneaux flottant au-dessus des racks en panne ou en réparation, instanciés. */
export function createStatusMarkers(capacity: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(signGeometry(), MATERIALS.statusMarker(), capacity);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}
