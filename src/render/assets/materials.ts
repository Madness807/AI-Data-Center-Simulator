import * as THREE from 'three';
import type { BuildingKind } from '../../sim/entities';
import { once, onceBy } from './cache';
import { PALETTE } from './palette';

type StandardParams = THREE.MeshStandardMaterialParameters;
type BasicParams = THREE.MeshBasicMaterialParameters;

const standard = (color: number, params: StandardParams = {}) =>
  once(() => new THREE.MeshStandardMaterial({ color, ...params }));
const basic = (color: number, params: BasicParams = {}) => once(() => new THREE.MeshBasicMaterial({ color, ...params }));
const line = (color: number) => once(() => new THREE.LineBasicMaterial({ color }));
const overlay = (color: number, opacity: number) =>
  basic(color, { transparent: true, opacity, depthWrite: false });

/**
 * Bibliothèque des matériaux partagés. Chaque entrée est créée au premier usage puis
 * réutilisée par tous les modèles : ne jamais modifier un matériau partagé par instance.
 */
export const MATERIALS = {
  floor: standard(PALETTE.floor, { roughness: 0.9 }),
  floorGrid: line(PALETTE.floorGrid),
  entrance: basic(PALETTE.entrance, { transparent: true, opacity: 0.35 }),
  wall: standard(PALETTE.wall, { roughness: 0.8 }),

  rackBody: standard(PALETTE.rackBody, { roughness: 0.5, metalness: 0.4 }),
  /** Blanc : la couleur d'état de chaque rack est portée par l'instance. */
  rackLed: basic(0xffffff),

  cracBody: standard(PALETTE.cracBody, { roughness: 0.6 }),
  cracGrille: standard(PALETTE.cracGrille),
  cracBlade: standard(PALETTE.cracBlade, { emissive: PALETTE.cracBladeGlow }),

  pduBody: standard(PALETTE.pduBody, { roughness: 0.5 }),
  pduStripe: standard(PALETTE.pduStripe),
  pduBolt: basic(PALETTE.pduStripe),

  techVest: standard(PALETTE.techVest, { roughness: 0.7 }),
  techStripe: basic(PALETTE.techStripe),
  techSkin: standard(PALETTE.techSkin),
  techHelmet: standard(PALETTE.techHelmet, { roughness: 0.4 }),

  siteFrame: line(PALETTE.siteFrame),
  siteFill: onceBy(
    (kind: BuildingKind) =>
      new THREE.MeshStandardMaterial({ color: PALETTE.siteFill[kind], transparent: true, opacity: 0.75 }),
  ),
  siteBase: overlay(PALETTE.siteFrame, 0.18),

  /** Blanc : la couleur (panne / réparation) est portée par l'instance. */
  statusMarker: basic(0xffffff),
  selectionRing: overlay(PALETTE.selection, 0.9),
  rangeRing: onceBy((emphasis: 'strong' | 'soft') => overlay(PALETTE.cracRange, emphasis === 'strong' ? 0.7 : 0.4)()),
  /** Modèle des pings d'ordre : chaque ping en clone un, car son opacité s'anime. */
  ping: onceBy((kind: keyof typeof PALETTE.ping) => new THREE.MeshBasicMaterial({ color: PALETTE.ping[kind], transparent: true, depthWrite: false })),
  /** Unique fantôme de construction : sa couleur change selon la validité. */
  ghost: once(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false })),
};
