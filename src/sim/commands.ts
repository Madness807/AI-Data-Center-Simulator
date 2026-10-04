import { BUILD_COST, DEMOLISH_REFUND, REPAIR } from './balance';
import type { BuildingKind } from './entities';
import { addBuilding, buildingAt, inBounds, isEntrance, removeBuilding, type GameState, type Speed } from './state';
import { updatePower } from './systems/power';

export type Command =
  | { type: 'build'; kind: BuildingKind; x: number; y: number }
  | { type: 'demolish'; x: number; y: number }
  | { type: 'repair'; x: number; y: number }
  | { type: 'acceptJob'; id: number }
  | { type: 'rejectJob'; id: number }
  | { type: 'setSpeed'; speed: Speed };

/** Raison du refus, ou null si la construction est possible. */
export function canBuild(s: GameState, kind: BuildingKind, x: number, y: number): string | null {
  if (!inBounds(s, x, y)) return 'Hors de la salle';
  if (isEntrance(x, y)) return "Zone d'entrée réservée";
  if (buildingAt(s, x, y)) return 'Case occupée';
  if (s.money < BUILD_COST[kind]) return 'Fonds insuffisants';
  return null;
}

/** Appelée à chaque frame, y compris en pause : on peut construire pendant la pause. */
export function processCommands(s: GameState): void {
  if (s.commands.length === 0) return;
  const commands = s.commands;
  s.commands = [];
  if (s.outcome === 'lost') return;
  for (const c of commands) {
    switch (c.type) {
      case 'build': {
        const reason = canBuild(s, c.kind, c.x, c.y);
        if (reason) {
          s.events.push({ type: 'error', message: reason });
          break;
        }
        s.money -= BUILD_COST[c.kind];
        addBuilding(s, c.kind, c.x, c.y);
        break;
      }
      case 'demolish': {
        const b = buildingAt(s, c.x, c.y);
        if (!b) break;
        s.money += Math.round(BUILD_COST[b.kind] * DEMOLISH_REFUND);
        removeBuilding(s, b);
        break;
      }
      case 'repair': {
        const b = buildingAt(s, c.x, c.y);
        if (!b || b.status !== 'failed') break;
        if (s.money < REPAIR.cost) {
          s.events.push({ type: 'error', message: 'Fonds insuffisants pour réparer' });
          break;
        }
        s.money -= REPAIR.cost;
        b.status = 'repairing';
        b.repairLeft = REPAIR.seconds;
        break;
      }
      case 'acceptJob': {
        const job = s.jobs.find((j) => j.id === c.id && j.status === 'offer');
        if (!job) break;
        job.status = 'active';
        job.deadline = s.time + job.deadlineInS;
        break;
      }
      case 'rejectJob':
        s.jobs = s.jobs.filter((j) => !(j.id === c.id && j.status === 'offer'));
        break;
      case 'setSpeed':
        s.speed = c.speed;
        break;
    }
  }
  // L'alimentation est instantanée : le joueur voit tout de suite l'effet d'un PDU ou d'un rack.
  updatePower(s);
}
