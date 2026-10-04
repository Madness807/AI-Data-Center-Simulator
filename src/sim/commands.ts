import { BUILD_COST, BUILD_TIME, DEMOLISH_REFUND, TECH } from './balance';
import type { BuildingKind, TechTask } from './entities';
import { keepsAccess } from './pathfinding';
import { refund, spend } from './ledger';
import { addBuilding, addTech, buildingAt, inBounds, isEntrance, notify, removeBuilding, type GameState, type Speed } from './state';
import { updatePower } from './systems/power';

export type Command =
  /** `assign` : techniciens à qui confier le chantier (ajouté en fin de file). */
  | { type: 'build'; kind: BuildingKind; x: number; y: number; assign?: number[] }
  | { type: 'demolish'; x: number; y: number }
  | { type: 'order'; techs: number[]; task: TechTask; append: boolean }
  | { type: 'hire' }
  /** Tutoriel uniquement : met en panne un rack en service, pour apprendre à réparer. */
  | { type: 'forceFailure'; id: number }
  | { type: 'acceptJob'; id: number }
  | { type: 'rejectJob'; id: number }
  | { type: 'setSpeed'; speed: Speed };

/** Raison du refus, ou null si la construction est possible. */
export function canBuild(s: GameState, kind: BuildingKind, x: number, y: number): string | null {
  if (!inBounds(s, x, y)) return 'Hors de la salle';
  if (isEntrance(x, y)) return "Zone d'entrée réservée";
  if (buildingAt(s, x, y)) return 'Case occupée';
  if (s.techs.some((t) => Math.round(t.x) === x && Math.round(t.y) === y)) return 'Un technicien est sur la case';
  if (s.money < BUILD_COST[kind]) return 'Fonds insuffisants';
  if (!keepsAccess(s, x, y)) return "Bloquerait l'accès d'un équipement";
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
          notify(s, 'error', reason, { cell: c, code: 'refused' });
          break;
        }
        spend(s, 'construction', BUILD_COST[c.kind]);
        const site = addBuilding(s, c.kind, c.x, c.y, true);
        for (const t of s.techs) {
          if (c.assign?.includes(t.id)) t.tasks.push({ type: 'build', target: site.id });
        }
        break;
      }
      case 'demolish': {
        const b = buildingAt(s, c.x, c.y);
        if (!b) break;
        // Un chantier pas encore commencé est remboursé en entier.
        const untouched = b.status === 'construction' && b.workLeft >= BUILD_TIME[b.kind];
        refund(s, 'construction', Math.round(BUILD_COST[b.kind] * (untouched ? 1 : DEMOLISH_REFUND)));
        removeBuilding(s, b);
        break;
      }
      case 'order':
        for (const t of s.techs) {
          if (!c.techs.includes(t.id)) continue;
          if (!c.append) {
            t.tasks = [];
            t.path = null;
          }
          t.tasks.push(c.task);
        }
        break;
      case 'hire':
        if (s.techs.length >= TECH.max) notify(s, 'error', `Équipe complète (${TECH.max} max)`, { code: 'refused' });
        else if (s.money < TECH.hireCost) notify(s, 'error', 'Fonds insuffisants pour embaucher', { code: 'refused' });
        else {
          spend(s, 'hiring', TECH.hireCost);
          addTech(s);
        }
        break;
      case 'forceFailure': {
        const b = s.buildings.find((o) => o.id === c.id);
        if (!b || b.kind !== 'rack' || b.status !== 'ok') break;
        b.status = 'failed';
        b.failures++;
        notify(s, 'warning', `Panne du rack ${b.x},${b.y} (exercice)`, { cell: b, code: 'failure' });
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
