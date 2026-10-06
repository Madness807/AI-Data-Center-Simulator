import type { BuildingKind, Gen, Specialty } from '../sim/entities';
import type { Branch } from '../sim/research';
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
  switch: { name: 'Switch réseau', short: 'Switch', icon: 'switch' },
};

/** Nom complet d'un équipement, génération comprise (« Rack GPU G2 »). */
export function buildingName(kind: BuildingKind, gen: Gen = 1): string {
  return kind === 'rack' && gen > 1 ? `${KIND_INFO.rack.name} G${gen}` : KIND_INFO[kind].name;
}

/** Nom court, pour une carte de la barre (« Rack G2 »). */
export function shortName(kind: BuildingKind, gen: Gen = 1): string {
  return kind === 'rack' && gen > 1 ? `Rack G${gen}` : KIND_INFO[kind].short;
}

/** Icône de chaque branche de la recherche. */
export const BRANCH_ICON: Record<Branch, IconName> = { compute: 'compute', network: 'switch', cooling: 'crac', power: 'power', ops: 'team' };

/** Icône de chaque nœud de recherche ; un nœud qui débloque un équipement reprend celle de l'équipement. */
export const RESEARCH_ICON: Readonly<Record<string, IconName>> = {
  opportunistic: 'recycle',
  'gpu-g2': 'gpu',
  retrofit: 'retrofit',
  checkpoints: 'checkpoint',
  'gpu-g3': 'chip',
  switches: KIND_INFO.switch.icon,
  fabric: 'fabric',
  optical: 'cable',
  'crac-he': 'airflow',
  containment: 'containment',
  'liquid-cooling': KIND_INFO.cdu.icon,
  'free-cooling': 'wind',
  'heat-reuse': 'heatReuse',
  'pdu-hc': KIND_INFO.pdu.icon,
  ups: KIND_INFO.ups.icon,
  generators: KIND_INFO.generator.icon,
  'green-power': 'green',
  'switchover-2n': 'switchover',
  'auto-repair': 'repair',
  'fast-techs': 'fastTechs',
  'planned-maintenance': 'planned',
  'spare-parts': 'spareParts',
  specialties: 'specialties',
  predictive: 'predictive',
};

/** Libellé de chaque spécialité de technicien. */
export const SPECIALTY_LABEL: Record<Specialty, string> = { electrician: 'électricien', hvac: 'frigoriste', it: 'informaticien' };
