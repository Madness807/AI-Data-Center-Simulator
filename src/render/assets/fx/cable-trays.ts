import * as THREE from 'three';
import { once } from '../cache';
import { bake, box } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';

/** Hauteur des chemins de câbles : au-dessus des racks (1,6), des tuyaux des G3 (1,79), du confinement et des murs. */
export const TRAY_Y = 1.86;
const TRAY_W = 0.2;

/** Tronçon de chemin de câbles (fond et deux rebords), de longueur 1 le long de +X depuis son origine. */
export const trayGeometry = once(() =>
  bake([
    { geometry: box(1, 0.012, TRAY_W, 0.5), color: PALETTE.trayFrame },
    { geometry: box(1, 0.05, 0.012, 0.5, 0, TRAY_W / 2 - 0.006), color: PALETTE.trayFrame },
    { geometry: box(1, 0.05, 0.012, 0.5, 0, -TRAY_W / 2 + 0.006), color: PALETTE.trayFrame },
  ]),
);

/** Faisceau de câbles : un pavé unité posé dans le tronçon (x de 0 à 1, y de 0 à 1). */
const bundleGeometry = once(() => new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0));
/** Descente verticale vers un équipement (y de 0 à 1). */
const dropGeometry = once(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));

export interface CableTrays {
  readonly root: THREE.Group;
  readonly trays: THREE.InstancedMesh;
  readonly bundles: THREE.InstancedMesh;
  readonly drops: THREE.InstancedMesh;
}

/** Trois maillages instanciés (chemins, faisceaux, descentes) : trois appels de dessin pour tout le réseau. */
export function createCableTrays(capacity: number): CableTrays {
  const trays = new THREE.InstancedMesh(trayGeometry(), MATERIALS.vertexColored(), capacity);
  const bundles = new THREE.InstancedMesh(bundleGeometry(), MATERIALS.fiber(), capacity);
  const drops = new THREE.InstancedMesh(dropGeometry(), MATERIALS.fiber(), capacity);
  const root = new THREE.Group();
  for (const mesh of [trays, bundles, drops]) {
    mesh.count = 0;
    // Pas d'ombre : celle d'un chemin au plafond tomberait loin de lui et ressemblerait à un câble au sol.
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  return { root, trays, bundles, drops };
}

/** Épaisseur d'un faisceau selon le nombre de câbles qu'il porte. */
export function bundleThickness(cables: number): number {
  return 0.045 + 0.11 * Math.sqrt(Math.min(cables, 16) / 16);
}
