import * as THREE from 'three';
import { CRAC } from '../../../sim/balance';
import type { BuildingKind } from '../../../sim/entities';
import { once } from '../cache';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import { cracStaticGeometry } from '../props/crac';
import { pduStaticGeometry } from '../props/pdu';
import { rackBodyGeometry } from '../props/rack';
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

const demolishBox = once(() => new THREE.BoxGeometry(1, 2, 1).translate(0, 1, 0));

/** Fantôme de construction : la vraie silhouette du modèle, teintée et translucide. */
export function createBuildGhost(): BuildGhost {
  const material = MATERIALS.ghost();
  const shapes: Record<GhostKind, THREE.Mesh> = {
    rack: new THREE.Mesh(rackBodyGeometry(), material),
    crac: new THREE.Mesh(cracStaticGeometry(), material),
    pdu: new THREE.Mesh(pduStaticGeometry(), material),
    demolish: new THREE.Mesh(demolishBox(), material),
  };
  const ring = createRangeRing(CRAC.radius, 'strong');
  const root = new THREE.Group();
  root.add(...Object.values(shapes), ring);
  root.visible = false;

  return {
    root,
    set(kind, valid) {
      for (const [k, mesh] of Object.entries(shapes)) mesh.visible = k === kind;
      ring.visible = kind === 'crac';
      if (kind === 'demolish') material.color.set(valid ? PALETTE.ghostBad : PALETTE.ghostNeutral);
      else material.color.set(valid ? PALETTE.ghostOk : PALETTE.ghostBad);
    },
  };
}
