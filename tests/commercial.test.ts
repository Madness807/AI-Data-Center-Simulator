import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/save';
import { COMMERCIAL, JOBS } from '../src/sim/balance';
import { defaultCommercial } from '../src/sim/career';
import type { Job } from '../src/sim/entities';
import { modifiers } from '../src/sim/progression';
import { step } from '../src/sim/sim';
import { addBuilding, createInitialState, type GameState } from '../src/sim/state';
import { committedCompute } from '../src/sim/stats';
import { autoAcceptOffers } from '../src/sim/systems/commercial';
import { generateOffer } from '../src/sim/systems/jobs';
import { room, runSeconds, testJob } from './helpers';

/** Une carrière au palier donné, avec ces recherches faites (même graine : mêmes tirages). */
function career(done: string[], tier = 3): GameState {
  const s = createInitialState(7, 'career');
  s.career.tier = tier;
  s.research.done.push(...done);
  return s;
}

/** Offres générées à la suite, depuis le même état de départ. */
const offers = (s: GameState, n = 30) => Array.from({ length: n }, () => generateOffer(s));

describe('branche Commercial : effets sur les offres', () => {
  it('Négociation paie plus, pénalité comprise', () => {
    const base = offers(career([]));
    const better = offers(career(['negotiation']));
    const m = modifiers(career(['negotiation'])).priceMult;
    expect(m).toBeGreaterThan(1);
    base.forEach((o, i) => {
      expect(better[i].payment).toBeGreaterThan(o.payment);
      expect(better[i].payment / o.payment).toBeCloseTo(m, 1);
      expect(better[i].penalty).toBeGreaterThanOrEqual(o.penalty);
    });
  });

  it('Fidélisation allonge la validité et l’échéance, sans baisser le prix', () => {
    const base = offers(career([]));
    const loyal = offers(career(['loyalty']));
    const m = modifiers(career(['loyalty']));
    base.forEach((o, i) => {
      expect(loyal[i].payment).toBe(o.payment);
      expect(loyal[i].expiresAt - loyal[i].offeredAt).toBeCloseTo(JOBS.offerExpiry * m.offerExpiryMult);
      expect(loyal[i].deadlineInS).toBeGreaterThan(o.deadlineInS);
    });
  });

  it('Grands comptes relève le plafond de taille du palier', () => {
    const big = (done: string[]) => {
      const s = career(done, 1);
      // Un grand parc : seul le plafond du palier limite la taille.
      for (let i = 0; i < 40; i++) s.buildings.push({ ...s.buildings.find((b) => b.kind === 'pdu')!, id: 1000 + i, kind: 'rack', x: i % 20, y: 10 + Math.floor(i / 20) });
      return Math.max(...offers(s, 200).map((o) => o.rateCU));
    };
    expect(big(['key-accounts'])).toBeGreaterThan(big([]));
  });

  it('ne change rien en partie rapide', () => {
    const quick = (done: string[]) => {
      const s = createInitialState(7, 'quick');
      s.research.done.push(...done);
      return offers(s);
    };
    expect(quick(['negotiation', 'loyalty', 'key-accounts'])).toEqual(quick([]));
  });

  it('Commercial automatique ouvre l’acceptation automatique', () => {
    expect(modifiers(career([])).autoAccept).toBe(false);
    expect(modifiers(career(['loyalty', 'auto-commercial'])).autoAccept).toBe(true);
  });
});

