import { describe, expect, it } from 'vitest';
import { BUILD_TIME, REPAIR } from '../src/sim/balance';
import { addBuilding, addTech, buildingAt, createEmptyState } from '../src/sim/state';
import { tempStats } from '../src/sim/stats';
import { runSeconds, runUntil } from './helpers';

/** Le scénario manuel du plan, rejoué sans rendu avec une graine fixe. */
describe('scénario', () => {
  it('surchauffe → pannes → un technicien répare → CRAC → la température redescend', () => {
    const s = createEmptyState(1234);
    s.nextOfferAt = Infinity;
    addBuilding(s, 'pdu', 0, 0);
    const racks = [0, 1, 2].map((i) => addBuilding(s, 'rack', 10 + i, 8));
    const tech = addTech(s);

    expect(runUntil(s, () => racks.some((r) => r.status === 'failed'), 600)).toBe(true);
    const hot = tempStats(s).max;
    expect(hot).toBeGreaterThan(40);

    const broken = racks.find((r) => r.status === 'failed')!;
    s.commands.push(
      { type: 'order', techs: [tech.id], task: { type: 'repair', target: broken.id }, append: false },
      { type: 'build', kind: 'pdu', x: 1, y: 0, assign: [tech.id] },
      { type: 'build', kind: 'crac', x: 11, y: 10, assign: [tech.id] },
      { type: 'build', kind: 'crac', x: 11, y: 6, assign: [tech.id] },
    );
    // CRAC à une case d'écart : collés au rack du milieu, ils l'enfermeraient (refusé).
    // La réparation passe en premier ; le rack peut retomber en panne tant que la salle est chaude.
    expect(runUntil(s, () => broken.status === 'ok', 20 + REPAIR.seconds)).toBe(true);
    const budget = 30 + BUILD_TIME.pdu + 2 * BUILD_TIME.crac;
    expect(runUntil(s, () => tech.tasks.length === 0, budget)).toBe(true);
    expect(buildingAt(s, 11, 10)?.status).toBe('ok');
    expect(buildingAt(s, 11, 6)?.status).toBe('ok');

    // D'autres pannes ont pu survenir pendant la chauffe : on les fait réparer aussi.
    for (const r of racks.filter((r) => r.status === 'failed')) {
      s.commands.push({ type: 'order', techs: [tech.id], task: { type: 'repair', target: r.id }, append: true });
    }
    runSeconds(s, 180);
    expect(tempStats(s).max).toBeLessThan(35);
  });
});
