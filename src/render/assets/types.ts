import type * as THREE from 'three';

/** Ce que la scène transmet à un modèle à chaque frame. */
export interface ModelState {
  /** Temps réel écoulé (s), pour les animations continues. */
  time: number;
  /** Durée réelle de la frame (s). */
  dt: number;
  /** Vitesse de simulation (0 = pause). */
  speed: number;
  powered: boolean;
  /** Avancement d'un chantier, de 0 à 1. */
  progress: number;
  /** Onduleur : charge de 0 à 1, et s'il alimente la salle (coupure). */
  charge?: number;
  discharging?: boolean;
  /** Groupe électrogène : en train de démarrer, ou en marche. */
  starting?: boolean;
  running?: boolean;
  /** Switch : ports occupés, et si un rack relié calcule. */
  ports?: number;
  traffic?: boolean;
}

/**
 * Contrat de tout modèle de bâtiment : un objet à placer dans la scène, qui gère
 * lui-même ses animations. Remplacer un modèle généré par un .glb ne change que sa fabrique.
 */
export interface AssetModel {
  readonly root: THREE.Group;
  update(state: ModelState): void;
}

export type TechnicianPose = 'idle' | 'walk' | 'work';

export interface TechnicianModel {
  readonly root: THREE.Group;
  setSelected(selected: boolean): void;
  animate(pose: TechnicianPose, time: number): void;
}
