import * as THREE from 'three';
import { once } from '../cache';
import { merge } from '../geometry';
import { MATERIALS } from '../materials';

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

export const rackBodyGeometry = once(() => new THREE.BoxGeometry(0.8, 1.6, 0.8).translate(0, 0.8, 0));

/** LEDs en façade et en rampe sur le dessus, visibles sous les 4 angles de caméra. */
export const rackLedGeometry = once(() =>
  merge([
    new THREE.BoxGeometry(0.6, 1.2, 0.02).translate(0, 0.85, 0.41),
    new THREE.BoxGeometry(0.5, 0.03, 0.12).translate(0, 1.615, 0),
  ]),
);

export function createRackInstances(capacity = RACK_CAPACITY): RackInstances {
  const body = new THREE.InstancedMesh(rackBodyGeometry(), MATERIALS.rackBody(), capacity);
  const led = new THREE.InstancedMesh(rackLedGeometry(), MATERIALS.rackLed(), capacity);
  for (const m of [body, led]) {
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
  }
  body.receiveShadow = true;
  // Créé d'emblée pour que le shader soit compilé avec la couleur par instance.
  led.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  return { body, led };
}
