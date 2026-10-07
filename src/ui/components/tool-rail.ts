import { actionKey, HELP_CHAR } from '../../input/keymap';
import type { GameState } from '../../sim/state';
import { OVERLAY_MODES, overlayAvailable, type OverlayMode } from '../../render/overlay-colors';
import { el, icon } from '../dom';
import type { IconName } from '../icons';
import { OVERLAY_INFO } from './overlay-legend';

export interface ToolRailActions {
  setOverlay: (mode: OverlayMode | null) => void;
  toggleEdgePan: () => void;
  toggleHelp: () => void;
  toggleResearch: () => void;
}

export interface ToolRailView {
  overlay: OverlayMode | null;
  edgePan: boolean;
  helpOpen: boolean;
  /** Carrière seulement : panneau de recherche ouvert, étude en cours. */
  research: { open: boolean; active: boolean } | null;
}

/** Bouton icône du bloc, avec sa touche en pastille ; `label` sert à l'infobulle. */
function railButton(name: IconName, label: string, key: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'btn rail-button', icon(name, 17), el('span', 'kbd', key));
  b.setAttribute('aria-label', label);
  b.onclick = onClick;
  return b;
}

/**
 * Bloc d'outils du coin bas droit, à part de la barre de construction : calques (et leur menu),
 * défilement par les bords, aide, recherche. Chaque bouton a une infobulle (nom et touche).
 */
export class ToolRail {
  readonly root: HTMLElement;
  /** Nom de chaque bouton et sa touche, pour les infobulles. */
  readonly buttons: { button: HTMLButtonElement; label: () => string; key: string }[] = [];
  private readonly overlayButton: HTMLButtonElement;
  private readonly overlayIcon = el('span', 'overlay-icon');
  private readonly overlayMenu: HTMLElement;
  private readonly overlayItems = new Map<OverlayMode | null, HTMLButtonElement>();
  private shownOverlay: OverlayMode | null | undefined;
  private overlayLabel = 'Calques';
  private readonly edgeButton: HTMLButtonElement;
  private readonly helpButton: HTMLButtonElement;
  private readonly researchButton: HTMLButtonElement;

  constructor(actions: ToolRailActions) {
    // Calques : un bouton (H les fait défiler) et un menu pour choisir directement.
    this.overlayButton = el('button', 'btn rail-button overlay-button', this.overlayIcon, el('span', 'kbd', actionKey('overlay')));
    this.overlayButton.dataset.toggle = 'overlay';
    this.overlayButton.setAttribute('aria-label', 'Calques');
    this.overlayMenu = el('div', 'overlay-menu glass');
    this.overlayMenu.hidden = true;
    for (const mode of [...OVERLAY_MODES, null]) {
      const info = mode ? OVERLAY_INFO[mode] : { label: 'Aucun calque', icon: 'close' as IconName };
      const item = el('button', 'btn overlay-item', icon(info.icon, 14), el('span', undefined, info.label));
      item.onclick = () => {
        actions.setOverlay(mode);
        this.overlayMenu.hidden = true;
      };
      this.overlayItems.set(mode, item);
      this.overlayMenu.append(item);
    }
    this.overlayButton.onclick = () => (this.overlayMenu.hidden = !this.overlayMenu.hidden);
    document.addEventListener('pointerdown', (e) => {
      const target = e.target as Node;
      if (!this.overlayMenu.hidden && !this.overlayMenu.contains(target) && !this.overlayButton.contains(target)) this.overlayMenu.hidden = true;
    });
    this.edgeButton = railButton('edgePan', 'Défilement par les bords', actionKey('edgePan'), actions.toggleEdgePan);
    this.helpButton = railButton('help', 'Aide', HELP_CHAR, actions.toggleHelp);
    this.researchButton = railButton('research', 'Recherche (R&D)', actionKey('research'), actions.toggleResearch);
    this.researchButton.dataset.panel = 'research';
    this.researchButton.hidden = true;
    this.buttons.push(
      { button: this.overlayButton, label: () => this.overlayLabel, key: actionKey('overlay') },
      { button: this.edgeButton, label: () => 'Défilement par les bords', key: actionKey('edgePan') },
      { button: this.helpButton, label: () => 'Aide', key: HELP_CHAR },
      { button: this.researchButton, label: () => 'Recherche (R&D)', key: actionKey('research') },
    );
    const overlays = el('div', 'overlay-picker', this.overlayButton, this.overlayMenu);
    this.root = el('div', 'tool-rail glass', overlays, this.edgeButton, this.helpButton, this.researchButton);
  }

  update(s: GameState, view: ToolRailView): void {
    for (const [mode, item] of this.overlayItems) item.hidden = mode !== null && !overlayAvailable(mode, s);
    if (view.overlay !== this.shownOverlay) {
      this.shownOverlay = view.overlay;
      const info = view.overlay ? OVERLAY_INFO[view.overlay] : { label: 'Calques', icon: 'layers' as IconName };
      this.overlayIcon.replaceChildren(icon(info.icon, 17));
      this.overlayLabel = view.overlay ? `Calque : ${info.label}` : 'Calques';
      this.overlayButton.classList.toggle('active', view.overlay !== null);
      for (const [mode, item] of this.overlayItems) item.classList.toggle('active', mode === view.overlay);
    }
    this.edgeButton.classList.toggle('active', view.edgePan);
    this.helpButton.classList.toggle('active', view.helpOpen);
    this.researchButton.hidden = view.research === null;
    this.researchButton.classList.toggle('active', !!view.research?.open);
    // Rien à l'étude : le bouton le signale, une part du calcul attend un nœud.
    this.researchButton.classList.toggle('idle', view.research !== null && !view.research.active);
  }
}
