/**
 * Mémoire des alertes préventives, sauvegardée avec la partie : chaque alerte part une
 * fois par épisode et ne se réarme qu'une fois la situation nettement rétablie.
 */
export interface AlertMemory {
  /** Racks signalés chauds, jusqu'à ce qu'ils redescendent sous le seuil de réarmement. */
  hotRacks: number[];
  /** Énergie signalée proche de la saturation. */
  power: boolean;
  /** Contrats déjà signalés en retard probable : une alerte par contrat. */
  lateJobs: number[];
  /** Trésorerie signalée basse. */
  cash: boolean;
  /** Pannes sans technicien affecté : depuis quand, et si l'alerte est partie. */
  unattended: { id: number; since: number; notified: boolean }[];
}

export function emptyAlerts(): AlertMemory {
  return { hotRacks: [], power: false, lateJobs: [], cash: false, unattended: [] };
}
