import { describe, expect, it } from 'vitest';
import { BUILD_TIME, GPU, rackSpec, SLA, TRAINING } from '../src/sim/balance';
import { clusterIntact, findCluster, largestFreeCluster } from '../src/sim/clusters';
import { canBuild, processCommands, upgradeCost } from '../src/sim/commands';
import type { Building, Job } from '../src/sim/entities';
import { addBuilding, createEmptyState, createInitialState, type GameState } from '../src/sim/state';
import { generateOffer, updateJobs } from '../src/sim/systems/jobs';
import { updatePower } from '../src/sim/systems/power';

function career(): GameState {
  const s = createEmptyState(5, 24, 16, 'career');
  s.nextOfferAt = Number.MAX_SAFE_INTEGER;
  s.money = 200000;
  for (let x = 0; x < 10; x++) addBuilding(s, 'pdu', x, 0);
  return s;
}

function rack(s: GameState, x: number, y: number, gen: 1 | 2 | 3 = 1): Building {
  const b = addBuilding(s, 'rack', x, y);
  if (gen > 1) b.gen = gen;
  return b;
}

function training(id: number, cluster: number, work = 1e6): Job {
  return { id, name: `T${id}`, status: 'active', rateCU: cluster * 10, durationS: 100, work, progress: 0, deadlineInS: 1000, payment: 5000, penalty: 2500, offeredAt: 0, expiresAt: 0, deadline: 1000, allocated: 0, kind: 'training', cluster, minGen: 1 };
}

describe('générations de GPU', () => {
  it('chaque génération : plus de calcul par kW, plus de chaleur, plus cher', () => {
    expect(rackSpec({})).toBe(GPU[1]);
    for (const g of [2, 3] as const) {
      expect(GPU[g].computeCU / GPU[g].powerKW).toBeGreaterThan(GPU[(g - 1) as 1 | 2].computeCU / GPU[(g - 1) as 1 | 2].powerKW);
      expect(GPU[g].heatKW).toBeGreaterThan(GPU[(g - 1) as 1 | 2].heatKW);
    }
    const s = career();
    const a = rack(s, 5, 5, 2);
    updatePower(s);
    updateJobs(s, 0.1);
    expect(s.compute.total).toBe(GPU[2].computeCU);
    expect(s.power.loadKW).toBe(GPU[2].powerKW);
    expect(a.powered).toBe(true);
  });

  it('un rack G2 se débloque par la recherche ; il coûte son prix', () => {
    const s = career();
    expect(canBuild(s, 'rack', 5, 5, 2)).toMatch(/génération 2/);
    s.research.done.push('gpu-g2');
    expect(canBuild(s, 'rack', 5, 5, 2)).toBeNull();
    const before = s.money;
    s.commands.push({ type: 'build', kind: 'rack', x: 5, y: 5, gen: 2 });
    processCommands(s);
    expect(before - s.money).toBe(GPU[2].cost);
    expect(s.buildings.at(-1)?.gen).toBe(2);
    // Partie rapide : la génération demandée est ignorée.
    const q = createInitialState(1);
    q.commands.push({ type: 'build', kind: 'rack', x: 10, y: 10, gen: 3 });
    processCommands(q);
    expect(q.buildings.at(-1)?.gen).toBeUndefined();
  });

  it('modernisation : le rack repasse en chantier, à la génération suivante, pour la différence majorée', () => {
    const s = career();
    const b = rack(s, 5, 5);
    s.commands.push({ type: 'upgrade', id: b.id });
    processCommands(s);
    expect(s.events.at(-1)?.message).toMatch(/Modernisation/);
    s.research.done.push('gpu-g2', 'retrofit');
    const before = s.money;
    s.commands.push({ type: 'upgrade', id: b.id });
    processCommands(s);
    expect(b.gen).toBe(2);
    expect(b.status).toBe('construction');
    expect(b.workLeft).toBe(BUILD_TIME.rack);
    expect(before - s.money).toBe(upgradeCost({ gen: 1 }));
    expect(upgradeCost({ gen: 1 })).toBe(Math.round((GPU[2].cost - GPU[1].cost) * 1.2));
  });
});

