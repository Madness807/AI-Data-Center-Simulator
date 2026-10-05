import { BUILD_TIME, buildCost, DEMOLISH_REFUND, GPU, MAX_GEN, RESEARCH_RATE, RETROFIT, TECH } from './balance';
import type { Building, BuildingKind, Facing, Gen, Specialty, TechTask } from './entities';
import { keepsAccess } from './pathfinding';
import { isUnlocked, modifiers, researchBlocker, unlockedBy } from './progression';
import { refund, spend } from './ledger';
import { addBuilding, addTech, buildingAt, buildingById, inBounds, isEntrance, notify, removeBuilding, type GameState, type Speed } from './state';
import { failRack } from './systems/failures';
import { updatePower } from './systems/power';

export type Command =
  /** `assign` : techniciens à qui confier le chantier (ajouté en fin de file). */
  | { type: 'build'; kind: BuildingKind; x: number; y: number; assign?: number[]; facing?: Facing; gen?: Gen }
  /** Carrière (recherche Modernisation) : passe un rack à la génération suivante, sur place. */
  | { type: 'upgrade'; id: number; assign?: number[] }
  /** Carrière : fait pivoter un rack d'un quart de tour (prise d'air et soufflage). */
  | { type: 'rotate'; id: number }
  | { type: 'demolish'; x: number; y: number }
  | { type: 'order'; techs: number[]; task: TechTask; append: boolean }
  /** `specialty` (recherche Spécialités) : électricien, frigoriste ou informaticien. */
  | { type: 'hire'; specialty?: Specialty }
  /** Tutoriel uniquement : met en panne un rack en service, pour apprendre à réparer. */
  | { type: 'forceFailure'; id: number }
  | { type: 'acceptJob'; id: number }
  | { type: 'rejectJob'; id: number }
  | { type: 'setSpeed'; speed: Speed }
  /** Carrière : part du calcul consacrée à la R&D, nœud à étudier (null : aucun). */
  | { type: 'setResearchShare'; share: number }
  | { type: 'startResearch'; id: string | null }
  | { type: 'setPolicy'; autoRepair?: boolean; autoMaintain?: boolean };

