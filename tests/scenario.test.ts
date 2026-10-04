import { describe, expect, it } from 'vitest';
import { REPAIR } from '../src/sim/balance';
import { addBuilding, buildingAt, createEmptyState } from '../src/sim/state';
import { tempStats } from '../src/sim/stats';
import { runSeconds, runUntil } from './helpers';

/** Le scénario manuel du plan, rejoué sans rendu avec une graine fixe. */
describe('scénario', () => {
  it('surchauffe → pannes → réparation → CRAC → la température redescend', () => {
    const s = createEmptyState(1234);
    s.nextOfferAt = Infinity;
    addBuilding(s, 'pdu', 0, 0);
    const racks = [0, 1, 2].map((i) => addBuilding(s, 'rack', 10 + i, 8));

    expect(runUntil(s, () => racks.some((r) => r.status === 'failed'), 600)).toBe(true);
    const hot = tempStats(s).max;
    expect(hot).toBeGreaterThan(40);

    const broken = racks.find((r) => r.status === 'failed')!;
    s.commands.push({ type: 'repair', x: broken.x, y: broken.y });
    s.commands.push({ type: 'build', kind: 'pdu', x: 1, y: 0 });
    s.commands.push({ type: 'build', kind: 'crac', x: 11, y: 9 });
    s.commands.push({ type: 'build', kind: 'crac', x: 11, y: 7 });
    runSeconds(s, REPAIR.seconds + 1);
    expect(buildingAt(s, broken.x, broken.y)?.status).not.toBe('failed');

    runSeconds(s, 180);
    expect(tempStats(s).max).toBeLessThan(35);
  });
});