describe('contrats d’entraînement', () => {
  it('un bloc exige des racks contigus : un CRAC au milieu de la rangée le coupe', () => {
    const s = career();
    for (const x of [5, 6, 7]) rack(s, x, 5);
    addBuilding(s, 'crac', 8, 5);
    for (const x of [9, 10]) rack(s, x, 5);
    updatePower(s);
    expect(largestFreeCluster(s, 1)).toBe(3);
    expect(findCluster(s, 4, 1, new Set())).toBeNull();
    expect(findCluster(s, 3, 1, new Set())).toHaveLength(3);
    // L'interconnexion optique enjambe une case : les deux tronçons ne font plus qu'un.
    s.research.done.push('optical');
    expect(largestFreeCluster(s, 1)).toBe(5);
  });

  it('deux entraînements ne partagent jamais un rack ; l’inférence garde le reste', () => {
    const s = career();
    for (let x = 4; x < 12; x++) rack(s, x, 5);
    updatePower(s);
    s.jobs.push(training(1, 4), training(2, 4), training(3, 2));
    updateJobs(s, 0.1);
    const [a, b, c] = s.jobs;
    expect(a.assigned).toHaveLength(4);
    expect(b.assigned).toHaveLength(4);
    expect(new Set([...a.assigned!, ...b.assigned!]).size).toBe(8);
    expect(c.assigned).toBeUndefined();
    expect(c.allocated).toBe(0);
    expect(s.compute.used).toBe(80);
  });

  it('une panne dans le bloc fait reculer la progression ; les points de contrôle limitent la perte', () => {
    const run = (checkpoints: boolean) => {
      const s = career();
      const racks = [4, 5, 6].map((x) => rack(s, x, 5));
      if (checkpoints) s.research.done.push('checkpoints');
      updatePower(s);
      const j = training(1, 3, 10000);
      s.jobs.push(j);
      for (let i = 0; i < 1000; i++) updateJobs(s, 0.1); // 3 000 CU faits, plus que le recul possible
      const before = j.progress;
      racks[1].status = 'failed';
      updatePower(s);
      updateJobs(s, 0.1);
      return { lost: before - j.progress, work: j.work, event: s.events.at(-1)?.code };
    };
    const plain = run(false);
    expect(plain.lost).toBeCloseTo(plain.work * TRAINING.rollback);
    expect(plain.event).toBe('trainingBroken');
    const saved = run(true);
    expect(saved.lost).toBeCloseTo(saved.work * TRAINING.rollbackCheckpoints);
  });

  it('un bloc de G2 entraîne plus vite qu’un bloc de G1', () => {
    const s = career();
    for (const x of [4, 5, 6]) rack(s, x, 5, 2);
    updatePower(s);
    const j = training(1, 3);
    s.jobs.push(j);
    updateJobs(s, 1);
    expect(j.allocated).toBe(3 * GPU[2].computeCU);
    expect(clusterIntact(s, j.assigned!, 1, new Set())).toBe(true);
  });

  it('SLA : un débit qui manque plus de 1 % du temps coûte la pénalité', () => {
    const play = (racks: number) => {
      const s = career();
      for (let x = 0; x < racks; x++) rack(s, 4 + x, 5);
      updatePower(s);
      const j: Job = { id: 1, name: 'S', status: 'active', rateCU: 20, durationS: 30, work: 600, progress: 0, deadlineInS: 200, payment: 1000, penalty: 500, offeredAt: 0, expiresAt: 0, deadline: 200, allocated: 0, sla: true, shortS: 0 };
      s.jobs.push(j);
      const before = s.money;
      for (let i = 0; i < 1000 && s.jobs.length; i++) {
        updateJobs(s, 0.1);
        s.time += 0.1;
      }
      return { paid: s.money - before, events: s.events.map((e) => e.code) };
    };
    expect(play(2).paid).toBe(1000);
    const starved = play(1); // 10 CU/s pour 20 promis
    expect(starved.paid).toBe(1000 - 500);
    expect(starved.events).toContain('slaBreach');
    expect(SLA.tolerance).toBeLessThan(0.05);
  });

  it('les offres du Labo d’IA mêlent entraînements et SLA ; la partie rapide n’en propose jamais', () => {
    const s = career();
    s.career.tier = TRAINING.minTier;
    for (let x = 0; x < 10; x++) rack(s, 4 + x, 5);
    const offers = Array.from({ length: 60 }, () => generateOffer(s));
    expect(offers.some((o) => o.kind === 'training' && (o.cluster ?? 0) >= 3)).toBe(true);
    expect(offers.some((o) => o.sla)).toBe(true);
    const q = createInitialState(1);
    for (let i = 0; i < 40; i++) {
      const o = generateOffer(q);
      expect(o.kind).toBeUndefined();
      expect(o.sla).toBeUndefined();
    }
  });
});
