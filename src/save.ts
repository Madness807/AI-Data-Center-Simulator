import type { KeyValueStore } from './settings';
import type { Building, Job, Technician } from './sim/entities';
import type { GameState, Outcome } from './sim/state';

/** Format des fichiers de sauvegarde ; à incrémenter (avec une migration) s'il change. */
export const SAVE_FORMAT = 1;

export type SaveSlot = 'auto' | 1 | 2 | 3;
export const SAVE_SLOTS: readonly SaveSlot[] = ['auto', 1, 2, 3];

export interface SaveSummary {
  time: number;
  money: number;
  racks: number;
  outcome: Outcome;
}

export interface SaveFile {
  format: number;
  version: string;
  savedAt: string;
  summary: SaveSummary;
  state: Omit<GameState, 'commands' | 'events'>;
}

export type LoadResult = { ok: true; state: GameState; file: SaveFile } | { ok: false; error: string };

export function summarize(s: GameState): SaveSummary {
  return {
    time: s.time,
    money: Math.round(s.money),
    racks: s.buildings.filter((b) => b.kind === 'rack').length,
    outcome: s.outcome,
  };
}

/** L'état est fait de données simples : on l'écrit tel quel, sans les champs passagers. */
export function serialize(s: GameState, version: string, now = new Date()): string {
  const { commands: _commands, events: _events, ...persisted } = s;
  const file: SaveFile = { format: SAVE_FORMAT, version, savedAt: now.toISOString(), summary: summarize(s), state: persisted };
  return JSON.stringify(file);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);

class Invalid extends Error {}
function need(cond: boolean, what: string): asserts cond {
  if (!cond) throw new Invalid(what);
}

function checkBuilding(b: unknown, w: number, h: number): asserts b is Building {
  need(isObject(b), 'équipement illisible');
  need(isInt(b.id) && ['rack', 'crac', 'pdu'].includes(b.kind as string), 'équipement inconnu');
  need(isInt(b.x) && isInt(b.y) && (b.x as number) >= 0 && (b.y as number) >= 0 && (b.x as number) < w && (b.y as number) < h, 'équipement hors de la salle');
  need(['construction', 'ok', 'failed', 'repairing'].includes(b.status as string), 'état d’équipement inconnu');
  need(isNum(b.workLeft) && isInt(b.failures) && typeof b.powered === 'boolean', 'équipement incomplet');
  need(b.builtAt === null || isNum(b.builtAt), 'date de mise en service invalide');
}

function checkTech(t: unknown): asserts t is Technician {
  need(isObject(t) && isInt(t.id) && isNum(t.x) && isNum(t.y) && isNum(t.prevX) && isNum(t.prevY), 'technicien illisible');
  need(Array.isArray(t.tasks) && typeof t.working === 'boolean', 'technicien incomplet');
  need(t.path === null || Array.isArray(t.path), 'chemin de technicien invalide');
}

function checkJob(j: unknown): asserts j is Job {
  need(isObject(j) && isInt(j.id) && typeof j.name === 'string' && ['offer', 'active'].includes(j.status as string), 'contrat illisible');
  for (const k of ['rateCU', 'durationS', 'work', 'progress', 'deadlineInS', 'payment', 'penalty', 'offeredAt', 'expiresAt', 'deadline', 'allocated']) {
    need(isNum(j[k]), 'contrat incomplet');
  }
}

