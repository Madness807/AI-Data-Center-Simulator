import { BUILD_COST, TECH } from '../../sim/balance';
import type { BuildingKind } from '../../sim/entities';
import type { GameState } from '../../sim/state';
import type { Tool } from '../../input/build';
import { OVERLAY_MODES, type OverlayMode } from '../../render/overlay-colors';
import { el, icon, setText } from '../dom';
import { money } from '../format';
import type { IconName } from '../icons';
import { OVERLAY_INFO } from './overlay-legend';

export interface BuildBarActions {
  setTool: (tool: Tool) => void;
  hire: () => void;
  setOverlay: (mode: OverlayMode | null) => void;
  toggleEdgePan: () => void;
  toggleHelp: () => void;
  toggleResearch: () => void;
}

export interface BuildBarView {
  tool: Tool;
  overlay: OverlayMode | null;
  edgePan: boolean;
  helpOpen: boolean;
  /** Carrière seulement : panneau de recherche ouvert, étude en cours. */
  research: { open: boolean; active: boolean } | null;
}

/** Tout ce qui se pose ou s'achète depuis la barre, dans l'ordre d'affichage. */
export const BUILD_ITEMS: { tool: Exclude<Tool, null>; label: string; key: string; icon: IconName }[] = [
  { tool: 'rack', label: 'Rack GPU', key: 'R', icon: 'rack' },
  { tool: 'crac', label: 'CRAC', key: 'C', icon: 'crac' },
  { tool: 'pdu', label: 'PDU', key: 'P', icon: 'pdu' },
  { tool: 'demolish', label: 'Démolir', key: 'X', icon: 'demolish' },
];

function card(label: string, key: string, art: Node, cost?: string): { root: HTMLButtonElement; thumb: HTMLElement; cost: HTMLElement } {
  const thumb = el('span', 'tool-thumb', art);
  const costEl = el('span', 'tool-cost', cost ?? '');
  const root = el('button', 'tool-card', el('span', 'kbd', key), thumb, el('span', 'tool-name', label), cost ? costEl : null);
  return { root, thumb, cost: costEl };
}

function toggle(name: IconName, label: string, key: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'btn', icon(name, 14), el('span', undefined, label), el('span', 'kbd', key));
  b.onclick = onClick;
  return b;
}

/** Barre de construction : équipements, démolition, embauche et bascules d'affichage. */
export class BuildBar {
  readonly root: HTMLElement;
  /** Bouton de chaque outil, pour l'infobulle et les vignettes. */
  readonly toolCards = new Map<Exclude<Tool, null>, HTMLButtonElement>();
  readonly hireCard: HTMLButtonElement;
  private readonly thumbs = new Map<string, HTMLElement>();
  private readonly overlayButton: HTMLButtonElement;
  private readonly overlayIcon = el('span', 'overlay-icon');
  private readonly overlayLabel = el('span');
  private readonly overlayMenu: HTMLElement;
  private readonly overlayItems = new Map<OverlayMode | null, HTMLButtonElement>();
  private shownOverlay: OverlayMode | null | undefined;
  private readonly edgeButton: HTMLButtonElement;
  private readonly helpButton: HTMLButtonElement;
  private readonly researchButton: HTMLButtonElement;

  constructor(actions: BuildBarActions) {
    const bar = el('div', 'build-bar glass');
    for (const item of BUILD_ITEMS) {
      const c = card(item.label, item.key, icon(item.icon, 24), item.tool === 'demolish' ? undefined : money(BUILD_COST[item.tool]));
      c.root.onclick = () => actions.setTool(item.tool);
      c.root.dataset.tool = item.tool;
      this.toolCards.set(item.tool, c.root);
      this.thumbs.set(item.tool, c.thumb);
      bar.append(c.root);
    }
    const hire = card('Embaucher', 'T', icon('hire', 24), money(TECH.hireCost));
    hire.root.onclick = actions.hire;
    this.hireCard = hire.root;
    this.thumbs.set('technician', hire.thumb);

    // Calques : un bouton (H les fait défiler) et un menu pour choisir directement.
    this.overlayButton = el('button', 'btn overlay-button', this.overlayIcon, this.overlayLabel, el('span', 'kbd', 'H'));
    this.overlayButton.dataset.toggle = 'overlay';
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
    this.edgeButton = toggle('edgePan', 'Bords', 'B', actions.toggleEdgePan);
    this.helpButton = toggle('help', 'Aide', '?', actions.toggleHelp);
    this.researchButton = toggle('research', 'R&D', 'U', actions.toggleResearch);
    this.researchButton.dataset.panel = 'research';
    this.researchButton.hidden = true;
    const overlays = el('div', 'overlay-picker', this.overlayButton, this.overlayMenu);
    const toggles = el('div', 'toggle-group', overlays, this.edgeButton, this.helpButton, this.researchButton);
    bar.append(el('div', 'build-sep'), hire.root, el('div', 'build-sep'), toggles);
    this.root = bar;
  }

  /** Remplace l'icône d'une carte par la vignette du vrai modèle 3D. */
  setThumbnail(key: BuildingKind | 'technician', url: string): void {
    const slot = this.thumbs.get(key);
    if (slot) slot.replaceChildren(Object.assign(document.createElement('img'), { src: url, alt: '' }));
  }

  update(s: GameState, view: BuildBarView): void {
    for (const [tool, b] of this.toolCards) {
      b.classList.toggle('active', tool === view.tool);
      b.disabled = tool !== 'demolish' && s.money < BUILD_COST[tool];
    }
    this.hireCard.disabled = s.money < TECH.hireCost || s.techs.length >= TECH.max;
    if (view.overlay !== this.shownOverlay) {
      this.shownOverlay = view.overlay;
      const info = view.overlay ? OVERLAY_INFO[view.overlay] : { short: 'Calques', icon: 'layers' as IconName };
      this.overlayIcon.replaceChildren(icon(info.icon, 14));
      setText(this.overlayLabel, info.short);
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
