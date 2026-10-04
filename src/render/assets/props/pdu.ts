import * as THREE from 'three';
import { once } from '../cache';
import { bake, box, scaleUv, type Part } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import type { AssetModel } from '../types';

const FRONT = 0.28;

/** Éclair en relief, dessiné dans un carré unité puis mis à l'échelle. */
function boltGeometry(): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0.55, 1],
    [0.12, 0.45],
    [0.45, 0.45],
    [0.3, 0],
    [0.88, 0.58],
    [0.55, 0.58],
    [0.78, 1],
  ];
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false })
    .translate(-0.5, -0.5, 0)
    .scale(0.13, 0.19, 1)
    .translate(0.24, 0.52, FRONT - 0.004);
}

/** Armoire, socle et toit, panneau de disjoncteurs, éclair, gaine qui descend dans le plancher. */
export const pduStaticGeometry = once(() => {
  const p = PALETTE;
  const parts: Part[] = [
    { geometry: box(0.66, 0.06, 0.51), color: p.pduDark },
    { geometry: box(0.7, 0.86, 0.55, 0, 0.06), color: p.pduBody },
    { geometry: box(0.72, 0.06, 0.57, 0, 0.92), color: p.pduDark },
    { geometry: box(0.46, 0.6, 0.02, -0.07, 0.2, FRONT), color: p.pduDark },
    { geometry: boltGeometry(), color: p.pduDark },
    { geometry: new THREE.CylinderGeometry(0.045, 0.045, 0.96, 10).translate(0.24, 0.48, -0.272), color: p.pduConduit },
    { geometry: box(0.1, 0.09, 0.08, 0.24, 0.86, -0.26), color: p.pduConduit },
  ];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const x = -0.235 + c * 0.11;
      const y = 0.3 + r * 0.25;
      parts.push(
        { geometry: box(0.075, 0.13, 0.03, x, y, FRONT + 0.02), color: p.pduBreaker },
        { geometry: box(0.035, 0.04, 0.02, x, y + 0.07, FRONT + 0.032), color: p.pduToggle },
      );
    }
  }
  return bake(parts);
});

/** Bande de danger autour du pied de l'armoire. */
const hazardGeometry = once(() => scaleUv(box(0.706, 0.07, 0.556, 0, 0.09), 6, 0.6));
const lampGeometry = once(() => box(0.06, 0.06, 0.03, 0.24, 0.72, FRONT + 0.01));

/** Armoire de distribution électrique, avec son voyant de mise sous tension. */
export function createPdu(): AssetModel {
  const root = new THREE.Group();
  const body = new THREE.Mesh(pduStaticGeometry(), MATERIALS.vertexColored());
  body.castShadow = body.receiveShadow = true;
  const band = new THREE.Mesh(hazardGeometry(), MATERIALS.hazard());
  const lamp = new THREE.Mesh(lampGeometry(), MATERIALS.pduLampOn());
  root.add(body, band, lamp);
  return {
    root,
    update({ powered }) {
      lamp.visible = powered;
    },
  };
}
