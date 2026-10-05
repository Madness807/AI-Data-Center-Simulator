import { describe, expect, it } from 'vitest';
import { ALERTS } from '../src/sim/balance';
import type { Job } from '../src/sim/entities';
import { addBuilding, addTech, createEmptyState, emptyPower, idx, type EventCode, type GameState } from '../src/sim/state';
import { availability, pue } from '../src/sim/stats';
import { predictCompletion, updateAlerts } from '../src/sim/systems/alerts';
import { updateEconomy } from '../src/sim/systems/economy';
import { updatePower } from '../src/sim/systems/power';
import { testJob } from './helpers';

/** Lance une passe d'alertes et compte celles du code donné. */
function alertsOf(s: GameState, code: EventCode): number {
  s.events = [];
  s.tick = 0;
  updateAlerts(s);
  return s.events.filter((e) => e.code === code).length;
}

function activeJob(s: GameState, id: number, o: { rate: number; work: number; deadlineIn: number; startedAgo?: number }): Job {
  const deadline = s.time + o.deadlineIn;
  const deadlineInS = o.deadlineIn + (o.startedAgo ?? 10);
  const job = testJob({ id, name: `Contrat ${id}`, rateCU: o.rate, durationS: o.work / o.rate, work: o.work, deadlineInS, deadline });
  s.jobs.push(job);
  return job;
}

