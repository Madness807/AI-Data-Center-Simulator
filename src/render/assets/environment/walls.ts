import * as THREE from 'three';
import { ENTRANCE } from '../../../sim/balance';
import { MATERIALS } from '../materials';

export interface WallsModel {
  readonly root: THREE.Group;
  /** Adapte les murs à l'angle de la caméra (azimut en radians). */
  update(cameraAzimuth: number, dt: number): void;
}

const WALL_HEIGHT = 0.35;
const THICKNESS = 0.15;

/** Murets autour de la salle, ouverts à l'entrée. */
export function createWalls(w: number, h: number): WallsModel {
  const root = new THREE.Group();
  const addWall = (x0: number, z0: number, x1: number, z1: number) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(x1 - x0, THICKNESS), WALL_HEIGHT, Math.max(z1 - z0, THICKNESS)),
      MATERIALS.wall(),
    );
    m.position.set((x0 + x1) / 2, WALL_HEIGHT / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  };
  const half = THICKNESS / 2;
  addWall(0, -half, w, -half);
  addWall(0, h + half, w, h + half);
  addWall(w + half, 0, w + half, h);
  const doorYs = ENTRANCE.filter(([x]) => x === 0).map(([, y]) => y);
  addWall(-half, 0, -half, Math.min(...doorYs));
  addWall(-half, Math.max(...doorYs) + 1, -half, h);

  return { root, update() {} };
}
