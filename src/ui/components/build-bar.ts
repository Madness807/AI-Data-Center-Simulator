import { BUILD_COST, TECH } from '../../sim/balance';
import type { BuildingKind } from '../../sim/entities';
import { isUnlocked } from '../../sim/progression';
import type { GameState } from '../../sim/state';
import type { Tool } from '../../input/build';
import { OVERLAY_MODES, type OverlayMode } from '../../render/overlay-colors';
import { el, icon, setText } from '../dom';
import { money } from '../format';
import type { IconName } from '../icons';
import { OVERLAY_INFO } from './overlay-legend';

export interface BuildBarActions {
  /** Outil réellement en main (pas celui de la dernière image : deux touches peuvent arriver entre deux images). */
  currentTool: () => Tool;
  /** Prend exactement cet outil (null : aucun), sans effet de bascule. */
  selectTool: (tool: Tool) => void;
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

export type BuildTool = Exclude<Tool, null>;
export type FamilyId = 'compute' | 'cooling' | 'power' | 'demolish';

/** Nom court et icône de chaque outil. */
export const TOOL_INFO: Record<BuildTool, { label: string; icon: IconName }> = {
  rack: { label: 'Rack GPU', icon: 'rack' },
  crac: { label: 'CRAC', icon: 'crac' },
  pdu: { label: 'PDU', icon: 'pdu' },
  ups: { label: 'Onduleur', icon: 'ups' },
  generator: { label: 'Groupe', icon: 'generator' },
  cdu: { label: 'CDU', icon: 'cdu' },
  demolish: { label: 'Démolir', icon: 'demolish' },
};

/**
 * Familles de la barre, dans l'ordre d'affichage : une carte par famille ; sa touche (ou un
 * clic) passe d'une variante débloquée à la suivante, puis rend la main.
 */
export const BUILD_FAMILIES: { id: FamilyId; key: string; variants: BuildTool[] }[] = [
  { id: 'compute', key: 'R', variants: ['rack'] },
  { id: 'cooling', key: 'C', variants: ['crac', 'cdu'] },
  { id: 'power', key: 'P', variants: ['pdu', 'ups', 'generator'] },
  { id: 'demolish', key: 'X', variants: ['demolish'] },
];

const familyOf = (tool: Tool) => BUILD_FAMILIES.find((f) => tool !== null && f.variants.includes(tool));
const available = (s: GameState, tool: BuildTool) => tool === 'demolish' || isUnlocked(s, tool as BuildingKind);

interface FamilyCard {
  root: HTMLButtonElement;
  thumb: HTMLElement;
  name: HTMLElement;
  cost: HTMLElement;
  dots: HTMLElement[];
}

function card(label: string, key: string, art: Node, cost?: string): { root: HTMLButtonElement; thumb: HTMLElement; name: HTMLElement; cost: HTMLElement } {
  const thumb = el('span', 'tool-thumb', art);
  const name = el('span', 'tool-name', label);
  const costEl = el('span', 'tool-cost', cost ?? '');
  const root = el('button', 'tool-card', el('span', 'kbd', key), thumb, name, cost ? costEl : null);
  return { root, thumb, name, cost: costEl };
}

function toggle(name: IconName, label: string, key: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', 'btn', icon(name, 14), el('span', undefined, label), el('span', 'kbd', key));
  b.onclick = onClick;
  return b;
}

/** Barre de construction : équipements, démolition, embauche et bascules d'affichage. */
export class BuildBar {
  readonly root: HTMLElement;
  /** Carte de chaque famille, pour l'infobulle. */
  readonly familyCards = new Map<FamilyId, HTMLButtonElement>();
  readonly hireCard: HTMLButtonElement;
  private readonly cards = new Map<FamilyId, FamilyCard>();
  /** Variante montrée par chaque famille : l'outil en main, sinon la dernière utilisée. */
  private readonly last = new Map<FamilyId, BuildTool>();
  private readonly urls = new Map<string, string>();
  private readonly shown = new Map<FamilyId, string>();
  private readonly hireThumb: HTMLElement;
  private state: GameState | null = null;
  private tool: Tool = null;
  private readonly overlayButton: HTMLButtonElement;
  private readonly overlayIcon = el('span', 'overlay-icon');
  private readonly overlayLabel = el('span');
  private readonly overlayMenu: HTMLElement;
  private readonly overlayItems = new Map<OverlayMode | null, HTMLButtonElement>();
  private shownOverlay: OverlayMode | null | undefined;
  private readonly edgeButton: HTMLButtonElement;
  private readonly helpButton: HTMLButtonElement;
  private readonly researchButton: HTMLButtonElement;

