/** Types d'équipement ; la sauvegarde vérifie ses valeurs sur ces listes. */
export const BUILDING_KINDS = ['rack', 'crac', 'pdu', 'ups', 'generator', 'cdu'] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

/** Génération de GPU d'un rack (carrière ; 1 par défaut). */
export const GENS = [1, 2, 3] as const;
export type Gen = (typeof GENS)[number];

/** Orientation de la façade (prise d'air) : 0 = +y, 1 = +x, 2 = −y, 3 = −x. */
export const FACINGS = [0, 1, 2, 3] as const;
export type Facing = (typeof FACINGS)[number];

/** Pas de grille vers l'avant de chaque orientation. */
export const FACING_STEP: Record<Facing, readonly [number, number]> = { 0: [0, 1], 1: [1, 0], 2: [0, -1], 3: [-1, 0] };
export const BUILDING_STATUSES = ['construction', 'ok', 'failed', 'repairing'] as const;
export type BuildingStatus = (typeof BUILDING_STATUSES)[number];

export type Cell = { x: number; y: number };

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  /** Mis à jour par le système d'énergie. Un PDU est toujours alimenté. */
  powered: boolean;
  /** Seuls les racks tombent en panne. Un chantier ne fonctionne pas encore. */
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
  /** Rack : génération de GPU (absente = 1). */
  gen?: Gen;
  /** Rack (carrière) : usure de 0 à 100 ; elle augmente le risque de panne, l'entretien la remet à zéro. */
  wear?: number;
  /** Modernisation en cours : génération remplacée et prix payé, pour rembourser une démolition. */
  upgradeFrom?: Gen;
  upgradePaid?: number;
}

export type TechTask =
  | { type: 'move'; x: number; y: number }
  | { type: 'build'; target: number }
  | { type: 'repair'; target: number }
  /** Entretien d'un rack en service : remet son usure à zéro ; `left` : secondes restantes une fois commencé. */
  | { type: 'maintain'; target: number; left?: number };

/** Spécialité d'un technicien (recherche) : il travaille deux fois plus vite dans son domaine. */
export const SPECIALTIES = ['electrician', 'hvac', 'it'] as const;
export type Specialty = (typeof SPECIALTIES)[number];

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
  /** Spécialité, absente pour un polyvalent. */
  specialty?: Specialty;
}

export const JOB_STATUSES = ['offer', 'active'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_KINDS = ['inference', 'training'] as const;
export type JobKind = (typeof JOB_KINDS)[number];

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
  /** Entraînement : bloc de racks contigus dédié (sinon inférence sur le pool commun). */
  kind?: JobKind;
  /** Entraînement : taille du bloc demandé, génération minimale, racks attribués. */
  cluster?: number;
  minGen?: Gen;
  assigned?: number[];
  /** Inférence avec SLA : secondes où le débit servi est resté sous le débit promis. */
  sla?: boolean;
  shortS?: number;
}

/** Contrôle exhaustif : le compilateur refuse un switch qui oublierait un type d'équipement. */
export function unknownKind(kind: never): never {
  throw new Error(`Équipement inconnu : ${String(kind)}`);
}

export function isRackActive(b: Building): boolean {
  return b.kind === 'rack' && b.status === 'ok' && b.powered;
}
