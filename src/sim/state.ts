import { ENTRANCE, GRID_H, GRID_W, HEAT, START_MONEY } from './balance';
import type { Command } from './commands';
import type { Building, BuildingKind } from './entities';

export type Speed = 0 | 1 | 2 | 4;

export interface PowerStats {
  capacityKW: number;
  demandKW: number;
  loadKW: number;
  shedCount: number;
}

export type GameEvent = { type: 'error'; message: string };

export interface GameState {
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
  power: PowerStats;
  commands: Command[];
  /** Messages pour l'UI, vidés par elle à chaque frame. */
  events: GameEvent[];
}

export function createEmptyState(seed = 1, w = GRID_W, h = GRID_H): GameState {
  return {
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
    power: { capacityKW: 0, demandKW: 0, loadKW: 0, shedCount: 0 },
    commands: [],
    events: [],
  };
}

/** Partie standard : un PDU et un CRAC déjà installés. */
export function createInitialState(seed = 1): GameState {
  const s = createEmptyState(seed);
  addBuilding(s, 'pdu', 1, 1);
  addBuilding(s, 'crac', 8, 8);
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

export function addBuilding(s: GameState, kind: BuildingKind, x: number, y: number): Building {
  const b: Building = { id: s.nextId++, kind, x, y, powered: kind === 'pdu' };
  s.buildings.push(b);
  s.occupant[idx(s, x, y)] = b.id;
  return b;
}

export function removeBuilding(s: GameState, b: Building): void {
  s.buildings = s.buildings.filter((o) => o.id !== b.id);
  s.occupant[idx(s, b.x, b.y)] = -1;
}
