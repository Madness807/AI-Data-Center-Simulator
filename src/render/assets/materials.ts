import * as THREE from 'three';
import { once, onceBy } from './cache';
import { PALETTE } from './palette';
import { TEXTURES } from './textures';

type StandardParams = THREE.MeshStandardMaterialParameters;
type BasicParams = THREE.MeshBasicMaterialParameters;

const standard = (color: number, params: StandardParams = {}) =>
  once(() => new THREE.MeshStandardMaterial({ color, ...params }));
/** Les couleurs « lumineuses » (états, anneaux) échappent au tone mapping pour rester franches. */
const glow = (color: number, params: BasicParams = {}) =>
  once(() => new THREE.MeshBasicMaterial({ color, toneMapped: false, ...params }));
const overlay = (color: number, opacity: number) => glow(color, { transparent: true, opacity, depthWrite: false });

/**
 * Bibliothèque des matériaux partagés. Chaque entrée est créée au premier usage puis
 * réutilisée par tous les modèles : ne jamais modifier un matériau partagé par instance.
 */
export const MATERIALS = {
  /** Matériau unique des modèles « cuits » : la couleur vient des sommets (geometry.bake). */
  vertexColored: standard(0xffffff, { vertexColors: true, roughness: 0.62, metalness: 0.12 }),
  /** Variante facettée, pour les formes rondes low-poly (têtes, casques). */
  vertexColoredFlat: standard(0xffffff, { vertexColors: true, roughness: 0.55, flatShading: true }),

  floor: onceBy(
    (key: string) =>
      new THREE.MeshStandardMaterial({ map: TEXTURES.floor(...(key.split('x').map(Number) as [number, number])), roughness: 0.85 }),
  ),
  floorSlab: standard(PALETTE.floorSlab, { roughness: 0.9 }),
  wallPanel: once(() => new THREE.MeshStandardMaterial({ map: TEXTURES.wallPanel(), roughness: 0.8 })),
  hazard: once(() => new THREE.MeshStandardMaterial({ map: TEXTURES.hazard(), roughness: 0.7 })),
  wallLight: glow(PALETTE.wallLight),

  /** Blanc : la couleur d'état de chaque rack est portée par l'instance. */
  rackLed: glow(0xffffff),

  cracScreenOn: glow(PALETTE.cracScreenOn),
  cracScreenOff: standard(PALETTE.cracScreenOff, { roughness: 0.4 }),
  pduLampOn: glow(PALETTE.pduLampOn),
  aisleCold: overlay(PALETTE.aisleCold, 0.7),
  aisleHot: overlay(PALETTE.aisleHot, 0.7),
  containment: once(() => new THREE.MeshStandardMaterial({ color: PALETTE.containmentGlass, transparent: true, opacity: 0.2, roughness: 0.15, metalness: 0.1, depthWrite: false })),
  upsLedCharge: glow(PALETTE.upsLedCharge),
  upsLedDischarge: glow(PALETTE.upsLedDischarge),
  upsLedOff: standard(PALETTE.upsLedOff, { roughness: 0.4 }),
  genLampRun: glow(PALETTE.genLampRun),
  genLampStart: glow(PALETTE.genLampStart),
  genLampOff: standard(PALETTE.upsLedOff, { roughness: 0.4 }),
  switchLedOn: glow(PALETTE.switchLedLink),
  switchLedDim: glow(PALETTE.switchLedDim),
  switchLedOff: standard(PALETTE.upsLedOff, { roughness: 0.4 }),

  scaffold: standard(PALETTE.scaffold, { roughness: 0.5, metalness: 0.2 }),
  blueprint: standard(PALETTE.blueprint, {
    emissive: PALETTE.blueprintGlow,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  }),
  blueprintScan: glow(PALETTE.blueprint, { transparent: true, opacity: 0.85 }),

  /** Panneau d'alerte : symbole sombre cuit dans les sommets, fond teinté par instance. */
  statusMarker: glow(0xffffff, { vertexColors: true }),
  selectionRing: overlay(PALETTE.selection, 0.9),
  inspectBrackets: glow(PALETTE.inspect),
  rangeRing: onceBy((emphasis: 'strong' | 'soft') => overlay(PALETTE.cracRange, emphasis === 'strong' ? 0.7 : 0.4)()),
  /** Modèle des pings d'ordre : chaque ping en clone un, car son opacité s'anime. */
  ping: onceBy(
    (kind: keyof typeof PALETTE.ping) =>
      new THREE.MeshBasicMaterial({ color: PALETTE.ping[kind], transparent: true, depthWrite: false, toneMapped: false }),
  ),
  /** Unique fantôme de construction : sa couleur change selon la validité. */
  ghost: once(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
  ),
};
