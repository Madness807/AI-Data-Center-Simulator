import { describe, expect, it } from 'vitest';
import { DT, HEAT } from '../src/sim/balance';
import { addBuilding, createEmptyState, idx } from '../src/sim/state';
import { tempStats } from '../src/sim/stats';
import { updateHeat } from '../src/sim/systems/heat';
import { updatePower } from '../src/sim/systems/power';
import type { GameState } from '../src/sim/state';

/** Énergie + chaleur seules, sans pannes ni contrats. */
function runHeat(s: GameState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    updatePower(s);
    updateHeat(s, DT);
  }
}

describe('heat', () => {
  it('une salle vide reste à l’ambiant', () => {
    const s = createEmptyState();
    for (let i = 0; i < 1000; i++) updateHeat(s, DT);
    expect(s.temp.every((t) => Math.abs(t - HEAT.ambient) < 1e-9)).toBe(true);
  });

  it('la diffusion conserve l’énergie avec des bords isolants', () => {
    const s = createEmptyState(1, 6, 6);
    s.temp[idx(s, 0, 0)] = 122; // coin : teste les bords
    const before = s.temp.reduce((a, b) => a + b, 0);
    const lossFree = HEAT.ambientLoss;
    HEAT.ambientLoss = 0;
    try {
      for (let i = 0; i < 500; i++) updateHeat(s, DT);
    } finally {
      HEAT.ambientLoss = lossFree;
    }
    const after = s.temp.reduce((a, b) => a + b, 0);
    expect(after).toBeCloseTo(before, 6);
    // Et elle s'est bien étalée, sans oscillation (aucune case sous l'ambiant).
    expect(Math.max(...s.temp)).toBeLessThan(30);
    expect(Math.min(...s.temp)).toBeGreaterThanOrEqual(HEAT.ambient);
  });

  it('reste stable et fini sur une longue partie chargée', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 0, 0);
    addBuilding(s, 'pdu', 1, 0);
    for (let i = 0; i < 6; i++) addBuilding(s, 'rack', 5 + i, 5);
    runHeat(s, 3600);
    expect(s.temp.every(Number.isFinite)).toBe(true);
    expect(Math.min(...s.temp)).toBeGreaterThanOrEqual(HEAT.ambient - 1e-9);
  });

  it('un rack non alimenté ne chauffe pas', () => {
    const s = createEmptyState();
    addBuilding(s, 'rack', 5, 5);
    runHeat(s, 60);
    expect(tempStats(s).max).toBeCloseTo(HEAT.ambient, 9);
  });

  it('un CRAC ne refroidit pas sous sa cible', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 0, 0);
    addBuilding(s, 'crac', 5, 5);
    runHeat(s, 120);
    expect(Math.min(...s.temp)).toBeGreaterThanOrEqual(HEAT.cracTarget - 1e-9);
  });

  it('scénario : 4 racks sans refroidissement surchauffent, un CRAC fait redescendre', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 0, 0);
    for (let i = 0; i < 4; i++) addBuilding(s, 'rack', 10 + i, 8);
    updatePower(s);
    runHeat(s, 120);
    const hot = tempStats(s).max;
    expect(hot).toBeGreaterThan(40);

    addBuilding(s, 'pdu', 1, 0);
    addBuilding(s, 'crac', 11, 9);
    addBuilding(s, 'crac', 12, 7);
    runHeat(s, 120);
    expect(tempStats(s).max).toBeLessThan(hot - 10);
  });
});
