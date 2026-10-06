import { describe, expect, it } from 'vitest';
import { BUILD_COST, CRAC, DT, GRID_H, GRID_W, NETWORK, RACK, TRAINING } from '../src/sim/balance';
import { canBuild, processCommands } from '../src/sim/commands';
import { isUnlocked } from '../src/sim/progression';
import { BRANCHES, RESEARCH } from '../src/sim/research';
import { deserialize, serialize } from '../src/save';
import { clusterSpeed, findCluster, freeBlocks } from '../src/sim/clusters';
import type { Job } from '../src/sim/entities';
import { activeLinks, networkView, planLinks, switchReach, updateNetwork } from '../src/sim/network';
import { step } from '../src/sim/sim';
import { updateJobs } from '../src/sim/systems/jobs';
import { predictCompletion } from '../src/sim/systems/alerts';
import { addBuilding, createEmptyState, createInitialState, idx, removeBuilding, type GameState } from '../src/sim/state';
import { pue } from '../src/sim/stats';
import { updateHeat } from '../src/sim/systems/heat';
import { serviceOrder, updatePower } from '../src/sim/systems/power';
import { room, testJob } from './helpers';

describe('switch réseau', () => {
  it('se débloque par la recherche de la branche Réseau, en carrière seulement', () => {
    const node = RESEARCH.find((n) => n.effect.unlocks?.includes('switch'))!;
    expect(node.branch).toBe('network');
    expect(BRANCHES.map((b) => b.id)).toContain('network');
    const s = room(3, { pdus: 1, money: 50_000 });
    expect(canBuild(s, 'switch', 5, 5)).toBe(`Recherche requise : ${node.name}`);
    s.research.done.push(node.id);
    expect(canBuild(s, 'switch', 5, 5)).toBeNull();
    const before = s.money;
    s.commands.push({ type: 'build', kind: 'switch', x: 5, y: 5 });
    processCommands(s);
    expect(before - s.money).toBe(BUILD_COST.switch);
    // Partie rapide : jamais, même avec la recherche (elle n'y existe pas).
    const quick = createInitialState(1);
    quick.research.done.push(node.id);
    expect(isUnlocked(quick, 'switch')).toBe(false);
  });

  it('servi après le froid et avant les racks : il ne s’éteint jamais avant eux', () => {
    const s = createEmptyState(1, GRID_W, GRID_H, 'career');
    addBuilding(s, 'pdu', 0, 0);
    const rack = addBuilding(s, 'rack', 5, 5);
    const sw = addBuilding(s, 'switch', 3, 5);
    addBuilding(s, 'crac', 9, 9);
    expect(serviceOrder(s).map((b) => b.kind)).toEqual(['crac', 'switch', 'rack']);
    updatePower(s);
    expect(sw.powered && rack.powered).toBe(true);
    expect(s.power.loadKW).toBe(CRAC.powerKW + NETWORK.powerKW + RACK.powerKW);
  });

  it('compte dans le PUE comme l’informatique, et chauffe sa case', () => {
    const s = createEmptyState(1, GRID_W, GRID_H, 'career');
    addBuilding(s, 'pdu', 0, 0);
    const sw = addBuilding(s, 'switch', 3, 5);
    updatePower(s);
    expect(pue(s)).toBeNull(); // pas de rack en service : pas de PUE
    addBuilding(s, 'rack', 5, 5);
    addBuilding(s, 'crac', 9, 9);
    updatePower(s);
    expect(pue(s)).toBeCloseTo((CRAC.powerKW + NETWORK.powerKW + RACK.powerKW) / (NETWORK.powerKW + RACK.powerKW));

    const cold = createEmptyState(1, GRID_W, GRID_H, 'career');
    updateHeat(s, DT);
    updateHeat(cold, DT);
    expect(s.temp[idx(s, sw.x, sw.y)]).toBeGreaterThan(cold.temp[idx(cold, sw.x, sw.y)]);
  });
});

/** Carrière avec 4 PDU (y = 0) au palier donné ; le réseau compte à partir du palier 2. */
const career = (tier = 2): GameState => room(8, { tier, pdus: 4 });
/** Un passage d'énergie puis de réseau, comme dans un tick. */
function wire(s: GameState): void {
  updatePower(s);
  updateNetwork(s);
}
const linkOf = (s: GameState, id: number) => s.buildings.find((b) => b.id === id)?.link;

