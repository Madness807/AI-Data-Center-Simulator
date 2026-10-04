import { BUILD_COST, TECH } from '../../sim/balance';
import type { BuildingKind } from '../../sim/entities';
import type { GameState } from '../../sim/state';
import type { Tool } from '../../input/build';
import { el, icon } from '../dom';
import { money } from '../format';
import type { IconName } from '../icons';

export interface BuildBarActions {
  setTool: (tool: Tool) => void;
  hire: () => void;
  toggleHeatmap: () => void;
  toggleEdgePan: () => void;
  toggleHelp: () => void;
}

export interface BuildBarView {
  tool: Tool;
  heatmap: boolean;
  edgePan: boolean;
  helpOpen: boolean;
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
  private readonly heatButton: HTMLButtonElement;
  private readonly edgeButton: HTMLButtonElement;
  private readonly helpButton: HTMLButtonElement;

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

    this.heatButton = toggle('heatmap', 'Chaleur', 'H', actions.toggleHeatmap);
    this.heatButton.dataset.toggle = 'heatmap';
    this.edgeButton = toggle('edgePan', 'Bords', 'B', actions.toggleEdgePan);
    this.helpButton = toggle('help', 'Aide', '?', actions.toggleHelp);
    const toggles = el('div', 'toggle-group', this.heatButton, this.edgeButton, this.helpButton);
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
    this.heatButton.classList.toggle('active', view.heatmap);
    this.edgeButton.classList.toggle('active', view.edgePan);
    this.helpButton.classList.toggle('active', view.helpOpen);
  }
}
