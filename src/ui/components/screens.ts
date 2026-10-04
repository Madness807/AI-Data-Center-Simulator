import type { GameState } from '../../sim/state';
import { el, icon, setText } from '../dom';
import { clock } from '../format';
import type { IconName } from '../icons';

function stat(label: string): { root: HTMLElement; value: HTMLElement } {
  const value = el('b');
  return { root: el('div', undefined, value, el('span', undefined, label)), value };
}

function action(name: IconName, label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = el('button', `btn ${primary ? 'btn-primary' : ''}`, icon(name, 15), label);
  b.onclick = onClick;
  return b;
}

/** Écran de faillite : résumé de la partie et redémarrage. */
export class DefeatScreen {
  readonly root: HTMLElement;
  private readonly time = stat('tenu');
  private readonly done = stat('contrats livrés');
  private readonly late = stat('en retard');

  constructor(restart: () => void) {
    this.root = el(
      'div',
      'screen defeat glass',
      el('div', 'screen-icon', icon('trendDown', 28)),
      el('h1', undefined, 'Faillite'),
      el('p', undefined, 'La trésorerie est restée négative trop longtemps : le data center ferme ses portes.'),
      el('div', 'screen-stats', this.time.root, this.done.root, this.late.root),
      el('div', 'screen-actions', action('restart', 'Nouvelle partie', restart, true)),
    );
    this.root.hidden = true;
  }

  update(s: GameState): void {
    this.root.hidden = s.outcome !== 'lost';
    if (this.root.hidden) return;
    setText(this.time.value, clock(s.time));
    setText(this.done.value, String(s.economy.jobsDone));
    setText(this.late.value, String(s.economy.jobsFailed));
  }
}
