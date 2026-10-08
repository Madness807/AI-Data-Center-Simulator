import { describe, expect, it } from 'vitest';
import { JOBS } from '../src/sim/balance';
import { modifiers } from '../src/sim/progression';
import { createInitialState, type GameState } from '../src/sim/state';
import { generateOffer } from '../src/sim/systems/jobs';

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
