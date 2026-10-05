/**
 * Toutes les couleurs de la direction artistique (low-poly stylisé). Aucun autre fichier
 * ne doit écrire une couleur en dur : on change le style ici, en un seul endroit.
 */
export const PALETTE = {
  background: 0x0b0e14,
  lightSky: 0xd6e4ff,
  lightGround: 0x2a2f3a,
  lightSun: 0xfff1de,
  lightFill: 0x86a9ff,

  // Salle
  floorTile: 0x3b4352,
  floorSeam: 0x1f242d,
  floorHole: 0x161a21,
  floorSlab: 0x161a21,
  wallPanel: 0x4b5566,
  wallSeam: 0x3a4351,
  wallSkirting: 0x1d222a,
  wallCap: 0x2b313b,
  wallTray: 0x252b34,
  wallLight: 0xfff3d6,
  hazardA: 0xf2c230,
  hazardB: 0x1b1d21,

  // Rack
  rackFoot: 0x0e1115,
  rackFrame: 0x1d222a,
  rackPanel: 0x272d37,
  rackDoor: 0x313846,
  rackServer: 0x151920,
  rackServerAlt: 0x1d222b,
  rackHandle: 0x8d99ab,
  rackVent: 0x0f1216,

  // CRAC
  cracBase: 0x262b33,
  cracBody: 0xdde3ea,
  cracPanel: 0xc3cbd5,
  cracGrille: 0x2a313b,
  cracLouver: 0x48515e,
  cracAccent: 0x3a9cff,
  cracFan: 0xa9bccf,
  cracScreenOn: 0x5fe3ff,
  cracScreenOff: 0x1b2730,

  // PDU
  pduBody: 0xe7b52e,
  pduDark: 0x262b33,
  pduBreaker: 0x3f4652,
  pduToggle: 0xd6dbe2,
  pduConduit: 0x5b6573,
  pduLampOn: 0x3dffa0,

  // Onduleur
  upsBody: 0x55657a,
  upsDark: 0x262b33,
  upsModule: 0x1d232b,
  upsStrip: 0x3c4a5c,
  upsLedCharge: 0x3dffa0,
  upsLedDischarge: 0xffb020,
  upsLedOff: 0x1b2730,

  // Groupe électrogène
  genBody: 0x4c7a5c,
  genDark: 0x22282f,
  genGrille: 0x2c333d,
  genExhaust: 0x8a939e,
  genPanel: 0x2f3640,
  genLampRun: 0x3dffa0,
  genLampStart: 0xffb020,

  // CDU (refroidissement liquide)
  cduBody: 0x9aaec2,
  cduDark: 0x262b33,
  cduPanel: 0x2f3640,
  cduPipeCold: 0x3a9cff,
  cduPipeHot: 0xff7a3a,
  cduImpeller: 0xd6dbe2,

  // Réseau : le mauve (Okabe-Ito, lisible en mode daltonien) marque les switchs partout
  // (modèle, mini-carte, calque) ; le jaune est celui de la fibre et des câbles.
  switchBody: 0x262d38,
  switchDark: 0x14181e,
  switchBay: 0x0e1115,
  switchUnit: 0x1c222b,
  switchPort: 0x07090c,
  switchAccent: 0xcc79a7,
  switchLedLink: 0x3dffa0,
  switchLedDim: 0x1f8f5a,
  patchBlue: 0x3a7bd5,
  fiber: 0xffd83a,

  // Technicien
  techVest: 0xff7a1a,
  techReflective: 0xeef5ff,
  techShirt: 0x2f4f86,
  techTrousers: 0x27344b,
  techBoots: 0x17191d,
  techSkin: 0xf1c9a5,
  techHelmet: 0xffd23f,

  // Chantier
  scaffold: 0xffc83d,
  blueprint: 0x4fd1ff,
  blueprintGlow: 0x0f4d6b,

  // Interface dans le monde
  selection: 0x3dffa0,
  /** Équipement inspecté : cyan, pour le distinguer des techniciens sélectionnés (vert). */
  inspect: 0x4fd1ff,
  cracRange: 0x7fd4ff,
  ghostOk: 0x40ff80,
  aisleCold: 0x4fc3ff,
  rackG2: 0x2fd4ff,
  rackG3: 0xa86bff,
  aisleHot: 0xff8a3d,
  containmentGlass: 0x9fd8ff,
  ghostBad: 0xff4040,
  ghostNeutral: 0x666666,
  markerSymbol: 0x15171b,

  /** Couleurs d'état : elles portent l'information de jeu, à garder très contrastées. */
  status: {
    busy: 0x3dffa0,
    idle: 0x2a8fd0,
    shed: 0xff3b3b,
    shedOff: 0x3a1414,
    dead: 0x111419,
    failed: 0xff3b3b,
    repairing: 0xffa23b,
  },

  ping: { move: 0x3dffa0, build: 0xffc83d, repair: 0xffa23b, maintain: 0x5ef2c6, focus: 0x4fd1ff },

  /** Calques au sol (render/overlay-colors.ts) : liquide, entraînement, sol assombri sous les équipements. */
  overlay: { liquid: 0x9678ff, training: 0xff6ec8, dim: 0x080c12 },
} as const;

export type Rgb = readonly [number, number, number];

/** Composantes d'une couleur de la palette (0xRRGGBB → [r, g, b]). */
export function toRgb(hex: number): Rgb {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
