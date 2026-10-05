import type { BuildingKind, Gen, Specialty } from '../sim/entities';
import type { IconName } from './icons';

/**
 * Noms affichés des équipements : le nom complet (inspecteur, infobulles, tâches), le nom
 * court (cartes de la barre de construction) et l'icône. Seule source des noms.
 */
export const KIND_INFO: Record<BuildingKind, { name: string; short: string; icon: IconName }> = {
  rack: { name: 'Rack GPU', short: 'Rack GPU', icon: 'rack' },
  crac: { name: 'CRAC', short: 'CRAC', icon: 'crac' },
  pdu: { name: 'PDU', short: 'PDU', icon: 'pdu' },
  ups: { name: 'Onduleur', short: 'Onduleur', icon: 'ups' },
  generator: { name: 'Groupe électrogène', short: 'Groupe', icon: 'generator' },
  cdu: { name: 'CDU (liquide)', short: 'CDU', icon: 'cdu' },
};

/** Nom complet d'un équipement, génération comprise (« Rack GPU G2 »). */
export function buildingName(kind: BuildingKind, gen: Gen = 1): string {
  return kind === 'rack' && gen > 1 ? `${KIND_INFO.rack.name} G${gen}` : KIND_INFO[kind].name;
}

/** Nom court, pour une carte de la barre (« Rack G2 »). */
export function shortName(kind: BuildingKind, gen: Gen = 1): string {
  return kind === 'rack' && gen > 1 ? `Rack G${gen}` : KIND_INFO[kind].short;
}

/** Libellé de chaque spécialité de technicien. */
export const SPECIALTY_LABEL: Record<Specialty, string> = { electrician: 'électricien', hvac: 'frigoriste', it: 'informaticien' };
