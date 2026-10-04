import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Fusionne des géométries en une seule (un seul appel de dessin) ; échoue bruyamment si c'est impossible. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('Fusion de géométries impossible : attributs incompatibles');
  return merged;
}

/** Triangles dessinés par un objet et ses enfants (les lignes ne comptent pas) : sert aux budgets. */
export function countTriangles(object: THREE.Object3D): number {
  let total = 0;
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = o.geometry as THREE.BufferGeometry;
    total += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return total;
}
