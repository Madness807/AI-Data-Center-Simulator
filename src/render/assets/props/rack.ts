import * as THREE from 'three';
import { once } from '../cache';
import { bake, box, merge, type Part } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';

/** Nombre maximal de racks dessinés (taille des tampons d'instances). */
export const RACK_CAPACITY = 1024;

/**
 * Les racks sont nombreux : ils sont dessinés par instanciation (un appel de dessin pour
 * tous). Le corps et les LEDs sont deux maillages instanciés qui partagent les mêmes matrices.
 */
export interface RackInstances {
  body: THREE.InstancedMesh;
  /** Couleur par instance = état du rack (calcul, inactif, délesté, panne). */
  led: THREE.InstancedMesh;
}

/** Hauteur de la base de chacun des 6 serveurs visibles en façade. */
const SERVER_Y = [0.2, 0.405, 0.61, 0.815, 1.02, 1.225];
const FRONT = 0.405;

/** Caisson, porte avant à 6 serveurs, porte arrière à ouïes, flancs et grille de toit. */
export const rackBodyGeometry = once(() => {
  const p = PALETTE;
  const parts: Part[] = [
    { geometry: box(0.74, 0.06, 0.74), color: p.rackFoot },
    { geometry: box(0.8, 1.5, 0.8, 0, 0.06), color: p.rackFrame },
    { geometry: box(0.82, 0.04, 0.82, 0, 1.56), color: p.rackPanel },
    { geometry: box(0.68, 1.34, 0.02, 0, 0.14, FRONT), color: p.rackDoor },
    { geometry: box(0.68, 1.34, 0.02, 0, 0.14, -FRONT), color: p.rackDoor },
    { geometry: box(0.02, 1.26, 0.6, 0.405, 0.18), color: p.rackPanel },
    { geometry: box(0.02, 1.26, 0.6, -0.405, 0.18), color: p.rackPanel },
    { geometry: box(0.5, 0.012, 0.36, 0, 1.6, -0.08), color: p.rackVent },
  ];
  SERVER_Y.forEach((y, i) => {
    parts.push(
      { geometry: box(0.6, 0.17, 0.02, 0, y, FRONT + 0.015), color: i % 2 ? p.rackServerAlt : p.rackServer },
      { geometry: box(0.03, 0.1, 0.02, -0.26, y + 0.035, FRONT + 0.03), color: p.rackHandle },
    );
  });
  for (let j = 0; j < 8; j++) parts.push({ geometry: box(0.56, 0.025, 0.015, 0, 0.3 + j * 0.14, -FRONT - 0.015), color: p.rackVent });
  return bake(parts);
});

/**
 * LEDs : un voyant par serveur, une bande verticale en façade, une rampe sur le toit et une
 * bande à l'arrière, pour lire l'état du rack sous les 4 angles de caméra.
 */
export const rackLedGeometry = once(() =>
  merge([
    ...SERVER_Y.map((y) => box(0.16, 0.05, 0.012, 0.17, y + 0.06, FRONT + 0.031)),
    box(0.025, 1.22, 0.012, 0.315, 0.2, FRONT + 0.016),
    box(0.66, 0.025, 0.12, 0, 1.6, 0.28),
    box(0.025, 1.1, 0.012, 0.3, 0.25, -FRONT - 0.016),
  ]),
);

export function createRackInstances(capacity = RACK_CAPACITY): RackInstances {
  const body = new THREE.InstancedMesh(rackBodyGeometry(), MATERIALS.vertexColored(), capacity);
  const led = new THREE.InstancedMesh(rackLedGeometry(), MATERIALS.rackLed(), capacity);
  for (const m of [body, led]) {
    m.count = 0;
    m.frustumCulled = false;
  }
  body.castShadow = body.receiveShadow = true;
  // Créé d'emblée pour que le shader soit compilé avec la couleur par instance.
  led.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  return { body, led };
}
