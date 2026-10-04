import { describe, expect, it } from 'vitest';
import { BUILD_COST, DEMOLISH_REFUND, REPAIR, START_MONEY, TECH } from '../src/sim/balance';
import { processCommands } from '../src/sim/commands';
import { OPERATING, type Ledger } from '../src/sim/ledger';
import { step } from '../src/sim/sim';
import { addBuilding, addTech, buildingAt, createEmptyState, createInitialState, type GameState } from '../src/sim/state';
import { committedCompute, freeCapacity } from '../src/sim/stats';
import { runSeconds, runUntil } from './helpers';

const expenses = (l: Ledger) => l.penalties + l.electricity + l.salaries + l.repairs + l.construction + l.hiring;

/** Invariant : la trésorerie se déduit exactement du grand livre. */
function expectBalanced(s: GameState, start = START_MONEY): void {
  const l = s.economy.ledger;
  expect(s.money).toBeCloseTo(start + l.revenue - expenses(l), 6);
}

describe('grand livre', () => {
  it('construction, démolition et embauche sont ventilées', () => {
    const s = createEmptyState();
    s.commands.push({ type: 'build', kind: 'rack', x: 4, y: 4 }, { type: 'build', kind: 'crac', x: 6, y: 4 }, { type: 'hire' });
    processCommands(s);
    expect(s.economy.ledger.construction).toBe(BUILD_COST.rack + BUILD_COST.crac);
    expect(s.economy.ledger.hiring).toBe(TECH.hireCost);
    // Le CRAC n'a pas commencé : remboursé en entier ; le rack terminé : à moitié.
    buildingAt(s, 4, 4)!.status = 'ok';
    s.commands.push({ type: 'demolish', x: 6, y: 4 }, { type: 'demolish', x: 4, y: 4 });
    processCommands(s);
    expect(s.economy.ledger.construction).toBe(BUILD_COST.rack * (1 - DEMOLISH_REFUND));
    expectBalanced(s);
  });

  it('électricité, salaires, réparations, recettes et pénalités', () => {
    const s = createInitialState(5);
    s.nextOfferAt = Infinity;
    addBuilding(s, 'pdu', 2, 1);
    const racks = [0, 1].map((i) => addBuilding(s, 'rack', 10 + i, 5));
    s.commands.push({ type: 'acceptJob', id: s.jobs[0].id });
    runSeconds(s, 70);
    const l = s.economy.ledger;
    expect(l.revenue).toBe(6000);
    expect(l.electricity).toBeGreaterThan(0);
    expect(l.salaries).toBeCloseTo(70 * s.techs.length * TECH.salaryPerS, 1);

    racks[0].status = 'failed';
    s.commands.push({ type: 'order', techs: [s.techs[0].id], task: { type: 'repair', target: racks[0].id }, append: false });
    expect(runUntil(s, () => racks[0].status === 'ok', 40)).toBe(true);
    expect(l.repairs).toBe(REPAIR.cost);
    expectBalanced(s);
  });

  it('reste équilibré sur une longue partie', () => {
    const s = createInitialState(11);
    addBuilding(s, 'pdu', 2, 1);
    for (let i = 0; i < 6; i++) addBuilding(s, 'rack', 10 + i, 5);
    addTech(s);
    for (let t = 0; t < 6000; t++) {
      for (const j of s.jobs) if (j.status === 'offer' && freeCapacity(s) >= j.rateCU) s.commands.push({ type: 'acceptJob', id: j.id });
      step(s);
      s.events.length = 0;
    }
    expect(s.economy.jobsDone).toBeGreaterThan(0);
    expectBalanced(s);
    expect(OPERATING).not.toContain('construction');
  });
});

describe('événements localisés', () => {
  it('une panne porte sa case et son heure', () => {
    const s = createEmptyState(3);
    addBuilding(s, 'pdu', 0, 0);
    const r = addBuilding(s, 'rack', 7, 3);
    s.nextOfferAt = Infinity;
    expect(
      runUntil(
        s,
        () => {
          s.temp[3 * s.w + 7] = 70;
          return r.status === 'failed';
        },
        600,
      ),
    ).toBe(true);
    const e = s.events.find((ev) => ev.message.startsWith('Panne'));
    expect(e?.cell).toEqual({ x: 7, y: 3 });
    expect(e?.time).toBeGreaterThan(0);
  });

  it('une construction terminée porte sa case', () => {
    const s = createEmptyState();
    s.nextOfferAt = Infinity;
    const t = addTech(s, { x: 5, y: 5 });
    s.commands.push({ type: 'build', kind: 'pdu', x: 6, y: 5, assign: [t.id] });
    runSeconds(s, 8);
    expect(s.events.find((e) => e.message.includes('construit'))?.cell).toEqual({ x: 6, y: 5 });
  });
});

describe('capacité libre', () => {
  it('soustrait les débits des contrats en cours', () => {
    const s = createInitialState();
    s.nextOfferAt = Infinity;
    for (let i = 0; i < 3; i++) addBuilding(s, 'rack', 10 + i, 5);
    runSeconds(s, 0.1);
    expect(freeCapacity(s)).toBe(30);
    s.commands.push({ type: 'acceptJob', id: s.jobs[0].id });
    runSeconds(s, 0.1);
    expect(committedCompute(s)).toBe(20);
    expect(freeCapacity(s)).toBe(10);
  });
});
