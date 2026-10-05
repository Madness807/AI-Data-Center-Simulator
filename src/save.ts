import type { KeyValueStore } from './settings';
import { emptyAlerts } from './sim/alert-memory';
import { NETWORK } from './sim/balance';
import { defaultPolicies, emptyCareer, emptyResearch, GAME_MODES, rulesFor } from './sim/career';
import {
  BUILDING_KINDS,
  BUILDING_STATUSES,
  FACINGS,
  GENS,
  JOB_KINDS,
  JOB_STATUSES,
  SPECIALTIES,
  type Building,
  type Job,
  type Technician,
} from './sim/entities';
import { TIERS } from './sim/progression';
import { emptyCooling, emptyIncidents, emptyPower, OUTCOMES, SPEEDS, type GameState, type Outcome } from './sim/state';

/** Format des fichiers de sauvegarde ; à incrémenter (avec une migration) s'il change. */
export const SAVE_FORMAT = 9;
/** Taille maximale d'une salle relue (garde-fou contre un fichier gonflé). */
const MAX_CELLS = 10_000;

export type SaveSlot = 'auto' | 1 | 2 | 3;
export const SAVE_SLOTS: readonly SaveSlot[] = ['auto', 1, 2, 3];

export interface SaveSummary {
  time: number;
  money: number;
  racks: number;
  outcome: Outcome;
  /** Absents des sauvegardes d'avant la carrière (format 2 et moins). */
  mode?: GameState['mode'];
  tier?: number;
}

/** L'état sauvegardé : tout, sauf les champs passagers (commandes en attente, événements du tick). */
export type PersistedState = Omit<GameState, 'commands' | 'events'>;

export interface SaveFile {
  format: number;
  version: string;
  savedAt: string;
  summary: SaveSummary;
  state: PersistedState;
}

export type LoadResult = { ok: true; state: GameState; file: SaveFile } | { ok: false; error: string };

