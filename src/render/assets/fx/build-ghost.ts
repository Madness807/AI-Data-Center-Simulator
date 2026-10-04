import * as THREE from 'three';
import { CRAC } from '../../../sim/balance';
import type { BuildingKind } from '../../../sim/entities';
import { once } from '../cache';
import { BUILDING_SIZE } from '../dimensions';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import { createRangeRing } from './rings';

export type GhostKind = BuildingKind | 'demolish';

export interface BuildGhost {
  readonly root: THREE.Group;
  /**
   * Affiche l'aperçu de `kind`. Construction : vert si `valid`, rouge sinon.
   * Démolition : rouge si un équipement est visé (`valid`), gris sinon.
   */
  set(kind: GhostKind, valid: boolean): void;
}

const unitBox = once(() => new THREE.BoxGeometry(1, 1, 1));

export function createBuildGhost(): BuildGhost {
  const material = MATERIALS.ghost();
  const box = new THREE.Mesh(unitBox(), material);
  const ring = createRangeRing(CRAC.radius, 'strong');
  const root = new THREE.Group();
  root.add(box, ring);
  root.visible = false;

  return {
    root,
    set(kind, valid) {
      if (kind === 'demolish') {
        box.scale.set(1, 2, 1);
        box.position.y = 1;
        material.color.set(valid ? PALETTE.ghostBad : PALETTE.ghostNeutral);
        ring.visible = false;
        return;
      }
      const [sx, sy, sz] = BUILDING_SIZE[kind];
      box.scale.set(sx, sy, sz);
      box.position.y = sy / 2;
      material.color.set(valid ? PALETTE.ghostOk : PALETTE.ghostBad);
      ring.visible = kind === 'crac';
    },
  };
}
