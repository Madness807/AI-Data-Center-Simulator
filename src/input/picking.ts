import * as THREE from 'three';

const raycaster = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

export type Cell = { x: number; y: number };

/** Rayon caméra → curseur, partagé (le résultat n'est valable que jusqu'au prochain appel). */
export function rayFromScreen(camera: THREE.Camera, dom: HTMLElement, clientX: number, clientY: number): THREE.Raycaster {
  const rect = dom.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster;
}

/** Case de la grille sous le curseur, par intersection avec le plan du sol. */
export function pickGroundCell(ray: THREE.Raycaster, w: number, h: number): Cell | null {
  if (!ray.ray.intersectPlane(ground, hit)) return null;
  const x = Math.floor(hit.x);
  const y = Math.floor(hit.z);
  return x >= 0 && y >= 0 && x < w && y < h ? { x, y } : null;
}
