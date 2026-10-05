import * as THREE from 'three';
import { NETWORK } from '../../../sim/balance';
import { once, onceBy } from '../cache';
import { bake, box, merge, type Part } from '../geometry';
import { MATERIALS } from '../materials';
import { PALETTE } from '../palette';
import type { AssetModel } from '../types';

const FRONT = 0.3;
const TOP = 1.02;
/** Un voyant par port. */
const PORTS = NETWORK.ports;

/**
 * Armoire réseau basse : socle, bandeau mauve (la couleur du réseau dans tout le jeu), baie
 * avant avec quatre switchs 1U, leurs ports et leurs jarretières, passage de câbles sur le toit.
 */
export const switchStaticGeometry = once(() => {
  const p = PALETTE;
  const parts: Part[] = [
    { geometry: box(0.68, 0.05, 0.56), color: p.switchDark },
    { geometry: box(0.72, 0.92, 0.6, 0, 0.05), color: p.switchBody },
    { geometry: box(0.74, 0.05, 0.62, 0, 0.97), color: p.switchDark },
    { geometry: box(0.73, 0.06, 0.61, 0, 0.86), color: p.switchAccent },
    // Baie avant et ses deux guide-câbles.
    { geometry: box(0.6, 0.62, 0.02, 0, 0.12, FRONT), color: p.switchBay },
    { geometry: box(0.05, 0.62, 0.03, -0.28, 0.12, FRONT + 0.01), color: p.switchDark },
    { geometry: box(0.05, 0.62, 0.03, 0.28, 0.12, FRONT + 0.01), color: p.switchDark },
    // Passage de câbles sur le toit : c'est là qu'arrivent les descentes du chemin de câbles.
    { geometry: box(0.4, 0.035, 0.26, 0, TOP, -0.1), color: p.switchDark },
    { geometry: box(0.32, 0.04, 0.18, 0, TOP, -0.1), color: p.fiber },
    // Ouïes d'aération à l'arrière.
    { geometry: box(0.5, 0.5, 0.01, 0, 0.25, -FRONT - 0.005), color: p.switchDark },
  ];
  // Quatre switchs 1U : huit ports chacun, une jarretière fibre (jaune) ou cuivre (bleue).
  for (let u = 0; u < 4; u++) {
    const y = 0.18 + u * 0.13;
    parts.push({ geometry: box(0.48, 0.1, 0.025, 0, y, FRONT + 0.01), color: p.switchUnit });
    for (let k = 0; k < 8; k++) parts.push({ geometry: box(0.035, 0.03, 0.01, -0.1925 + k * 0.055, y + 0.05, FRONT + 0.025), color: p.switchPort });
    parts.push({ geometry: box(0.46, 0.014, 0.014, 0, y + 0.015, FRONT + 0.03), color: u % 2 ? p.patchBlue : p.fiber });
  }
  return bake(parts);
});

/** Voyants des ports `from` à `to` (exclu) : sur le dessus, lisibles sous tous les angles, et en façade. */
function ledBoxes(from: number, to: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = from; k < to; k++) {
    const x = -0.245 + k * 0.07;
    out.push(box(0.04, 0.015, 0.04, x, TOP, 0.24), box(0.03, 0.025, 0.01, x, 0.77, FRONT + 0.006));
  }
  return out;
}

/** Les n premiers voyants allumés, les autres éteints : deux maillages, quel que soit n. */
const litLeds = onceBy((n: number) => merge(ledBoxes(0, n)));
const darkLeds = onceBy((n: number) => merge(ledBoxes(n, PORTS)));

let nextPhase = 0;

/** Switch : un voyant allumé par port occupé ; ils papillotent quand un rack relié calcule. */
export function createSwitch(): AssetModel {
  const root = new THREE.Group();
  const body = new THREE.Mesh(switchStaticGeometry(), MATERIALS.vertexColored());
  body.castShadow = body.receiveShadow = true;
  const lit = new THREE.Mesh(litLeds(PORTS), MATERIALS.switchLedOn());
  const dark = new THREE.Mesh(darkLeds(0), MATERIALS.switchLedOff());
  root.add(body, lit, dark);
  // Déphasage propre à chaque switch : ils ne papillotent pas tous ensemble.
  const phase = (nextPhase++ * 2.39) % 10;
  let shown = -1;
  return {
    root,
    update({ powered, ports = 0, traffic = false, time }) {
      const n = powered ? Math.max(0, Math.min(PORTS, ports)) : 0;
      if (n !== shown) {
        shown = n;
        lit.visible = n > 0;
        dark.visible = n < PORTS;
        if (n > 0) lit.geometry = litLeds(n);
        if (n < PORTS) dark.geometry = darkLeds(n);
      }
      const flicker = traffic && Math.sin(time * 31 + phase) * Math.sin(time * 17 + phase * 2) > 0.25;
      lit.material = flicker ? MATERIALS.switchLedDim() : MATERIALS.switchLedOn();
    },
  };
}
