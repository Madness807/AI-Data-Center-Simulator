import type { GameEvent } from '../../sim/state';
import { el, icon } from '../dom';
import type { IconName } from '../icons';

const ICON: Record<GameEvent['type'], IconName> = { error: 'failed', warning: 'alert', info: 'info', success: 'done' };

/** Messages éphémères sous la barre du haut. */
export class Toasts {
  readonly root = el('div', 'toasts');
  private readonly recent = new Map<string, number>();

  show(e: GameEvent): void {
    // Glisser sur des cases invalides ne doit pas inonder l'écran.
    const now = performance.now();
    if (now - (this.recent.get(e.message) ?? 0) < 1200) return;
    this.recent.set(e.message, now);
    const t = el('div', `toast ${e.type}`, icon(ICON[e.type], 15), e.message);
    this.root.append(t);
    const life = e.type === 'success' || e.type === 'warning' ? 4000 : 2200;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 450);
  }

  clear(): void {
    this.root.replaceChildren();
  }
}
