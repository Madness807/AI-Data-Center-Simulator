import { BUILD_TIME, ENTRANCE, GRID_H, GRID_W, HEAT, JOBS, RACK, START_LAYOUT, START_MONEY, TECH } from './balance';
import type { Command } from './commands';
import type { Building, BuildingKind, Cell, Job, Technician } from './entities';
import { emptyAlerts, type AlertMemory } from './alert-memory';
import { defaultPolicies, emptyCareer, emptyResearch, rulesFor, type CareerState, type GameMode, type Policies, type ResearchState, type Rules } from './career';
import { emptyLedger, type Ledger } from './ledger';

export type Speed = 0 | 1 | 2 | 4;

export interface PowerStats {
  /** Capacité de distribution des PDU. */
  capacityKW: number;
  demandKW: number;
  /** Puissance servie aux équipements. */
  loadKW: number;
  shedCount: number;
  /** Réseau électrique disponible (faux pendant une coupure). */
  grid: boolean;
  /** Pendant une coupure : puissance que les secours peuvent fournir. */
  backupKW: number;
  /** Puissance servie par les groupes et par les onduleurs au dernier tick. */
  generatorKW: number;
  upsKW: number;
  /** Recharge des onduleurs sur le réseau (facturée en plus de la charge). */
  chargeKW: number;
}

export function emptyPower(): PowerStats {
  return { capacityKW: 0, demandKW: 0, loadKW: 0, shedCount: 0, grid: true, backupKW: 0, generatorKW: 0, upsKW: 0, chargeKW: 0 };
}

/** Refroidissement au dernier tick : chaleur captée par les CDU, météo. */
export interface CoolingStats {
  liquidKW: number;
  /** Température extérieure, null sans météo. */
  outsideC: number | null;
  /** Efficacité des CRAC due à la météo (1 sans météo). */
  cracFactor: number;
}

export function emptyCooling(): CoolingStats {
  return { liquidKW: 0, outsideC: null, cracFactor: 1 };
}

/** Incidents en cours et à venir (carrière). */
export interface Incidents {
  /** Coupure du réseau en cours : fin (temps de jeu), ou null. */
  outageEndsAt: number | null;
  /** Prochaine coupure ; null tant qu'aucune n'est programmée. */
  nextOutageAt: number | null;
  /** Coupures déjà subies (la première est courte). */
  outages: number;
  /** Canicule en cours : fin, ou null ; prochaine (null : pas encore programmée). */
  heatwaveEndsAt: number | null;
  nextHeatwaveAt: number | null;
}

export function emptyIncidents(): Incidents {
  return { outageEndsAt: null, nextOutageAt: null, outages: 0, heatwaveEndsAt: null, nextHeatwaveAt: null };
}

/** Nature de l'événement, pour réagir sans analyser le texte (son, routage dans le HUD). */
export type EventCode =
  | 'failure'
  | 'built'
  | 'repaired'
  | 'delivered'
  | 'late'
  | 'offer'
  | 'won'
  | 'bankrupt'
  | 'refused'
  | 'saved'
  // Alertes préventives (systems/alerts.ts).
  | 'overheat'
  | 'powerHigh'
  | 'lateRisk'
  | 'cashLow'
  | 'unattended'
  // Carrière.
  | 'tierUp'
  | 'researchDone'
  // Incidents.
  | 'outage'
  | 'gridBack'
  | 'upsLow'
  | 'heatwave'
  | 'heatwaveEnd'
  | 'trainingBroken'
  | 'slaBreach'
  | 'maintained'
  | 'wearRisk';

export interface GameEvent {
  type: 'error' | 'warning' | 'info' | 'success';
  message: string;
  /** Temps de jeu de l'événement. */
  time: number;
  /** Case concernée, quand il y en a une : l'interface peut y centrer la caméra. */
  cell?: Cell;
  code?: EventCode;
}

/** Émet un événement pour l'interface, horodaté, éventuellement localisé et typé. */
export function notify(
  s: GameState,
  type: GameEvent['type'],
  message: string,
  extra: { cell?: Cell; code?: EventCode } = {},
): void {
  const { cell, code } = extra;
  s.events.push({ type, message, time: s.time, ...(cell ? { cell: { x: cell.x, y: cell.y } } : {}), ...(code ? { code } : {}) });
}

export type Outcome = 'playing' | 'won' | 'lost';

export interface EconomyStats {
  /** $/s d'électricité au dernier tick. */
  electricityPerS: number;
  /** $/s de salaires au dernier tick. */
  salariesPerS: number;
  /** Secondes passées d'affilée sous zéro. */
  bankruptTimer: number;
  /** Cumuls par poste depuis le début de la partie. */
  ledger: Ledger;
  jobsDone: number;
  jobsFailed: number;
  /** Pannes depuis le début de la partie, racks démolis compris. */
  failures: number;
  /** Secondes × racks installés (hors chantier) et en service : la disponibilité est leur rapport. */
  rackSecondsInstalled: number;
  rackSecondsActive: number;
}