describe('alertes préventives', () => {
  it('surchauffe : une alerte par épisode, réarmée seulement après refroidissement', () => {
    const s = createEmptyState(1);
    addBuilding(s, 'pdu', 0, 0);
    addBuilding(s, 'rack', 5, 5);
    updatePower(s);
    const at = (t: number) => {
      s.temp[idx(s, 5, 5)] = t;
      return alertsOf(s, 'overheat');
    };
    const hot = ALERTS.hotC + 1;
    expect(at(hot)).toBe(1);
    expect(at(hot)).toBe(0);
    expect(at(ALERTS.hotResetC + 1)).toBe(0); // encore au-dessus du seuil de réarmement
    expect(at(hot)).toBe(0);
    expect(at(ALERTS.hotResetC - 1)).toBe(0); // réarmée
    expect(at(hot)).toBe(1);
  });

  it('surchauffe : plusieurs racks d’un coup donnent une seule alerte, sur le plus chaud', () => {
    const s = createEmptyState(1);
    addBuilding(s, 'pdu', 0, 0);
    for (const x of [5, 6, 7]) addBuilding(s, 'rack', x, 5);
    updatePower(s);
    s.temp[idx(s, 5, 5)] = ALERTS.hotC + 1;
    s.temp[idx(s, 6, 5)] = ALERTS.hotC + 4;
    s.temp[idx(s, 7, 5)] = ALERTS.hotC + 2;
    expect(alertsOf(s, 'overheat')).toBe(1);
    expect(s.events[0].cell).toEqual({ x: 6, y: 5 });
    expect(s.events[0].message).toMatch(/3 racks/);
  });

  it(`énergie : alerte à ${ALERTS.power * 100} % de la capacité, réarmée sous ${ALERTS.powerReset * 100} %`, () => {
    const s = createEmptyState(1);
    const cap = 40;
    const at = (ratio: number) => {
      const demandKW = cap * ratio;
      s.power = { ...emptyPower(), capacityKW: cap, demandKW, loadKW: Math.min(demandKW, cap) };
      return alertsOf(s, 'powerHigh');
    };
    expect(at(ALERTS.power)).toBe(1);
    expect(at(ALERTS.power + 0.05)).toBe(0);
    expect(at((ALERTS.power + ALERTS.powerReset) / 2)).toBe(0); // entre les deux seuils : pas encore réarmée
    expect(at(ALERTS.powerReset - 0.025)).toBe(0); // réarmée
    expect(at(ALERTS.power + 0.025)).toBe(1);
  });

  it('retard probable : prévu selon l’ordre des échéances, signalé une fois', () => {
    const s = createEmptyState(1);
    s.time = 100;
    s.compute = { total: 20, used: 20 };
    // A passe en premier (30 s), B attend puis finit à +70 s, avant son échéance (+100 s).
    activeJob(s, 1, { rate: 20, work: 600, deadlineIn: 60 });
    activeJob(s, 2, { rate: 20, work: 800, deadlineIn: 100 });
    const ends = predictCompletion(s);
    expect(ends.get(1)).toBeCloseTo(130);
    expect(ends.get(2)).toBeCloseTo(170);
    expect(alertsOf(s, 'lateRisk')).toBe(0);

    // Un rack tombe : il ne reste que 10 CU/s, B ne tiendra pas son échéance.
    s.compute = { total: 10, used: 10 };
    expect(alertsOf(s, 'lateRisk')).toBe(1);
    expect(s.events[0].message).toMatch(/Contrat 2/);
    expect(alertsOf(s, 'lateRisk')).toBe(0);
  });

  it('retard probable : pas de jugement pendant les premières secondes d’un contrat', () => {
    const s = createEmptyState(1);
    s.compute = { total: 0, used: 0 };
    activeJob(s, 1, { rate: 20, work: 1200, deadlineIn: 150, startedAgo: ALERTS.lateGraceS - 3 });
    expect(alertsOf(s, 'lateRisk')).toBe(0);
    s.time += 4;
    expect(alertsOf(s, 'lateRisk')).toBe(1);
  });

  it(`trésorerie : alerte sous ${ALERTS.cashS} s de dépenses, réarmée au-delà de ${ALERTS.cashResetS} s`, () => {
    const s = createEmptyState(1);
    s.economy.electricityPerS = 9;
    s.economy.salariesPerS = 1;
    const burn = 10;
    const at = (secondsCovered: number) => {
      s.money = burn * secondsCovered;
      return alertsOf(s, 'cashLow');
    };
    expect(at(10 * ALERTS.cashS)).toBe(0);
    expect(at(ALERTS.cashS - 1)).toBe(1);
    expect(at(ALERTS.cashS - 10)).toBe(0);
    expect(at(ALERTS.cashResetS - 10)).toBe(0); // pas encore réarmée
    expect(at(ALERTS.cashResetS + 10)).toBe(0); // réarmée
    expect(at(-5)).toBe(0); // dans le rouge : le compte à rebours de faillite prend le relais
    expect(at(ALERTS.cashS - 20)).toBe(1);
  });

  it(`panne sans technicien : alerte après ${ALERTS.unattendedS} s, sauf si une réparation est demandée`, () => {
    const s = createEmptyState(1);
    const rack = addBuilding(s, 'rack', 5, 5);
    rack.status = 'failed';
    const tech = addTech(s);
    const at = (time: number) => {
      s.time = time;
      return alertsOf(s, 'unattended');
    };
    const wait = ALERTS.unattendedS;
    expect(at(0)).toBe(0);
    expect(at(wait - 1)).toBe(0);
    expect(at(wait)).toBe(1);
    expect(at(2 * wait)).toBe(0);

    // Un ordre de réparation efface l'attente ; s'il est annulé, le décompte repart.
    tech.tasks.push({ type: 'repair', target: rack.id });
    expect(at(2 * wait + 1)).toBe(0);
    tech.tasks = [];
    const restart = 2 * wait + 2;
    expect(at(restart)).toBe(0);
    expect(at(restart + wait - 1)).toBe(0);
    expect(at(restart + wait)).toBe(1);
  });
});

describe('indicateurs d’exploitation', () => {
  it('PUE : énergie totale ÷ énergie des racks en service', () => {
    const s = createEmptyState(1);
    expect(pue(s)).toBeNull();
    addBuilding(s, 'pdu', 0, 0);
    addBuilding(s, 'crac', 8, 8);
    const racks = [10, 11, 12].map((x) => addBuilding(s, 'rack', x, 6));
    updatePower(s);
    expect(pue(s)).toBeCloseTo(34 / 30);
    racks[0].status = 'failed';
    updatePower(s);
    expect(pue(s)).toBeCloseTo(24 / 20);
  });

  it('disponibilité : temps de service des racks installés', () => {
    const s = createEmptyState(1);
    expect(availability(s)).toBeNull();
    addBuilding(s, 'pdu', 0, 0);
    const [a] = [10, 11].map((x) => addBuilding(s, 'rack', x, 6));
    addBuilding(s, 'rack', 12, 6, true); // chantier : ne compte pas
    updatePower(s);
    updateEconomy(s, 1);
    expect(availability(s)).toBe(1);
    a.status = 'failed';
    updatePower(s);
    updateEconomy(s, 1);
    expect(availability(s)).toBeCloseTo(3 / 4);
  });
});
