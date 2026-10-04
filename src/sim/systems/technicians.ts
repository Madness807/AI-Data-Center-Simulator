import { REPAIR, TECH } from '../balance';
import type { Building, Cell, Technician, TechTask } from '../entities';
import { findPath, isAdjacent, isWalkable, pathNextTo } from '../pathfinding';
import { spend } from '../ledger';
import { buildingAt, buildingById, notify, type GameState } from '../state';

/** Le bâtiment visé par la tâche, s'il a encore besoin d'elle. */
function target(s: GameState, task: TechTask): Building | undefined {
  if (task.type === 'move') return undefined;
  const b = buildingById(s, task.target);
  if (!b) return undefined;
  if (task.type === 'build') return b.status === 'construction' ? b : undefined;
  return b.status === 'failed' || b.status === 'repairing' ? b : undefined;
}

/** Un déplacement vers une case occupée s'arrête à côté. */
function moveGoal(s: GameState, task: { x: number; y: number }): Building | Cell {
  return buildingAt(s, task.x, task.y) ?? task;
}

function isGoal(s: GameState, task: TechTask, c: Cell): boolean {
  if (task.type === 'move') {
    const g = moveGoal(s, task);
    return 'id' in g ? isAdjacent(c, g) : c.x === g.x && c.y === g.y;
  }
  const b = target(s, task);
  return !!b && isAdjacent(c, b);
}

function planPath(s: GameState, task: TechTask, from: Cell): Cell[] | null {
  if (task.type === 'move') {
    const g = moveGoal(s, task);
    if ('id' in g) return pathNextTo(s, from, g);
    return findPath(s, from, (c) => c.x === g.x && c.y === g.y, (c) => Math.abs(c.x - g.x) + Math.abs(c.y - g.y));
  }
  const b = target(s, task);
  return b ? pathNextTo(s, from, b) : null;
}

export function updateTechnicians(s: GameState, dt: number): void {
  for (const t of s.techs) {
    t.prevX = t.x;
    t.prevY = t.y;
    t.working = false;
    // Plusieurs passages : une tâche devenue inutile ne doit pas faire perdre un tick.
    for (let guard = 0; guard < 4; guard++) {
      const task = t.tasks[0];
      if (!task) {
        t.path = null;
        break;
      }
      if (task.type !== 'move' && !target(s, task)) {
        nextTask(t);
        continue;
      }
      const here = { x: Math.round(t.x), y: Math.round(t.y) };
      const centered = Math.abs(t.x - here.x) + Math.abs(t.y - here.y) < 1e-6;
      if (centered && isGoal(s, task, here)) {
        if (work(s, t, task, dt)) nextTask(t);
        break;
      }
      if (!t.path || (t.path.length && !isWalkable(s, t.path[0].x, t.path[0].y))) {
        t.path = planPath(s, task, here);
        if (!t.path) {
          notify(s, 'error', `Technicien ${t.id} : destination inaccessible`, { x: Math.round(t.x), y: Math.round(t.y) });
          nextTask(t);
          continue;
        }
      }
      walk(t, TECH.speed * dt, here);
      break;
    }
  }
}

function nextTask(t: Technician): void {
  t.tasks.shift();
  t.path = null;
}

/** Avance le long du chemin ; un chemin vide ramène au centre de la case courante. */
function walk(t: Technician, distance: number, here: Cell): void {
  let left = distance;
  while (left > 0) {
    const next = t.path?.[0] ?? here;
    const dx = next.x - t.x;
    const dy = next.y - t.y;
    const d = Math.hypot(dx, dy);
    if (d <= left) {
      t.x = next.x;
      t.y = next.y;
      left -= d;
      if (!t.path?.length) return;
      t.path.shift();
    } else {
      t.x += (dx / d) * left;
      t.y += (dy / d) * left;
      return;
    }
  }
}

/** Travaille sur la tâche ; renvoie vrai quand elle est terminée. */
function work(s: GameState, t: Technician, task: TechTask, dt: number): boolean {
  if (task.type === 'move') return true;
  const b = target(s, task)!;
  if (b.status === 'failed') {
    // Les pièces sont payées à l'arrivée du technicien.
    if (s.money < REPAIR.cost) {
      notify(s, 'error', 'Fonds insuffisants pour réparer', b);
      return true;
    }
    spend(s, 'repairs', REPAIR.cost);
    b.status = 'repairing';
    b.workLeft = REPAIR.seconds;
  }
  t.working = true;
  b.workLeft -= dt;
  if (b.workLeft > 1e-9) return false;
  b.workLeft = 0;
  const label = b.kind === 'rack' ? 'Rack' : b.kind === 'crac' ? 'CRAC' : 'PDU';
  notify(s, 'info', b.status === 'construction' ? `${label} ${b.x},${b.y} construit` : `${label} ${b.x},${b.y} réparé`, b);
  if (b.status === 'construction') b.builtAt = s.time;
  b.status = 'ok';
  return true;
}
