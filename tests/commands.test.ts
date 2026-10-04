import { describe, expect, it } from 'vitest';
import { BUILD_COST, BUILD_TIME, DEMOLISH_REFUND, ENTRANCE } from '../src/sim/balance';
import { processCommands } from '../src/sim/commands';
import { buildingAt, createEmptyState, createInitialState } from '../src/sim/state';
import { nextRandom } from '../src/sim/rng';

describe('commands', () => {
  it('construire débite le coût et pose un chantier sur la case', () => {
    const s = createEmptyState();
    const money = s.money;
    s.commands.push({ type: 'build', kind: 'rack', x: 4, y: 4 });
    processCommands(s);
    const site = buildingAt(s, 4, 4);
    expect(site?.kind).toBe('rack');
    expect(site?.status).toBe('construction');
    expect(site?.workLeft).toBe(BUILD_TIME.rack);
    expect(s.money).toBe(money - BUILD_COST.rack);
  });

  it('annuler un chantier non commencé rembourse tout', () => {
    const s = createEmptyState();
    const money = s.money;
    s.commands.push({ type: 'build', kind: 'crac', x: 4, y: 4 }, { type: 'demolish', x: 4, y: 4 });
    processCommands(s);
    expect(buildingAt(s, 4, 4)).toBeUndefined();
    expect(s.money).toBe(money);
  });

  it('refuse case occupée, entrée, hors grille et fonds insuffisants', () => {
    const s = createEmptyState();
    const [ex, ey] = ENTRANCE[0];
    s.commands.push(
      { type: 'build', kind: 'rack', x: 4, y: 4 },
      { type: 'build', kind: 'pdu', x: 4, y: 4 },
      { type: 'build', kind: 'rack', x: ex, y: ey },
      { type: 'build', kind: 'rack', x: -1, y: 0 },
    );
    processCommands(s);
    s.money = 0;
    s.commands.push({ type: 'build', kind: 'rack', x: 6, y: 6 });
    processCommands(s);
    expect(s.buildings).toHaveLength(1);
    expect(s.events.map((e) => e.message)).toEqual([
      'Case occupée',
      "Zone d'entrée réservée",
      'Hors de la salle',
      'Fonds insuffisants',
    ]);
  });

  it('démolir libère la case et rembourse une partie', () => {
    const s = createInitialState();
    const money = s.money;
    const pdu = s.buildings.find((b) => b.kind === 'pdu')!;
    s.commands.push({ type: 'demolish', x: pdu.x, y: pdu.y });
    processCommands(s);
    expect(buildingAt(s, pdu.x, pdu.y)).toBeUndefined();
    expect(s.money).toBe(money + BUILD_COST.pdu * DEMOLISH_REFUND);
  });

  it('un chantier ne consomme ni ne fonctionne avant d’être construit', () => {
    const s = createInitialState();
    s.commands.push({ type: 'build', kind: 'rack', x: 4, y: 4 });
    processCommands(s);
    expect(buildingAt(s, 4, 4)?.powered).toBe(false);
    expect(s.power.demandKW).toBe(4); // le CRAC de départ seulement
  });

  it('le state est sérialisable et le RNG déterministe', () => {
    const a = createInitialState(42);
    const b = JSON.parse(JSON.stringify(a));
    expect(b).toEqual(a);
    const seqA = [nextRandom(a), nextRandom(a), nextRandom(a)];
    const seqB = [nextRandom(b), nextRandom(b), nextRandom(b)];
    expect(seqA).toEqual(seqB);
    expect(new Set(seqA).size).toBe(3);
  });
});
