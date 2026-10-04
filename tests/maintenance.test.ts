import { describe, expect, it } from 'vitest';
import { MAINTENANCE, PREDICTIVE, REPAIR, SPARE_PARTS, WEAR } from '../src/sim/balance';
import { processCommands } from '../src/sim/commands';
import type { Building } from '../src/sim/entities';
import { addBuilding, addTech, createEmptyState, createInitialState, idx, type GameState } from '../src/sim/state';
import { rackRiskPerMinute, updateWear, wearMultiplier } from '../src/sim/systems/failures';
import { updateAlerts } from '../src/sim/systems/alerts';
import { updatePower } from '../src/sim/systems/power';
import { updateTechnicians, workSpeed } from '../src/sim/systems/technicians';
import { runSeconds } from './helpers';

/** Carrière au palier où l'usure compte, alimentée, sans offres. */
function hall(): GameState {
  const s = createEmptyState(9, 24, 16, 'career');
  s.career.tier = WEAR.minTier;
  s.nextOfferAt = Number.MAX_SAFE_INTEGER;
  s.money = 50000;
  for (let x = 0; x < 4; x++) addBuilding(s, 'pdu', x, 0);
  return s;
}

function rack(s: GameState, x: number, y: number): Building {
  const b = addBuilding(s, 'rack', x, y);
  updatePower(s);
  return b;
}

describe('usure', () => {
  it('un rack en service s’use, deux fois plus vite quand il aspire de l’air chaud', () => {
    const s = hall();
    const cool = rack(s, 5, 5);
    const hot = rack(s, 10, 5);
    s.temp[idx(s, 10, 6)] = WEAR.hotC + 5; // devant le rack chaud (orientation par défaut : +y)
    updateWear(s, 100);
    expect(cool.wear).toBeCloseTo(WEAR.perS * 100);
    expect(hot.wear).toBeCloseTo(WEAR.perS * WEAR.hotMult * 100);
  });

  it('l’usure et l’âge augmentent le risque ; la partie rapide n’en tient pas compte', () => {
    const s = hall();
    const b = rack(s, 5, 5);
    const fresh = rackRiskPerMinute(s, b);
    b.wear = 100;
    expect(wearMultiplier(s, b)).toBeCloseTo(1 + WEAR.failureMult);
    s.time = 3600; // une heure de service
    expect(rackRiskPerMinute(s, b)).toBeGreaterThan(fresh * 3);

    const q = createInitialState(1);
    const r = addBuilding(q, 'rack', 10, 10);
    r.wear = 100;
    expect(wearMultiplier(q, r)).toBe(1);
  });

  it('pas d’usure avant son palier', () => {
    const s = hall();
    s.career.tier = WEAR.minTier - 1;
    const b = rack(s, 5, 5);
    updateWear(s, 1000);
    expect(b.wear).toBeUndefined();
  });
});

describe('entretien', () => {
  it('un technicien entretient un rack usé : payé à l’arrivée, usure remise à zéro, le rack tourne toujours', () => {
    const s = hall();
    const b = rack(s, 5, 5);
    b.wear = 80;
    const t = addTech(s, { x: 5, y: 6 });
    s.commands.push({ type: 'order', techs: [t.id], task: { type: 'maintain', target: b.id }, append: false });
    processCommands(s);
    const before = s.money;
    runSeconds(s, MAINTENANCE.seconds + 1);
    expect(b.wear).toBeLessThan(1);
    expect(b.status).toBe('ok');
    expect(before - s.money).toBeGreaterThanOrEqual(MAINTENANCE.cost);
    expect(t.tasks).toHaveLength(0);
  });

  it('maintenance planifiée : les techniciens libres entretiennent les racks usés, du plus usé au moins usé', () => {
    const s = hall();
    const a = rack(s, 5, 5);
    const b = rack(s, 7, 5);
    a.wear = MAINTENANCE.autoAbove + 5;
    b.wear = MAINTENANCE.autoAbove + 30;
    const t = addTech(s, { x: 6, y: 7 });
    updateTechnicians(s, 0.1);
    expect(t.tasks).toEqual([]); // pas encore étudiée
    s.research.done.push('auto-repair', 'planned-maintenance');
    s.policies.autoMaintain = false;
    updateTechnicians(s, 0.1);
    expect(t.tasks).toEqual([]);
    s.policies.autoMaintain = true;
    updateTechnicians(s, 0.1);
    expect(t.tasks[0]).toMatchObject({ type: 'maintain', target: b.id });
  });
});

describe('équipe', () => {
  it('un spécialiste va deux fois plus vite dans son domaine, à vitesse normale ailleurs', () => {
    const s = hall();
    s.research.done.push('specialties');
    s.commands.push({ type: 'hire', specialty: 'hvac' });
    processCommands(s);
    const t = s.techs.at(-1)!;
    expect(t.specialty).toBe('hvac');
    const crac = addBuilding(s, 'crac', 8, 8);
    const r = addBuilding(s, 'rack', 12, 8);
    expect(workSpeed(t, crac)).toBe(2);
    expect(workSpeed(t, r)).toBe(1);
  });

  it('les spécialités demandent leur recherche', () => {
    const s = hall();
    s.commands.push({ type: 'hire', specialty: 'it' });
    processCommands(s);
    expect(s.techs).toHaveLength(0);
    expect(s.events.at(-1)?.message).toMatch(/Spécialités/);
  });

  it('stock de pièces : réparation moins chère et plus courte', () => {
    const repair = (done: string[]) => {
      const s = hall();
      s.research.done.push(...done);
      const b = rack(s, 5, 5);
      b.status = 'failed';
      const t = addTech(s, { x: 5, y: 6 });
      s.commands.push({ type: 'order', techs: [t.id], task: { type: 'repair', target: b.id }, append: false });
      processCommands(s);
      const before = s.money;
      let seconds = 0;
      while ((b.status as string) !== 'ok' && seconds < 30) {
        updateTechnicians(s, 0.1);
        seconds += 0.1;
      }
      return { cost: before - s.money, seconds };
    };
    const base = repair([]);
    const stocked = repair(['spare-parts']);
    expect(base.cost).toBe(REPAIR.cost);
    expect(stocked.cost).toBe(SPARE_PARTS.cost);
    expect(stocked.seconds).toBeLessThan(base.seconds - 2);
  });
});

describe('maintenance prédictive', () => {
  it('un rack à risque est signalé avant la casse, une fois', () => {
    const s = hall();
    const b = rack(s, 5, 5);
    s.research.done.push('predictive');
    b.wear = 100;
    s.time = 3 * 3600;
    s.temp[idx(s, 5, 6)] = 44;
    const alerts = () => {
      s.events = [];
      s.tick = 0;
      updateAlerts(s);
      return s.events.filter((e) => e.code === 'wearRisk').length;
    };
    expect(rackRiskPerMinute(s, b)).toBeGreaterThan(PREDICTIVE.warnPerMin);
    expect(alerts()).toBe(1);
    expect(alerts()).toBe(0);
  });
});