export interface GameState {
  /** Graine de la partie, conservée pour reproduire un bug. */
  seed: number;
  mode: GameMode;
  /** Mécaniques actives, fixées par le mode. */
  rules: Rules;
  career: CareerState;
  research: ResearchState;
  policies: Policies;
  tick: number;
  /** Secondes de jeu écoulées. */
  time: number;
  speed: Speed;
  rng: number;
  money: number;
  w: number;
  h: number;
  /** °C par case, indexé par idx(). */
  temp: number[];
  /** id du bâtiment sur la case, -1 si libre. */
  occupant: number[];
  buildings: Building[];
  nextId: number;
  techs: Technician[];
  nextTechId: number;
  power: PowerStats;
  cooling: CoolingStats;
  incidents: Incidents;
  /** CU/s disponibles (racks actifs) et utilisés par les contrats. */
  compute: { total: number; used: number };
  /** Offres et contrats en cours. */
  jobs: Job[];
  nextJobId: number;
  nextOfferAt: number;
  economy: EconomyStats;
  /** Mémoire des alertes préventives : une alerte par épisode. */
  alerts: AlertMemory;
  /** 'won' laisse la partie continuer en mode libre ; 'lost' la fige. */
  outcome: Outcome;
  commands: Command[];
  /** Messages pour l'UI, vidés par elle à chaque frame. */
  events: GameEvent[];
}

export function createEmptyState(seed = 1, w = GRID_W, h = GRID_H, mode: GameMode = 'quick'): GameState {
  return {
    seed,
    mode,
    rules: rulesFor(mode),
    career: emptyCareer(),
    research: emptyResearch(),
    policies: defaultPolicies(),
    tick: 0,
    time: 0,
    speed: 1,
    rng: seed,
    money: START_MONEY,
    w,
    h,
    temp: new Array(w * h).fill(HEAT.ambient),
    occupant: new Array(w * h).fill(-1),
    buildings: [],
    nextId: 1,
    techs: [],
    nextTechId: 1,
    power: emptyPower(),
    cooling: emptyCooling(),
    incidents: emptyIncidents(),
    compute: { total: 0, used: 0 },
    jobs: [],
    nextJobId: 1,
    nextOfferAt: 0,
    economy: {
      electricityPerS: 0,
      salariesPerS: 0,
      bankruptTimer: 0,
      jobsDone: 0,
      jobsFailed: 0,
      failures: 0,
      rackSecondsInstalled: 0,
      rackSecondsActive: 0,
      ledger: emptyLedger(),
    },
    alerts: emptyAlerts(),
    outcome: 'playing',
    commands: [],
    events: [],
  };
}

/** Partie standard : un PDU, un CRAC, deux techniciens et un premier contrat facile. */
export function createInitialState(seed = 1, mode: GameMode = 'quick'): GameState {
  const s = createEmptyState(seed, GRID_W, GRID_H, mode);
  addBuilding(s, 'pdu', START_LAYOUT.pdu.x, START_LAYOUT.pdu.y);
  addBuilding(s, 'crac', START_LAYOUT.crac.x, START_LAYOUT.crac.y);
  for (let i = 0; i < TECH.start; i++) addTech(s);
  const first = JOBS.firstJob;
  const rate = first.units * RACK.computeCU;
  const duration = first.durationS;
  s.jobs.push({
    id: s.nextJobId++,
    name: 'Inférence batch — Lumen Labs',
    status: 'offer',
    rateCU: rate,
    durationS: duration,
    work: rate * duration,
    progress: 0,
    deadlineInS: first.deadlineInS,
    payment: first.payment,
    penalty: first.penalty,
    offeredAt: 0,
    expiresAt: JOBS.firstOfferExpiry,
    deadline: 0,
    allocated: 0,
  });
  s.nextOfferAt = JOBS.firstOfferAt;
  return s;
}

export function idx(s: GameState, x: number, y: number): number {
  return y * s.w + x;
}

export function inBounds(s: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < s.w && y < s.h;
}

export function isEntrance(x: number, y: number): boolean {
  return ENTRANCE.some(([ex, ey]) => ex === x && ey === y);
}

export function buildingAt(s: GameState, x: number, y: number): Building | undefined {
  if (!inBounds(s, x, y)) return undefined;
  const id = s.occupant[idx(s, x, y)];
  return id < 0 ? undefined : s.buildings.find((b) => b.id === id);
}

/** Bâtiment terminé par défaut ; `site` crée un chantier qu'un technicien doit construire. */
export function addBuilding(s: GameState, kind: BuildingKind, x: number, y: number, site = false): Building {
  const b: Building = {
    id: s.nextId++,
    kind,
    x,
    y,
    powered: false,
    status: site ? 'construction' : 'ok',
    workLeft: site ? BUILD_TIME[kind] : 0,
    failures: 0,
    builtAt: site ? null : s.time,
  };
  if (kind === 'ups') b.charge = 0;
  s.buildings.push(b);
  s.occupant[idx(s, x, y)] = b.id;
  return b;
}

export function buildingById(s: GameState, id: number): Building | undefined {
  return s.buildings.find((b) => b.id === id);
}

/** Un technicien entre par l'entrée (cases alternées), sauf position donnée (tests). */
export function addTech(s: GameState, at?: { x: number; y: number }): Technician {
  const [ex, ey] = ENTRANCE[s.techs.length % ENTRANCE.length];
  const { x, y } = at ?? { x: ex, y: ey };
  const t: Technician = { id: s.nextTechId++, x, y, prevX: x, prevY: y, tasks: [], path: null, working: false };
  s.techs.push(t);
  return t;
}

export function removeBuilding(s: GameState, b: Building): void {
  s.buildings = s.buildings.filter((o) => o.id !== b.id);
  s.occupant[idx(s, b.x, b.y)] = -1;
}
