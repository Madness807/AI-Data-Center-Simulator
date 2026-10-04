import * as THREE from 'three';
import { once } from '../cache';
import { bake, box, type Part } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import type { AssetModel } from '../types';

const FRONT = 0.31;

/** Châssis, capot insonorisé, calandre de radiateur, échappement et pupitre de commande. */
export const generatorStaticGeometry = once(() => {
  const p = PALETTE;
  const parts: Part[] = [
    { geometry: box(0.9, 0.08, 0.62), color: p.genDark },
    { geometry: box(0.86, 0.62, 0.58, 0, 0.08), color: p.genBody },
    { geometry: box(0.88, 0.05, 0.6, 0, 0.7), color: p.genDark },
    // Calandre du radiateur, côté droit.
    { geometry: box(0.02, 0.46, 0.46, 0.44, 0.16), color: p.genGrille },
    // Pupitre de commande en façade.
    { geometry: box(0.22, 0.2, 0.03, -0.24, 0.38, FRONT), color: p.genPanel },
    // Échappement : pot et tuyau vertical.
    { geometry: new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10).translate(-0.28, 0.83, -0.14), color: p.genExhaust },
    { geometry: new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8).translate(-0.28, 0.98, -0.14), color: p.genExhaust },
  ];
  // Lames de la calandre.
  for (let i = 0; i < 5; i++) parts.push({ geometry: box(0.03, 0.03, 0.42, 0.455, 0.2 + i * 0.085), color: p.genDark });
  // Grilles d'aération en façade.
  for (let i = 0; i < 4; i++) parts.push({ geometry: box(0.36, 0.025, 0.02, 0.14, 0.2 + i * 0.09, FRONT), color: p.genGrille });
  return bake(parts);
});

const lampGeometry = once(() => box(0.06, 0.06, 0.03, -0.24, 0.5, FRONT + 0.015));

/** Groupe électrogène : voyant orange au démarrage, vert en marche ; il vibre quand il tourne. */
export function createGenerator(): AssetModel {
  const root = new THREE.Group();
  const shell = new THREE.Group();
  const body = new THREE.Mesh(generatorStaticGeometry(), MATERIALS.vertexColored());
  body.castShadow = body.receiveShadow = true;
  const lamp = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(lampGeometry(), MATERIALS.genLampOff());
  shell.add(body, lamp);
  root.add(shell);
  return {
    root,
    update({ starting = false, running = false, time, speed }) {
      lamp.material = running ? MATERIALS.genLampRun() : starting && Math.floor(time * 4) % 2 === 0 ? MATERIALS.genLampStart() : MATERIALS.genLampOff();
      const shake = running && speed > 0 ? 0.006 : 0;
      shell.position.set(Math.sin(time * 53) * shake, Math.abs(Math.sin(time * 61)) * shake, 0);
    },
  };
}
