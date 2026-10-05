import { UI_SCALES, type UiScale } from './ui/layout';

/**
 * Options du joueur, conservées entre les parties. Le stockage du navigateur peut être
 * indisponible (navigation privée, stockage bloqué) : on retombe alors sur une mémoire
 * locale, et le jeu fonctionne quand même.
 */

export interface Settings {
  /** Volumes, de 0 à 1. */
  volumeMaster: number;
  volumeSfx: number;
  volumeAmbience: number;
  shadows: boolean;
  /** Netteté du rendu : 1 = normale (économe), 2 = haute (écrans Retina). */
  pixelRatio: 1 | 2;
  /** Pris en compte au prochain lancement (le contexte WebGL doit être recréé). */
  antialias: boolean;
  edgePan: boolean;
  uiScale: UiScale;
  colorblind: boolean;
  /** Conseils de carrière déjà affichés : chacun ne s'affiche qu'une fois. */
  tipsSeen: readonly string[];
}

export const DEFAULT_SETTINGS: Settings = {
  volumeMaster: 0.8,
  volumeSfx: 0.8,
  volumeAmbience: 0.5,
  shadows: true,
  pixelRatio: 2,
  antialias: true,
  edgePan: false,
  uiScale: 1,
  colorblind: false,
  tipsSeen: [],
};

export const SETTINGS_KEY = 'datacenter-ia.settings';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Le stockage du navigateur, ou une mémoire locale s'il est inaccessible. */
export function safeStorage(): KeyValueStore {
  try {
    const probe = '__probe__';
    localStorage.setItem(probe, probe);
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => void memory.set(k, v),
      removeItem: (k) => void memory.delete(k),
    };
  }
}

const isVolume = (v: unknown): v is number => typeof v === 'number' && v >= 0 && v <= 1;

/** Ne garde que les valeurs valides : une option corrompue reprend sa valeur par défaut. */
export function sanitizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  if (isVolume(r.volumeMaster)) s.volumeMaster = r.volumeMaster;
  if (isVolume(r.volumeSfx)) s.volumeSfx = r.volumeSfx;
  if (isVolume(r.volumeAmbience)) s.volumeAmbience = r.volumeAmbience;
  for (const k of ['shadows', 'antialias', 'edgePan', 'colorblind'] as const) if (typeof r[k] === 'boolean') s[k] = r[k];
  if (r.pixelRatio === 1 || r.pixelRatio === 2) s.pixelRatio = r.pixelRatio;
  if ((UI_SCALES as readonly unknown[]).includes(r.uiScale)) s.uiScale = r.uiScale as UiScale;
  s.tipsSeen = Array.isArray(r.tipsSeen) ? [...new Set(r.tipsSeen.filter((id): id is string => typeof id === 'string'))].slice(0, 50) : [];
  return s;
}

/** Options courantes, avec notification des changements. */
export class SettingsStore {
  private current: Settings;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(private readonly storage: KeyValueStore = safeStorage()) {
    let raw: unknown = null;
    try {
      raw = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null');
    } catch {
      raw = null;
    }
    this.current = sanitizeSettings(raw);
  }

  get value(): Readonly<Settings> {
    return this.current;
  }

  update(patch: Partial<Settings>): void {
    this.current = sanitizeSettings({ ...this.current, ...patch });
    try {
      this.storage.setItem(SETTINGS_KEY, JSON.stringify(this.current));
    } catch {
      // Stockage plein ou bloqué : l'option s'applique quand même pour cette session.
    }
    for (const fn of this.listeners) fn(this.current);
  }

  /** Appelle `fn` tout de suite puis à chaque changement. */
  subscribe(fn: (s: Settings) => void): void {
    this.listeners.add(fn);
    fn(this.current);
  }
}