/** Raison du refus, ou null si la construction est possible. */
export function canBuild(s: GameState, kind: BuildingKind, x: number, y: number, gen: Gen = 1): string | null {
  if (!isUnlocked(s, kind)) return `Recherche requise : ${unlockedBy(kind)?.name ?? 'inconnue'}`;
  if (kind === 'rack' && gen > modifiers(s).maxGen) return `Recherche requise : GPU génération ${gen}`;
  if (!inBounds(s, x, y)) return 'Hors de la salle';
  if (isEntrance(x, y)) return "Zone d'entrée réservée";
  if (buildingAt(s, x, y)) return 'Case occupée';
  if (s.techs.some((t) => Math.round(t.x) === x && Math.round(t.y) === y)) return 'Un technicien est sur la case';
  if (s.money < buildCost(kind, gen)) return 'Fonds insuffisants';
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
        const gen = c.kind === 'rack' && s.rules.progression ? (c.gen ?? 1) : 1;
        const reason = canBuild(s, c.kind, c.x, c.y, gen);
        if (reason) {
          notify(s, 'error', reason, { cell: c, code: 'refused' });
          break;
        }
        spend(s, 'construction', buildCost(c.kind, gen));
        const site = addBuilding(s, c.kind, c.x, c.y, true);
        if (gen > 1) site.gen = gen;
        if (c.kind === 'rack' && s.rules.aisles && c.facing !== undefined) site.facing = c.facing;
        for (const t of s.techs) {
          if (c.assign?.includes(t.id)) t.tasks.push({ type: 'build', target: site.id });
        }
        break;
      }
      case 'demolish': {
        const b = buildingAt(s, c.x, c.y);
        if (!b) break;
        refund(s, 'construction', demolishRefund(b));
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
        else if (c.specialty && !modifiers(s).specialties) notify(s, 'error', 'Recherche requise : Spécialités', { code: 'refused' });
        else {
          spend(s, 'hiring', TECH.hireCost);
          const t = addTech(s);
          if (c.specialty) t.specialty = c.specialty;
        }
        break;
      case 'forceFailure': {
        const b = buildingById(s, c.id);
        if (!b || b.kind !== 'rack' || b.status !== 'ok') break;
        failRack(s, b, ' (exercice)');
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
      case 'setResearchShare':
        if (Number.isFinite(c.share)) s.research.share = Math.min(RESEARCH_RATE.maxShare, Math.max(0, c.share));
        break;
      case 'startResearch': {
        if (c.id === null) {
          s.research.current = null;
          break;
        }
        const reason = researchBlocker(s, c.id);
        if (reason) notify(s, 'error', reason, { code: 'refused' });
        else s.research.current = c.id;
        break;
      }
      case 'upgrade': {
        const b = buildingById(s, c.id);
        const reason = upgradeBlocker(s, b);
        if (reason || !b) {
          notify(s, 'error', reason ?? 'Équipement introuvable', { code: 'refused' });
          break;
        }
        const next = ((b.gen ?? 1) + 1) as Gen;
        const cost = upgradeCost(b);
        spend(s, 'construction', cost);
        // Le rack repasse en chantier le temps du remplacement des GPU ; on garde de quoi rembourser.
        b.upgradeFrom = b.gen ?? 1;
        b.upgradePaid = cost;
        b.gen = next;
        b.status = 'construction';
        b.workLeft = BUILD_TIME.rack;
        b.builtAt = null;
        b.powered = false;
        for (const t of s.techs) if (c.assign?.includes(t.id)) t.tasks.push({ type: 'build', target: b.id });
        break;
      }
      case 'rotate': {
        const b = buildingById(s, c.id);
        if (b?.kind === 'rack' && s.rules.aisles) b.facing = (((b.facing ?? 0) + 1) % 4) as Facing;
        break;
      }
      case 'setPolicy':
        if (c.autoRepair !== undefined) s.policies.autoRepair = c.autoRepair;
        if (c.autoMaintain !== undefined) s.policies.autoMaintain = c.autoMaintain;
        break;
    }
  }
  // L'alimentation est instantanée : le joueur voit tout de suite l'effet d'un PDU ou d'un rack.
  updatePower(s);
}

/**
 * Ce que rend une démolition : un chantier pas encore commencé en entier, sinon la moitié.
 * Une modernisation en cours rend son prix selon la même règle, plus la moitié de l'ancien rack
 * (comme si on le démolissait avant de le moderniser).
 */
export function demolishRefund(b: Building): number {
  const untouched = b.status === 'construction' && b.workLeft >= BUILD_TIME[b.kind];
  const share = untouched ? 1 : DEMOLISH_REFUND;
  if (b.upgradeFrom !== undefined) return Math.round((b.upgradePaid ?? 0) * share + buildCost(b.kind, b.upgradeFrom) * DEMOLISH_REFUND);
  return Math.round(buildCost(b.kind, b.gen) * share);
}

/** Prix de la modernisation d'un rack vers la génération suivante. */
export function upgradeCost(b: { gen?: Gen }): number {
  const gen = b.gen ?? 1;
  if (gen >= MAX_GEN) return Infinity;
  return Math.round((GPU[(gen + 1) as Gen].cost - GPU[gen].cost) * RETROFIT.surcharge);
}

/** Raison pour laquelle un rack ne peut pas être modernisé, ou null. */
export function upgradeBlocker(s: GameState, b: { kind: BuildingKind; status: string; gen?: Gen } | undefined): string | null {
  if (!b || b.kind !== 'rack') return 'Seul un rack se modernise';
  if (!modifiers(s).retrofit) return 'Recherche requise : Modernisation';
  if (b.status !== 'ok') return 'Le rack doit être en service';
  const gen = b.gen ?? 1;
  if (gen >= MAX_GEN) return 'Déjà de dernière génération';
  if (gen + 1 > modifiers(s).maxGen) return `Recherche requise : GPU génération ${gen + 1}`;
  if (s.money < upgradeCost(b)) return 'Fonds insuffisants';
  return null;
}