  constructor(private readonly actions: BuildBarActions) {
    const bar = el('div', 'build-bar glass');
    for (const family of BUILD_FAMILIES) {
      const first = family.variants[0];
      const info = TOOL_INFO[first];
      const c = card(info.label, family.key, icon(info.icon, 24), first === 'demolish' ? undefined : money(BUILD_COST[first]));
      const dots = family.variants.length > 1 ? family.variants.map(() => el('span', 'variant-dot')) : [];
      if (dots.length) c.root.append(el('span', 'variant-dots', ...dots));
      c.root.onclick = () => this.cycle(family.id);
      c.root.dataset.tool = first;
      c.root.dataset.family = family.id;
      this.familyCards.set(family.id, c.root);
      this.cards.set(family.id, { ...c, dots });
      this.last.set(family.id, first);
      bar.append(c.root);
    }
    const hire = card('Embaucher', 'T', icon('hire', 24), money(TECH.hireCost));
    hire.root.onclick = actions.hire;
    this.hireCard = hire.root;
    this.hireThumb = hire.thumb;

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
    if (key === 'technician') this.hireThumb.replaceChildren(Object.assign(document.createElement('img'), { src: url, alt: '' }));
    else {
      this.urls.set(key, url);
      this.shown.clear(); // les cartes se redessinent avec la vignette
    }
  }

  /** Outil montré par une famille : celui en main s'il en fait partie, sinon le dernier utilisé. */
  shownTool(id: FamilyId): BuildTool {
    const family = BUILD_FAMILIES.find((f) => f.id === id)!;
    return this.tool !== null && family.variants.includes(this.tool) ? this.tool : (this.last.get(id) ?? family.variants[0]);
  }

  /**
   * Touche ou clic d'une famille : prend la variante montrée, puis passe à la suivante
   * débloquée, puis rend la main (aucun outil). Les variantes verrouillées sont sautées.
   */
  cycle(id: FamilyId): void {
    const family = BUILD_FAMILIES.find((f) => f.id === id)!;
    const s = this.state;
    const open = s ? family.variants.filter((v) => available(s, v)) : family.variants.slice(0, 1);
    if (!open.length) return;
    const current = this.actions.currentTool();
    let next: Tool;
    if (current === null || !family.variants.includes(current)) {
      const remembered = this.last.get(id);
      next = remembered && open.includes(remembered) ? remembered : open[0];
    } else {
      const i = open.indexOf(current);
      next = i >= 0 && i + 1 < open.length ? open[i + 1] : null;
    }
    if (next) this.last.set(id, next);
    this.tool = next;
    this.actions.selectTool(next);
  }

  update(s: GameState, view: BuildBarView): void {
    this.state = s;
    this.tool = view.tool;
    const owner = familyOf(view.tool);
    if (owner && view.tool) this.last.set(owner.id, view.tool);
    for (const family of BUILD_FAMILIES) {
      const c = this.cards.get(family.id)!;
      const tool = this.shownTool(family.id);
      const key = `${tool}|${this.urls.has(tool)}`;
      if (this.shown.get(family.id) !== key) {
        this.shown.set(family.id, key);
        const info = TOOL_INFO[tool];
        const url = this.urls.get(tool);
        c.thumb.replaceChildren(url ? Object.assign(document.createElement('img'), { src: url, alt: '' }) : icon(info.icon, 24));
        setText(c.name, info.label);
        if (tool !== 'demolish') setText(c.cost, money(BUILD_COST[tool]));
        c.root.dataset.tool = tool;
      }
      family.variants.forEach((v, i) => {
        const dot = c.dots[i];
        if (!dot) return;
        dot.className = `variant-dot ${v === tool ? 'current' : ''} ${available(s, v) ? '' : 'locked'}`;
      });
      c.root.classList.toggle('active', owner?.id === family.id);
      c.root.disabled = tool !== 'demolish' && s.money < BUILD_COST[tool];
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
