import { describe, expect, it } from 'vitest';
import { BUILD_TIME, CRAC, RACK } from '../src/sim/balance';
import { addBuilding, addTech, buildingAt, createEmptyState } from '../src/sim/state';
import { busyRackIds, coolersCovering, cracHeatLoad } from '../src/sim/stats';
import { failureProbability, failureRiskPerMinute } from '../src/sim/systems/failures';
import { updatePower } from '../src/sim/systems/power';
import { runSeconds, runUntil } from './helpers';

describe('données de l’inspecteur', () => {
  it('compte les pannes de chaque rack', () => {
    const s = createEmptyState(9);
    s.nextOfferAt = Infinity;
    addBuilding(s, 'pdu', 0, 0);
    const r = addBuilding(s, 'rack', 6, 6);
    expect(r.failures).toBe(0);
    expect(runUntil(s, () => ((s.temp[6 * s.w + 6] = 70), r.status === 'failed'), 600)).toBe(true);
    expect(r.failures).toBe(1);
  });

  it('date la mise en service à la fin du chantier', () => {
    const s = createEmptyState();
    s.nextOfferAt = Infinity;
    const t = addTech(s, { x: 5, y: 5 });
    s.commands.push({ type: 'build', kind: 'pdu', x: 6, y: 5, assign: [t.id] });
    runSeconds(s, 0.2);
    expect(buildingAt(s, 6, 5)!.builtAt).toBeNull();
    runSeconds(s, BUILD_TIME.pdu + 1);
    const built = buildingAt(s, 6, 5)!;
    expect(built.builtAt).toBeGreaterThan(BUILD_TIME.pdu - 0.5);
    expect(built.builtAt).toBeLessThan(s.time);
  });

  it('désigne les racks les plus anciens comme « en calcul »', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 0, 0);
    const racks = [0, 1, 2].map((i) => addBuilding(s, 'rack', 5 + i, 5));
    updatePower(s);
    s.compute = { total: 30, used: 15 };
    expect([...busyRackIds(s)]).toEqual([racks[0].id, racks[1].id]);
    racks[0].status = 'failed';
    expect(busyRackIds(s).has(racks[0].id)).toBe(false);
  });

  it('trouve les CRAC alimentés à portée et la chaleur de leur zone', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 0, 0);
    const crac = addBuilding(s, 'crac', 10, 10);
    addBuilding(s, 'rack', 10 + CRAC.radius, 10); // au bord de la portée
    addBuilding(s, 'rack', 10 + CRAC.radius + 1, 10); // juste dehors
    updatePower(s);
    expect(coolersCovering(s, 10 + CRAC.radius, 10).map((c) => c.id)).toEqual([crac.id]);
    expect(coolersCovering(s, 10 + CRAC.radius + 1, 10)).toEqual([]);
    expect(cracHeatLoad(s, crac)).toEqual({ racks: 1, heatKW: RACK.heatKW });
    crac.powered = false;
    expect(coolersCovering(s, 10, 11)).toEqual([]);
  });

  it('le risque par minute croît avec la température', () => {
    expect(failureRiskPerMinute(50)).toBeCloseTo(failureProbability(50, 60), 12);
    expect(failureRiskPerMinute(25)).toBeLessThan(failureRiskPerMinute(45));
    expect(failureRiskPerMinute(45)).toBeLessThan(failureRiskPerMinute(60));
  });
});
