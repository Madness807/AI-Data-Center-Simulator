import * as THREE from 'three';
import { PALETTE } from '../palette';

/** Lumière d'ambiance et soleil avec ombres, cadré sur toute la salle. */
export function createLighting(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(PALETTE.lightSky, PALETTE.lightGround, 1.2));
  const sun = new THREE.DirectionalLight(PALETTE.lightSun, 1.6);
  sun.position.set(w / 2 + 12, 25, h / 2 + 8);
  sun.target.position.set(w / 2, 0, h / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -Math.max(w, h);
  sc.right = sc.top = Math.max(w, h);
  sc.near = 1;
  sc.far = 80;
  g.add(sun, sun.target);
  return g;
}
