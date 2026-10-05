import { describe, expect, it } from 'vitest';
import { CDU, CRAC, GPU, GRID_H, GRID_W, PDU, RACK, WEATHER } from '../src/sim/balance';
import { addBuilding, createEmptyState } from '../src/sim/state';
import { loadKW, servedBy, updatePower } from '../src/sim/systems/power';

describe('power', () => {
  it('sans PDU, rien n’est alimenté', () => {
    const s = createEmptyState();
    const r = addBuilding(s, 'rack', 3, 3);
    updatePower(s);
    expect(r.powered).toBe(false);
    expect(s.power.capacityKW).toBe(0);
    expect(s.power.shedCount).toBe(1);
  });

  it('la capacité est la somme des PDU', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 1, 1);
    addBuilding(s, 'pdu', 2, 1);
    updatePower(s);
    expect(s.power.capacityKW).toBe(2 * PDU.capacityKW);
  });

  it('les CRAC passent avant les racks, puis les racks les plus récents sont délestés', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 1, 1);
    const racks = [0, 1, 2, 3].map((i) => addBuilding(s, 'rack', 5 + i, 5));
    const crac = addBuilding(s, 'crac', 10, 10); // construit en dernier, mais prioritaire
    updatePower(s);

    const fit = Math.floor((PDU.capacityKW - CRAC.powerKW) / RACK.powerKW);
    expect(crac.powered).toBe(true);
    racks.forEach((r, i) => expect(r.powered).toBe(i < fit));
    expect(s.power.shedCount).toBe(racks.length - fit);
    expect(s.power.loadKW).toBe(CRAC.powerKW + fit * RACK.powerKW);
    expect(s.power.demandKW).toBe(CRAC.powerKW + racks.length * RACK.powerKW);
  });

  it('ajouter un PDU réalimente les racks délestés', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 1, 1);
    const racks = [0, 1, 2, 3, 4].map((i) => addBuilding(s, 'rack', 5 + i, 5));
    updatePower(s);
    expect(racks.some((r) => !r.powered)).toBe(true);
    addBuilding(s, 'pdu', 2, 1);
    updatePower(s);
    expect(racks.every((r) => r.powered)).toBe(true);
  });

  it('ordre de service : le froid, puis les racks ; une charge qui ne rentre pas est sautée', () => {
    const s = createEmptyState(1, GRID_W, GRID_H, 'career');
    addBuilding(s, 'pdu', 1, 1);
    const g3 = addBuilding(s, 'rack', 5, 5);
    g3.gen = 3;
    const g2 = addBuilding(s, 'rack', 6, 5);
    g2.gen = 2;
    const g1 = addBuilding(s, 'rack', 7, 5);
    const last = addBuilding(s, 'rack', 8, 5);
    const cdu = addBuilding(s, 'cdu', 10, 10); // construite en dernier, mais servie d'abord
    // 40 kW : la CDU (6), pas le G3 (36), le G2 (18) et un G1 (10) ; le dernier G1 ne rentre plus.
    expect(CDU.powerKW + GPU[2].powerKW + RACK.powerKW).toBeLessThanOrEqual(PDU.capacityKW);
    const served = servedBy(s, PDU.capacityKW);
    expect([cdu, g3, g2, g1, last].map((b) => served.has(b.id))).toEqual([true, false, true, true, false]);
    // La distribution suit exactement la même règle.
    updatePower(s);
    expect([cdu, g3, g2, g1, last].map((b) => b.powered)).toEqual([true, false, true, true, false]);
  });

  it('le free cooling allège les CRAC partout où l’énergie est comptée', () => {
    const s = createEmptyState(1, GRID_W, GRID_H, 'career');
    s.career.tier = WEATHER.minTier;
    s.research.done.push('free-cooling');
    s.time = WEATHER.periodS * 0.75; // creux du cycle : il fait frais dehors
    const crac = addBuilding(s, 'crac', 10, 10);
    const racks = [5, 6, 7].map((x) => addBuilding(s, 'rack', x, 5));
    const light = CRAC.powerKW * WEATHER.freeCoolingPowerMult;
    expect(loadKW(s, crac)).toBe(light);
    // Juste assez pour le CRAC allégé et ses 3 racks ; au prix plein, le 3e rack serait délesté.
    expect(servedBy(s, light + 3 * RACK.powerKW).has(racks[2].id)).toBe(true);
    s.research.done.length = 0;
    expect(servedBy(s, light + 3 * RACK.powerKW).has(racks[2].id)).toBe(false);
  });
});