describe('commercial automatique', () => {
  /** Salle de carrière : `racks` racks G1 en rangée (100 CU/s pour 10), le commercial étudié. */
  function hall(racks = 10, tier = 3): GameState {
    const s = room(31, { mode: 'career', pdus: Math.ceil(racks / 4) + 1, tier });
    for (let x = 0; x < racks; x++) addBuilding(s, 'rack', 2 + x, 6);
    s.research.done.push('loyalty', 'auto-commercial');
    runSeconds(s, 0.5);
    return s;
  }
  const offer = (o: Partial<Job> & Pick<Job, 'id'>) => testJob({ status: 'offer', deadline: 0, expiresAt: 1e6, ...o, work: (o.rateCU ?? 10) * 100 });
  const accepted = (s: GameState) => s.jobs.filter((j) => j.status === 'active').map((j) => j.id).sort();

  it('ne promet jamais plus que le calcul en service moins la marge, les mieux payées d’abord', () => {
    const s = hall();
    expect(s.compute.total).toBe(100);
    s.jobs = [offer({ id: 1, rateCU: 60, payment: 6000 }), offer({ id: 2, rateCU: 30, payment: 6000 }), offer({ id: 3, rateCU: 20, payment: 1000 })];
    autoAcceptOffers(s);
    // Marge de 20 % : 80 CU/s au plus. La 2 (la mieux payée par CU) passe, puis la 1 ne tient plus, la 3 si.
    expect(accepted(s)).toEqual([2, 3]);
    expect(committedCompute(s)).toBeLessThanOrEqual(s.compute.total * (1 - COMMERCIAL.margin));
    expect(s.events.filter((e) => e.code === 'autoAccepted')).toHaveLength(2);
  });

  it('respecte les types cochés et le prix minimum', () => {
    const s = hall();
    s.policies.commercial = { ...s.policies.commercial, sla: false, minPricePerCU: 0.5 };
    s.jobs = [offer({ id: 1, rateCU: 10, sla: true, payment: 5000 }), offer({ id: 2, rateCU: 10, payment: 400 }), offer({ id: 3, rateCU: 10, payment: 600 })];
    autoAcceptOffers(s);
    expect(accepted(s)).toEqual([3]);
  });

  it('garde une marge plus large pour un SLA', () => {
    const s = hall();
    s.jobs = [offer({ id: 1, rateCU: 75, sla: true, payment: 9000 })];
    autoAcceptOffers(s);
    expect(accepted(s)).toEqual([]);
    s.jobs = [offer({ id: 2, rateCU: 75, payment: 9000 })];
    autoAcceptOffers(s);
    expect(accepted(s)).toEqual([2]);
  });

  it('ne prend un entraînement que si un bloc libre assez grand existe', () => {
    const s = hall(6, 1);
    s.jobs = [offer({ id: 1, kind: 'training', cluster: 8, rateCU: 0, payment: 9000 }), offer({ id: 2, kind: 'training', cluster: 4, rateCU: 0, payment: 9000 })];
    autoAcceptOffers(s);
    expect(accepted(s)).toEqual([2]);
  });

  it('ne fait rien sans la recherche, réglage éteint, ou pendant une coupure', () => {
    const none = hall();
    none.research.done = [];
    none.jobs = [offer({ id: 1 })];
    autoAcceptOffers(none);
    expect(accepted(none)).toEqual([]);

    const off = hall();
    off.policies.commercial.enabled = false;
    off.jobs = [offer({ id: 1 })];
    autoAcceptOffers(off);
    expect(accepted(off)).toEqual([]);

    const outage = hall();
    outage.power.grid = false;
    outage.jobs = [offer({ id: 1 })];
    autoAcceptOffers(outage);
    expect(accepted(outage)).toEqual([]);
  });

  it('borne les réglages reçus', () => {
    const s = hall();
    s.commands.push({ type: 'setPolicy', commercial: { margin: 5, minPricePerCU: -1, training: false } });
    step(s);
    expect(s.policies.commercial).toMatchObject({ margin: Math.max(...COMMERCIAL.margins), minPricePerCU: 0, training: false, inference: true });
  });

  it('garde ses réglages à la sauvegarde ; une partie au format 9 reçoit les réglages par défaut', () => {
    const s = hall();
    s.policies.commercial = { ...s.policies.commercial, margin: 0.3, sla: false };
    const r = deserialize(serialize(s, 'test'));
    expect(r.ok && r.state.policies.commercial).toEqual(s.policies.commercial);
    const old = JSON.parse(serialize(s, '1.2.0'));
    old.format = 9;
    delete old.state.policies.commercial;
    const m = deserialize(JSON.stringify(old));
    expect(m.ok && m.state.policies.commercial).toEqual(defaultCommercial());
  });
});
