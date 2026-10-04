import { BUILD_TIME, ENTRANCE, GRID_H, GRID_W, HEAT, JOBS, RACK, START_MONEY, TECH } from './balance';
import type { Command } from './commands';
import type { Building, BuildingKind, Cell, Job, Technician } from './entities';
import { emptyLedger, type Ledger } from './ledger';

export type Speed = 0 | 1 | 2 | 4;

export interface PowerStats {
  capacityKW: number;
  demandKW: number;
  loadKW: number;
  shedCount: number;
}

export interface GameEvent {
  type: 'error' | 'warning' | 'info' | 'success';
  message: string;
  /** Temps de jeu de l'événement. */
  time: number;
  /** Case concernée, quand il y en a une : l'interface peut y centrer la caméra. */
  cell?: Cell;
}

/** Émet un événement pour l'interface, horodaté et éventuellement localisé. */
export function notify(s: GameState, type: GameEvent['type'], message: string, cell?: Cell): void {
  s.events.push({ type, message, time: s.time, ...(cell ? { cell: { x: cell.x, y: cell.y } } : {}) });
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
}

export interface GameState {
  /** Graine de la partie, conservée pour reproduire un bug. */
  seed: number;
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
  /** CU/s disponibles (racks actifs) et utilisés par les contrats. */
  compute: { total: number; used: number };
  /** Offres et contrats en cours. */
  jobs: Job[];
  nextJobId: number;
  nextOfferAt: number;
  economy: EconomyStats;
  /** 'won' laisse la partie continuer en mode libre ; 'lost' la fige. */
  outcome: Outcome;
  commands: Command[];
  /** Messages pour l'UI, vidés par elle à chaque frame. */
  events: GameEvent[];
}

export function createEmptyState(seed = 1, w = GRID_W, h = GRID_H): GameState {
  return {
    seed,
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
    power: { capacityKW: 0, demandKW: 0, loadKW: 0, shedCount: 0 },
    compute: { total: 0, used: 0 },
    jobs: [],
    nextJobId: 1,
    nextOfferAt: 0,
    economy: { electricityPerS: 0, salariesPerS: 0, bankruptTimer: 0, jobsDone: 0, jobsFailed: 0, ledger: emptyLedger() },
    outcome: 'playing',
    commands: [],
    events: [],
  };
}

/** Partie standard : un PDU, un CRAC, deux techniciens et un premier contrat facile. */
export function createInitialState(seed = 1): GameState {
  const s = createEmptyState(seed);
  addBuilding(s, 'pdu', 1, 1);
  addBuilding(s, 'crac', 8, 8);
  for (let i = 0; i < TECH.start; i++) addTech(s);
  const rate = 2 * RACK.computeCU;
  const duration = 60;
  s.jobs.push({
    id: s.nextJobId++,
    name: 'Inférence batch — Lumen Labs',
    status: 'offer',
    rateCU: rate,
    durationS: duration,
    work: rate * duration,
    progress: 0,
    deadlineInS: 150,
    payment: 6000,
    penalty: 1500,
    offeredAt: 0,
    expiresAt: JOBS.firstOfferExpiry,
    deadline: 0,
    allocated: 0,
  });
  s.nextOfferAt = 60;
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
