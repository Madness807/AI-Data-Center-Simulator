import { describe, expect, it } from 'vitest';
import { DT, ECONOMY, PDU } from '../src/sim/balance';
import { addBuilding, createEmptyState } from '../src/sim/state';
import { updateEconomy } from '../src/sim/systems/economy';
import { updatePower } from '../src/sim/systems/power';
import { runSeconds } from './helpers';

describe('economy', () => {
  it('facture l’électricité sur la charge servie, pas sur la capacité', () => {
    const s = createEmptyState();
    addBuilding(s, 'pdu', 0, 0);
    addBuilding(s, 'rack', 5, 5);
    updatePower(s);
    const money = s.money;
    for (let i = 0; i < 10; i++) updateEconomy(s, DT);
    expect(s.power.capacityKW).toBe(PDU.capacityKW);
    expect(money - s.money).toBeCloseTo(s.power.loadKW * ECONOMY.electricityPerKWs, 9);
  });

  it('faillite seulement après le compte à rebours, qui repart à zéro si on remonte', () => {
    const s = createEmptyState();
    s.money = -1;
    for (let i = 0; i < (ECONOMY.bankruptcySeconds - 1) / DT; i++) updateEconomy(s, DT);
    expect(s.outcome).toBe('playing');
    s.money = 100;
    updateEconomy(s, DT);
    expect(s.economy.bankruptTimer).toBe(0);

    s.money = -1;
    for (let i = 0; i < ECONOMY.bankruptcySeconds / DT + 1; i++) updateEconomy(s, DT);
    expect(s.outcome).toBe('lost');
    expect(s.speed).toBe(0);
  });

  it('une partie perdue est figée', () => {
    const s = createEmptyState();
    s.outcome = 'lost';
    const tick = s.tick;
    s.commands.push({ type: 'build', kind: 'rack', x: 3, y: 3 });
    runSeconds(s, 5);
    expect(s.tick).toBe(tick);
    expect(s.buildings).toHaveLength(0);
  });

  it('atteindre l’objectif gagne sans arrêter la partie', () => {
    const s = createEmptyState();
    s.money = ECONOMY.goalMoney;
    runSeconds(s, 1);
    expect(s.outcome).toBe('won');
    expect(s.tick).toBeGreaterThan(0);
  });
});