export function summarize(s: GameState): SaveSummary {
  return {
    time: s.time,
    money: Math.round(s.money),
    racks: s.buildings.filter((b) => b.kind === 'rack').length,
    outcome: s.outcome,
    mode: s.mode,
    tier: s.career.tier,
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
/** La valeur fait-elle partie de la liste (les listes de valeurs viennent des types du jeu) ? */
const oneOf = <T>(list: readonly T[], v: unknown): v is T => (list as readonly unknown[]).includes(v);

class Invalid extends Error {}
function need(cond: boolean, what: string): asserts cond {
  if (!cond) throw new Invalid(what);
}

function checkBuilding(b: unknown, w: number, h: number): asserts b is Building {
  need(isObject(b), 'équipement illisible');
  need(isInt(b.id) && oneOf(BUILDING_KINDS, b.kind), 'équipement inconnu');
  need(isInt(b.x) && isInt(b.y) && b.x >= 0 && b.y >= 0 && b.x < w && b.y < h, 'équipement hors de la salle');
  need(oneOf(BUILDING_STATUSES, b.status), 'état d’équipement inconnu');
  need(isNum(b.workLeft) && isInt(b.failures) && typeof b.powered === 'boolean', 'équipement incomplet');
  need(b.builtAt === null || isNum(b.builtAt), 'date de mise en service invalide');
  need(b.charge === undefined || isNum(b.charge), 'charge d’onduleur invalide');
  need(b.warmup === undefined || isNum(b.warmup), 'état de groupe électrogène invalide');
  need(b.facing === undefined || oneOf(FACINGS, b.facing), 'orientation invalide');
  need(b.gen === undefined || oneOf(GENS, b.gen), 'génération de GPU invalide');
  need(b.wear === undefined || isNum(b.wear), 'usure invalide');
  need((b.upgradeFrom === undefined || oneOf(GENS, b.upgradeFrom)) && (b.upgradePaid === undefined || isNum(b.upgradePaid)), 'modernisation illisible');
  // Un id de switch disparu reste lisible : une sauvegarde faite en pause juste après une
  // démolition en contient, et le passage suivant du réseau le retire.
  need(b.link === undefined || (isInt(b.link) && b.kind === 'rack'), 'câblage réseau illisible');
}

function checkTech(t: unknown): asserts t is Technician {
  need(isObject(t) && isInt(t.id) && isNum(t.x) && isNum(t.y) && isNum(t.prevX) && isNum(t.prevY), 'technicien illisible');
  need(Array.isArray(t.tasks) && typeof t.working === 'boolean', 'technicien incomplet');
  need(t.path === null || Array.isArray(t.path), 'chemin de technicien invalide');
  need(t.specialty === undefined || oneOf(SPECIALTIES, t.specialty), 'spécialité inconnue');
}

function checkJob(j: unknown): asserts j is Job {
  need(isObject(j) && isInt(j.id) && typeof j.name === 'string' && oneOf(JOB_STATUSES, j.status), 'contrat illisible');
  for (const k of ['rateCU', 'durationS', 'work', 'progress', 'deadlineInS', 'payment', 'penalty', 'offeredAt', 'expiresAt', 'deadline', 'allocated']) {
    need(isNum(j[k]), 'contrat incomplet');
  }
  need(j.kind === undefined || oneOf(JOB_KINDS, j.kind), 'type de contrat inconnu');
  need(j.assigned === undefined || (Array.isArray(j.assigned) && j.assigned.every(isInt)), 'bloc d’entraînement illisible');
  need(j.cluster === undefined || isInt(j.cluster), 'taille de bloc invalide');
  need(j.minGen === undefined || oneOf(GENS, j.minGen), 'génération de bloc invalide');
  need((j.sla === undefined || typeof j.sla === 'boolean') && (j.shortS === undefined || isNum(j.shortS)), 'engagement de service illisible');
}

type RawState = Record<string, unknown>;

/** Les règles qu'ouvre le mode d'une sauvegarde (partie rapide si le mode manque). */
const rulesOf = (state: RawState) => rulesFor(state.mode === 'career' ? 'career' : 'quick');

/**
 * Mises à niveau successives, indexées par le format de départ : chaque étape ajoute ce que
 * le format suivant a introduit. Une sauvegarde de la bêta 0.9 (format 1) se recharge donc.
 */
export const MIGRATIONS: Record<number, (state: RawState) => void> = {
  // 1 → 2 (0.10) : alertes préventives et compteurs d'exploitation.
  1: (state) => {
    state.alerts = emptyAlerts();
    const buildings = Array.isArray(state.buildings) ? state.buildings : [];
    if (isObject(state.economy)) {
      Object.assign(state.economy, {
        failures: buildings.reduce((n: number, b: unknown) => n + (isObject(b) && isInt(b.failures) ? b.failures : 0), 0),
        rackSecondsInstalled: 0,
        rackSecondsActive: 0,
      });
    }
  },
  // 2 → 3 (lot 2) : modes de jeu, carrière et recherche. Une partie d'avant est une partie rapide.
  2: (state) => {
    Object.assign(state, { mode: 'quick', rules: rulesFor('quick'), career: emptyCareer(), research: emptyResearch(), policies: defaultPolicies() });
  },
  // 3 → 4 (lot 3) : énergie de secours, incidents, carburant.
  3: (state) => {
    state.incidents = emptyIncidents();
    if (isObject(state.rules)) state.rules.incidents = rulesOf(state).incidents;
    state.power = { ...emptyPower(), ...(isObject(state.power) ? state.power : {}) };
    if (isObject(state.economy) && isObject(state.economy.ledger)) state.economy.ledger.fuel = 0;
    if (isObject(state.alerts)) state.alerts.upsLow = false;
  },
  // 4 → 5 (lot 4) : orientation des racks, météo, canicules, CDU.
  4: (state) => {
    if (isObject(state.rules)) Object.assign(state.rules, { aisles: rulesOf(state).aisles, weather: rulesOf(state).weather });
    if (isObject(state.incidents)) Object.assign(state.incidents, { heatwaveEndsAt: null, nextHeatwaveAt: null });
    state.cooling = emptyCooling();
  },
  // 5 → 6 (lot 5) : générations de GPU, contrats d'entraînement et avec SLA (champs facultatifs).
  5: () => {},
  // 6 → 7 (lot 6) : usure, entretien, spécialités, maintenance planifiée.
  6: (state) => {
    if (isObject(state.rules)) state.rules.wear = rulesOf(state).wear;
    if (isObject(state.policies)) state.policies.autoMaintain = true;
    if (isObject(state.alerts)) state.alerts.wornRacks = [];
  },
  // 7 → 8 (1.0.1) : modernisation en cours (champs facultatifs, absents des parties d'avant).
  7: () => {},
  // 8 → 9 (1.1) : réseau de calcul. Une carrière en cours y passe ; au palier où il compte, ses
  // entraînements quittent leur bloc, sans recul : ils attendront un bloc relié.
  8: (state) => {
    if (isObject(state.rules)) state.rules.network = rulesOf(state).network;
    const tier = isObject(state.career) && isInt(state.career.tier) ? state.career.tier : 0;
    if (state.mode !== 'career' || tier < NETWORK.minTier || !Array.isArray(state.jobs)) return;
    for (const j of state.jobs) if (isObject(j) && j.kind === 'training') delete j.assigned;
  },
};

function migrate(file: RawState): void {
  if (!isObject(file.state)) return;
  for (let format = file.format as number; format < SAVE_FORMAT; format++) MIGRATIONS[format]?.(file.state);
  file.format = SAVE_FORMAT;
}

function checkAlerts(a: unknown): void {
  need(isObject(a) && ['hotRacks', 'lateJobs', 'unattended', 'wornRacks'].every((k) => Array.isArray(a[k])), 'alertes illisibles');
  need(typeof a.power === 'boolean' && typeof a.cash === 'boolean' && typeof a.upsLow === 'boolean', 'alertes incomplètes');
}

/** Vérifie la forme et la cohérence d'un état chargé (types, grille, occupation des cases). */
function checkState(s: unknown): asserts s is PersistedState {
  need(isObject(s), 'partie illisible');
  for (const k of ['seed', 'tick', 'time', 'rng', 'money', 'nextId', 'nextTechId', 'nextJobId', 'nextOfferAt']) {
    need(isNum(s[k]), `valeur « ${k} » manquante`);
  }
  need(oneOf(SPEEDS, s.speed), 'vitesse invalide');
  need(oneOf(OUTCOMES, s.outcome), 'issue de partie invalide');
  need(isInt(s.w) && isInt(s.h) && s.w > 0 && s.h > 0 && s.w * s.h <= MAX_CELLS, 'taille de salle invalide');
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
  for (const k of ['failures', 'rackSecondsInstalled', 'rackSecondsActive']) need(isNum(s.economy[k]), `compteur « ${k} » manquant`);
  checkAlerts(s.alerts);
  need(oneOf(GAME_MODES, s.mode), 'mode de jeu inconnu');
  const rules = s.rules;
  need(isObject(rules) && typeof rules.progression === 'boolean', 'règles illisibles');
  const c = s.career;
  need(isObject(c) && isNum(c.reputation) && isInt(c.tier) && c.tier >= 0 && c.tier < TIERS.length, 'carrière illisible');
  const r = s.research;
  need(isObject(r) && isNum(r.share) && (r.current === null || typeof r.current === 'string'), 'recherche illisible');
  need(Array.isArray(r.done) && r.done.every((d) => typeof d === 'string') && isObject(r.progress) && isNum(r.ratePerS), 'recherche incomplète');
  need(isObject(s.policies) && typeof s.policies.autoRepair === 'boolean' && typeof s.policies.autoMaintain === 'boolean', 'réglages illisibles');
  const inc = s.incidents;
  const time = (v: unknown) => v === null || isNum(v);
  need(isObject(inc) && time(inc.outageEndsAt) && time(inc.nextOutageAt) && isInt(inc.outages), 'incidents illisibles');
  need(['incidents', 'aisles', 'weather', 'wear', 'network'].every((k) => typeof rules[k] === 'boolean'), 'règles incomplètes');
  need(time(inc.heatwaveEndsAt) && time(inc.nextHeatwaveAt), 'canicules illisibles');
  need(isObject(s.cooling) && isNum(s.cooling.liquidKW) && isNum(s.cooling.cracFactor), 'refroidissement illisible');
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
  migrate(file);
  try {
    checkState(file.state);
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: `Sauvegarde endommagée (${e.message}).` };
    throw e;
  }
  const state: GameState = { ...(file.state as PersistedState), commands: [], events: [] };
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
