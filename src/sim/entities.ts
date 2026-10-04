export type BuildingKind = 'rack' | 'crac' | 'pdu';

export interface Building {
  id: number;
  kind: BuildingKind;
  x: number;
  y: number;
  /** Mis à jour par le système d'énergie. Un PDU est toujours alimenté. */
  powered: boolean;
}
