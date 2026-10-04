import { describe, expect, it } from 'vitest';
import type { Job } from '../src/sim/entities';
import { addBuilding, addTech, createEmptyState, idx, type EventCode, type GameState } from '../src/sim/state';
import { availability, pue } from '../src/sim/stats';
import { predictCompletion, updateAlerts } from '../src/sim/systems/alerts';
import { updateEconomy } from '../src/sim/systems/economy';
import { updatePower } from '../src/sim/systems/power';

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
  const job: Job = {
    id,
    name: `Contrat ${id}`,
    status: 'active',
    rateCU: o.rate,
    durationS: o.work / o.rate,
    work: o.work,
    progress: 0,
    deadlineInS,
    payment: 1000,
    penalty: 500,
    offeredAt: 0,
    expiresAt: 0,
    deadline,
    allocated: 0,
  };
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
    expect(at(33)).toBe(1);
    expect(at(33)).toBe(0);
    expect(at(31)).toBe(0); // encore au-dessus du seuil de réarmement
    expect(at(33)).toBe(0);
    expect(at(29)).toBe(0); // réarmée
    expect(at(33)).toBe(1);
  });

  it('surchauffe : plusieurs racks d’un coup donnent une seule alerte, sur le plus chaud', () => {
    const s = createEmptyState(1);
    addBuilding(s, 'pdu', 0, 0);
    for (const x of [5, 6, 7]) addBuilding(s, 'rack', x, 5);
    updatePower(s);
    s.temp[idx(s, 5, 5)] = 33;
    s.temp[idx(s, 6, 5)] = 36;
    s.temp[idx(s, 7, 5)] = 34;
    expect(alertsOf(s, 'overheat')).toBe(1);
    expect(s.events[0].cell).toEqual({ x: 6, y: 5 });
    expect(s.events[0].message).toMatch(/3 racks/);
  });

  it('énergie : alerte à 90 % de la capacité, réarmée sous 85 %', () => {
    const s = createEmptyState(1);
    const at = (demandKW: number) => {
      s.power = { capacityKW: 40, demandKW, loadKW: Math.min(demandKW, 40), shedCount: 0 };
      return alertsOf(s, 'powerHigh');
    };
    expect(at(36)).toBe(1);
    expect(at(38)).toBe(0);
    expect(at(35)).toBe(0); // 87,5 % : pas encore réarmée
    expect(at(33)).toBe(0); // 82,5 % : réarmée
    expect(at(37)).toBe(1);
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
    activeJob(s, 1, { rate: 20, work: 1200, deadlineIn: 150, startedAgo: 2 });
    expect(alertsOf(s, 'lateRisk')).toBe(0);
    s.time += 4;
    expect(alertsOf(s, 'lateRisk')).toBe(1);
  });

  it('trésorerie : alerte sous 60 s de dépenses, réarmée au-delà de 120 s', () => {
    const s = createEmptyState(1);
    s.economy.electricityPerS = 9;
    s.economy.salariesPerS = 1;
    const at = (money: number) => {
      s.money = money;
      return alertsOf(s, 'cashLow');
    };
    expect(at(5000)).toBe(0);
    expect(at(590)).toBe(1);
    expect(at(500)).toBe(0);
    expect(at(1100)).toBe(0); // 110 s : pas encore réarmée
    expect(at(1300)).toBe(0); // réarmée
    expect(at(-50)).toBe(0); // dans le rouge : le compte à rebours de faillite prend le relais
    expect(at(400)).toBe(1);
  });

  it('panne sans technicien : alerte après 20 s, sauf si une réparation est demandée', () => {
    const s = createEmptyState(1);
    const rack = addBuilding(s, 'rack', 5, 5);
    rack.status = 'failed';
    const tech = addTech(s);
    const at = (time: number) => {
      s.time = time;
      return alertsOf(s, 'unattended');
    };
    expect(at(0)).toBe(0);
    expect(at(19)).toBe(0);
    expect(at(20)).toBe(1);
    expect(at(40)).toBe(0);

    // Un ordre de réparation efface l'attente ; s'il est annulé, le décompte repart.
    tech.tasks.push({ type: 'repair', target: rack.id });
    expect(at(41)).toBe(0);
    tech.tasks = [];
    expect(at(42)).toBe(0);
    expect(at(61)).toBe(0);
    expect(at(62)).toBe(1);
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
