import { describe, expect, it } from 'vitest';
import { serialize } from '../src/save';
import { addBuilding, addTech, createEmptyState, type GameState } from '../src/sim/state';
import { COMPETENT, playBot, type BotRun } from './bot';
import { runSeconds } from './helpers';

/**
 * Empreinte temporaire du jalon Réseau (à retirer au dernier lot) : la partie rapide doit
 * rester identique au bit près. Le hash porte sur l'état et le résumé sérialisés, clés triées,
 * sans l'en-tête du fichier (le format change) ni la nouvelle règle `network`.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical((value as Record<string, unknown>)[k]);
    return out;
  }
  return value;
}

/** cyrb53 : hash 53 bits, largement assez pour détecter un écart. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function fingerprint(s: GameState, extra: unknown = null): string {
  const { state, summary } = JSON.parse(serialize(s, 'empreinte', new Date(0)));
  delete state.rules.network;
  return hash(JSON.stringify(canonical({ state, summary, extra })));
}

const ofRun = (r: BotRun) => fingerprint(r.state, { tierAt: r.tierAt, researchAt: r.researchAt, wonAt: r.wonAt, lostAt: r.lostAt, first: r.firstDeliveryAt, maxTemp: r.maxTemp, maxIntake: r.maxIntake });

/** Le scénario du plan (tests/scenario.test.ts), sans les vérifications. */
function scenario(): string {
  const s = createEmptyState(1234);
  s.nextOfferAt = Infinity;
  addBuilding(s, 'pdu', 0, 0);
  const racks = [0, 1, 2].map((i) => addBuilding(s, 'rack', 10 + i, 8));
  const tech = addTech(s);
  runSeconds(s, 120);
  const broken = racks.find((r) => r.status === 'failed') ?? racks[0];
  s.commands.push(
    { type: 'order', techs: [tech.id], task: { type: 'repair', target: broken.id }, append: false },
    { type: 'build', kind: 'pdu', x: 1, y: 0, assign: [tech.id] },
    { type: 'build', kind: 'crac', x: 11, y: 10, assign: [tech.id] },
    { type: 'build', kind: 'crac', x: 11, y: 6, assign: [tech.id] },
  );
  runSeconds(s, 300);
  return fingerprint(s);
}

/** Relevées sur 3750c50 (v1.0.1), avant le réseau. */
const EXPECTED: Record<string, string> = {
  scenario: '190yz5m8abv',
  'rapide #1': 't2srb007ve',
  'rapide #2': '19qyu7urjxb',
  'rapide #3': '3dnb0y0m08',
};

describe('empreinte du jalon Réseau', () => {
  it('la partie rapide reste identique au bit près', () => {
    const got: Record<string, string> = {
      scenario: scenario(),
      'rapide #1': ofRun(playBot(1, COMPETENT, 45 * 60)),
      'rapide #2': ofRun(playBot(2, COMPETENT, 45 * 60)),
      'rapide #3': ofRun(playBot(3, COMPETENT, 45 * 60)),
    };
    expect(got).toEqual(EXPECTED);
  }, 60_000);
});
