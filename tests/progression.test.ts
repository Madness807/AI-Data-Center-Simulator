import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/save';
import { BUILD_COST, ECONOMY, NETWORK, RACK } from '../src/sim/balance';
import { processCommands } from '../src/sim/commands';
import type { Job } from '../src/sim/entities';
import { deliveryReputation, gainReputation, modifiers, promote, researchBlocker, TIERS } from '../src/sim/progression';
import { researchById } from '../src/sim/research';
import { addBuilding, addTech, createInitialState, idx, type GameState } from '../src/sim/state';
import { freeCapacity } from '../src/sim/stats';
import { updateEconomy } from '../src/sim/systems/economy';
import { updateHeat } from '../src/sim/systems/heat';
import { clientsFor, generateOffer, updateJobs } from '../src/sim/systems/jobs';
import { updatePower } from '../src/sim/systems/power';
import { updateTechnicians } from '../src/sim/systems/technicians';
import { room, testJob } from './helpers';

/** Carrière avec `racks` racks en service (alimentés). */
function career(racks = 3): GameState {
  const s = room(7, { pdus: 2, offers: true });
  for (let i = 0; i < racks; i++) addBuilding(s, 'rack', 4 + i, 4);
  updatePower(s);
  return s;
}

const job = (id: number, rateCU: number, work: number): Job => testJob({ id, rateCU, work, durationS: work / rateCU });

describe('recherche', () => {
  it('la part réservée produit des points et termine le nœud en cours', () => {
    const s = career(3); // 30 CU/s
    s.research.share = 0.2; // 6 CU/s → 0,6 point/s
    s.commands.push({ type: 'startResearch', id: 'auto-repair' }); // 300 points
    processCommands(s);
    for (let t = 0; t < 499; t++) updateJobs(s, 1);
    expect(s.research.done).toEqual([]);
    expect(s.research.ratePerS).toBeCloseTo(0.6);
    s.events = [];
    updateJobs(s, 1);
    expect(s.research.done).toEqual(['auto-repair']);
    expect(s.research.current).toBeNull();
    expect(s.events.map((e) => e.code)).toContain('researchDone');
  });

  it('la R&D passe avant les contrats ; sans nœud en cours, tout va aux contrats', () => {
    const s = career(3);
    s.jobs.push(job(1, 30, 3000));
    s.research.share = 0.2;
    updateJobs(s, 1);
    expect(s.jobs[0].allocated).toBe(30); // aucun nœud : rien n'est réservé
    s.research.current = 'auto-repair';
    updateJobs(s, 1);
    expect(s.jobs[0].allocated).toBeCloseTo(24);
    expect(freeCapacity(s)).toBeCloseTo(30 - 6 - 30);
  });

  it('l’ordonnanceur opportuniste donne à la recherche le calcul inactif', () => {
    const s = career(3);
    s.jobs.push(job(1, 10, 3000));
    s.research.share = 0.2;
    s.research.current = 'crac-he';
    updateJobs(s, 1);
    expect(s.research.ratePerS).toBeCloseTo(0.6);
    s.research.done.push('opportunistic');
    updateJobs(s, 1);
    expect(s.research.ratePerS).toBeCloseTo(2); // 30 − 10 pour le contrat = 20 CU/s
    expect(s.compute.used).toBe(30);
  });

  it('prérequis, mode et nœuds déjà faits bloquent le lancement', () => {
    const s = career();
    expect(researchBlocker(s, 'fast-techs')).toMatch(/Réparations automatiques/);
    expect(researchBlocker(s, 'auto-repair')).toBeNull();
    s.research.done.push('auto-repair');
    expect(researchBlocker(s, 'auto-repair')).toMatch(/terminée/);
    expect(researchBlocker(s, 'fast-techs')).toBeNull();
    expect(researchBlocker(s, 'inconnu')).toMatch(/inconnue/);

    const quick = createInitialState(3);
    quick.commands.push({ type: 'startResearch', id: 'auto-repair' });
    processCommands(quick);
    expect(quick.research.current).toBeNull();
    expect(quick.events.at(-1)?.message).toMatch(/carrière/);
  });

  it('les effets se cumulent : froid, énergie, vitesse des techniciens', () => {
    const s = career(0);
    expect(modifiers(s).pduCapacityKW).toBe(40);
    s.research.done.push('pdu-hc', 'crac-he', 'auto-repair', 'fast-techs');
    const m = modifiers(s);
    expect(m.pduCapacityKW).toBe(60);
    expect(m.cracCoolingKW).toBeCloseTo(36);
    expect(m.techSpeed).toBeCloseTo(3.9);
    expect(m.autoRepair).toBe(true);
    updatePower(s);
    expect(s.power.capacityKW).toBe(120);

    // Un CRAC amélioré retire plus de chaleur d'une case chaude.
    const hot = (done: string[]) => {
      const t = career(0);
      t.research.done.push(...done);
      addBuilding(t, 'crac', 10, 10);
      updatePower(t);
      t.temp[idx(t, 11, 10)] = 60;
      updateHeat(t, 0.1);
      return t.temp[idx(t, 11, 10)];
    };
    expect(hot(['crac-he'])).toBeLessThan(hot([]));
  });

  it('réparations automatiques : un technicien libre part réparer, sauf si le réglage est coupé', () => {
    const s = career(2);
    const rack = s.buildings.find((b) => b.kind === 'rack')!;
    rack.status = 'failed';
    const tech = addTech(s, { x: 4, y: 6 });
    updateTechnicians(s, 0.1);
    expect(tech.tasks).toEqual([]); // pas encore étudié
    s.research.done.push('auto-repair');
    s.policies.autoRepair = false;
    updateTechnicians(s, 0.1);
    expect(tech.tasks).toEqual([]);
    s.policies.autoRepair = true;
    updateTechnicians(s, 0.1);
    expect(tech.tasks).toEqual([{ type: 'repair', target: rack.id }]);
  });
});

