import { describe, expect, it } from 'vitest';
import { FAILURE, REPAIR } from '../src/sim/balance';
import { processCommands } from '../src/sim/commands';
import { addBuilding, createEmptyState, idx } from '../src/sim/state';
import { failureProbability, failureRate, updateFailures } from '../src/sim/systems/failures';
import { updateHeat } from '../src/sim/systems/heat';
import { updatePower } from '../src/sim/systems/power';
import { runSeconds } from './helpers';

describe('failures', () => {
  it('le taux est faible sous le seuil puis croît vite au-dessus', () => {
    expect(failureRate(25)).toBe(FAILURE.baseRate);
    expect(failureRate(FAILURE.thresholdC)).toBe(FAILURE.baseRate);
    expect(failureRate(45)).toBeGreaterThan(10 * failureRate(30));
    expect(failureRate(60)).toBeGreaterThan(2 * failureRate(50));
  });

  it('la probabilité ne dépend pas du découpage en ticks', () => {
    for (const t of [30, 45, 60]) {
      const tenSmall = 1 - (1 - failureProbability(t, 0.1)) ** 10;
      expect(tenSmall).toBeCloseTo(failureProbability(t, 1), 12);
    }
  });

  it('même graine, mêmes pannes', () => {
    const run = (seed: number) => {
      const s = createEmptyState(seed);
      addBuilding(s, 'pdu', 0, 0);
      const racks = [0, 1, 2].map((i) => addBuilding(s, 'rack', 5 + i, 5));
      updatePower(s);
      racks.forEach((r) => (s.temp[idx(s, r.x, r.y)] = 60));
      const log: string[] = [];
      for (let tick = 0; tick < 600; tick++) {
        updateFailures(s, 0.1);
        racks.forEach((r, i) => r.status === 'failed' && !log.includes(`${i}`) && log.push(`${i}`, `${tick}`));
      }
      return log;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7).length).toBeGreaterThan(0);
  });

  it('un rack en panne ne consomme plus, ne chauffe plus et ne calcule plus', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 0, 0);
    const r = addBuilding(s, 'rack', 5, 5);
    r.status = 'failed';
    updatePower(s);
    expect(r.powered).toBe(false);
    expect(s.power.loadKW).toBe(0);
    expect(s.power.shedCount).toBe(0);
    for (let i = 0; i < 100; i++) updateHeat(s, 0.1);
    expect(s.temp[idx(s, 5, 5)]).toBeCloseTo(22, 9);
  });

  it('réparer coûte, prend du temps, puis remet le rack en service', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 0, 0);
    const r = addBuilding(s, 'rack', 5, 5);
    r.status = 'failed';
    const money = s.money;
    s.commands.push({ type: 'repair', x: 5, y: 5 });
    processCommands(s);
    expect(r.status).toBe('repairing');
    expect(s.money).toBe(money - REPAIR.cost);
    runSeconds(s, REPAIR.seconds - 1);
    expect(r.status).toBe('repairing');
    runSeconds(s, 1.5);
    expect(r.status).toBe('ok');
    expect(r.powered).toBe(true);
  });

  it('on ne répare ni un rack sain ni sans fonds', () => {
    const s = createEmptyState();
    const ok = addBuilding(s, 'rack', 5, 5);
    const broken = addBuilding(s, 'rack', 6, 5);
    broken.status = 'failed';
    s.money = REPAIR.cost - 1;
    s.commands.push({ type: 'repair', x: 5, y: 5 }, { type: 'repair', x: 6, y: 5 });
    processCommands(s);
    expect(ok.status).toBe('ok');
    expect(broken.status).toBe('failed');
    expect(s.money).toBe(REPAIR.cost - 1);
  });
});
