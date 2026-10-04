import * as THREE from 'three';
import { once } from '../cache';
import { MATERIALS } from '../materials';
import type { AssetModel } from '../types';

const bodyGeometry = once(() => new THREE.BoxGeometry(0.7, 1.0, 0.55).translate(0, 0.5, 0));
const stripeGeometry = once(() => new THREE.BoxGeometry(0.72, 0.12, 0.57).translate(0, 0.75, 0));
const boltGeometry = once(() => new THREE.BoxGeometry(0.12, 0.3, 0.02).translate(0, 0.4, 0.28));

/** Armoire de distribution électrique. */
export function createPdu(): AssetModel {
  const root = new THREE.Group();
  const body = new THREE.Mesh(bodyGeometry(), MATERIALS.pduBody());
  body.castShadow = body.receiveShadow = true;
  const stripe = new THREE.Mesh(stripeGeometry(), MATERIALS.pduStripe());
  const bolt = new THREE.Mesh(boltGeometry(), MATERIALS.pduBolt());
  bolt.rotation.z = 0.4;
  root.add(body, stripe, bolt);
  return { root, update() {} };
}
