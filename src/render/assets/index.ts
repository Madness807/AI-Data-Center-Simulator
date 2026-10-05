/**
 * Point d'entrée unique des assets 3D : le reste du jeu n'importe que ce fichier.
 * Conventions et procédure pour ajouter ou remplacer un modèle : docs/ASSETS.md.
 */
import type { BuildingKind } from '../../sim/entities';
import { createConstructionSite } from './fx/construction-site';
import { createCdu } from './props/cdu';
import { createCrac } from './props/crac';
import { createGenerator } from './props/generator';
import { createPdu } from './props/pdu';
import { createSwitch } from './props/switch';
import { createUps } from './props/ups';
import type { AssetModel } from './types';

export type { AssetModel, ModelState, TechnicianModel, TechnicianPose } from './types';
export { PALETTE } from './palette';
export { BUILDING_SIZE } from './dimensions';
export { countTriangles } from './geometry';
export { createRackCrowns, createRackInstances, RACK_CAPACITY, rackCrownGeometry, type RackInstances } from './props/rack';
export { createTechnician } from './characters/technician';
export { createFloor } from './environment/floor';
export { createWalls, type WallsModel } from './environment/walls';
export { createLighting } from './environment/lighting';
export { createContainmentPanels, createShedMarkers, createStatusMarkers } from './fx/status-markers';
export { isColorblind, setColorblind, statusColor, statusVersion, type StatusName } from './status-colors';
export { createPing, createRangeRing, createSelectionBrackets, createSelectionRing, type Ping, type PingKind } from './fx/rings';
export { createBuildGhost, FACING_ANGLE, type BuildGhost, type GhostKind } from './fx/build-ghost';
export { createConstructionSite };

/**
 * Registre des bâtiments dessinés un par un. Les racks, beaucoup plus nombreux, sont
 * instanciés à part (createRackInstances). Pour passer un modèle en .glb, on remplace
 * sa fabrique ici par un chargeur, sans toucher à la scène.
 */
export const PROP_MODELS: Record<Exclude<BuildingKind, 'rack'>, () => AssetModel> = {
  crac: createCrac,
  pdu: createPdu,
  ups: createUps,
  generator: createGenerator,
  cdu: createCdu,
  switch: createSwitch,
};

/** Modèle d'un bâtiment non instancié, ou de son chantier tant qu'il est en construction. */
export function createBuildingModel(kind: BuildingKind, underConstruction: boolean): AssetModel {
  if (underConstruction) return createConstructionSite(kind);
  if (kind === 'rack') throw new Error('Les racks terminés sont instanciés : utiliser createRackInstances()');
  return PROP_MODELS[kind]();
}
