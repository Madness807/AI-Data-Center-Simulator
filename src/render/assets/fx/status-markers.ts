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

/** Plaque carrée, éclair et barre oblique : « plus de courant », lisible sans la couleur. */
const shedGeometry = once(() => {
  const bolt = new THREE.Shape(
    [
      [0.03, 0.15],
      [-0.08, -0.01],
      [0.0, -0.01],
      [-0.04, -0.15],
      [0.09, 0.03],
      [0.01, 0.03],
      [0.06, 0.15],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  );
  return bake([
    { geometry: new THREE.BoxGeometry(0.4, 0.4, 0.04), color: 0xffffff },
    { geometry: new THREE.ExtrudeGeometry(bolt, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03), color: PALETTE.markerSymbol },
    { geometry: new THREE.BoxGeometry(0.46, 0.045, 0.07).rotateZ(-Math.PI / 4), color: PALETTE.markerSymbol },
  ]);
});

/** Marqueurs des racks délestés (mode daltonien), instanciés comme les panneaux de panne. */
export function createShedMarkers(capacity: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(shedGeometry(), MATERIALS.statusMarker(), capacity);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

/** Toit vitré du confinement d'allée chaude, posé au-dessus des racks, une instance par case. */
export function createContainmentPanels(capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.03, 1).translate(0, 1.72, 0), MATERIALS.containment(), capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return mesh;
}
