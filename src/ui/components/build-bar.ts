import { buildCost, TECH } from '../../sim/balance';
import { isUnlocked, modifiers, unlockedBy } from '../../sim/progression';
import { canHire } from '../../sim/stats';
import { toolBuild, type Tool } from '../../input/build';
import { actionKey } from '../../input/keymap';
import type { GameState } from '../../sim/state';
import { KIND_INFO, shortName } from '../catalog';
import { el, icon, setText } from '../dom';
import { money } from '../format';
import type { IconName } from '../icons';
import { stripLeft, toolFigures } from '../tool-figures';
import { nextVariant } from '../variant-cycle';

export interface BuildBarActions {
  /** Outil réellement en main (pas celui de la dernière image : deux touches peuvent arriver entre deux images). */
  currentTool: () => Tool;
  /** Prend exactement cet outil (null : aucun), sans effet de bascule. */
  selectTool: (tool: Tool) => void;
  hire: () => void;
  /** Famille ou variante verrouillée : le message à montrer (« Recherche requise : … »). */
  locked: (message: string) => void;
}

export interface BuildBarView {
  tool: Tool;
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
/**
 * Variantes d'une famille qui existent dans cette partie : toutes en carrière (les verrouillées
 * montrent la recherche à faire), seulement les disponibles en partie rapide.
 */
const modeVariants = (s: GameState | null, family: (typeof BUILD_FAMILIES)[number]): BuildTool[] =>
  !s ? family.variants.slice(0, 1) : s.rules.progression ? family.variants : family.variants.filter((v) => toolAvailable(s, v));

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
  dots: HTMLElement[];
}

/** Tuile d'une variante dans le bandeau : vignette, nom, prix (ou recherche requise) et chiffres clés. */
interface VariantTile {
  root: HTMLButtonElement;
  thumb: HTMLElement;
  cost: HTMLElement;
  figures: HTMLElement;
  /** Vignette affichée (icône ou modèle 3D), pour ne pas reconstruire l'image à chaque image. */
  shown: string;
}

function card(label: string, key: string, art: Node, cost?: string): { root: HTMLButtonElement; thumb: HTMLElement; name: HTMLElement; cost: HTMLElement } {
  const thumb = el('span', 'tool-thumb', art);
  const name = el('span', 'tool-name', label);
  const costEl = el('span', 'tool-cost', cost ?? '');
  const root = el('button', 'tool-card', el('span', 'kbd', key), el('span', 'tool-lock', icon('lock', 12)), thumb, name, cost ? costEl : null);
  return { root, thumb, name, cost: costEl };
}

/**
 * Barre de construction : une carte par famille d'équipements, la démolition et l'embauche.
 * Quand une famille à plusieurs variantes est en main, un bandeau au-dessus de sa carte montre
 * toutes ses variantes côte à côte ; un clic en prend une.
 */
export class BuildBar {
  readonly root: HTMLElement;
  /** Carte de chaque famille, pour l'infobulle. */
  readonly familyCards = new Map<FamilyId, HTMLButtonElement>();
  /** Tuile de chaque variante du bandeau, pour l'infobulle détaillée. */
  readonly variantTiles = new Map<BuildTool, HTMLButtonElement>();
  readonly hireCard: HTMLButtonElement;
  private readonly bar: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly cards = new Map<FamilyId, FamilyCard>();
  private readonly tiles = new Map<BuildTool, VariantTile>();
  /** Famille dont le bandeau est ouvert, et ses variantes affichées (clé de mise en page). */
  private stripKey = '';
  private stripFamily: FamilyId | null = null;
  /** Variante montrée par chaque famille : l'outil en main, sinon la dernière utilisée. */
  private readonly last = new Map<FamilyId, BuildTool>();
  /** Variante de départ du tour en cours de chaque famille : le tour rend la main avant d'y revenir. */
  private readonly start = new Map<FamilyId, BuildTool>();
  private readonly urls = new Map<string, string>();
  private readonly shown = new Map<FamilyId, string>();
  private readonly hireThumb: HTMLElement;
  private state: GameState | null = null;
  private tool: Tool = null;

