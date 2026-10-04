import { el, icon } from '../dom';

/** Refus immédiat (« Case occupée »…) affiché près du curseur, là où le joueur regarde. */
export class CursorFlash {
  readonly root = el('div', 'cursor-flashes');
  private x = 0;
  private y = 0;
  private readonly recent = new Map<string, number>();

  constructor() {
    window.addEventListener('pointermove', (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
    });
  }

  show(message: string): void {
    // Glisser sur des cases invalides ne doit pas empiler les messages.
    const now = performance.now();
    if (now - (this.recent.get(message) ?? 0) < 900) return;
    this.recent.set(message, now);
    const flash = el('div', 'cursor-flash', icon('failed', 13), message);
    flash.style.transform = `translate(${this.x + 14}px, ${this.y - 34}px)`;
    this.root.append(flash);
    setTimeout(() => flash.remove(), 1500);
  }
}