describe('câblage', () => {
  it('un rack se câble par les cases libres : longueur 0 contre le switch, 3 dans la rangée', () => {
    const s = career();
    const sw = addBuilding(s, 'switch', 5, 10);
    const a = addBuilding(s, 'rack', 6, 10);
    const b = addBuilding(s, 'rack', 7, 10);
    wire(s);
    expect([a.link, b.link]).toEqual([sw.id, sw.id]);
    const view = networkView(s);
    const cable = (id: number) => view.cables.find((c) => c.rack === id)!;
    expect(cable(a.id)).toMatchObject({ length: 0, cells: [], up: true });
    expect(cable(b.id).length).toBe(3);
    expect(cable(b.id).cells).toEqual([{ x: 7, y: 11 }, { x: 6, y: 11 }, { x: 5, y: 11 }]);
    expect(view.ports.get(sw.id)).toBe(2);
  });

  it(`portée : ${NETWORK.reach} cases de câble passent, une de plus non`, () => {
    for (const [x, linked] of [[6 + NETWORK.reach, true], [7 + NETWORK.reach, false]] as const) {
      const s = career();
      addBuilding(s, 'switch', 5, 10);
      const r = addBuilding(s, 'rack', x, 10);
      wire(s);
      expect(r.link !== undefined, `rack en ${x}`).toBe(linked);
      if (!linked) expect(networkView(s).unlinked.get(r.id)).toBe('tooFar');
    }
  });

  it(`${NETWORK.ports} ports par switch : les câbles les plus courts d'abord`, () => {
    const s = career();
    const sw = addBuilding(s, 'switch', 5, 10);
    // Construits du plus loin au plus proche : l'ordre de construction ne compte pas.
    const racks = [14, 13, 12, 11, 10, 9, 8, 7, 6].map((x) => addBuilding(s, 'rack', x, 10));
    wire(s);
    const linked = racks.filter((r) => r.link === sw.id).map((r) => r.x);
    expect(linked.sort((p, q) => p - q)).toEqual([6, 7, 8, 9, 10, 11, 12, 13]);
    expect(networkView(s).unlinked.get(racks[0].id)).toBe('portsFull');
  });

  it('à longueur égale, le switch le plus ancien ; un switch plus proche construit ensuite ne vole rien', () => {
    const s = career();
    const older = addBuilding(s, 'switch', 5, 10);
    addBuilding(s, 'switch', 9, 10);
    const r = addBuilding(s, 'rack', 7, 10);
    wire(s);
    expect(r.link).toBe(older.id);
    const t = career();
    const far = addBuilding(t, 'switch', 5, 10);
    const rack = addBuilding(t, 'rack', 9, 10);
    wire(t);
    expect(rack.link).toBe(far.id);
    addBuilding(t, 'switch', 10, 10); // touche le rack
    wire(t);
    expect(rack.link).toBe(far.id);
  });

  it('un chantier ou un rack en panne garde son port ; un switch sans courant coupe ses liaisons', () => {
    const s = career();
    const sw = addBuilding(s, 'switch', 5, 10);
    const site = addBuilding(s, 'rack', 6, 10, true);
    const r = addBuilding(s, 'rack', 5, 11);
    wire(s);
    expect([site.link, r.link]).toEqual([sw.id, sw.id]);
    r.status = 'failed';
    wire(s);
    expect(r.link).toBe(sw.id);
    expect(activeLinks(s)?.get(r.id)).toBe(sw.id);
    sw.status = 'construction'; // comme un switch hors service
    wire(s);
    expect(r.link).toBe(sw.id);
    expect(activeLinks(s)?.has(r.id)).toBe(false);
  });

  it('construire sur le seul chemin coupe le câble (signalé au palier 2), puis le rack se recâble ailleurs', () => {
    for (const tier of [1, 2]) {
      const s = career(tier);
      const sw = addBuilding(s, 'switch', 5, 10);
      const r = addBuilding(s, 'rack', 7, 10);
      for (const [x, y] of [[8, 10], [7, 11], [7, 9]]) addBuilding(s, 'crac', x, y);
      wire(s);
      expect(r.link).toBe(sw.id);
      const other = addBuilding(s, 'switch', 7, 12);
      addBuilding(s, 'pdu', 6, 10); // bouche la seule case libre autour du rack
      s.events = [];
      wire(s);
      expect(r.link).toBeUndefined();
      expect(s.events.filter((e) => e.code === 'linkLost')).toHaveLength(tier >= NETWORK.minTier ? 1 : 0);
      // Enfermé : plus aucune case libre autour du rack, aucun switch ne le touche.
      expect(networkView(s).unlinked.get(r.id)).toBe('enclosed');
      removeBuilding(s, s.buildings.find((b) => b.kind === 'crac' && b.x === 7 && b.y === 11)!);
      wire(s);
      expect(r.link).toBe(other.id);
    }
  });

  it('un autre chemin dans la portée : le câble est détourné, pas coupé', () => {
    const s = career();
    const sw = addBuilding(s, 'switch', 5, 10);
    const r = addBuilding(s, 'rack', 7, 10);
    wire(s);
    expect(networkView(s).cables[0].length).toBe(1); // par la case (6,10)
    addBuilding(s, 'pdu', 6, 10);
    s.events = [];
    wire(s);
    expect(r.link).toBe(sw.id);
    expect(s.events.some((e) => e.code === 'linkLost')).toBe(false);
    expect(networkView(s).cables[0].length).toBe(3);
  });

  it('démolir un switch : le câble pend jusqu’au passage suivant, puis il est retiré', () => {
    const s = career();
    const sw = addBuilding(s, 'switch', 5, 10);
    const r = addBuilding(s, 'rack', 6, 10);
    wire(s);
    removeBuilding(s, sw);
    expect(r.link).toBe(sw.id);
    wire(s);
    expect(linkOf(s, r.id)).toBeUndefined();
    expect(networkView(s).unlinked.get(r.id)).toBe('noSwitch');
  });

  it('les fonctions d’aperçu ne modifient rien', () => {
    const s = career();
    addBuilding(s, 'switch', 5, 10);
    for (const x of [6, 7, 8]) addBuilding(s, 'rack', x, 10);
    wire(s);
    const before = JSON.stringify(s);
    planLinks(s, { block: { x: 6, y: 11 } });
    networkView(s, { addSwitch: { x: 9, y: 12 } });
    switchReach(s, { x: 12, y: 12 });
    switchReach(s, { x: 5, y: 10 });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('un switch supposé posé : ses câbles et sa portée, sans le construire', () => {
    const s = career();
    const r = addBuilding(s, 'rack', 9, 10);
    expect(planLinks(s).size).toBe(0);
    const plan = planLinks(s, { addSwitch: { x: 9, y: 12 } });
    expect(plan.get(r.id)).toBe(s.nextId);
    const reach = switchReach(s, { x: 9, y: 12 });
    expect(reach).toContain(idx(s, 9, 11));
    expect(reach).not.toContain(idx(s, 9, 12));
  });

  it('partie rapide : aucun câble ; carrière avant le palier 2 : câblée, mais sans effet', () => {
    const quick = createEmptyState(1);
    addBuilding(quick, 'switch', 5, 10);
    const q = addBuilding(quick, 'rack', 6, 10);
    wire(quick);
    expect(q.link).toBeUndefined();
    expect(networkView(quick).cables).toEqual([]);
    const early = career(1);
    const sw = addBuilding(early, 'switch', 5, 10);
    const r = addBuilding(early, 'rack', 6, 10);
    wire(early);
    expect(r.link).toBe(sw.id);
    expect(activeLinks(early)).toBeNull();
  });
});

/** Entraînement en cours, de `size` racks, assez long pour ne pas finir pendant le test. */
const training = (id: number, size: number): Job =>
  testJob({ id, kind: 'training', cluster: size, minGen: 1, rateCU: size * RACK.computeCU, work: 1e6, deadline: 1e6, deadlineInS: 1e6 });

/**
 * Une rangée de 6 racks entre deux switchs : (5,10) relie les racks 6 à 8, (12,10) les racks
 * 9 à 11. Les racks sont construits dans le désordre (8, 9, 10, 6, 7, 11) : un simple parcours
 * depuis le premier rack formerait un bloc à cheval.
 */
function twoSwitches(): GameState {
  const s = career();
  addBuilding(s, 'switch', 5, 10);
  addBuilding(s, 'switch', 12, 10);
  for (const x of [8, 9, 10, 6, 7, 11]) addBuilding(s, 'rack', x, 10);
  wire(s);
  return s;
}
const xs = (s: GameState, ids: readonly number[] | undefined) => (ids ?? []).map((id) => s.buildings.find((b) => b.id === id)!.x);

describe('entraînement relié', () => {
  it('au Labo d’IA, pas de switch, pas de bloc ; avant, les racks côte à côte suffisent', () => {
    const s = career();
    for (const x of [6, 7, 8]) addBuilding(s, 'rack', x, 10);
    wire(s);
    expect(findCluster(s, 3, 1, new Set())).toBeNull();
    expect(freeBlocks(s, 1)).toEqual({ contiguous: 3, linked: 0, oneSwitch: 0 });
    const early = career(1);
    for (const x of [6, 7, 8]) addBuilding(early, 'rack', x, 10);
    wire(early);
    expect(findCluster(early, 3, 1, new Set())).toHaveLength(3);
    addBuilding(s, 'switch', 5, 10);
    wire(s);
    expect(xs(s, findCluster(s, 3, 1, new Set()) ?? undefined).sort()).toEqual([6, 7, 8]);
  });

  it('un bloc sur un seul switch passe avant un bloc à cheval', () => {
    const s = twoSwitches();
    expect(freeBlocks(s, 1)).toEqual({ contiguous: 6, linked: 6, oneSwitch: 3 });
    expect(xs(s, findCluster(s, 3, 1, new Set()) ?? undefined)).toEqual([8, 7, 6]);
  });

  it(`à cheval sur deux switchs, le bloc avance à ${NETWORK.crossSwitch * 100} % mais reste réservé ; la Fabric lui rend sa vitesse`, () => {
    for (const fabric of [false, true]) {
      const s = twoSwitches();
      if (fabric) s.research.done.push('switches', 'fabric');
      const j = training(1, 6);
      s.jobs = [j];
      updateJobs(s, DT);
      expect(j.assigned).toHaveLength(6);
      expect(clusterSpeed(s, j.assigned!)).toBe(fabric ? 1 : NETWORK.crossSwitch);
      expect(j.allocated).toBeCloseTo(6 * RACK.computeCU * (fabric ? 1 : NETWORK.crossSwitch));
      expect(s.compute.used).toBe(6 * RACK.computeCU);
    }
  });

  it('une liaison perdue rompt le bloc : il recule, et le message cite le réseau', () => {
    const s = twoSwitches();
    const j = training(1, 3);
    s.jobs = [j];
    updateJobs(s, DT);
    expect(xs(s, j.assigned)).toEqual([8, 7, 6]);
    j.progress = 500_000;
    removeBuilding(s, s.buildings.find((b) => b.kind === 'switch' && b.x === 5)!);
    wire(s);
    s.events = [];
    updateJobs(s, DT);
    expect(j.progress).toBeLessThan(500_000 - j.work * TRAINING.rollback + 1e-6 + j.allocated * DT);
    expect(s.events.find((e) => e.code === 'trainingBroken')?.message).toMatch(/\(réseau\)/);
  });

  it('les prévisions de retard comptent tout le bloc réservé, même ralenti par le réseau', () => {
    const s = twoSwitches();
    const inference = testJob({ id: 2, rateCU: RACK.computeCU, work: 1000, deadline: 1e6 });
    s.jobs = [training(1, 6), inference];
    updateJobs(s, DT);
    // Les 6 racks sont pris par le bloc (à 70 %) : il ne reste rien pour l'inférence.
    expect(predictCompletion(s).get(inference.id)).toBe(Infinity);
  });

  it('une carrière câblée, avec un entraînement en cours, se sauvegarde et continue à l’identique', () => {
    const s = twoSwitches();
    s.jobs = [training(s.nextJobId++, 3)];
    for (let i = 0; i < 50; i++) step(s);
    expect(s.jobs[0].assigned).toHaveLength(3);
    const loaded = deserialize(serialize(s, 'test'));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const strip = (g: GameState) => JSON.parse(JSON.stringify({ ...g, commands: [], events: [] }));
    for (let i = 0; i < 600; i++) {
      step(s);
      step(loaded.state);
      s.events.length = loaded.state.events.length = 0;
    }
    expect(strip(loaded.state)).toEqual(strip(s));
  });
});
