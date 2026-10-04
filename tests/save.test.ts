import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT, SaveManager, deserialize, serialize } from '../src/save';
import type { KeyValueStore } from '../src/settings';
import { step } from '../src/sim/sim';
import { addBuilding, createInitialState, type GameState } from '../src/sim/state';
import { runSeconds } from './helpers';

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** Une partie un peu avancée : racks, contrat, chaleur, pannes possibles. */
function playedGame(seed = 31): GameState {
  const s = createInitialState(seed);
  addBuilding(s, 'pdu', 2, 1);
  for (let i = 0; i < 5; i++) addBuilding(s, 'rack', 10 + i, 6);
  s.commands.push({ type: 'acceptJob', id: s.jobs[0].id });
  runSeconds(s, 200);
  return s;
}

const strip = (s: GameState) => JSON.parse(JSON.stringify({ ...s, commands: [], events: [] }));

describe('sauvegarde', () => {
  it('un aller-retour redonne la même partie, qui continue à l’identique', () => {
    const s = playedGame();
    const loaded = deserialize(serialize(s, 'test'));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(strip(loaded.state)).toEqual(strip(s));
    // Même graine, même état : la suite de la partie est identique (déterminisme).
    for (let i = 0; i < 600; i++) {
      step(s);
      step(loaded.state);
      s.events.length = loaded.state.events.length = 0;
    }
    expect(strip(loaded.state)).toEqual(strip(s));
  });

  it('n’écrit pas les champs passagers', () => {
    const s = playedGame();
    s.commands.push({ type: 'hire' });
    s.events.push({ type: 'info', message: 'x', time: 0 });
    const file = JSON.parse(serialize(s, 'test'));
    expect(file.format).toBe(SAVE_FORMAT);
    expect(file.state.commands).toBeUndefined();
    expect(file.state.events).toBeUndefined();
    expect(file.summary.racks).toBe(5);
  });

  it('refuse proprement les fichiers corrompus ou d’une version plus récente', () => {
    const good = JSON.parse(serialize(playedGame(), 'test'));
    const variants: [string, unknown][] = [
      ['pas du json', '{oups'],
      ['format futur', { ...good, format: SAVE_FORMAT + 1 }],
      ['grille incohérente', { ...good, state: { ...good.state, temp: good.state.temp.slice(1) } }],
      ['équipement hors salle', { ...good, state: { ...good.state, buildings: [{ ...good.state.buildings[0], x: 999 }] } }],
      ['vitesse inconnue', { ...good, state: { ...good.state, speed: 3 } }],
      ['case en désaccord', { ...good, state: { ...good.state, occupant: good.state.occupant.map(() => -1) } }],
    ];
    for (const [, v] of variants) {
      const r = deserialize(typeof v === 'string' ? v : JSON.stringify(v));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
  });

  it('migre une sauvegarde de la bêta 0.9 (format 1)', () => {
    const s = playedGame();
    s.buildings[3].failures = 2;
    const file = JSON.parse(serialize(s, '0.9.0-beta'));
    // Ce que la bêta 0.9 écrivait : ni alertes ni compteurs d'exploitation.
    file.format = 1;
    delete file.state.alerts;
    for (const k of ['failures', 'rackSecondsInstalled', 'rackSecondsActive']) delete file.state.economy[k];
    const r = deserialize(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.format).toBe(SAVE_FORMAT);
    expect(r.state.alerts).toEqual({ hotRacks: [], power: false, lateJobs: [], cash: false, unattended: [], upsLow: false, wornRacks: [] });
    expect(r.state.economy.failures).toBe(s.buildings.reduce((n, b) => n + b.failures, 0));
    expect(r.state.economy.rackSecondsActive).toBe(0);
    runSeconds(r.state, 60);
    expect(r.state.economy.rackSecondsActive).toBeGreaterThan(0);
  });

  it('migre une sauvegarde au format 3 (énergie de secours absente)', () => {
    const s = playedGame();
    const file = JSON.parse(serialize(s, '0.10.0-beta'));
    file.format = 3;
    delete file.state.incidents;
    delete file.state.rules.incidents;
    delete file.state.economy.ledger.fuel;
    delete file.state.alerts.upsLow;
    for (const k of ['grid', 'backupKW', 'generatorKW', 'upsKW', 'chargeKW']) delete file.state.power[k];
    const r = deserialize(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.incidents).toEqual({ outageEndsAt: null, nextOutageAt: null, outages: 0, heatwaveEndsAt: null, nextHeatwaveAt: null });
    expect(r.state.rules.incidents).toBe(false);
    expect(r.state.economy.ledger.fuel).toBe(0);
    runSeconds(r.state, 10);
    expect(r.state.power.grid).toBe(true);
  });

  it('gère les emplacements et désigne la plus récente', () => {
    const m = new SaveManager(memoryStore(), 'test');
    expect(m.latest()).toBeNull();
    expect(m.load(1).ok).toBe(false);
    const a = playedGame(1);
    expect(m.save(1, a)).toBeNull();
    const b = playedGame(2);
    expect(m.save('auto', b)).toBeNull();
    const slots = m.list();
    expect(slots.map((x) => x.slot).sort()).toEqual([1, 'auto'].sort());
    expect(m.latest()).not.toBeNull();
    const back = m.load(1);
    expect(back.ok && back.state.seed).toBe(1);
    m.remove(1);
    expect(m.list().map((x) => x.slot)).toEqual(['auto']);
  });

  it('signale un stockage plein au lieu de planter', () => {
    const full: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(new SaveManager(full, 'test').save('auto', playedGame())).toMatch(/stockage/);
  });
});
