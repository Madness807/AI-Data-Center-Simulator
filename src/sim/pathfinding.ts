import { ENTRANCE } from './balance';
import type { Building, Cell } from './entities';
import { DIRS4, manhattan } from './math';
import { idx, inBounds, type GameState } from './state';

export function isWalkable(s: GameState, x: number, y: number): boolean {
  return inBounds(s, x, y) && s.occupant[idx(s, x, y)] < 0;
}

export function isAdjacent(a: Cell, b: Cell): boolean {
  return manhattan(a, b) === 1;
}

/**
 * A* sur 4 voisins. Renvoie les cases à parcourir après `start` jusqu'à une case
 * qui satisfait `isGoal` ([] si on y est déjà), ou null si c'est impossible.
 */
export function findPath(
  s: GameState,
  start: Cell,
  isGoal: (c: Cell) => boolean,
  heuristic: (c: Cell) => number,
): Cell[] | null {
  if (isGoal(start)) return [];
  const n = s.w * s.h;
  const g = new Float64Array(n).fill(Infinity);
  const f = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open: number[] = [];
  const si = idx(s, start.x, start.y);
  g[si] = 0;
  f[si] = heuristic(start);
  open.push(si);

  while (open.length) {
    // Liste ouverte linéaire : la grille est petite et les recherches rares.
    let best = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[best]]) best = k;
    const cur = open[best];
    open.splice(best, 1);
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % s.w;
    const cy = (cur - cx) / s.w;
    if (cur !== si && isGoal({ x: cx, y: cy })) {
      const path: Cell[] = [];
      for (let p = cur; p !== si; p = parent[p]) path.push({ x: p % s.w, y: Math.floor(p / s.w) });
      return path.reverse();
    }
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(s, nx, ny)) continue;
      const ni = idx(s, nx, ny);
      if (closed[ni]) continue;
      const ng = g[cur] + 1;
      if (ng < g[ni]) {
        g[ni] = ng;
        f[ni] = ng + heuristic({ x: nx, y: ny });
        parent[ni] = cur;
        open.push(ni);
      }
    }
  }
  return null;
}

/** Chemin jusqu'à une case libre voisine du bâtiment (on travaille à côté, pas dessus). */
export function pathNextTo(s: GameState, start: Cell, b: Building): Cell[] | null {
  return findPath(
    s,
    start,
    (c) => isAdjacent(c, b) && isWalkable(s, c.x, c.y),
    (c) => Math.max(0, manhattan(c, b) - 1),
  );
}

/** Cases libres accessibles depuis l'entrée, en considérant `extraBlocked` (index) comme occupée. */
export function reachableFromEntrance(s: GameState, extraBlocked = -1): Uint8Array {
  const seen = new Uint8Array(s.w * s.h);
  const queue: number[] = [];
  for (const [x, y] of ENTRANCE) {
    const i = idx(s, x, y);
    if (i !== extraBlocked && isWalkable(s, x, y)) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  while (queue.length) {
    const cur = queue.pop()!;
    const cx = cur % s.w;
    const cy = (cur - cx) / s.w;
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(s, nx, ny)) continue;
      const ni = idx(s, nx, ny);
      if (ni === extraBlocked || seen[ni]) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

/**
 * Vrai si occuper (x, y) laisserait chaque bâtiment (et le nouveau) avec au moins une
 * case voisine accessible, et chaque technicien dans la zone accessible.
 */
export function keepsAccess(s: GameState, x: number, y: number): boolean {
  const blocked = idx(s, x, y);
  const reach = reachableFromEntrance(s, blocked);
  const reachable = (c: Cell) =>
    DIRS4.some(([dx, dy]) => inBounds(s, c.x + dx, c.y + dy) && reach[idx(s, c.x + dx, c.y + dy)] === 1);
  if (!reachable({ x, y })) return false;
  for (const b of s.buildings) if (!reachable(b)) return false;
  for (const t of s.techs) {
    if (!reach[idx(s, Math.round(t.x), Math.round(t.y))]) return false;
  }
  return true;
}
