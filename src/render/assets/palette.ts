import type { BuildingKind } from '../../sim/entities';

/**
 * Toutes les couleurs de la direction artistique. Aucun autre fichier ne doit
 * écrire une couleur en dur : on change le style ici, en un seul endroit.
 */
export const PALETTE = {
  background: 0x0d1015,
  lightSky: 0xbfd4ff,
  lightGround: 0x1a1d24,
  lightSun: 0xffffff,

  floor: 0x1d222b,
  floorGrid: 0x343b48,
  entrance: 0xc9a227,
  wall: 0x3a4250,

  rackBody: 0x2b313c,

  cracBody: 0xc7d0da,
  cracGrille: 0x1b1f26,
  cracBlade: 0x7fd4ff,
  cracBladeGlow: 0x1a5a80,

  pduBody: 0xd9a520,
  pduStripe: 0x151515,

  techVest: 0xf08a24,
  techStripe: 0xe8f4ff,
  techSkin: 0xf1c9a5,
  techHelmet: 0xffd23f,

  siteFrame: 0xffc83d,
  siteFill: { rack: 0x55657a, crac: 0xaab6c4, pdu: 0xd9a520 } satisfies Record<BuildingKind, number>,

  selection: 0x3dffa0,
  cracRange: 0x7fd4ff,
  ghostOk: 0x40ff80,
  ghostBad: 0xff4040,
  ghostNeutral: 0x666666,

  /** Couleurs d'état : elles portent l'information de jeu, à garder très contrastées. */
  status: {
    busy: 0x3dffa0,
    idle: 0x2a7fa8,
    shed: 0xff3b3b,
    shedOff: 0x3a1414,
    dead: 0x15181d,
    failed: 0xff3b3b,
    repairing: 0xffa23b,
  },

  ping: { move: 0x3dffa0, build: 0xffc83d, repair: 0xffa23b },
} as const;
