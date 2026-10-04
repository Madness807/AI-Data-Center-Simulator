import * as THREE from 'three';
import { ENTRANCE } from '../../../sim/balance';
import { bake, box, merge, scaleUv } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';

export interface WallsModel {
  readonly root: THREE.Group;
  /** Abaisse les murs côté caméra et relève ceux du fond (azimut en radians). */
  update(cameraAzimuth: number, dt: number): void;
}

const TALL = 1.75;
const LOW = 0.24;
const THICKNESS = 0.16;
const SKIRTING = 0.12;
const CAP = 0.05;
const DOOR_HEIGHT = 1.25;
/** Au-dessus de cette hauteur, on montre les détails du haut des murs (chemin de câbles, appliques). */
const DETAIL_HEIGHT = 1.3;

/** Un côté de la salle : il monte ou descend d'un bloc selon la caméra. */
interface Side {
  /** Normale sortante dans le plan du sol (x, z). */
  normal: readonly [number, number];
  height: number;
  /** Corps des murs, de hauteur 1, étirés en Y. */
  bodies: THREE.Mesh[];
  /** Corniches posées sur le haut des murs. */
  caps: THREE.Mesh[];
  /** Détails visibles seulement quand le mur est haut. */
  details: THREE.Object3D[];
}

/**
 * Murs en coupe, comme dans les jeux de gestion isométriques : les murs entre la caméra
 * et la salle s'abaissent pour ne rien cacher, ceux du fond montent et habillent la scène.
 */
export function createWalls(w: number, h: number): WallsModel {
  const root = new THREE.Group();
  const sides: Side[] = [];
  const half = THICKNESS / 2;

  /** Mur le long de X (nord/sud) ou de Z (ouest/est), de `a` à `b` sur cet axe. */
  const addSegment = (side: Side, alongX: boolean, a: number, b: number, at: number) => {
    const len = b - a;
    const mid = (a + b) / 2;
    const place = (o: THREE.Object3D) => {
      if (alongX) o.position.set(mid, o.position.y, at);
      else {
        o.position.set(at, o.position.y, mid);
        o.rotation.y = Math.PI / 2;
      }
    };

    const body = new THREE.Mesh(scaleUv(box(len, 1, THICKNESS), len, 1), MATERIALS.wallPanel());
    body.castShadow = body.receiveShadow = true;
    const cap = new THREE.Mesh(
      bake([{ geometry: box(len + 0.04, CAP, THICKNESS + 0.06), color: PALETTE.wallCap }]),
      MATERIALS.vertexColored(),
    );
    const skirting = new THREE.Mesh(
      bake([{ geometry: box(len, SKIRTING, THICKNESS + 0.04), color: PALETTE.wallSkirting }]),
      MATERIALS.vertexColored(),
    );
    for (const o of [body, cap, skirting]) place(o);
    side.bodies.push(body);
    side.caps.push(cap);
    root.add(body, cap, skirting);

    // Chemin de câbles et appliques, plaqués sur la face intérieure du mur.
    const tray = new THREE.Mesh(
      bake([{ geometry: box(len, 0.06, 0.16, 0, 1.42, 0), color: PALETTE.wallTray }]),
      MATERIALS.vertexColored(),
    );
    // Toutes les appliques d'un pan de mur en une seule géométrie : un seul appel de dessin.
    const lamps: THREE.BufferGeometry[] = [];
    for (let k = 3; k < len - 1; k += 6) lamps.push(box(0.5, 0.05, 0.04, k - len / 2, 1.2, 0));
    const lights = lamps.length ? new THREE.Mesh(merge(lamps), MATERIALS.wallLight()) : new THREE.Group();
    for (const [o, inset] of [
      [tray, half + 0.08],
      [lights, half + 0.02],
    ] as const) {
      place(o);
      o.position.x -= side.normal[0] * inset;
      o.position.z -= side.normal[1] * inset;
      side.details.push(o);
      root.add(o);
    }
  };

  const makeSide = (normal: readonly [number, number]): Side => {
    const side: Side = { normal, height: TALL, bodies: [], caps: [], details: [] };
    sides.push(side);
    return side;
  };

  // Nord et sud couvrent les angles ; l'ouest est ouvert sur l'entrée.
  addSegment(makeSide([0, -1]), true, -THICKNESS, w + THICKNESS, -half);
  addSegment(makeSide([0, 1]), true, -THICKNESS, w + THICKNESS, h + half);
  addSegment(makeSide([1, 0]), false, 0, h, w + half);
  const west = makeSide([-1, 0]);
  const doorYs = ENTRANCE.filter(([x]) => x === 0).map(([, y]) => y);
  const doorStart = Math.min(...doorYs);
  const doorEnd = Math.max(...doorYs) + 1;
  addSegment(west, false, 0, doorStart, -half);
  addSegment(west, false, doorEnd, h, -half);
  // Linteau au-dessus de la porte, visible seulement quand le mur ouest est haut.
  const lintel = new THREE.Mesh(
    scaleUv(box(doorEnd - doorStart, TALL - DOOR_HEIGHT, THICKNESS, 0, DOOR_HEIGHT, 0), doorEnd - doorStart, 1),
    MATERIALS.wallPanel(),
  );
  lintel.position.set(-half, 0, (doorStart + doorEnd) / 2);
  lintel.rotation.y = Math.PI / 2;
  lintel.castShadow = true;
  west.details.push(lintel);
  root.add(lintel);

  const apply = (side: Side) => {
    for (const b of side.bodies) b.scale.y = side.height;
    for (const c of side.caps) c.position.y = side.height;
    const detailed = side.height > DETAIL_HEIGHT;
    for (const d of side.details) d.visible = detailed;
  };

  let first = true;
  return {
    root,
    update(azimuth, dt) {
      // Direction sol de la cible vers la caméra (voir RtsCamera.update).
      const cx = Math.sin(azimuth);
      const cz = Math.cos(azimuth);
      const k = first ? 1 : 1 - Math.exp(-10 * dt);
      first = false;
      for (const side of sides) {
        const facesCamera = side.normal[0] * cx + side.normal[1] * cz > 0.25;
        const goal = facesCamera ? LOW : TALL;
        side.height += (goal - side.height) * k;
        apply(side);
      }
    },
  };
}
