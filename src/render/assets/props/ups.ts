import * as THREE from 'three';
import { once } from '../cache';
import { bake, box, type Part } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import type { AssetModel } from '../types';

const FRONT = 0.3;
const SEGMENTS = 5;

/** Armoire, socle, quatre modules de batteries en façade, gaine vers le plancher. */
export const upsStaticGeometry = once(() => {
  const p = PALETTE;
  const parts: Part[] = [
    { geometry: box(0.66, 0.06, 0.56), color: p.upsDark },
    { geometry: box(0.7, 1.08, 0.6, 0, 0.06), color: p.upsBody },
    { geometry: box(0.72, 0.06, 0.62, 0, 1.14), color: p.upsDark },
    { geometry: new THREE.CylinderGeometry(0.04, 0.04, 1.2, 10).translate(-0.27, 0.6, -0.29), color: p.upsStrip },
  ];
  // Quatre tiroirs de batteries, chacun avec sa poignée.
  for (let i = 0; i < 4; i++) {
    const y = 0.14 + i * 0.22;
    parts.push(
      { geometry: box(0.46, 0.18, 0.02, -0.07, y, FRONT + 0.005), color: p.upsModule },
      { geometry: box(0.3, 0.025, 0.03, -0.07, y + 0.13, FRONT + 0.02), color: p.upsStrip },
    );
  }
  // Colonne de la jauge, à droite.
  parts.push({ geometry: box(0.1, 0.9, 0.02, 0.24, 0.14, FRONT + 0.005), color: p.upsDark });
  return bake(parts);
});

const segmentGeometry = once(() => box(0.06, 0.12, 0.02, 0, 0, 0));

/** Onduleur : sa jauge (5 segments) montre la charge, verte en recharge, ambre quand il alimente la salle. */
export function createUps(): AssetModel {
  const root = new THREE.Group();
  const body = new THREE.Mesh(upsStaticGeometry(), MATERIALS.vertexColored());
  body.castShadow = body.receiveShadow = true;
  root.add(body);
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const seg = new THREE.Mesh(segmentGeometry(), MATERIALS.upsLedOff());
    seg.position.set(0.24, 0.18 + i * 0.17, FRONT + 0.02);
    segments.push(seg);
    root.add(seg);
  }
  return {
    root,
    update({ charge = 0, discharging = false, time }) {
      const lit = Math.ceil(charge * SEGMENTS - 1e-6);
      // En décharge, le dernier segment allumé clignote.
      const blink = discharging && Math.floor(time * 3) % 2 === 0;
      segments.forEach((seg, i) => {
        const on = i < lit && !(blink && i === lit - 1);
        seg.material = on ? (discharging ? MATERIALS.upsLedDischarge() : MATERIALS.upsLedCharge()) : MATERIALS.upsLedOff();
      });
    },
  };
}
