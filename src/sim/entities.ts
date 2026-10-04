export type BuildingKind = 'rack' | 'crac' | 'pdu' | 'ups' | 'generator' | 'cdu';

/** Orientation de la façade (prise d'air) : 0 = +y, 1 = +x, 2 = −y, 3 = −x. */
export type Facing = 0 | 1 | 2 | 3;

/** Pas de grille vers l'avant de chaque orientation. */
export const FACING_STEP: Record<Facing, readonly [number, number]> = { 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] };
export type BuildingStatus = 'construction' | 'ok' | 'failed' | 'repairing';

export type Cell = { x: number; y: number };

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  /** Mis à jour par le système d'énergie. Un PDU est toujours alimenté. */
  powered: boolean;
  /** Seuls les racks tombent en panne en v0.1. Un chantier ne fonctionne pas encore. */
  status: BuildingStatus;
  /** Secondes de travail restantes, en chantier ou en réparation. */
  workLeft: number;
  /** Nombre de pannes depuis la mise en service. */
  failures: number;
  /** Temps de jeu de la mise en service ; null tant que le chantier n'est pas terminé. */
  builtAt: number | null;
  /** Onduleur : énergie stockée (kJ, soit kW·s). */
  charge?: number;
  /** Groupe électrogène : secondes avant de produire ; absent tant qu'il est à l'arrêt. */
  warmup?: number;
  /** Rack : côté de la prise d'air ; la chaleur ressort de l'autre côté (carrière). */
  facing?: Facing;
}

export type TechTask =
  | { type: 'move'; x: number; y: number }
  | { type: 'build'; target: number }
  | { type: 'repair'; target: number };

export interface Technician {
  id: number;
  /** Position continue en unités de case : (x, y) entier = centre de la case. */
  x: number;
  y: number;
  /** Position au tick précédent, pour l'interpolation du rendu. */
  prevX: number;
  prevY: number;
  /** File d'ordres ; le premier est en cours. */
  tasks: TechTask[];
  /** Cases restantes jusqu'au but de la tâche courante, null = à recalculer. */
  path: Cell[] | null;
  /** Vrai si le technicien a travaillé (construit/réparé) au dernier tick. */
  working: boolean;
}

export type JobStatus = 'offer' | 'active';

export interface Job {
  id: number;
  name: string;
  status: JobStatus;
  /** Débit demandé et plafond d'allocation (CU/s). */
  rateCU: number;
  durationS: number;
  /** Travail total = rateCU × durationS. */
  work: number;
  progress: number;
  /** Délai accordé à partir de l'acceptation. */
  deadlineInS: number;
  payment: number;
  penalty: number;
  /** Temps de jeu où l'offre est apparue. */
  offeredAt: number;
  /** Temps de jeu où l'offre disparaît (status = 'offer'). */
  expiresAt: number;
  /** Temps de jeu limite (status = 'active'). */
  deadline: number;
  /** CU/s reçus au dernier tick, pour l'UI. */
  allocated: number;
}

export function isRackActive(b: Building): boolean {
  return b.kind === 'rack' && b.status === 'ok' && b.powered;
}
