import { buildCost, TECH } from '../../sim/balance';
import { isUnlocked, modifiers, unlockedBy } from '../../sim/progression';
import { canHire } from '../../sim/stats';
import { toolBuild, type Tool } from '../../input/build';
import { actionKey, HELP_CHAR } from '../../input/keymap';
import type { GameState } from '../../sim/state';
import { OVERLAY_MODES, overlayAvailable, type OverlayMode } from '../../render/overlay-colors';
import { KIND_INFO, shortName } from '../catalog';
import { el, icon, setText } from '../dom';
import { money } from '../format';
import type { IconName } from '../icons';
import { nextVariant } from '../variant-cycle';
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
  /** Famille entièrement verrouillée : le message à montrer (« Recherche requise : … »). */
  locked: (message: string) => void;
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
export type FamilyId = 'compute' | 'cooling' | 'power' | 'network' | 'demolish';

/** Nom court et icône de chaque outil. */
const toolInfo = (tool: Exclude<BuildTool, 'demolish'>) => {
  const { kind, gen } = toolBuild(tool);
  return { label: shortName(kind, gen), icon: KIND_INFO[kind].icon };
};
export const TOOL_INFO: Record<BuildTool, { label: string; icon: IconName }> = {
  rack: toolInfo('rack'),
  rack2: toolInfo('rack2'),
  rack3: toolInfo('rack3'),
  crac: toolInfo('crac'),
  pdu: toolInfo('pdu'),
  ups: toolInfo('ups'),
  generator: toolInfo('generator'),
  cdu: toolInfo('cdu'),
  switch: toolInfo('switch'),
  demolish: { label: 'Démolir', icon: 'demolish' },
};

/**
 * Familles de la barre, dans l'ordre d'affichage : une carte par famille ; sa touche (ou un
 * clic) passe d'une variante débloquée à la suivante, puis rend la main. `visible` : la carte
 * n'existe que dans les parties qui ont cette mécanique (le réseau, en carrière).
 */
export const BUILD_FAMILIES: { id: FamilyId; key: string; variants: BuildTool[]; visible?: (s: GameState) => boolean }[] = [
  { id: 'compute', key: actionKey('buildCompute'), variants: ['rack', 'rack2', 'rack3'] },
  { id: 'cooling', key: actionKey('buildCooling'), variants: ['crac', 'cdu'] },
  { id: 'power', key: actionKey('buildPower'), variants: ['pdu', 'ups', 'generator'] },
  { id: 'network', key: actionKey('buildNetwork'), variants: ['switch'], visible: (s) => s.rules.network },
  { id: 'demolish', key: actionKey('demolish'), variants: ['demolish'] },
];

const familyOf = (tool: Tool) => BUILD_FAMILIES.find((f) => tool !== null && f.variants.includes(tool));
export const toolAvailable = (s: GameState, tool: BuildTool): boolean => {
  if (tool === 'demolish') return true;
  const { kind, gen } = toolBuild(tool);
  return isUnlocked(s, kind) && (gen === 1 || (s.rules.progression && modifiers(s).maxGen >= gen));
};
/** Pourquoi une variante n'est pas débloquée (« Recherche requise : … »). */
function lockedMessage(s: GameState | null, tool: BuildTool): string {
  if (tool === 'demolish') return 'Indisponible';
  if (s && !s.rules.progression) return 'Disponible en carrière';
  const { kind, gen } = toolBuild(tool);
  const node = gen > 1 ? `GPU génération ${gen}` : unlockedBy(kind)?.name;
  return node ? `Recherche requise : ${node}` : 'Indisponible';
}

/** Prix affiché d'un outil. */
export const toolCost = (tool: Exclude<BuildTool, 'demolish'>) => {
  const { kind, gen } = toolBuild(tool);
  return buildCost(kind, gen);
};

interface FamilyCard {
  root: HTMLButtonElement;
  thumb: HTMLElement;
  name: HTMLElement;
  cost: HTMLElement;
  dots: HTMLButtonElement[];
}

