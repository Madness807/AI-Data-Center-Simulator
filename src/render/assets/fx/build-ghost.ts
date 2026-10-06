import * as THREE from 'three';
import { CDU, CRAC } from '../../../sim/balance';
import type { BuildingKind, Facing } from '../../../sim/entities';
import { once } from '../cache';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import { cduStaticGeometry } from '../props/cdu';
import { cracStaticGeometry } from '../props/crac';
import { generatorStaticGeometry } from '../props/generator';
import { pduStaticGeometry } from '../props/pdu';
import { switchStaticGeometry } from '../props/switch';
import { upsStaticGeometry } from '../props/ups';
import { rackBodyGeometry } from '../props/rack';
import { createRangeRing } from './rings';

export type GhostKind = BuildingKind | 'demolish';

/** Rotation (autour de Y) qui tourne une façade +Z vers l'orientation de grille donnée. */
export const FACING_ANGLE: Record<Facing, number> = { 0: 0, 1: Math.PI / 2, 2: Math.PI, 3: -Math.PI / 2 };

export interface BuildGhost {
  readonly root: THREE.Group;
  /**
   * Affiche l'aperçu de `kind`. Construction : vert si `valid`, rouge sinon.
   * Démolition : rouge si un équipement est visé (`valid`), gris sinon. Pour un rack en
   * carrière, `facing` oriente le fantôme et montre l'avant (air froid) et l'arrière (air chaud).
   * `warn` : possible, mais la construction couperait des câbles réseau (ambre).
   */
  set(kind: GhostKind, valid: boolean, facing?: Facing, warn?: boolean): void;
}

/** Repère d'allée au sol, juste au-delà du bord de la case (devant ou derrière). */
const aisleMarkGeometry = once(() => new THREE.PlaneGeometry(0.7, 0.22).rotateX(-Math.PI / 2));

const demolishBox = once(() => new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0));

/** Fantôme de construction : la vraie silhouette du modèle, teintée et translucide. */
export function createBuildGhost(): BuildGhost {
  const material = MATERIALS.ghost();
  const shapes: Record<GhostKind, THREE.Mesh> = {
    rack: new THREE.Mesh(rackBodyGeometry(), material),
    crac: new THREE.Mesh(cracStaticGeometry(), material),
    pdu: new THREE.Mesh(pduStaticGeometry(), material),
    ups: new THREE.Mesh(upsStaticGeometry(), material),
    generator: new THREE.Mesh(generatorStaticGeometry(), material),
    cdu: new THREE.Mesh(cduStaticGeometry(), material),
    switch: new THREE.Mesh(switchStaticGeometry(), material),
    demolish: new THREE.Mesh(demolishBox(), material),
  };
  const ring = createRangeRing(CRAC.radius, 'strong');
  const cduRing = createRangeRing(CDU.radius, 'strong');
  const body = new THREE.Group();
  body.add(...Object.values(shapes));
  const front = new THREE.Mesh(aisleMarkGeometry(), MATERIALS.aisleCold());
  front.position.set(0, 0.035, 0.62);
  const back = new THREE.Mesh(aisleMarkGeometry(), MATERIALS.aisleHot());
  back.position.set(0, 0.035, -0.62);
  body.add(front, back);
  const root = new THREE.Group();
  root.add(body, ring, cduRing);
  root.visible = false;

  return {
    root,
    set(kind, valid, facing, warn = false) {
      for (const [k, mesh] of Object.entries(shapes)) mesh.visible = k === kind;
      ring.visible = kind === 'crac';
      cduRing.visible = kind === 'cdu';
      // Façade vers +Z ; chaque quart de tour suit l'orientation de la grille (+y = +Z, +x = +X).
      body.rotation.y = kind === 'rack' && facing !== undefined ? FACING_ANGLE[facing] : 0;
      front.visible = back.visible = kind === 'rack' && facing !== undefined;
      if (kind === 'demolish') material.color.set(valid ? PALETTE.ghostBad : PALETTE.ghostNeutral);
      else material.color.set(valid ? (warn ? PALETTE.ghostWarn : PALETTE.ghostOk) : PALETTE.ghostBad);
    },
  };
}
