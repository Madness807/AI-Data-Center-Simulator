import { RESEARCH_RATE } from '../../sim/balance';
import { actionKey, keyLabel, matches } from '../../input/keymap';
import { levelOpen, levelTier } from '../../sim/progression';
import { BRANCHES, researchById } from '../../sim/research';
import type { GameState } from '../../sim/state';
import { BRANCH_ICON, RESEARCH_ICON } from '../catalog';
import { el, icon, setHidden, setStyle, setText } from '../dom';
import { duration, percent } from '../format';
import type { IconName } from '../icons';
import { svg } from '../svg';
import { lanesFrom, linkShape, type Box } from '../research-links';
import {
  defaultSelection,
  edgeState,
  IDLE_TEXT,
  LEVELS,
  neighbour,
  progressOf,
  rateText,
  related,
  remainingSeconds,
  shareNote,
  structureKey,
  tileState,
  tileView,
  TREE,
  type TreeEdge,
} from '../research-model';
import { ResearchDetail } from './research-detail';

export interface ResearchActions {
  setShare: (share: number) => void;
  /** null : arrête l'étude en cours (la part réservée retourne aux contrats). */
  start: (id: string | null) => void;
}

interface Tile {
  root: HTMLButtonElement;
  glyph: HTMLElement;
  glyphName: IconName | null;
  meta: HTMLElement;
  fill: HTMLElement;
}

interface Link {
  edge: TreeEdge;
  group: SVGGElement;
  halo: SVGPathElement | null;
  line: SVGPathElement;
  arrow: SVGPathElement;
}

/** Délai avant qu'un survol prévisualise une tuile dans la fiche (ms). */
const HOVER_MS = 90;

/** Couleur d'une branche portée par un élément : --b et --b-rgb, lues par le CSS. */
function paint(e: HTMLElement | SVGElement, branch: string): void {
  e.style.setProperty('--b', `var(--branch-${branch})`);
  e.style.setProperty('--b-rgb', `var(--branch-${branch}-rgb)`);
}

/**
 * Panneau Recherche (U, carrière) : un arbre technologique. Les niveaux (et le palier qui les
 * ouvre) en lignes, les branches en colonnes, les liens de prérequis entre les tuiles, et une
 * fiche à droite pour lire puis lancer une recherche. Le DOM est construit une fois ; seules la
 * recherche en cours et les valeurs vivantes changent à chaque image.
 */
export class ResearchPanel {
  readonly root: HTMLElement;
  private readonly tree = el('div', 'research-tree');
  private readonly links = svg('svg', { class: 'rt-links', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  private readonly rate = el('span', 'mono');
  private readonly slider: HTMLInputElement;
  private readonly shareValue = el('span', 'mono rt-share-value');
  private readonly shareNoteEl = el('span', 'rt-share-note');
  private readonly strip = el('div', 'rt-strip');
  private readonly stripIcon = el('span', 'rt-strip-icon');
  private readonly stripName = el('button', 'rt-strip-name');
  private readonly stripFill = el('div', 'rt-strip-fill');
  private readonly stripInfo = el('span', 'mono rt-strip-info');
  private readonly stripIdle = el('span', 'rt-strip-idle', IDLE_TEXT);
  private readonly stripBusy: HTMLElement;
  private readonly tiles = new Map<string, Tile>();
  private readonly linkEls: Link[] = [];
  private readonly levelHeads: HTMLElement[] = [];
  private readonly bands: HTMLElement[] = [];
  private readonly branchHeads: HTMLElement[] = [];
  private readonly detail: ResearchDetail;
  private state: GameState | null = null;
  private key = '';
  private selected: string | null = null;
  private preview: string | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly actions: ResearchActions) {
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 16));
    close.title = `Fermer (${actionKey('research')} ou ${actionKey('cancel')})`;
    close.onclick = () => this.close();

    this.slider = el('input', 'rt-slider');
    Object.assign(this.slider, { type: 'range', min: '0', max: String(RESEARCH_RATE.maxShare * 100), step: '5' });
    this.slider.oninput = () => actions.setShare(Number(this.slider.value) / 100);
    this.slider.setAttribute('aria-label', 'Part du calcul pour la R&D');

