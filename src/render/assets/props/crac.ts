import * as THREE from 'three';
import { once } from '../cache';
import { bake, box, type Part } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import type { AssetModel } from '../types';

const FRONT = 0.452;

/** Lamelle de soufflage, inclinée vers le sol (la rotation avance son arête : on la garde dans la case). */
const louver = (y: number) => new THREE.BoxGeometry(0.66, 0.035, 0.05).rotateX(0.5).translate(0, y, FRONT + 0.014);

/** Parties fixes : socle, caisson, liseré bleu, grille à lamelles, boîtier de commande, ouïes, carter du ventilateur. */
export const cracStaticGeometry = once(() => {
  const p = PALETTE;
  const parts: Part[] = [
    { geometry: box(0.86, 0.08, 0.86), color: p.cracBase },
    { geometry: box(0.9, 1.22, 0.9, 0, 0.08), color: p.cracBody },
    { geometry: box(0.9, 0.08, 0.9, 0, 1.3), color: p.cracPanel },
    { geometry: box(0.912, 0.06, 0.912, 0, 1.08), color: p.cracAccent },
    { geometry: box(0.7, 0.72, 0.02, 0, 0.22, FRONT), color: p.cracGrille },
    { geometry: box(0.3, 0.1, 0.02, 0.17, 0.96, FRONT), color: p.cracGrille },
    { geometry: new THREE.CylinderGeometry(0.37, 0.37, 0.05, 20).translate(0, 1.405, 0), color: p.cracGrille },
    { geometry: box(0.7, 0.015, 0.025, 0, 1.47), color: p.cracGrille },
    { geometry: box(0.025, 0.015, 0.7, 0, 1.47), color: p.cracGrille },
  ];
  for (let i = 0; i < 7; i++) parts.push({ geometry: louver(0.29 + i * 0.095), color: p.cracLouver });
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) parts.push({ geometry: box(0.02, 0.03, 0.6, side * 0.455, 0.45 + k * 0.12), color: p.cracGrille });
  }
  return bake(parts);
});

/** Pales et moyeu, sous la grille du toit : seule pièce qui tourne. */
const fanGeometry = once(() =>
  bake([
    ...[0, 1, 2, 3].map((k) => ({
      geometry: new THREE.BoxGeometry(0.3, 0.012, 0.09).translate(0.17, 1.445, 0).rotateY((k * Math.PI) / 2),
      color: PALETTE.cracFan,
    })),
    { geometry: new THREE.CylinderGeometry(0.06, 0.06, 0.03, 10).translate(0, 1.445, 0), color: PALETTE.cracBase },
  ]),
);

const screenGeometry = once(() => box(0.2, 0.06, 0.012, 0.17, 0.98, FRONT + 0.012));

/** Climatiseur de salle : ventilateur qui tourne et écran allumé quand il est alimenté. */
export function createCrac(): AssetModel {
  const root = new THREE.Group();
  const body = new THREE.Mesh(cracStaticGeometry(), MATERIALS.vertexColored());
  body.castShadow = body.receiveShadow = true;
  const fan = new THREE.Mesh(fanGeometry(), MATERIALS.vertexColored());
  const screen = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(screenGeometry(), MATERIALS.cracScreenOff());
  root.add(body, fan, screen);

  return {
    root,
    update({ dt, speed, powered }) {
      // Tourne encore doucement en pause, pour qu'on voie qu'il est en marche.
      if (powered) fan.rotation.y += dt * 10 * Math.max(speed, 0.15);
      screen.material = powered ? MATERIALS.cracScreenOn() : MATERIALS.cracScreenOff();
    },
  };
}
