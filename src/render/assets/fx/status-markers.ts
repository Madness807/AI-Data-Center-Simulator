import * as THREE from 'three';
import { once } from '../cache';
import { MATERIALS } from '../materials';

const markerGeometry = once(() => new THREE.OctahedronGeometry(0.3));

/**
 * Losanges flottant au-dessus des racks en panne ou en réparation, instanciés :
 * la couleur de chaque instance porte l'état.
 */
export function createStatusMarkers(capacity: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(markerGeometry(), MATERIALS.statusMarker(), capacity);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}
