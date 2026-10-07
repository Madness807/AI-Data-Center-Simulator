import { CDU, CRAC, GENERATOR, GPU, NETWORK, PDU, UPS } from '../sim/balance';
import type { Gen } from '../sim/entities';
import { modifiers } from '../sim/progression';
import type { GameState } from '../sim/state';
import type { Tool } from '../input/build';

const RACK_GEN: Partial<Record<Exclude<Tool, null>, Gen>> = { rack: 1, rack2: 2, rack3: 3 };

/**
 * Chiffres clés d'un équipement pour le bandeau de variantes : une ou deux chaînes courtes, avec
 * les gains de la recherche (refroidissement des CRAC, capacité des PDU…). L'infobulle garde le
 * détail complet.
 */
export function toolFigures(s: GameState | null, tool: Exclude<Tool, null | 'demolish'>): string[] {
  const m = s ? modifiers(s) : null;
  const gen = RACK_GEN[tool];
  if (gen) return [`${GPU[gen].computeCU} CU/s`, `${GPU[gen].powerKW} kW`];
  switch (tool) {
    case 'crac':
      return [`${Math.round(m?.cracCoolingKW ?? CRAC.coolingKW)} kW de froid`, `portée ${CRAC.radius}`];
    case 'cdu':
      return [`capte ${Math.round(CDU.captured * 100)} %`, `portée ${CDU.radius}`];
    case 'pdu':
      return [`+${Math.round(m?.pduCapacityKW ?? PDU.capacityKW)} kW`];
    case 'ups':
      return [`${Math.round((m?.upsStoreKJ ?? UPS.storeKJ) / UPS.powerKW)} s à ${UPS.powerKW} kW`];
    case 'generator':
      return [`${GENERATOR.powerKW} kW`, `démarre en ${m?.generatorStartS ?? GENERATOR.startS} s`];
    case 'switch':
      return [`${NETWORK.ports} ports`];
    default:
      return [];
  }
}

/**
 * Position gauche du bandeau de variantes, en px depuis le bord gauche de la barre : centré sur
 * la carte de sa famille, sans dépasser la barre (aligné à gauche s'il est plus large qu'elle).
 */
export function stripLeft(cardCenter: number, stripWidth: number, barWidth: number): number {
  const centered = cardCenter - stripWidth / 2;
  return Math.max(0, Math.min(centered, barWidth - stripWidth));
}
