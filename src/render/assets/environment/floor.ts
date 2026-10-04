import * as THREE from 'three';
import { ENTRANCE } from '../../../sim/balance';
import { MATERIALS } from '../materials';

/** Faux plancher de la salle, avec ses dalles et le marquage de l'entrée. */
export function createFloor(w: number, h: number): THREE.Group {
  const g = new THREE.Group();

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MATERIALS.floor());
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, h / 2);
  floor.receiveShadow = true;
  g.add(floor);

  const pts: number[] = [];
  for (let x = 0; x <= w; x++) pts.push(x, 0.005, 0, x, 0.005, h);
  for (let y = 0; y <= h; y++) pts.push(0, 0.005, y, w, 0.005, y);
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lines, MATERIALS.floorGrid()));

  const tileGeometry = new THREE.PlaneGeometry(0.96, 0.96);
  for (const [x, y] of ENTRANCE) {
    const tile = new THREE.Mesh(tileGeometry, MATERIALS.entrance());
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(x + 0.5, 0.01, y + 0.5);
    g.add(tile);
  }
  return g;
}
