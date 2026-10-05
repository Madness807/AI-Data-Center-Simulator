import { describe, expect, it } from 'vitest';
import { BUILD_COST, CRAC, DT, GRID_H, GRID_W, NETWORK, RACK } from '../src/sim/balance';
import { canBuild, processCommands } from '../src/sim/commands';
import { isUnlocked } from '../src/sim/progression';
import { BRANCHES, RESEARCH } from '../src/sim/research';
import { addBuilding, createEmptyState, createInitialState, idx } from '../src/sim/state';
import { pue } from '../src/sim/stats';
import { updateHeat } from '../src/sim/systems/heat';
import { serviceOrder, updatePower } from '../src/sim/systems/power';
import { room } from './helpers';

describe('switch réseau', () => {
  it('se débloque par la recherche de la branche Réseau, en carrière seulement', () => {
    const node = RESEARCH.find((n) => n.effect.unlocks?.includes('switch'))!;
    expect(node.branch).toBe('network');
    expect(BRANCHES.map((b) => b.id)).toContain('network');
    const s = room(3, { pdus: 1, money: 50_000 });
    expect(canBuild(s, 'switch', 5, 5)).toBe(`Recherche requise : ${node.name}`);
    s.research.done.push(node.id);
    expect(canBuild(s, 'switch', 5, 5)).toBeNull();
    const before = s.money;
    s.commands.push({ type: 'build', kind: 'switch', x: 5, y: 5 });
    processCommands(s);
    expect(before - s.money).toBe(BUILD_COST.switch);
    // Partie rapide : jamais, même avec la recherche (elle n'y existe pas).
    const quick = createInitialState(1);
    quick.research.done.push(node.id);
    expect(isUnlocked(quick, 'switch')).toBe(false);
  });

  it('servi après le froid et avant les racks : il ne s’éteint jamais avant eux', () => {
    const s = createEmptyState(1, GRID_W, GRID_H, 'career');
    addBuilding(s, 'pdu', 0, 0);
    const rack = addBuilding(s, 'rack', 5, 5);
    const sw = addBuilding(s, 'switch', 3, 5);
    addBuilding(s, 'crac', 9, 9);
    expect(serviceOrder(s).map((b) => b.kind)).toEqual(['crac', 'switch', 'rack']);
    updatePower(s);
    expect(sw.powered && rack.powered).toBe(true);
    expect(s.power.loadKW).toBe(CRAC.powerKW + NETWORK.powerKW + RACK.powerKW);
  });

  it('compte dans le PUE comme l’informatique, et chauffe sa case', () => {
    const s = createEmptyState(1, GRID_W, GRID_H, 'career');
    addBuilding(s, 'pdu', 0, 0);
    const sw = addBuilding(s, 'switch', 3, 5);
    updatePower(s);
    expect(pue(s)).toBeNull(); // pas de rack en service : pas de PUE
    addBuilding(s, 'rack', 5, 5);
    addBuilding(s, 'crac', 9, 9);
    updatePower(s);
    expect(pue(s)).toBeCloseTo((CRAC.powerKW + NETWORK.powerKW + RACK.powerKW) / (NETWORK.powerKW + RACK.powerKW));

    const cold = createEmptyState(1, GRID_W, GRID_H, 'career');
    updateHeat(s, DT);
    updateHeat(cold, DT);
    expect(s.temp[idx(s, sw.x, sw.y)]).toBeGreaterThan(cold.temp[idx(cold, sw.x, sw.y)]);
  });
});