/** Vérifie la forme et la cohérence d'un état chargé (types, grille, occupation des cases). */
function checkState(s: unknown): asserts s is Omit<GameState, 'commands' | 'events'> {
  need(isObject(s), 'partie illisible');
  for (const k of ['seed', 'tick', 'time', 'rng', 'money', 'nextId', 'nextTechId', 'nextJobId', 'nextOfferAt']) need(isNum(s[k]), `valeur « ${k} » manquante`);
  need([0, 1, 2, 4].includes(s.speed as number), 'vitesse invalide');
  need(['playing', 'won', 'lost'].includes(s.outcome as string), 'issue de partie invalide');
  need(isInt(s.w) && isInt(s.h) && (s.w as number) > 0 && (s.h as number) > 0 && (s.w as number) * (s.h as number) <= 10_000, 'taille de salle invalide');
  const cells = (s.w as number) * (s.h as number);
  need(Array.isArray(s.temp) && s.temp.length === cells && s.temp.every(isNum), 'températures incohérentes');
  need(Array.isArray(s.occupant) && s.occupant.length === cells && s.occupant.every(isInt), 'occupation incohérente');
  need(Array.isArray(s.buildings) && Array.isArray(s.techs) && Array.isArray(s.jobs), 'listes manquantes');
  for (const b of s.buildings) checkBuilding(b, s.w as number, s.h as number);
  for (const t of s.techs) checkTech(t);
  for (const j of s.jobs) checkJob(j);
  const occupant = s.occupant as number[];
  for (const b of s.buildings as Building[]) need(occupant[b.y * (s.w as number) + b.x] === b.id, 'équipement et case en désaccord');
  need(isObject(s.power) && isObject(s.compute) && isObject(s.economy) && isObject(s.economy.ledger), 'statistiques manquantes');
}

/** Relit une sauvegarde ; tout problème donne un refus explicite, jamais un état bancal. */
export function deserialize(json: string): LoadResult {
  let file: unknown;
  try {
    file = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Fichier illisible : ce n’est pas une sauvegarde.' };
  }
  if (!isObject(file) || !isInt(file.format)) return { ok: false, error: 'Fichier illisible : ce n’est pas une sauvegarde.' };
  if ((file.format as number) > SAVE_FORMAT) return { ok: false, error: 'Sauvegarde créée par une version plus récente du jeu.' };
  // Point de migration : les formats plus anciens seront convertis ici.
  try {
    checkState(file.state);
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: `Sauvegarde endommagée (${e.message}).` };
    throw e;
  }
  const state: GameState = { ...(file.state as SaveFile['state']), commands: [], events: [] };
  return { ok: true, state, file: file as unknown as SaveFile };
}

const keyOf = (slot: SaveSlot) => `datacenter-ia.save.${slot}`;

export interface SlotInfo {
  slot: SaveSlot;
  savedAt: string;
  summary: SaveSummary;
}

/** Emplacements de sauvegarde dans le stockage du navigateur. */
export class SaveManager {
  constructor(
    private readonly storage: KeyValueStore,
    private readonly version: string,
  ) {}

  /** Renvoie null si tout va bien, sinon le message d'erreur (stockage plein, bloqué…). */
  save(slot: SaveSlot, state: GameState): string | null {
    try {
      this.storage.setItem(keyOf(slot), serialize(state, this.version));
      return null;
    } catch {
      return 'Sauvegarde impossible : le stockage du navigateur est plein ou bloqué.';
    }
  }

  load(slot: SaveSlot): LoadResult {
    const raw = this.storage.getItem(keyOf(slot));
    return raw === null ? { ok: false, error: 'Emplacement vide.' } : deserialize(raw);
  }

  /** Infos de chaque emplacement occupé et lisible. */
  list(): SlotInfo[] {
    const out: SlotInfo[] = [];
    for (const slot of SAVE_SLOTS) {
      const raw = this.storage.getItem(keyOf(slot));
      if (raw === null) continue;
      try {
        const file = JSON.parse(raw) as SaveFile;
        if (file?.summary && typeof file.savedAt === 'string') out.push({ slot, savedAt: file.savedAt, summary: file.summary });
      } catch {
        // Emplacement illisible : ignoré dans la liste, le chargement dira pourquoi.
      }
    }
    return out;
  }

  /** L'emplacement sauvegardé le plus récemment (pour « Continuer »). */
  latest(): SaveSlot | null {
    const all = this.list().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    return all[0]?.slot ?? null;
  }

  remove(slot: SaveSlot): void {
    this.storage.removeItem(keyOf(slot));
  }
}
