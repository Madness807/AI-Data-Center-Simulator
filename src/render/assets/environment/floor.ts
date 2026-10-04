import * as THREE from 'three';
import { MATERIALS } from '../materials';

const SLAB_DEPTH = 0.3;
const SLAB_MARGIN = 0.35;

/**
 * Faux plancher : une seule texture pour toute la salle (dalles, perforations, entrée
 * hachurée), posée sur une dalle sombre qui donne de l'épaisseur au bord de la salle.
 */
export function createFloor(w: number, h: number): THREE.Group {
  const g = new THREE.Group();

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), MATERIALS.floor(`${w}x${h}`));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, h / 2);
  floor.receiveShadow = true;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(w + 2 * SLAB_MARGIN, SLAB_DEPTH, h + 2 * SLAB_MARGIN),
    MATERIALS.floorSlab(),
  );
  // Juste sous le plancher, pour éviter que les deux surfaces se chevauchent à l'écran.
  slab.position.set(w / 2, -SLAB_DEPTH / 2 - 0.002, h / 2);
  slab.receiveShadow = true;

  g.add(slab, floor);
  return g;
}
