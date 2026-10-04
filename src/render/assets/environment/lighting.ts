import * as THREE from 'three';
import { PALETTE } from '../palette';

/**
 * Éclairage de studio : ciel bleuté, soleil chaud qui porte les ombres, et une lumière
 * d'appoint froide à l'opposé pour déboucher les faces à contre-jour.
 */
export function createLighting(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.HemisphereLight(PALETTE.lightSky, PALETTE.lightGround, 1.35));

  const sun = new THREE.DirectionalLight(PALETTE.lightSun, 2.4);
  sun.position.set(w / 2 + 10, 22, h / 2 + 14);
  sun.target.position.set(w / 2, 0, h / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const reach = Math.hypot(w, h) / 2 + 3;
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -reach;
  sc.right = sc.top = reach;
  sc.near = 1;
  sc.far = 80;

  const fill = new THREE.DirectionalLight(PALETTE.lightFill, 0.45);
  fill.position.set(w / 2 - 14, 10, h / 2 - 8);
  fill.target.position.set(w / 2, 0, h / 2);

  g.add(sun, sun.target, fill, fill.target);
  return g;
}