    const stop = el('button', 'btn', icon('pause', 13), 'Arrêter');
    stop.onclick = () => actions.start(null);
    this.stripName.onclick = () => {
      const current = this.state?.research.current;
      if (current) this.select(current, true);
    };
    this.stripBusy = el('div', 'rt-strip-busy', this.stripIcon, el('span', 'rt-strip-label', 'En cours'), this.stripName, el('div', 'rt-strip-meter', this.stripFill), this.stripInfo, stop);
    this.strip.append(this.stripBusy, this.stripIdle);

    this.detail = new ResearchDetail({ launch: (id) => this.launch(id), stop: () => actions.start(null) });
    this.buildTree();

    const head = el(
      'div',
      'menu-head rt-head',
      el('span', 'panel-title', icon('research', 14), el('span', undefined, 'Recherche · '), this.rate),
      el('label', 'rt-share', el('span', undefined, 'Part du calcul pour la R&D'), this.slider, this.shareValue),
      this.shareNoteEl,
      el('span', 'kbd', actionKey('research')),
      close,
    );
    head.querySelector('.panel-title')!.id = 'research-title';
    const legend = el(
      'div',
      'rt-legend',
      ...(
        [
          ['done', 'Terminée'],
          ['running', 'En cours'],
          ['launch', 'Disponible'],
          ['paused', 'Entamée'],
          ['lock', 'Verrouillée'],
        ] as const
      ).map(([glyph, label]) => el('span', 'rt-legend-item', icon(glyph, 12), label)),
      el('span', 'rt-legend-item', el('span', 'rt-legend-dash'), 'prérequis à faire'),
      el('span', 'rt-legend-keys', `${['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].map(keyLabel).join('')} parcourir · ${actionKey('confirm')} lancer`),
    );
    const panel = el(
      'section',
      'research glass',
      head,
      this.strip,
      el('div', 'rt-body', el('div', 'rt-tree-wrap', this.tree, legend), this.detail.root),
    );
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'research-title');
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });

    // Les liens suivent les tuiles : à l'ouverture, quand la fenêtre ou la taille de l'interface change, quand les polices arrivent.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.layoutLinks());
      try {
        observer.observe(this.tree, { box: 'device-pixel-content-box' });
      } catch {
        observer.observe(this.tree);
      }
    }
    void document.fonts?.ready.then(() => this.layoutLinks());
  }

  /** La grille : en-têtes de branches, une ligne par niveau (bandeau, en-tête, cases), et les liens. */
  private buildTree(): void {
    this.tree.style.gridTemplateColumns = `var(--rt-head-w) repeat(${BRANCHES.length}, minmax(0, 1fr))`;
    this.tree.setAttribute('role', 'group');
    this.tree.setAttribute('aria-label', 'Arbre de recherche');
    this.tree.append(this.links, el('div', 'rt-corner', 'Palier'));
    BRANCHES.forEach((b, col) => {
      const head = el('div', 'rt-branch', icon(BRANCH_ICON[b.id], 15), el('span', undefined, b.name));
      paint(head, b.id);
      head.style.gridColumn = String(col + 2);
      this.branchHeads.push(head);
      this.tree.append(head);
    });
    LEVELS.forEach((level, i) => {
      const row = String(i + 2);
      const band = el('div', 'rt-band');
      band.style.gridRow = row;
      const tier = levelTier(level).name;
      // Un cadenas à côté du numéro tant que le palier n'est pas atteint (le bandeau est hachuré).
      const lock = el('span', 'rt-level-lock', icon('lock', 10));
      const header = el('div', 'rt-level', el('span', 'rt-level-n', `Niveau ${level}`, lock), el('span', 'rt-level-tier', tier));
      header.style.gridRow = row;
      header.style.gridColumn = '1';
      this.bands.push(band);
      this.levelHeads.push(header);
      this.tree.append(band, header);
      for (const cell of TREE.cells.filter((c) => c.level === level)) {
        if (!cell.ids.length) continue; // une case vide ne se dessine pas : elle passerait pour un verrou
        const box = el('div', 'rt-cell', ...cell.ids.map((id) => this.buildTile(id)));
        box.style.gridRow = row;
        box.style.gridColumn = String(cell.col + 2);
        this.tree.append(box);
      }
    });
    for (const edge of TREE.edges) {
      const group = svg('g', { class: `rt-link ${edge.kind}` });
      paint(group, edge.branch);
      // Le lien traversant croise un autre lien : un liseré sombre dessous fait comme un pont.
      const halo = edge.kind === 'cross' ? svg('path', { class: 'rt-halo' }) : null;
      const line = svg('path', { class: 'rt-line' });
      const arrow = svg('path', { class: 'rt-arrow' });
      if (halo) group.append(halo);
      group.append(line, arrow);
      this.links.append(group);
      this.linkEls.push({ edge, group, halo, line, arrow });
    }
    this.tree.addEventListener('pointerleave', () => this.setPreview(null));
  }

  private buildTile(id: string): HTMLButtonElement {
    const node = researchById(id)!;
    const glyph = el('span', 'rt-glyph');
    const meta = el('span', 'rt-meta');
    const fill = el('span', 'rt-tile-fill');
    const root = el(
      'button',
      'rt-tile',
      el('span', 'rt-tile-icon', icon(RESEARCH_ICON[id], 16)),
      el('span', 'rt-tile-name', node.name),
      el('span', 'rt-tile-meta', glyph, meta),
      el('span', 'rt-tile-bar', fill),
    );
    root.dataset.id = id;
    root.tabIndex = -1;
    paint(root, node.branch);
    root.onclick = () => this.select(id, false);
    root.ondblclick = () => this.launch(id);
    root.addEventListener('focus', () => {
      if (this.selected !== id) this.select(id, false);
    });
    root.addEventListener('pointerenter', () => {
      if (this.hoverTimer) clearTimeout(this.hoverTimer);
      this.hoverTimer = setTimeout(() => this.setPreview(id), HOVER_MS);
    });
    this.tiles.set(id, { root, glyph, glyphName: null, meta, fill });
    return root as HTMLButtonElement;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
    if (!this.state) return;
    // À chaque ouverture : la recherche en cours, sinon la première disponible.
    this.selected = defaultSelection(this.state);
    this.preview = null;
    this.key = '';
    this.update(this.state);
    this.layoutLinks();
    this.tiles.get(this.selected)?.root.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true;
    this.setPreview(null);
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Nouvelle partie : oublier la sélection et l'état affiché. */
  reset(): void {
    this.selected = null;
    this.preview = null;
    this.key = '';
    this.detail.reset();
  }

  /** Touches du panneau : flèches (ou ZQSD/WASD) pour parcourir, Entrée pour lancer. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.isOpen || document.activeElement instanceof HTMLInputElement) return false;
    const dir = matches('panUp', e) ? 'up' : matches('panDown', e) ? 'down' : matches('panLeft', e) ? 'left' : matches('panRight', e) ? 'right' : null;
    if (dir) {
      const next = this.selected ? neighbour(this.selected, dir) : null;
      if (next) this.select(next, true);
      return true;
    }
    if (matches('confirm', e)) {
      // Entrée sur un autre bouton du panneau (Arrêter, Fermer) : le navigateur le déclenche.
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && this.root.contains(active) && !active.classList.contains('rt-tile')) return false;
      if (this.selected) this.launch(this.selected);
      return true;
    }
    return false;
  }

  private select(id: string, focus: boolean): void {
    this.selected = id;
    this.preview = null;
    if (focus) this.tiles.get(id)?.root.focus({ preventScroll: true });
    this.refreshFocus();
  }

  private setPreview(id: string | null): void {
    if (this.hoverTimer && id === null) {
      clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (this.preview === id) return;
    this.preview = id === this.selected ? null : id;
    this.refreshFocus();
  }

  /** Lancer : seulement une recherche disponible ; sinon la raison clignote dans la fiche. */
  private launch(id: string): void {
    const s = this.state;
    if (!s) return;
    if (this.selected !== id) this.select(id, false);
    if (tileState(s, id) === 'available') this.actions.start(id);
    else this.detail.refuse();
  }

  update(s: GameState): void {
    this.state = s;
    if (!this.isOpen) return;
    const r = s.research;
    const key = structureKey(s);
    if (key !== this.key) {
      this.key = key;
      this.refreshStructure(s);
    }
    setText(this.rate, rateText(s));
    if (document.activeElement !== this.slider) this.slider.value = String(Math.round(r.share * 100));
    setText(this.shareValue, percent(r.share));
    setText(this.shareNoteEl, shareNote(s));
    // La recherche en cours : sa tuile et le bandeau bougent à chaque image.
    const current = r.current;
    if (current) {
      const view = tileView(s, current);
      const tile = this.tiles.get(current);
      if (tile) {
        setText(tile.meta, view.meta);
        setStyle(tile.fill, 'width', `${view.progress * 100}%`);
      }
      const node = researchById(current)!;
      const done = r.progress[current] ?? 0;
      const left = remainingSeconds(s, current);
      setText(this.stripInfo, `${Math.floor(done)} / ${node.cost} pts · ${left === Infinity ? 'à l’arrêt' : `encore ${duration(left)}`}`);
      setStyle(this.stripFill, 'width', `${progressOf(s, current) * 100}%`);
    }
    this.detail.update(s);
  }

  /** Tout ce qui ne change qu'avec l'état de l'arbre : tuiles, niveaux, liens, bandeau, fiche. */
  private refreshStructure(s: GameState): void {
    for (const [id, tile] of this.tiles) {
      const view = tileView(s, id);
      tile.root.classList.remove('done', 'current', 'available', 'locked', 'tier');
      tile.root.classList.add(view.state);
      if (tile.glyphName !== view.glyph) {
        tile.glyphName = view.glyph;
        tile.glyph.replaceChildren(icon(view.glyph, 12));
      }
      setText(tile.meta, view.meta);
      setStyle(tile.fill, 'width', `${view.progress * 100}%`);
      tile.root.setAttribute('aria-label', view.label);
    }
    LEVELS.forEach((level, i) => {
      const open = levelOpen(s, level);
      this.bands[i].classList.toggle('closed', !open);
      this.levelHeads[i].classList.toggle('closed', !open);
      this.levelHeads[i].setAttribute('aria-label', open ? `Niveau ${level}, ${levelTier(level).name}` : `Niveau ${level} : s’ouvre au palier ${levelTier(level).name}`);
    });
    for (const l of this.linkEls) {
      const target = tileState(s, l.edge.to);
      l.group.setAttribute('class', `rt-link ${l.edge.kind} ${edgeState(s, l.edge)}${target === 'tier' ? ' tier' : ''}`);
    }
    const current = s.research.current;
    setHidden(this.stripBusy, !current);
    setHidden(this.stripIdle, !!current);
    if (current) {
      const node = researchById(current)!;
      paint(this.strip, node.branch);
      this.stripIcon.replaceChildren(icon(RESEARCH_ICON[current], 15));
      setText(this.stripName, node.name);
    } else this.strip.style.removeProperty('--b');
    this.refreshFocus();
  }

  /** Sélection, aperçu, tuiles liées et liens surlignés, fiche. */
  private refreshFocus(): void {
    const s = this.state;
    if (!s || !this.isOpen) return;
    const shown = this.preview ?? this.selected ?? defaultSelection(s);
    const near = related(shown);
    const ring = new Set([...near.requires, ...near.unlocks]);
    for (const [id, tile] of this.tiles) {
      const pressed = id === this.selected;
      tile.root.setAttribute('aria-pressed', String(pressed));
      tile.root.tabIndex = pressed ? 0 : -1;
      tile.root.classList.toggle('shown', id === shown);
      tile.root.classList.toggle('rel', ring.has(id));
    }
    for (const l of this.linkEls) l.group.classList.toggle('hl', l.edge.from === shown || l.edge.to === shown);
    this.detail.show(s, shown, this.preview !== null, this.key);
  }

  /** Recalcule le tracé des liens d'après la position réelle des tuiles (zoom de l'interface compris). */
  private layoutLinks(): void {
    if (!this.isOpen) return;
    const host = this.tree.getBoundingClientRect();
    if (!host.width || !this.tree.offsetWidth) return;
    // Sous un zoom CSS, les rectangles mesurés et la mise en page peuvent ne pas avoir la même échelle.
    const k = host.width / this.tree.offsetWidth;
    const local = (e: Element): Box => {
      const r = e.getBoundingClientRect();
      return { x: (r.left - host.left) / k, y: (r.top - host.top) / k, w: r.width / k, h: r.height / k };
    };
    const boxes = new Map<string, Box>();
    for (const [id, tile] of this.tiles) boxes.set(id, local(tile.root));
    const head = local(this.levelHeads[0]);
    const lanes = lanesFrom(this.branchHeads.map(local), head.x + head.w);
    this.links.setAttribute('viewBox', `0 0 ${this.tree.offsetWidth} ${this.tree.offsetHeight}`);
    for (const l of this.linkEls) {
      const shape = linkShape(l.edge, { boxes, lanes });
      if (!shape) continue;
      l.line.setAttribute('d', shape.d);
      l.halo?.setAttribute('d', shape.d);
      l.arrow.setAttribute('d', shape.arrow);
    }
  }
}

