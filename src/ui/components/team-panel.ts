import { TECH } from '../../sim/balance';
import { techName } from '../../sim/names';
import { modifiers } from '../../sim/progression';
import type { GameState } from '../../sim/state';
import { el, icon, setText } from '../dom';
import { money, plural } from '../format';
import { describeTask, SPECIALTY_LABEL } from './selection-panel';
import type { Specialty } from '../../sim/entities';

export interface TeamActions {
  /** Sélectionne ces techniciens ; `focus` centre la caméra sur le premier. */
  select: (ids: number[], focus: boolean) => void;
  hire: () => void;
  hireSpecialist: (specialty: Specialty) => void;
  setAutoRepair: (on: boolean) => void;
  setAutoMaintain: (on: boolean) => void;
}

const SPECIALTIES: Specialty[] = ['electrician', 'hvac', 'it'];
const SPECIALTY_HINT: Record<Specialty, string> = {
  electrician: 'PDU, onduleurs, groupes ×2',
  hvac: 'CRAC et CDU ×2',
  it: 'racks : réparation, entretien, chantier ×2',
};

interface Row {
  root: HTMLButtonElement;
  led: HTMLElement;
  name: HTMLElement;
  role: HTMLElement;
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
  private readonly autoRepair: HTMLInputElement;
  private readonly autoRepairRow: HTMLElement;
  private readonly autoMaintain: HTMLInputElement;
  private readonly autoMaintainRow: HTMLElement;
  private readonly specialists: HTMLElement;
  private readonly specialistButtons: HTMLButtonElement[] = [];
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
    this.autoRepair = el('input');
    this.autoRepair.type = 'checkbox';
    this.autoRepair.onchange = () => this.actions.setAutoRepair(this.autoRepair.checked);
    this.autoRepairRow = el('label', 'team-policy', this.autoRepair, el('span', undefined, 'Réparations automatiques : les techniciens libres prennent la panne la plus proche'));
    this.autoRepairRow.hidden = true;
    this.autoMaintain = el('input');
    this.autoMaintain.type = 'checkbox';
    this.autoMaintain.onchange = () => this.actions.setAutoMaintain(this.autoMaintain.checked);
    this.autoMaintainRow = el('label', 'team-policy', this.autoMaintain, el('span', undefined, 'Maintenance planifiée : les techniciens libres entretiennent les racks usés à plus de 50 %'));
    this.autoMaintainRow.hidden = true;
    for (const sp of SPECIALTIES) {
      const b = el('button', 'btn', icon('hire', 13), el('span', undefined, SPECIALTY_LABEL[sp]));
      b.title = `Embaucher un ${SPECIALTY_LABEL[sp]} (${money(TECH.hireCost)}) : ${SPECIALTY_HINT[sp]}`;
      b.onclick = () => this.actions.hireSpecialist(sp);
      this.specialistButtons.push(b);
    }
    this.specialists = el('div', 'team-specialists', el('span', 'team-specialists-label', 'Spécialistes'), ...this.specialistButtons);
    this.specialists.hidden = true;
    const panel = el(
      'div',
      'team glass',
      el('div', 'menu-head', el('span', 'panel-title', icon('team', 14), this.title), el('span', 'kbd', 'G'), close),
      this.list,
      this.autoRepairRow,
      this.autoMaintainRow,
      this.specialists,
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
          role: el('span', 'team-role'),
          task: el('span', 'task'),
          queue: el('span', 'chip queue'),
          where: el('span', 'team-where mono'),
        };
        r.root.append(r.led, el('span', 'team-who', r.name, r.role), r.task, r.queue, r.where);
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
      setText(row.role, t.specialty ? SPECIALTY_LABEL[t.specialty] : '');
      setText(row.task, describeTask(s, t));
      row.queue.hidden = t.tasks.length < 2;
      setText(row.queue, `+${t.tasks.length - 1} en file`);
      setText(row.where, `case ${Math.round(t.x)},${Math.round(t.y)}`);
    }
    const m = modifiers(s);
    this.autoRepairRow.hidden = !m.autoRepair;
    this.autoRepair.checked = s.policies.autoRepair;
    this.autoMaintainRow.hidden = !m.autoMaintain;
    this.autoMaintain.checked = s.policies.autoMaintain;
    this.specialists.hidden = !m.specialties;
    const canHire = s.money >= TECH.hireCost && s.techs.length < TECH.max;
    for (const b of this.specialistButtons) b.disabled = !canHire;
    this.idleButton.disabled = this.idle.length === 0;
    this.hireButton.disabled = s.money < TECH.hireCost || s.techs.length >= TECH.max;
  }
}
