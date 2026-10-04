import * as THREE from 'three';

/** Centre de la case (x, y) dans le monde : la grille occupe [0, w] × [0, h] sur le sol. */
export function cellCenter(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x + 0.5, 0, y + 0.5);
}
