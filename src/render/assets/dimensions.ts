import type { BuildingKind } from '../../sim/entities';

/**
 * Encombrement visuel de chaque bâtiment (largeur X, hauteur Y, profondeur Z), en cases.
 * Les modèles, les chantiers et le fantôme de construction s'y conforment.
 */
export const BUILDING_SIZE: Record<BuildingKind, readonly [number, number, number]> = {
  rack: [0.8, 1.6, 0.8],
  crac: [0.9, 1.4, 0.9],
  pdu: [0.7, 1.0, 0.55],
  ups: [0.7, 1.2, 0.6],
  generator: [0.9, 1.06, 0.62],
};
