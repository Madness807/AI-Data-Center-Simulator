import * as THREE from 'three';
import type { BuildingKind } from '../../../sim/entities';
import { once, onceBy } from '../cache';
import { BUILDING_SIZE } from '../dimensions';
import { MATERIALS } from '../materials';
import type { AssetModel } from '../types';

const frameGeometry = onceBy((kind: BuildingKind) => {
  const [w, h, d] = BUILDING_SIZE[kind];
  return new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.08, h, d + 0.08)).translate(0, h / 2, 0);
});
const fillGeometry = onceBy((kind: BuildingKind) => {
  const [w, , d] = BUILDING_SIZE[kind];
  return new THREE.BoxGeometry(w, 1, d).translate(0, 0.5, 0);
});
const baseGeometry = once(() => new THREE.PlaneGeometry(0.96, 0.96));

/** Chantier : échafaudage et volume qui monte avec l'avancement. */
export function createConstructionSite(kind: BuildingKind): AssetModel {
  const height = BUILDING_SIZE[kind][1];
  const root = new THREE.Group();
  const frame = new THREE.LineSegments(frameGeometry(kind), MATERIALS.siteFrame());
  const fill = new THREE.Mesh(fillGeometry(kind), MATERIALS.siteFill(kind));
  fill.castShadow = true;
  const base = new THREE.Mesh(baseGeometry(), MATERIALS.siteBase());
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.012;
  root.add(frame, fill, base);

  const setProgress = (p: number) => {
    fill.scale.y = Math.max(0.02, p) * height;
  };
  setProgress(0);
  return { root, update: ({ progress }) => setProgress(progress) };
}
