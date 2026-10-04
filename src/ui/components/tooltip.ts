import { el, setHidden } from '../dom';

const OFFSET = 16;

/**
 * Infobulle qui suit le curseur. Deux sources : un élément du HUD survolé (prioritaire)
 * et le monde (case ou équipement sous la souris), fourni à chaque image.
 */
export class Tooltip {
  readonly root = el('div', 'tooltip');
  private x = 0;
  private y = 0;
  private uiContent: (() => Node) | null = null;
  private worldContent: Node | null = null;
  private worldKey = '';

  constructor() {
    this.root.hidden = true;
    window.addEventListener('pointermove', (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
      this.place();
    });
  }

  /** Infobulle riche sur un élément du HUD (remplace l'attribut title, lent et terne). */
  bind(target: HTMLElement, content: () => Node): void {
    target.addEventListener('pointerenter', () => {
      this.uiContent = content;
      this.render();
    });
    target.addEventListener('pointerleave', () => {
      if (this.uiContent === content) this.uiContent = null;
      this.render();
    });
  }

  /** Contenu lié au monde ; `key` évite de reconstruire le DOM quand rien n'a changé. */
  setWorld(key: string, build: (() => Node) | null): void {
    if (key === this.worldKey) return;
    this.worldKey = key;
    this.worldContent = build ? build() : null;
    this.render();
  }

  private render(): void {
    const node = this.uiContent ? this.uiContent() : this.worldContent;
    setHidden(this.root, !node);
    if (node) this.root.replaceChildren(node);
    this.place();
  }

  private place(): void {
    if (this.root.hidden) return;
    const { offsetWidth: w, offsetHeight: h } = this.root;
    const left = this.x + OFFSET + w > window.innerWidth ? this.x - OFFSET - w : this.x + OFFSET;
    const top = this.y + OFFSET + h > window.innerHeight ? this.y - OFFSET - h : this.y + OFFSET;
    this.root.style.transform = `translate(${Math.max(4, left)}px, ${Math.max(4, top)}px)`;
  }
}
