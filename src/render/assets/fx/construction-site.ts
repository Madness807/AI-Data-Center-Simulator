import * as THREE from 'three';
import type { BuildingKind } from '../../../sim/entities';
import { once, onceBy } from '../cache';
import { BUILDING_SIZE } from '../dimensions';
import { bake, box, scaleUv, type Part } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import type { AssetModel } from '../types';

const POST = 0.04;
const MARGIN = 0.025;

/** Échafaudage autour de l'encombrement du bâtiment : 4 poteaux, 2 niveaux de traverses, 2 contreventements. */
const scaffoldGeometry = onceBy((kind: BuildingKind) => {
  const [w, h, d] = BUILDING_SIZE[kind];
  const hx = w / 2 + MARGIN;
  const hz = d / 2 + MARGIN;
  const top = h + 0.04;
  const parts: Part[] = [];
  const add = (geometry: THREE.BufferGeometry) => parts.push({ geometry, color: PALETTE.scaffold });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(POST, top, POST, sx * hx, 0, sz * hz));
  for (const y of [h * 0.45, top - 0.03]) {
    for (const sz of [-1, 1]) add(box(2 * hx, 0.03, 0.03, 0, y, sz * hz));
    for (const sx of [-1, 1]) add(box(0.03, 0.03, 2 * hz, sx * hx, y, 0));
  }
  // Contreventements en diagonale sur la façade et l'arrière.
  const diag = Math.hypot(2 * hx, h * 0.45);
  const angle = Math.atan2(h * 0.45, 2 * hx);
  for (const sz of [-1, 1]) {
    // Remonté de l'épaisseur de la barre : inclinée, son arête basse passerait sous le sol.
    add(new THREE.BoxGeometry(diag, 0.025, 0.025).rotateZ(angle).translate(0, h * 0.225 + 0.015, sz * hz));
  }
  return bake(parts);
});

/** Plaque de chantier rayée au sol. */
const baseGeometry = once(() => scaleUv(box(0.96, 0.02, 0.96), 3, 3));
const fillGeometry = onceBy((kind: BuildingKind) => {
  const [w, , d] = BUILDING_SIZE[kind];
  return box(w - 0.02, 1, d - 0.02);
});
const scanGeometry = onceBy((kind: BuildingKind) => {
  const [w, , d] = BUILDING_SIZE[kind];
  return box(w + 0.02, 0.015, d + 0.02);
});

/**
 * Chantier : échafaudage jaune sur une plaque rayée, et le « plan holographique » du bâtiment
 * qui monte avec l'avancement, surmonté d'une ligne de balayage lumineuse.
 */
export function createConstructionSite(kind: BuildingKind): AssetModel {
  const height = BUILDING_SIZE[kind][1];
  const root = new THREE.Group();
  const scaffold = new THREE.Mesh(scaffoldGeometry(kind), MATERIALS.vertexColored());
  scaffold.castShadow = true;
  const base = new THREE.Mesh(baseGeometry(), MATERIALS.hazard());
  base.receiveShadow = true;
  const fill = new THREE.Mesh(fillGeometry(kind), MATERIALS.blueprint());
  const scan = new THREE.Mesh(scanGeometry(kind), MATERIALS.blueprintScan());
  root.add(base, scaffold, fill, scan);

  const setProgress = (p: number) => {
    const level = Math.max(0.02, Math.min(1, p)) * height;
    fill.scale.y = level;
    scan.position.y = level;
  };
  setProgress(0);
  return { root, update: ({ progress }) => setProgress(progress) };
}
