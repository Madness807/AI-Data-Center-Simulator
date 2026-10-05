import type { SettingsStore } from '../../settings';
import type { GameState } from '../../sim/state';
import { dueTip, type CareerTip } from '../career-tips';
import { el, icon, restartAnimation, setText } from '../dom';

/** Un conseil se range de lui-même au bout de ce délai (temps réel, ms). */
const AUTO_HIDE_MS = 45_000;

/**
 * Conseils de carrière : une carte sous la barre du haut, sans mettre le jeu en pause. Un
 * conseil est noté comme vu (dans les options du joueur) dès qu'il s'affiche : il ne revient pas.
 */
export class TipCard {
  readonly root: HTMLElement;
  private readonly glyph = el('span', 'tip-card-icon');
  private readonly title = el('span', 'tuto-title');
  private readonly text = el('p', 'tuto-text');
  private current: CareerTip | null = null;
  private shownAt = 0;

  constructor(private readonly settings: SettingsStore) {
    const ok = el('button', 'btn btn-primary', icon('done', 14), 'Compris');
    ok.onclick = () => this.hide();
    this.root = el(
      'div',
      'tutorial tip-card glass',
      el('div', 'tuto-head', el('span', 'panel-title', icon('info', 14), 'Conseil de carrière')),
      el('div', 'tip-card-title', this.glyph, this.title),
      this.text,
      el('div', 'tuto-actions', ok),
    );
    this.root.hidden = true;
  }

  /** `allowed` : faux pendant une fenêtre bloquante (palier, victoire, pause) ; le conseil attend. */
  update(s: GameState, now: number, allowed: boolean): void {
    if (this.current && now - this.shownAt > AUTO_HIDE_MS) this.hide();
    if (this.current || !allowed) return;
    const tip = dueTip(s, this.settings.value.tipsSeen);
    if (!tip) return;
    this.current = tip;
    this.shownAt = now;
    this.glyph.replaceChildren(icon(tip.icon, 16));
    setText(this.title, tip.title);
    setText(this.text, tip.text);
    this.root.hidden = false;
    restartAnimation(this.root, 'advanced');
    this.settings.update({ tipsSeen: [...this.settings.value.tipsSeen, tip.id] });
  }

  hide(): void {
    this.current = null;
    this.root.hidden = true;
  }
}
