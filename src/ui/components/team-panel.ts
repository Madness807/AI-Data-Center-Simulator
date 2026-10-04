import { TECH } from '../../sim/balance';
import { techName } from '../../sim/names';
import type { GameState } from '../../sim/state';
import { el, icon, setText } from '../dom';
import { money, plural } from '../format';
import { describeTask } from './selection-panel';

export interface TeamActions {
  /** Sélectionne ces techniciens ; `focus` centre la caméra sur le premier. */
  select: (ids: number[], focus: boolean) => void;
  hire: () => void;
}

interface Row {
  root: HTMLButtonElement;
  led: HTMLElement;
  name: HTMLElement;
  task: HTMLElement;
  queue: HTMLElement;
  where: HTMLElement;
}

/** Panneau Équipe (G) : où est chacun et ce qu'il fait ; un clic le sélectionne et centre la vue. */
export class TeamPanel {
  readonly root: HTMLElement;
  private readonly title = el('span');
  private readonly list = el('div', 'team-list');
  private readonly rows = new Map<number, Row>();
  private readonly idleButton: HTMLButtonElement;
  private readonly hireButton: HTMLButtonElement;
  private idle: number[] = [];

  constructor(private readonly actions: TeamActions) {
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 16));
    close.title = 'Fermer (G ou Échap)';
    close.onclick = () => this.close();
    this.idleButton = el('button', 'btn', icon('target', 14), 'Sélectionner les libres');
    this.idleButton.onclick = () => {
      this.actions.select(this.idle, true);
      this.close();
    };
    this.hireButton = el('button', 'btn btn-primary', icon('hire', 14), `Embaucher · ${money(TECH.hireCost)}`);
    this.hireButton.onclick = () => this.actions.hire();
    const panel = el(
      'div',
      'team glass',
      el('div', 'menu-head', el('span', 'panel-title', icon('team', 14), this.title), el('span', 'kbd', 'G'), close),
      this.list,
      el('div', 'team-actions', this.idleButton, this.hireButton),
    );
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /** Vide la liste après un changement de partie (les numéros de techniciens repartent de 1). */
  reset(): void {
    this.rows.clear();
    this.list.replaceChildren();
  }

  update(s: GameState): void {
    if (!this.isOpen) return;
    this.idle = s.techs.filter((t) => t.tasks.length === 0).map((t) => t.id);
    setText(this.title, `Équipe · ${s.techs.length} ${plural(s.techs.length, 'technicien')} · ${this.idle.length} ${plural(this.idle.length, 'libre')}`);
    for (const t of s.techs) {
      let row = this.rows.get(t.id);
      if (!row) {
        const r: Row = {
          root: el('button', 'team-row'),
          led: el('span', 'led'),
          name: el('b'),
          task: el('span', 'task'),
          queue: el('span', 'chip queue'),
          where: el('span', 'team-where mono'),
        };
        r.root.append(r.led, r.name, r.task, r.queue, r.where);
        r.root.onclick = () => {
          this.actions.select([t.id], true);
          this.close();
        };
        this.rows.set(t.id, r);
        this.list.append(r.root);
        row = r;
      }
      row.led.className = `led ${t.working ? 'tech-working' : t.tasks.length ? 'tech-moving' : 'tech-idle off'}`;
      setText(row.name, techName(s, t));
      setText(row.task, describeTask(s, t));
      row.queue.hidden = t.tasks.length < 2;
      setText(row.queue, `+${t.tasks.length - 1} en file`);
      setText(row.where, `case ${Math.round(t.x)},${Math.round(t.y)}`);
    }
    this.idleButton.disabled = this.idle.length === 0;
    this.hireButton.disabled = s.money < TECH.hireCost || s.techs.length >= TECH.max;
  }
}