function card(label: string, key: string, art: Node, cost?: string): { root: HTMLButtonElement; thumb: HTMLElement; name: HTMLElement; cost: HTMLElement } {
  const thumb = el('span', 'tool-thumb', art);
  const name = el('span', 'tool-name', label);
  const costEl = el('span', 'tool-cost', cost ?? '');
  const root = el('button', 'tool-card', el('span', 'kbd', key), el('span', 'tool-lock', icon('lock', 12)), thumb, name, cost ? costEl : null);
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
  /** Carte de chaque famille avec ses pastilles, pour l'infobulle. */
  readonly familyCards = new Map<FamilyId, HTMLElement>();
  readonly hireCard: HTMLButtonElement;
  private readonly cards = new Map<FamilyId, FamilyCard>();
  /** Variante montrée par chaque famille : l'outil en main, sinon la dernière utilisée. */
  private readonly last = new Map<FamilyId, BuildTool>();
  /** Variante de départ du tour en cours de chaque famille : le tour rend la main avant d'y revenir. */
  private readonly start = new Map<FamilyId, BuildTool>();
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
      const c = card(info.label, family.key, icon(info.icon, 24), first === 'demolish' ? undefined : money(toolCost(first)));
      // Les pastilles sont des boutons posés sur la carte, pas dedans : pas de bouton dans un
      // bouton, et elles restent cliquables quand la carte est grisée faute d'argent.
      const dots = family.variants.length > 1 ? family.variants.map((v) => this.dot(family.id, v)) : [];
      const slot = el('div', 'tool-slot', c.root, dots.length ? el('div', 'variant-dots', ...dots) : null);
      c.root.onclick = () => this.cycle(family.id);
      c.root.dataset.tool = first;
      c.root.dataset.family = family.id;
      this.familyCards.set(family.id, slot);
      this.cards.set(family.id, { ...c, dots });
      this.last.set(family.id, first);
      bar.append(slot);
    }
    const hire = card('Embaucher', actionKey('hire'), icon('hire', 24), money(TECH.hireCost));
    hire.root.onclick = actions.hire;
    this.hireCard = hire.root;
    this.hireThumb = hire.thumb;

    // Calques : un bouton (H les fait défiler) et un menu pour choisir directement.
    this.overlayButton = el('button', 'btn overlay-button', this.overlayIcon, this.overlayLabel, el('span', 'kbd', actionKey('overlay')));
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
    this.edgeButton = toggle('edgePan', 'Bords', actionKey('edgePan'), actions.toggleEdgePan);
    this.helpButton = toggle('help', 'Aide', HELP_CHAR, actions.toggleHelp);
    this.researchButton = toggle('research', 'R&D', actionKey('research'), actions.toggleResearch);
    this.researchButton.dataset.panel = 'research';
    this.researchButton.hidden = true;
    const overlays = el('div', 'overlay-picker', this.overlayButton, this.overlayMenu);
    const toggles = el('div', 'toggle-group', overlays, this.edgeButton, this.helpButton, this.researchButton);
    bar.append(el('div', 'build-sep'), hire.root, el('div', 'build-sep'), toggles);
    this.root = bar;
  }

  /** Remplace l'icône d'une carte par la vignette du vrai modèle 3D. */
  setThumbnail(key: BuildTool | 'technician', url: string): void {
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
   * Touche ou clic d'une famille : prend la variante montrée, puis fait le tour des autres
   * variantes débloquées (en revenant au début de la liste, pour retrouver les anciennes
   * générations), puis rend la main (aucun outil). Les variantes verrouillées sont sautées ;
   * une famille absente de la partie ne fait rien, une famille verrouillée le dit.
   */
  cycle(id: FamilyId): void {
    const family = BUILD_FAMILIES.find((f) => f.id === id)!;
    const s = this.state;
    if (s && family.visible && !family.visible(s)) return;
    const open = s ? family.variants.filter((v) => toolAvailable(s, v)) : family.variants.slice(0, 1);
    if (!open.length) {
      this.actions.locked(lockedMessage(s, family.variants[0]));
      return;
    }
    const current = this.actions.currentTool();
    const inFamily = current !== null && family.variants.includes(current);
    const next = inFamily ? nextVariant(open, current, this.start.get(id) ?? current) : nextVariant(open, null, this.last.get(id));
    if (next) {
      this.last.set(id, next);
      if (!inFamily) this.start.set(id, next);
    }
    this.tool = next;
    this.actions.selectTool(next);
  }

  /** Pastille d'une variante : un clic la prend directement, ou dit quelle recherche il faut. */
  private dot(id: FamilyId, tool: BuildTool): HTMLButtonElement {
    const b = el('button', 'variant-dot');
    b.setAttribute('aria-label', TOOL_INFO[tool].label);
    b.onclick = () => this.pick(id, tool);
    return b;
  }

  /** Prend exactement cette variante ; la touche de la famille fera le tour à partir d'elle. */
  private pick(id: FamilyId, tool: BuildTool): void {
    const s = this.state;
    if (s && !toolAvailable(s, tool)) {
      this.actions.locked(lockedMessage(s, tool));
      return;
    }
    this.last.set(id, tool);
    this.start.set(id, tool);
    this.tool = tool;
    this.actions.selectTool(tool);
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
        if (tool !== 'demolish') setText(c.cost, money(toolCost(tool)));
        c.root.dataset.tool = tool;
      }
      family.variants.forEach((v, i) => {
        const dot = c.dots[i];
        if (!dot) return;
        dot.className = `variant-dot ${v === tool ? 'current' : ''} ${toolAvailable(s, v) ? '' : 'locked'}`;
        dot.setAttribute('aria-pressed', String(v === view.tool));
      });
      c.root.hidden = family.visible ? !family.visible(s) : false;
      // Verrouillée, la carte reste survolable (son infobulle dit quelle recherche il faut).
      const locked = !family.variants.some((v) => toolAvailable(s, v));
      c.root.classList.toggle('locked', locked);
      c.root.setAttribute('aria-disabled', String(locked));
      c.root.classList.toggle('active', owner?.id === family.id);
      c.root.disabled = !locked && tool !== 'demolish' && s.money < toolCost(tool);
    }
    this.hireCard.disabled = !canHire(s);
    for (const [mode, item] of this.overlayItems) item.hidden = mode !== null && !overlayAvailable(mode, s);
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
