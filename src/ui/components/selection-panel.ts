import type { BuildingKind, Technician } from '../../sim/entities';
import { techName } from '../../sim/names';
import { buildingById, type GameState } from '../../sim/state';
import { el, icon, setText } from '../dom';
import { plural } from '../format';

export const BUILDING_LABEL: Record<BuildingKind, string> = { rack: 'Rack GPU', crac: 'CRAC', pdu: 'PDU' };

/** Ce que fait le technicien, en clair. */
export function describeTask(s: GameState, t: Technician): string {
  const task = t.tasks[0];
  if (!task) return 'inactif';
  if (task.type === 'move') return `se déplace vers ${task.x},${task.y}`;
  const b = buildingById(s, task.target);
  const what = b ? `${BUILDING_LABEL[b.kind]} ${b.x},${b.y}` : '?';
  const verb = task.type === 'build' ? 'construit' : 'répare';
  return `${t.working ? verb : `va ${task.type === 'build' ? 'construire' : 'réparer'}`} ${what}`;
}

interface Row {
  root: HTMLElement;
  led: HTMLElement;
  task: HTMLElement;
  queue: HTMLElement;
}

/** Techniciens sélectionnés : voyant d'activité, tâche en cours et ordres en file. */
export class SelectionPanel {
  readonly root: HTMLElement;
  private readonly title = el('span');
  private readonly rows = new Map<number, Row>();
  private readonly list = el('div', 'selection-list');

  constructor() {
    this.root = el('div', 'selection glass', el('div', 'panel-title', icon('team', 14), this.title), this.list);
    this.root.hidden = true;
  }

  update(s: GameState, selected: ReadonlySet<number>): void {
    const techs = s.techs.filter((t) => selected.has(t.id));
    this.root.hidden = techs.length === 0;
    if (!techs.length) return;
    setText(this.title, `${techs.length} ${plural(techs.length, 'technicien')} ${plural(techs.length, 'sélectionné')}`);
    for (const [id, row] of this.rows) {
      if (techs.some((t) => t.id === id)) continue;
      row.root.remove();
      this.rows.delete(id);
    }
    for (const t of techs) {
      let row = this.rows.get(t.id);
      if (!row) {
        const led = el('span', 'led');
        const task = el('span', 'task');
        const queue = el('span', 'chip queue');
        row = { root: el('div', 'tech-row', led, el('b', undefined, techName(s, t)), task, queue), led, task, queue };
        this.rows.set(t.id, row);
        this.list.append(row.root);
      }
      row.led.className = `led ${t.working ? 'tech-working' : t.tasks.length ? 'tech-moving' : 'tech-idle off'}`;
      setText(row.task, describeTask(s, t));
      row.queue.hidden = t.tasks.length < 2;
      setText(row.queue, `+${t.tasks.length - 1}`);
    }
  }
}
