import { el, icon } from '../dom';
import { matchChapters, type GuideBlock, type GuideChapter } from '../guide/model';

/** Pastille d'un palier ou du mode carrière, devant un titre. */
const badge = (text: string | undefined) => (text ? el('span', 'chip guide-badge', text) : null);

function block(b: GuideBlock): HTMLElement {
  switch (b.kind) {
    case 'p':
      return el('p', 'guide-p', b.text);
    case 'h':
      return el('h3', 'guide-h', el('span', undefined, b.text), badge(b.badge));
    case 'facts':
      return el('div', 'guide-facts', ...b.rows.map(([label, value]) => el('div', 'guide-fact', el('span', undefined, label), el('b', 'mono', value))));
    case 'tips':
      return el('ul', 'guide-tips', ...b.items.map((t) => el('li', undefined, icon('info', 13), el('span', undefined, t))));
    case 'list':
      return el('ul', 'guide-list', ...b.items.map((t) => el('li', undefined, t)));
    case 'cards':
      return el(
        'div',
        'guide-cards',
        ...b.items.map((c) => el('div', 'guide-card', el('b', undefined, c.title), el('span', 'guide-card-meta', c.meta), el('p', undefined, c.text))),
      );
    case 'keys':
      return el(
        'div',
        'help-section',
        el('h3', undefined, b.title),
        ...b.lines.map(([label, keys]) => el('div', 'help-line', el('span', undefined, label), el('span', undefined, ...keys.map((k) => el('span', 'kbd', k))))),
      );
  }
}

/**
 * Guide du jeu en fenêtre : sommaire filtrable à gauche, chapitre à droite. Les chapitres sont
 * recalculés à chaque ouverture (chiffres de l'équilibrage, touches selon le clavier) ; le guide
 * se souvient du dernier chapitre lu.
 */
export class Guide {
  readonly root: HTMLElement;
  private readonly nav = el('nav', 'guide-nav');
  private readonly body = el('article', 'guide-body');
  private readonly search: HTMLInputElement;
  private chapters: GuideChapter[] = [];
  private current = '';

  constructor(
    private readonly source: () => GuideChapter[],
    private readonly onClose: () => void,
  ) {
    this.search = Object.assign(el('input', 'guide-search'), { type: 'search', placeholder: 'Rechercher…', spellcheck: false });
    this.search.setAttribute('aria-label', 'Rechercher dans le guide');
    this.search.oninput = () => this.renderNav(true);
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 16));
    close.setAttribute('aria-label', 'Fermer le guide');
    close.onclick = () => this.close();
    const panel = el(
      'div',
      'guide glass',
      el('div', 'guide-head', el('span', 'panel-title', icon('book', 14), 'Guide du jeu'), close),
      el('div', 'guide-main', el('div', 'guide-side', this.search, this.nav), this.body),
    );
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Guide du jeu');
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Ouvre le guide sur un chapitre (sinon le dernier lu), ou y passe s'il est déjà ouvert. */
  open(chapterId?: string): void {
    if (this.root.hidden) {
      this.chapters = this.source();
      this.search.value = '';
    }
    const id = chapterId ?? this.current;
    this.root.hidden = false;
    this.show(this.chapters.some((c) => c.id === id) ? id : this.chapters[0].id);
    this.renderNav(false);
  }

  close(): void {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.onClose();
  }

  /** Sommaire des chapitres qui répondent à la recherche ; `follow` passe au premier trouvé. */
  private renderNav(follow: boolean): void {
    const found = matchChapters(this.chapters, this.search.value);
    if (follow && found.length && !found.some((c) => c.id === this.current)) this.show(found[0].id);
    const links = found.map((c) => {
      const b = el('button', `guide-link ${c.id === this.current ? 'active' : ''}`, icon(c.icon, 15), el('span', undefined, c.title), badge(c.badge));
      b.onclick = () => {
        this.show(c.id);
        this.renderNav(false);
      };
      return b;
    });
    this.nav.replaceChildren(...(links.length ? links : [el('p', 'guide-empty', 'Aucun chapitre ne correspond.')]));
  }

  private show(id: string): void {
    const c = this.chapters.find((x) => x.id === id) ?? this.chapters[0];
    this.current = c.id;
    this.body.replaceChildren(el('h2', 'guide-title', icon(c.icon, 20), el('span', undefined, c.title), badge(c.badge)), ...c.blocks.map(block));
    this.body.scrollTop = 0;
  }
}
