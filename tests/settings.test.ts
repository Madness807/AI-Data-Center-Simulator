import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/report';
import { DEFAULT_SETTINGS, SETTINGS_KEY, SettingsStore, sanitizeSettings, type KeyValueStore } from '../src/settings';
import { createInitialState, notify } from '../src/sim/state';

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('options', () => {
  it('valeurs par défaut sans stockage, ni stockage illisible', () => {
    expect(new SettingsStore(memoryStore()).value).toEqual(DEFAULT_SETTINGS);
    expect(new SettingsStore(memoryStore({ [SETTINGS_KEY]: '{pas du json' })).value).toEqual(DEFAULT_SETTINGS);
  });

  it('ignore les valeurs invalides, garde les valides', () => {
    const s = sanitizeSettings({ volumeMaster: 3, volumeSfx: 0.2, shadows: 'oui', uiScale: 1.15, pixelRatio: 7, colorblind: true });
    expect(s.volumeMaster).toBe(DEFAULT_SETTINGS.volumeMaster);
    expect(s.volumeSfx).toBe(0.2);
    expect(s.shadows).toBe(DEFAULT_SETTINGS.shadows);
    expect(s.uiScale).toBe(1.15);
    expect(s.pixelRatio).toBe(DEFAULT_SETTINGS.pixelRatio);
    expect(s.colorblind).toBe(true);
  });

  it('persiste et prévient les abonnés', () => {
    const storage = memoryStore();
    const store = new SettingsStore(storage);
    const seen: boolean[] = [];
    store.subscribe((s) => seen.push(s.shadows));
    store.update({ shadows: false });
    expect(seen).toEqual([true, false]);
    expect(new SettingsStore(storage).value.shadows).toBe(false);
  });
});

describe('rapport de bug', () => {
  it('contient la version, la graine, les options, les événements et l’erreur', () => {
    const s = createInitialState(4242);
    notify(s, 'warning', 'Panne du rack 3,3 (51 °C)', { cell: { x: 3, y: 3 }, code: 'failure' });
    const report = buildReport(
      { state: s, settings: DEFAULT_SETTINGS, events: s.events, error: new Error('boum'), environment: { userAgent: 'Test', screen: '800x600' } },
      '0.9.0-beta',
      new Date('2026-10-04T12:00:00Z'),
    );
    for (const part of ['0.9.0-beta', 'Graine : 4242', 'Panne du rack 3,3', 'boum', 'Navigateur : Test', '"shadows":true']) {
      expect(report).toContain(part);
    }
  });
});
