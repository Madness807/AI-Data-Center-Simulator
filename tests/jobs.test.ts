import { describe, expect, it } from 'vitest';
import { DT, JOBS, RACK } from '../src/sim/balance';
import { processCommands } from '../src/sim/commands';
import type { Job } from '../src/sim/entities';
import { addBuilding, createEmptyState, createInitialState, type GameState } from '../src/sim/state';
import { generateOffer, updateJobs } from '../src/sim/systems/jobs';
import { updatePower } from '../src/sim/systems/power';

function job(s: GameState, rateCU: number, durationS: number, deadline: number): Job {
  const j: Job = {
    id: s.nextJobId++, name: 'test', status: 'active', rateCU, durationS, work: rateCU * durationS,
    progress: 0, deadlineInS: deadline, payment: 1000, penalty: 400, offeredAt: 0, expiresAt: 0, deadline, allocated: 0,
  };
  s.jobs.push(j);
  return j;
}

/** Fait avancer uniquement les contrats (les offres aléatoires sont repoussées). */
function runJobs(s: GameState, seconds: number) {
  s.nextOfferAt = Infinity;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    updatePower(s);
    updateJobs(s, DT);
    s.tick++;
    s.time = s.tick * DT;
  }
}

function withRacks(n: number): GameState {
  const s = createEmptyState();
  addBuilding(s, 'pdu', 0, 0);
  addBuilding(s, 'pdu', 1, 0);
  for (let i = 0; i < n; i++) addBuilding(s, 'rack', 4 + i, 4);
  return s;
}

describe('jobs', () => {
  it('le pool sert l’échéance la plus proche d’abord, plafonné au débit demandé', () => {
    const s = withRacks(3); // 30 CU/s
    const late = job(s, 20, 100, 500);
    const soon = job(s, 20, 100, 200);
    runJobs(s, DT);
    expect(s.compute.total).toBe(3 * RACK.computeCU);
    expect(soon.allocated).toBe(20);
    expect(late.allocated).toBe(10);
    expect(s.compute.used).toBe(30);
  });

  it('un contrat fini à temps paie et disparaît', () => {
    const s = withRacks(2);
    const money = s.money;
    job(s, 20, 30, 60);
    runJobs(s, 31);
    expect(s.jobs).toHaveLength(0);
    expect(s.money).toBe(money + 1000);
    expect(s.economy.jobsDone).toBe(1);
  });

  it('un délai dépassé coûte la pénalité', () => {
    const s = withRacks(1); // 10 CU/s pour un contrat à 20 : moitié trop lent
    const money = s.money;
    job(s, 20, 30, 40);
    runJobs(s, 41);
    expect(s.jobs).toHaveLength(0);
    expect(s.money).toBe(money - 400);
    expect(s.economy.jobsFailed).toBe(1);
  });

  it('accepter fixe l’échéance, refuser retire l’offre, une offre expire', () => {
    const s = createInitialState(3);
    const first = s.jobs[0];
    s.tick = 100;
    s.time = 10;
    s.commands.push({ type: 'acceptJob', id: first.id });
    processCommands(s);
    expect(first.status).toBe('active');
    expect(first.deadline).toBe(10 + first.deadlineInS);

    const offer = generateOffer(s);
    const other = generateOffer(s);
    s.jobs.push(offer, other);
    s.commands.push({ type: 'rejectJob', id: offer.id });
    processCommands(s);
    expect(s.jobs.map((j) => j.id)).toEqual([first.id, other.id]);

    runJobs(s, JOBS.offerExpiry + 1);
    expect(s.jobs.find((j) => j.id === other.id)).toBeUndefined();
  });

  it('les offres arrivent régulièrement, plafonnées, et restent cohérentes', () => {
    const s = withRacks(4);
    for (let i = 0; i < 3000; i++) {
      updateJobs(s, DT);
      s.tick++;
      s.time = s.tick * DT;
      expect(s.jobs.filter((j) => j.status === 'offer').length).toBeLessThanOrEqual(JOBS.maxOffers);
    }
    expect(s.jobs.length).toBeGreaterThan(0);
    for (let i = 0; i < 50; i++) {
      const o = generateOffer(s);
      expect(o.rateCU % RACK.computeCU).toBe(0);
      expect(o.rateCU).toBeLessThanOrEqual(JOBS.maxUnits * RACK.computeCU);
      expect(o.deadlineInS).toBeGreaterThan(o.durationS);
      expect(o.payment).toBeGreaterThan(o.penalty);
    }
  });
});
