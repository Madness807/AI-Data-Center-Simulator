export type BuildingKind = 'rack' | 'crac' | 'pdu';
export type BuildingStatus = 'ok' | 'failed' | 'repairing';

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  /** Mis à jour par le système d'énergie. Un PDU est toujours alimenté. */
  powered: boolean;
  /** Seuls les racks tombent en panne en v0.1. */
  status: BuildingStatus;
  /** Secondes de réparation restantes quand status = 'repairing'. */
  repairLeft: number;
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
