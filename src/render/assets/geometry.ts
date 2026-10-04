import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Fusionne des géométries en une seule (un seul appel de dessin) ; échoue bruyamment si c'est impossible. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!merged) throw new Error('Fusion de géométries impossible : attributs incompatibles');
  return merged;
}

/** Pavé de dimensions (w, h, d) dont la base est à `y` : on construit les modèles depuis le sol. */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}

/** Une pièce d'un modèle : sa forme et sa couleur (de la palette). */
export interface Part {
  geometry: THREE.BufferGeometry;
  color: number;
}

/**
 * Fusionne des pièces colorées en une seule géométrie à couleurs de sommets : tout le
 * modèle se dessine avec un seul matériau partagé (MATERIALS.vertexColored).
 */
export function bake(parts: Part[]): THREE.BufferGeometry {
  const color = new THREE.Color();
  return merge(
    parts.map(({ geometry, color: hex }) => {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      g.clearGroups();
      color.setHex(hex); // converti de sRGB vers l'espace de travail linéaire
      const n = g.attributes.position.count;
      const values = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) values.set([color.r, color.g, color.b], i * 3);
      g.setAttribute('color', new THREE.Float32BufferAttribute(values, 3));
      return g;
    }),
  );
}

/** Étire les coordonnées de texture : une texture répétée garde la même échelle sur un mur long. */
export function scaleUv(geometry: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
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
