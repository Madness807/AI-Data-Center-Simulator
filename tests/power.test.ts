import { describe, expect, it } from 'vitest';
import { CRAC, PDU, RACK } from '../src/sim/balance';
import { addBuilding, createEmptyState } from '../src/sim/state';
import { updatePower } from '../src/sim/systems/power';

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
});
