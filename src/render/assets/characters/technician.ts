import * as THREE from 'three';
import { once } from '../cache';
import { createSelectionRing } from '../fx/rings';
import { bake, box } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import type { TechnicianModel } from '../types';

/** Hauteur des hanches et des épaules : pivots des jambes et des bras. */
const HIP_Y = 0.5;
const SHOULDER_Y = 0.86;

/** Jambe, depuis la hanche (y = 0) jusqu'au sol : pantalon et chaussure. */
const legGeometry = once(() =>
  bake([
    { geometry: box(0.11, 0.42, 0.13, 0, -0.42), color: PALETTE.techTrousers },
    { geometry: box(0.12, 0.08, 0.18, 0, -0.5, 0.02), color: PALETTE.techBoots },
  ]),
);

/** Bras, depuis l'épaule (y = 0) : manche de chemise et main. */
const armGeometry = once(() =>
  bake([
    { geometry: box(0.09, 0.3, 0.1, 0, -0.3), color: PALETTE.techShirt },
    { geometry: box(0.08, 0.08, 0.08, 0, -0.38), color: PALETTE.techSkin },
  ]),
);

/** Tronc : ceinture, gilet haute visibilité et ses deux bandes réfléchissantes. */
const torsoGeometry = once(() =>
  bake([
    { geometry: box(0.32, 0.06, 0.19, 0, 0.47), color: PALETTE.techBoots },
    { geometry: box(0.34, 0.36, 0.2, 0, 0.53), color: PALETTE.techVest },
    { geometry: box(0.345, 0.03, 0.205, 0, 0.62), color: PALETTE.techReflective },
    { geometry: box(0.345, 0.03, 0.205, 0, 0.74), color: PALETTE.techReflective },
    { geometry: box(0.1, 0.05, 0.1, 0, 0.89), color: PALETTE.techSkin },
  ]),
);

/** Tête facettée, yeux (pour lire la direction du regard) et casque à visière. */
const headGeometry = once(() =>
  bake([
    { geometry: new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.03, 0), color: PALETTE.techSkin },
    { geometry: box(0.03, 0.03, 0.012, -0.045, 1.02, 0.122), color: PALETTE.techBoots },
    { geometry: box(0.03, 0.03, 0.012, 0.045, 1.02, 0.122), color: PALETTE.techBoots },
    {
      geometry: new THREE.SphereGeometry(0.145, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.06, 0),
      color: PALETTE.techHelmet,
    },
    { geometry: new THREE.CylinderGeometry(0.17, 0.17, 0.015, 10).translate(0, 1.06, 0.025), color: PALETTE.techHelmet },
  ]),
);

function limb(geometry: THREE.BufferGeometry, x: number, y: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const mesh = new THREE.Mesh(geometry, MATERIALS.vertexColored());
  mesh.castShadow = true;
  pivot.add(mesh);
  return pivot;
}

/**
 * Technicien d'environ 1,2 case de haut, à l'échelle des racks. Jambes et bras pivotent
 * aux hanches et aux épaules : marche, travail sur un équipement, repos.
 */
export function createTechnician(): TechnicianModel {
  const root = new THREE.Group();
  const figure = new THREE.Group();
  const torso = new THREE.Mesh(torsoGeometry(), MATERIALS.vertexColored());
  const head = new THREE.Mesh(headGeometry(), MATERIALS.vertexColoredFlat());
  torso.castShadow = head.castShadow = true;
  const leftLeg = limb(legGeometry(), -0.075, HIP_Y);
  const rightLeg = limb(legGeometry(), 0.075, HIP_Y);
  const leftArm = limb(armGeometry(), -0.215, SHOULDER_Y);
  const rightArm = limb(armGeometry(), 0.215, SHOULDER_Y);
  figure.add(torso, head, leftLeg, rightLeg, leftArm, rightArm);

  const ring = createSelectionRing();
  root.add(figure, ring);

  return {
    root,
    setSelected(selected) {
      ring.visible = selected;
    },
    animate(pose, time) {
      let legs = 0;
      let left = 0;
      let right = 0;
      let bob = 0;
      if (pose === 'walk') {
        const s = Math.sin(time * 10);
        legs = s * 0.6;
        left = s * 0.5; // les bras balancent à l'opposé des jambes
        right = -s * 0.5;
        bob = Math.abs(Math.cos(time * 10)) * 0.03;
      } else if (pose === 'work') {
        // Bras tendus vers l'équipement, qui travaillent en alternance.
        const s = Math.sin(time * 14);
        left = -1.25 + s * 0.25;
        right = -1.25 - s * 0.25;
        bob = Math.abs(s) * 0.015;
      } else {
        left = Math.sin(time * 2) * 0.04;
        right = -left;
      }
      leftLeg.rotation.x = -legs;
      rightLeg.rotation.x = legs;
      leftArm.rotation.x = left;
      rightArm.rotation.x = right;
      figure.position.y = bob;
    },
  };
}
