import * as THREE from 'three';
import { once } from '../cache';
import { createSelectionRing } from '../fx/rings';
import { MATERIALS } from '../materials';
import type { TechnicianModel } from '../types';

const bodyGeometry = once(() => new THREE.CapsuleGeometry(0.16, 0.34, 4, 10));
const stripeGeometry = once(() => new THREE.CylinderGeometry(0.165, 0.165, 0.05, 14));
const headGeometry = once(() => new THREE.SphereGeometry(0.12, 12, 10));
const helmetGeometry = once(() => new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2));

/** Technicien : gilet orange et casque jaune, avec son cercle de sélection. */
export function createTechnician(): TechnicianModel {
  const root = new THREE.Group();
  const figure = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry(), MATERIALS.techVest());
  body.position.y = 0.42;
  const stripe = new THREE.Mesh(stripeGeometry(), MATERIALS.techStripe());
  stripe.position.y = 0.5;
  const head = new THREE.Mesh(headGeometry(), MATERIALS.techSkin());
  head.position.y = 0.82;
  const helmet = new THREE.Mesh(helmetGeometry(), MATERIALS.techHelmet());
  helmet.position.y = 0.85;
  for (const m of [body, head, helmet]) m.castShadow = true;
  figure.add(body, stripe, head, helmet);

  const ring = createSelectionRing();
  root.add(figure, ring);

  return {
    root,
    setSelected(selected) {
      ring.visible = selected;
    },
    animate(pose, time) {
      // Au travail : il s'agite ; en marche : petit rebond.
      figure.position.y =
        pose === 'work' ? Math.abs(Math.sin(time * 12)) * 0.06 : pose === 'walk' ? Math.abs(Math.sin(time * 9)) * 0.04 : 0;
    },
  };
}
