import type { Command } from '../../sim/commands';
import type { Cell } from '../../sim/entities';
import type { GameState } from '../../sim/state';
import { el, icon, setText } from '../dom';
import { STEPS, advance, createMemo, type TutorialContext, type TutorialMemo } from './steps';

export interface TutorialHost {
  enqueue: (c: Command) => void;
  ping: (cell: Cell) => void;
  onFinish: () => void;
}

const PING_EVERY_MS = 2500;

/**
 * Partie guidée : un panneau d'objectif sous la barre du haut, l'élément du HUD concerné qui
 * pulse et un ping sur la case conseillée. Les étapes elles-mêmes sont dans steps.ts.
 */
export class Tutorial {
  readonly root: HTMLElement;
  private readonly counter = el('span', 'tuto-counter mono');
  private readonly title = el('span', 'tuto-title');
  private readonly text = el('p', 'tuto-text');
  private readonly finish: HTMLButtonElement;
  private index = -1;
  private shown = -1;
  private memo: TutorialMemo | null = null;
  private highlighted: Element | null = null;
  private lastPing = -Infinity;

  constructor(private readonly host: TutorialHost) {
    const skip = el('button', 'btn btn-ghost', 'Passer le tutoriel');
    skip.onclick = () => this.stop();
    this.finish = el('button', 'btn btn-primary', icon('done', 14), 'Terminer');
    this.finish.onclick = () => {
      this.stop();
      host.onFinish();
    };
    this.root = el(
      'div',
      'tutorial glass',
      el('div', 'tuto-head', el('span', 'panel-title', icon('target', 14), 'Partie guidée'), this.counter),
      this.title,
      this.text,
      el('div', 'tuto-actions', skip, this.finish),
    );
    this.root.hidden = true;
  }

  get active(): boolean {
    return this.index >= 0;
  }

  start(s: GameState): void {
    this.index = 0;
    this.shown = -1;
    this.memo = createMemo(s);
    this.root.hidden = false;
  }

  stop(): void {
    this.index = -1;
    this.root.hidden = true;
    this.setHighlight(null);
  }

  update(ctx: TutorialContext, now: number): void {
    if (!this.active || !this.memo) return;
    this.index = advance(this.index, ctx, this.memo, this.host.enqueue);
    if (this.index >= STEPS.length) {
      this.stop();
      this.host.onFinish();
      return;
    }
    const step = STEPS[this.index];
    if (this.index !== this.shown) {
      this.shown = this.index;
      setText(this.counter, `${this.index + 1} / ${STEPS.length}`);
      setText(this.title, step.title);
      setText(this.text, step.text);
      this.finish.hidden = this.index !== STEPS.length - 1;
      this.lastPing = -Infinity;
      // Petit signal visuel à chaque nouvelle étape.
      this.root.classList.remove('advanced');
      void this.root.offsetWidth;
      this.root.classList.add('advanced');
    }
    // L'élément à mettre en avant peut n'apparaître qu'en cours d'étape (bouton de l'inspecteur…).
    this.setHighlight(step.highlight ? document.querySelector(step.highlight) : null);
    if (step.target && now - this.lastPing > PING_EVERY_MS) {
      const cell = step.target(ctx, this.memo);
      if (cell) this.host.ping(cell);
      this.lastPing = now;
    }
  }

  private setHighlight(target: Element | null): void {
    if (target === this.highlighted) return;
    this.highlighted?.classList.remove('tuto-highlight');
    target?.classList.add('tuto-highlight');
    this.highlighted = target;
  }
}
