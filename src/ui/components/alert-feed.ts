import type { Cell } from '../../sim/entities';
import type { GameEvent } from '../../sim/state';
import { el, icon, setText } from '../dom';
import { clock } from '../format';
import type { IconName } from '../icons';

const MAX_ALERTS = 40;
const ICON: Record<GameEvent['type'], IconName> = { error: 'failed', warning: 'alert', info: 'info', success: 'done' };

/**
 * Fil d'alertes : l'historique des pannes, contrats et chantiers. Une alerte liée à une
 * case est cliquable et y recentre la caméra.
 */
export class AlertFeed {
  readonly root: HTMLElement;
  private readonly list = el('div', 'alerts-list');
  private readonly empty = el('div', 'alerts-empty', 'Rien à signaler.');
  private readonly count = el('span', 'contracts-count');

  constructor(private readonly focus: (cell: Cell) => void) {
    const clear = el('button', 'btn btn-ghost btn-icon', icon('close', 13));
    clear.title = 'Tout effacer';
    clear.onclick = () => this.clear();
    this.root = el('div', 'alerts glass', el('div', 'alerts-head', el('span', 'panel-title', icon('alert', 14), 'Alertes'), el('span', 'dim', this.count, clear)), this.list, this.empty);
    this.refresh();
  }

  push(e: GameEvent): void {
    const body = el('span', 'alert-text', e.message);
    const time = el('span', 'alert-time', clock(e.time));
    const item = e.cell
      ? el('button', `alert ${e.type} clickable`, icon(ICON[e.type], 14), body, icon('target', 12), time)
      : el('div', `alert ${e.type}`, icon(ICON[e.type], 14), body, time);
    if (e.cell) {
      const cell = e.cell;
      item.title = `${e.message} — cliquer pour voir dans la salle`;
      item.addEventListener('click', () => this.focus(cell));
    }
    if (!e.cell) item.title = e.message;
    this.list.prepend(item);
    while (this.list.children.length > MAX_ALERTS) this.list.lastElementChild!.remove();
    this.refresh();
  }

  clear(): void {
    this.list.replaceChildren();
    this.refresh();
  }

  private refresh(): void {
    const n = this.list.children.length;
    setText(this.count, n ? String(n) : '');
    this.empty.hidden = n > 0;
  }
}