  constructor(private readonly actions: BuildBarActions) {
    this.bar = el('div', 'build-bar glass');
    this.strip = el('div', 'variant-strip glass');
    this.strip.hidden = true;
    for (const family of BUILD_FAMILIES) {
      const first = family.variants[0];
      const info = TOOL_INFO[first];
      const c = card(info.label, family.key, icon(info.icon, 24), first === 'demolish' ? undefined : money(toolCost(first)));
      const dots = family.variants.length > 1 ? family.variants.map(() => el('span', 'variant-dot')) : [];
      if (dots.length) c.root.append(el('span', 'variant-dots', ...dots));
      c.root.onclick = () => this.cycle(family.id);
      c.root.dataset.tool = first;
      c.root.dataset.family = family.id;
      this.familyCards.set(family.id, c.root);
      this.cards.set(family.id, { ...c, dots });
      this.last.set(family.id, first);
      if (family.variants.length > 1) for (const v of family.variants) this.tiles.set(v, this.tile(family.id, v));
      this.bar.append(c.root);
    }
    const hire = card('Embaucher', actionKey('hire'), icon('hire', 24), money(TECH.hireCost));
    hire.root.onclick = actions.hire;
    this.hireCard = hire.root;
    this.hireThumb = hire.thumb;
    this.bar.append(el('div', 'build-sep'), hire.root);
    this.root = el('div', 'build-dock', this.strip, this.bar);
    // Les cartes changent de largeur avec la mise en page (inspecteur ouvert, petit écran), et le
    // bandeau passe en colonne sur les écrans étroits : on le recentre dans les deux cas.
    const resize = new ResizeObserver(() => this.placeStrip());
    resize.observe(this.bar);
    resize.observe(this.strip);
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

  /** Tuile d'une variante : un clic la prend directement, ou dit quelle recherche il faut. */
  private tile(id: FamilyId, tool: BuildTool): VariantTile {
    const thumb = el('span', 'tile-thumb');
    const cost = el('span', 'tile-cost mono');
    const figures = el('span', 'tile-figures');
    const root = el(
      'button',
      'variant-tile',
      el('span', 'tool-lock', icon('lock', 12)),
      thumb,
      el('span', 'tile-text', el('b', 'tile-name', TOOL_INFO[tool].label), cost, figures),
    );
    root.dataset.variant = tool;
    root.onclick = () => this.pick(id, tool);
    this.variantTiles.set(tool, root);
    return { root, thumb, cost, figures, shown: '' };
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
      const variants = modeVariants(s, family);
      family.variants.forEach((v, i) => {
        const dot = c.dots[i];
        if (!dot) return;
        dot.hidden = variants.length < 2 || !variants.includes(v);
        dot.className = `variant-dot ${v === tool ? 'current' : ''} ${toolAvailable(s, v) ? '' : 'locked'}`;
      });
      c.root.hidden = family.visible ? !family.visible(s) : false;
      // Verrouillée, la carte reste survolable (son infobulle dit quelle recherche il faut).
      const locked = !family.variants.some((v) => toolAvailable(s, v));
      c.root.classList.toggle('locked', locked);
      c.root.setAttribute('aria-disabled', String(locked));
      c.root.classList.toggle('active', owner?.id === family.id);
      // Trop chère, la carte reste cliquable : son bandeau propose peut-être une variante moins chère.
      c.root.classList.toggle('unaffordable', !locked && tool !== 'demolish' && s.money < toolCost(tool));
    }
    this.hireCard.disabled = !canHire(s);
    this.updateStrip(s, owner ?? null, view.tool);
  }

  /** Bandeau de la famille en main, s'il a au moins deux variantes dans cette partie. */
  private updateStrip(s: GameState, owner: (typeof BUILD_FAMILIES)[number] | null, tool: Tool): void {
    const variants = owner ? modeVariants(s, owner) : [];
    const open = owner !== null && variants.length > 1;
    const key = open ? `${owner.id}:${variants.join(',')}` : '';
    if (key !== this.stripKey) {
      this.stripKey = key;
      this.stripFamily = open ? owner.id : null;
      this.strip.replaceChildren(...(open ? variants.map((v) => this.tiles.get(v)!.root) : []));
      this.strip.hidden = !open;
      this.placeStrip();
    }
    if (!open) return;
    for (const v of variants) {
      const t = this.tiles.get(v)!;
      const available = toolAvailable(s, v);
      const build = v as Exclude<BuildTool, 'demolish'>;
      const url = this.urls.get(v);
      const thumbKey = url ?? TOOL_INFO[v].icon;
      if (t.shown !== thumbKey) {
        t.shown = thumbKey;
        t.thumb.replaceChildren(url ? Object.assign(document.createElement('img'), { src: url, alt: '' }) : icon(TOOL_INFO[v].icon, 22));
      }
      setText(t.cost, available ? money(toolCost(build)) : lockedMessage(s, v).replace('Recherche requise : ', 'Recherche : '));
      const figures = available ? toolFigures(s, build) : [];
      if (t.figures.dataset.key !== figures.join('|')) {
        t.figures.dataset.key = figures.join('|');
        t.figures.replaceChildren(...figures.map((f) => el('span', undefined, f)));
      }
      t.root.classList.toggle('current', v === tool);
      t.root.classList.toggle('locked', !available);
      t.root.classList.toggle('unaffordable', available && s.money < toolCost(build));
      t.root.setAttribute('aria-pressed', String(v === tool));
    }
  }

  /** Centre le bandeau sur la carte de sa famille, sans dépasser la barre. */
  private placeStrip(): void {
    if (!this.stripFamily) return;
    const anchor = this.cards.get(this.stripFamily)!.root;
    const left = stripLeft(anchor.offsetLeft + anchor.offsetWidth / 2, this.strip.offsetWidth, this.bar.offsetWidth);
    this.strip.style.left = `${Math.round(left)}px`;
  }
}
