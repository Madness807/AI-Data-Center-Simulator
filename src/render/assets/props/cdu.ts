import * as THREE from 'three';
import { once } from '../cache';
import { bake, box, type Part } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import type { AssetModel } from '../types';

const FRONT = 0.3;

/** Armoire, socle, hublot de la pompe, collecteurs froid (bleu) et chaud (orange) qui partent vers le haut. */
export const cduStaticGeometry = once(() => {
  const p = PALETTE;
  const pipe = (r: number, h: number, x: number, y: number, z: number) => new THREE.CylinderGeometry(r, r, h, 10).translate(x, y, z);
  const parts: Part[] = [
    { geometry: box(0.66, 0.06, 0.56), color: p.cduDark },
    { geometry: box(0.7, 1.0, 0.6, 0, 0.06), color: p.cduBody },
    { geometry: box(0.72, 0.06, 0.62, 0, 1.06), color: p.cduDark },
    // Pupitre et hublot de la pompe en façade.
    { geometry: box(0.5, 0.36, 0.02, 0, 0.5, FRONT + 0.005), color: p.cduPanel },
    { geometry: box(0.22, 0.12, 0.02, 0, 0.18, FRONT + 0.005), color: p.cduPanel },
    // Collecteurs : départ froid, retour chaud, coudes vers le plafond.
    { geometry: pipe(0.045, 0.32, -0.16, 1.28, -0.12), color: p.cduPipeCold },
    { geometry: pipe(0.045, 0.32, 0.16, 1.28, -0.12), color: p.cduPipeHot },
    { geometry: box(0.12, 0.05, 0.12, -0.16, 1.12, -0.12), color: p.cduDark },
    { geometry: box(0.12, 0.05, 0.12, 0.16, 1.12, -0.12), color: p.cduDark },
  ];
  return bake(parts);
});

/** Turbine de la pompe : quatre pales, tourne quand le CDU est alimenté. */
const impellerGeometry = once(() => {
  const parts: Part[] = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.BoxGeometry(0.05, 0.26, 0.012);
    g.rotateZ((i * Math.PI) / 4);
    parts.push({ geometry: g, color: PALETTE.cduImpeller });
  }
  return bake(parts);
});

const screenGeometry = once(() => box(0.18, 0.07, 0.02, 0, 0.21, FRONT + 0.012));

export function createCdu(): AssetModel {
  const root = new THREE.Group();
  const body = new THREE.Mesh(cduStaticGeometry(), MATERIALS.vertexColored());
  body.castShadow = body.receiveShadow = true;
  const impeller = new THREE.Mesh(impellerGeometry(), MATERIALS.vertexColored());
  impeller.position.set(0, 0.68, FRONT + 0.02);
  const screen = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(screenGeometry(), MATERIALS.cracScreenOff());
  root.add(body, impeller, screen);
  let angle = 0;
  return {
    root,
    update({ powered, dt, speed }) {
      if (powered) angle += dt * 6 * Math.max(speed, 0.4);
      impeller.rotation.z = angle;
      screen.material = powered ? MATERIALS.cracScreenOn() : MATERIALS.cracScreenOff();
    },
  };
}
