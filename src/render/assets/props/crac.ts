import * as THREE from 'three';
import { once } from '../cache';
import { MATERIALS } from '../materials';
import type { AssetModel } from '../types';

const bodyGeometry = once(() => new THREE.BoxGeometry(0.9, 1.4, 0.9).translate(0, 0.7, 0));
const grilleGeometry = once(() => new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24));
const bladeGeometry = once(() => new THREE.BoxGeometry(0.62, 0.02, 0.1));

/** Climatiseur de salle : son ventilateur tourne quand il est alimenté. */
export function createCrac(): AssetModel {
  const root = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry(), MATERIALS.cracBody());
  body.castShadow = body.receiveShadow = true;

  const grille = new THREE.Mesh(grilleGeometry(), MATERIALS.cracGrille());
  grille.position.y = 1.42;

  const fan = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeometry(), MATERIALS.cracBlade());
    blade.rotation.y = (i * Math.PI) / 3;
    fan.add(blade);
  }
  fan.position.y = 1.46;
  root.add(body, grille, fan);

  return {
    root,
    update({ dt, speed, powered }) {
      // Tourne encore doucement en pause, pour qu'on voie qu'il est en marche.
      if (powered) fan.rotation.y += dt * 10 * Math.max(speed, 0.15);
    },
  };
}