describe('réputation et paliers', () => {
  it('une livraison rapporte selon la taille, un retard coûte, jamais sous zéro', () => {
    expect(deliveryReputation(job(1, 20, 1))).toBe(12);
    expect(deliveryReputation(job(1, 80, 1))).toBe(18);
    const s = career();
    gainReputation(s, -25);
    expect(s.career.reputation).toBe(0);
  });

  it('passage de palier, plusieurs d’un coup si besoin, puis victoire au dernier', () => {
    const s = career();
    gainReputation(s, TIERS[1].reputation);
    expect(s.career.tier).toBe(1);
    expect(s.events.at(-1)?.code).toBe('tierUp');
    s.events = [];
    // La réputation ne suffit pas : les derniers paliers exigent aussi du calcul en service.
    gainReputation(s, TIERS[3].reputation);
    expect(s.career.tier).toBe(1);
    s.compute.total = TIERS[3].computeCU ?? 0;
    promote(s);
    expect(s.career.tier).toBe(3);
    expect(s.outcome).toBe('won');
    expect(s.events.map((e) => e.code)).toEqual(['tierUp', 'won']);
  });

  it('en carrière, l’argent ne fait pas gagner ; en partie rapide, si', () => {
    const c = career();
    c.money = ECONOMY.goalMoney * 2;
    updateEconomy(c, 0.1);
    expect(c.outcome).toBe('playing');
    const q = createInitialState(1);
    q.money = ECONOMY.goalMoney + 100; // les salaires du tick passent avant le contrôle
    updateEconomy(q, 0.1);
    expect(q.outcome).toBe('won');
  });

  it('les offres suivent le palier : taille plafonnée, prix majorés', () => {
    const at = (tier: number) => {
      const s = career(20);
      s.career.tier = tier;
      s.rng = 99;
      return Array.from({ length: 40 }, () => generateOffer(s));
    };
    const startup = at(0);
    expect(Math.max(...startup.map((o) => o.rateCU))).toBeLessThanOrEqual(TIERS[0].maxUnits * RACK.computeCU);
    const top = at(3);
    expect(Math.max(...top.map((o) => o.rateCU))).toBeGreaterThan(TIERS[0].maxUnits * RACK.computeCU);
    // Même tirage, prix majorés de 30 % (aux arrondis près).
    const pricePerWork = (offers: Job[]) => offers.reduce((sum, o) => sum + o.payment / o.work, 0) / offers.length;
    const base = at(0).filter((o) => o.rateCU <= 40);
    const rich = at(3).slice(0, base.length);
    expect(pricePerWork(rich)).toBeGreaterThan(pricePerWork(base) * 1.2);
  });

  it('chaque palier amène ses clients ; la partie rapide garde les premiers', () => {
    const client = (o: Job) => o.name.split(' — ')[1].replace(/ \(SLA.*$/, '');
    const clients = (s: GameState) => new Set(Array.from({ length: 60 }, () => client(generateOffer(s))));
    const q = createInitialState(1);
    const first = clientsFor(q);
    expect([...clients(q)].every((n) => first.includes(n))).toBe(true);
    const c = career(20);
    c.career.tier = 3;
    const top = [...clients(c)];
    expect(top.every((n) => clientsFor(c).includes(n))).toBe(true);
    expect(top.some((n) => !first.includes(n))).toBe(true);
  });
});

describe('modes et sauvegarde', () => {
  it('une carrière se sauvegarde et se recharge avec sa progression', () => {
    const s = createInitialState(5, 'career');
    s.career = { reputation: 140, tier: 1 };
    s.research = { share: 0.3, current: 'pdu-hc', progress: { 'pdu-hc': 120 }, done: ['auto-repair'], ratePerS: 0 };
    s.policies.autoRepair = false;
    const r = deserialize(serialize(s, 'test'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.mode).toBe('career');
    expect(r.state.career).toEqual({ reputation: 140, tier: 1 });
    expect(r.state.research.done).toEqual(['auto-repair']);
    expect(r.file.summary.tier).toBe(1);
  });

  it('une sauvegarde au format 2 (0.10) se recharge en partie rapide', () => {
    const s = createInitialState(5);
    addBuilding(s, 'rack', 10, 6);
    const file = JSON.parse(serialize(s, '0.10.0-beta'));
    file.format = 2;
    for (const k of ['mode', 'rules', 'career', 'research', 'policies']) delete file.state[k];
    const r = deserialize(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.mode).toBe('quick');
    expect(r.state.rules.progression).toBe(false);
    expect(r.state.research.done).toEqual([]);
  });

  it('branche Réseau : la Fabric après les switchs, l’optique après la Fabric ; le Labo d’IA annonce la règle', () => {
    expect(researchById('fabric')).toMatchObject({ branch: 'network', level: 3, requires: ['switches'] });
    expect(researchById('optical')).toMatchObject({ branch: 'network', level: 4, requires: ['fabric'] });
    const s = career();
    expect(modifiers(s).fabric).toBe(false);
    s.research.done.push('switches', 'fabric');
    expect(modifiers(s).fabric).toBe(true);
    expect(TIERS[1].perks.join(' ')).toMatch(/switchs réseau/);
    expect(TIERS[NETWORK.minTier].perks.join(' ')).toMatch(/câblé à un switch/);
  });

  it('la carrière démarre comme la partie rapide, recherche comprise à zéro', () => {
    const c = createInitialState(9, 'career');
    const q = createInitialState(9);
    expect(c.buildings).toEqual(q.buildings);
    expect(c.money).toBe(q.money);
    expect(c.rules.progression).toBe(true);
    expect(c.research.current).toBeNull();
    expect(BUILD_COST.rack).toBeGreaterThan(0);
  });
});
