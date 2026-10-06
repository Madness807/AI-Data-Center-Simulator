import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PROP_MODELS } from '../src/render/assets';
import { cableLayout, cablePreview, trayGraph } from '../src/render/cable-paths';
import { CableView } from '../src/render/cable-view';
import { networkView, updateNetwork } from '../src/sim/network';
import { addBuilding, idx, type GameState } from '../src/sim/state';
import { updatePower } from '../src/sim/systems/power';
import { cableText, unlinkedLabel } from '../src/ui/network-text';
import { room } from './helpers';

/** Un switch en bout de rangée et trois racks : un collé, deux câblés par l'allée du dessous. */
function wired(): GameState {
  const s = room(9, { tier: 2, pdus: 4 });
  addBuilding(s, 'switch', 5, 10);
  for (const x of [6, 7, 8]) addBuilding(s, 'rack', x, 10);
  updatePower(s);
  updateNetwork(s);
  return s;
}

describe('chemins de câbles', () => {
  it('un tronçon par paire de cases, partagé par les câbles qui l’empruntent', () => {
    const s = wired();
    const g = trayGraph(s, networkView(s));
    const edge = (a: [number, number], b: [number, number]) => {
      const [p, q] = [idx(s, ...a), idx(s, ...b)].sort((m, n) => m - n);
      return g.segments.find((e) => e.a === p && e.b === q)?.count;
    };
    expect(g.segments).toHaveLength(7);
    expect(edge([5, 11], [5, 10])).toBe(2); // l'arrivée sous le switch porte les deux câbles de l'allée
    expect(edge([6, 10], [5, 10])).toBe(1); // le rack collé : un tronçon direct
    expect(edge([8, 10], [8, 11])).toBe(1);
    expect(g.drops.map((d) => [d.kind, d.count])).toEqual([
      ['switch', 3],
      ['rack', 1],
      ['rack', 1],
      ['rack', 1],
    ]);
    expect(g.cells.get(idx(s, 6, 11))).toBe(2);
    expect(trayGraph(s, networkView(s))).toEqual(g);
  });

  it('le câblage affiché reste le même objet tant que rien ne change', () => {
    const s = wired();
    const layout = cableLayout(s);
    expect(cableLayout(s)).toBe(layout);
    addBuilding(s, 'rack', 9, 10);
    expect(cableLayout(s)).not.toBe(layout);
  });

  it('trois maillages instanciés : chemins, faisceaux, descentes', () => {
    const s = wired();
    const view = new CableView(s.w, s.h);
    view.sync(s);
    const counts = (view.root.children[0].children as THREE.InstancedMesh[]).map((m) => m.count);
    // 7 tronçons ; descentes : 3 racks, et 2 arrivées au switch (dessous et côté).
    expect(counts).toEqual([7, 7, 5]);
  });

  it('le switch allume un voyant par port occupé, aucun sans courant', () => {
    const model = PROP_MODELS.switch();
    const [, lit, dark] = model.root.children as THREE.Mesh[];
    const boxes = (m: THREE.Mesh) => m.geometry.attributes.position.count / 36; // 36 sommets par pavé
    model.update({ time: 0, dt: 0, speed: 1, powered: true, progress: 1, ports: 3 });
    expect([lit.visible, boxes(lit), boxes(dark)]).toEqual([true, 6, 10]); // dessus et façade
    model.update({ time: 0, dt: 0, speed: 1, powered: false, progress: 1, ports: 3 });
    expect([lit.visible, boxes(dark)]).toEqual([false, 16]);
  });
});

describe('aperçus de construction', () => {
  it('un switch à poser : sa portée et les racks qu’il relierait', () => {
    const s = room(9, { tier: 2, pdus: 4 });
    for (const x of [6, 7, 8]) addBuilding(s, 'rack', x, 10);
    const p = cablePreview(s, 'switch', { x: 5, y: 10 })!;
    expect(p.cables.map((c) => c.rackCell.x).sort()).toEqual([6, 7, 8]);
    expect(p.reach).toContain(idx(s, 5, 11));
    expect(p.cut).toEqual([]);
    expect(cablePreview(s, 'switch', { x: 5, y: 10 })).toBe(p); // même objet tant que rien ne change
    expect(cablePreview(s, 'switch', { x: 6, y: 10 })).toBeNull(); // case prise
  });

  it('une construction qui fermerait le seul chemin d’un câble le signale ; un détour possible, non', () => {
    const s = room(9, { tier: 2, pdus: 4 });
    addBuilding(s, 'switch', 5, 10);
    const r = addBuilding(s, 'rack', 7, 10);
    for (const [x, y] of [[8, 10], [7, 11], [7, 9]]) addBuilding(s, 'crac', x, y);
    updatePower(s);
    updateNetwork(s);
    expect(cablePreview(s, 'crac', { x: 6, y: 10 })?.cut).toEqual([r.id]);
    const t = room(9, { tier: 2, pdus: 4 });
    addBuilding(t, 'switch', 5, 10);
    addBuilding(t, 'rack', 7, 10);
    updatePower(t);
    updateNetwork(t);
    expect(cablePreview(t, 'crac', { x: 6, y: 10 })?.cut).toEqual([]);
  });

  it('la vue 3D montre la portée et les câbles fantômes d’un switch à poser, ou les câbles de l’équipement inspecté', () => {
    const s = wired();
    const view = new CableView(s.w, s.h);
    view.sync(s);
    const [, ghostBundles, , reach] = view.root.children as THREE.InstancedMesh[];
    addBuilding(s, 'rack', 6, 12);
    view.syncOverlay(s, cablePreview(s, 'switch', { x: 7, y: 12 }), null);
    expect(reach.count).toBeGreaterThan(10);
    expect(ghostBundles.count).toBeGreaterThan(0);
    const sw = s.buildings.find((b) => b.kind === 'switch')!;
    view.syncOverlay(s, null, sw);
    expect(ghostBundles.count).toBe(7); // tous les câbles du switch
    view.syncOverlay(s, null, null);
    expect([ghostBundles.count, reach.count]).toEqual([0, 0]);
  });
});

describe('textes du réseau', () => {
  it('raisons, longueurs de câble', () => {
    expect(unlinkedLabel('tooFar', 10)).toBe('switch à plus de 10 cases');
    expect(unlinkedLabel('portsFull', 10)).toBe('switchs à portée pleins');
    expect([0, 1, 3].map(cableText)).toEqual(['câble direct', 'câble de 1 case', 'câble de 3 cases']);
  });
});
