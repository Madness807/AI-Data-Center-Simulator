import { BUILD_COST, BUILD_TIME, CRAC, ECONOMY, FAILURE, PDU, RACK, REPAIR, TECH } from '../sim/balance';
import type { BuildingKind, Job, Technician } from '../sim/entities';
import { buildingAt, buildingById, idx, type GameEvent, type GameState, type Speed } from '../sim/state';
import { tempStats } from '../sim/stats';
import type { Tool } from '../input/build';
import { HEAT_STOPS } from '../render/overlays';

export interface HudActions {
  setTool: (tool: Tool) => void;
  setSpeed: (speed: Speed) => void;
  toggleHeatmap: () => void;
  toggleEdgePan: () => void;
  hire: () => void;
  acceptJob: (id: number) => void;
  rejectJob: (id: number) => void;
  restart: () => void;
}

const TOOLS: { tool: Exclude<Tool, null>; label: string; key: string; detail: string }[] = [
  { tool: 'rack', label: 'Rack GPU', key: 'R', detail: `${RACK.computeCU} CU/s · ${RACK.powerKW} kW · chauffe ${RACK.heatKW} kW` },
  { tool: 'crac', label: 'CRAC', key: 'C', detail: `refroidit ${CRAC.coolingKW} kW · rayon ${CRAC.radius} · ${CRAC.powerKW} kW` },
  { tool: 'pdu', label: 'PDU', key: 'P', detail: `+${PDU.capacityKW} kW de capacité` },
  { tool: 'demolish', label: 'Démolir', key: 'X', detail: 'rembourse 50 %' },
];

const LABEL: Record<BuildingKind, string> = { rack: 'Rack GPU', crac: 'CRAC', pdu: 'PDU' };
const SPEEDS: { speed: Speed; label: string; key: string }[] = [
  { speed: 0, label: '❚❚', key: 'Espace' },
  { speed: 1, label: '×1', key: '1' },
  { speed: 2, label: '×2', key: '2' },
  { speed: 4, label: '×4', key: '3' },
];

const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} $`;

/** Ce que fait le technicien, en clair. */
function describeTask(s: GameState, t: Technician): string {
  const task = t.tasks[0];
  if (!task) return '<span class="muted">inactif</span>';
  const more = t.tasks.length > 1 ? ` <span class="muted">(+${t.tasks.length - 1})</span>` : '';
  if (task.type === 'move') return `se déplace vers ${task.x},${task.y}${more}`;
  const b = buildingById(s, task.target);
  const what = b ? `${LABEL[b.kind]} ${b.x},${b.y}` : '?';
  const verb = task.type === 'build' ? 'construit' : 'répare';
  return `${t.working ? verb : `va ${task.type === 'build' ? 'construire' : 'réparer'}`} ${what}${more}`;
}
const seconds = (n: number) => `${Math.max(0, Math.ceil(n))} s`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Carte d'un contrat, créée une fois et mise à jour en place (recréer à chaque frame casserait les clics). */
interface JobCard {
  root: HTMLElement;
  status: Job['status'];
  meta: HTMLElement;
  timer: HTMLElement;
  bar: HTMLElement;
  rate?: HTMLElement;
}

export class Hud {
  private readonly stat: Record<'money' | 'time' | 'power' | 'compute' | 'costs' | 'team' | 'temp', HTMLElement>;
  private readonly goalBar: HTMLElement;
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();
  private readonly heatButton: HTMLButtonElement;
  private readonly edgeButton: HTMLButtonElement;
  private readonly info: HTMLElement;
  private readonly selection: HTMLElement;
  private readonly hireButton: HTMLButtonElement;
  private readonly legend: HTMLElement;
  private readonly jobsList: HTMLElement;
  private readonly jobsEmpty: HTMLElement;
  private readonly jobsCount: HTMLElement;
  private readonly cards = new Map<number, JobCard>();
  private readonly bankrupt: HTMLElement;
  private readonly gameOver: HTMLElement;
  private readonly gameOverStats: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly recentToasts = new Map<string, number>();

  constructor(root: HTMLElement, private readonly actions: HudActions) {
    const top = el('div', 'hud-top panel');
    const stat = (label: string) => {
      const box = el('div', 'stat');
      box.append(el('span', 'stat-label', label));
      const v = el('span', 'stat-value');
      box.append(v);
      top.append(box);
      return { box, v };
    };
    const moneyStat = stat('Trésorerie');
    this.goalBar = el('div', 'goal-fill');
    const goal = el('div', 'goal');
    goal.title = `Objectif : ${money(ECONOMY.goalMoney)}`;
    goal.append(this.goalBar);
    moneyStat.box.append(goal);
    this.stat = {
      money: moneyStat.v,
      time: stat('Temps').v,
      power: stat('Énergie').v,
      compute: stat('Calcul utilisé').v,
      costs: stat('Charges').v,
      team: stat('Équipe').v,
      temp: stat('Température').v,
    };
    const speeds = el('div', 'speeds');
    for (const sp of SPEEDS) {
      const b = el('button', 'btn', sp.label);
      b.title = `${sp.speed === 0 ? 'Pause' : `Vitesse ${sp.label}`} (${sp.key})`;
      b.onclick = () => actions.setSpeed(sp.speed);
      speeds.append(b);
      this.speedButtons.set(sp.speed, b);
    }
    top.append(speeds);

    const bar = el('div', 'hud-bottom panel');
    for (const t of TOOLS) {
      const b = el('button', 'btn tool');
      b.append(el('span', 'tool-key', t.key), el('span', 'tool-label', t.label));
      if (t.tool !== 'demolish') b.append(el('span', 'tool-cost', money(BUILD_COST[t.tool])));
      b.title = t.detail;
      b.onclick = () => actions.setTool(t.tool);
      bar.append(b);
      this.toolButtons.set(t.tool, b);
    }
    this.hireButton = el('button', 'btn tool');
    this.hireButton.append(el('span', 'tool-key', 'T'), el('span', 'tool-label', 'Embaucher'), el('span', 'tool-cost', money(TECH.hireCost)));
    this.hireButton.title = `Un technicien de plus (salaire ${TECH.salaryPerS} $/s, ${TECH.max} max)`;
    this.hireButton.onclick = actions.hire;
    bar.append(this.hireButton, el('div', 'sep'));
    this.heatButton = el('button', 'btn tool');
    this.heatButton.append(el('span', 'tool-key', 'H'), el('span', 'tool-label', 'Heatmap'));
    this.heatButton.onclick = actions.toggleHeatmap;
    this.edgeButton = el('button', 'btn tool');
    this.edgeButton.append(el('span', 'tool-key', 'B'), el('span', 'tool-label', 'Pan bords'));
    this.edgeButton.title = "Déplacer la caméra quand la souris touche le bord de l'écran";
    this.edgeButton.onclick = actions.toggleEdgePan;
    bar.append(this.heatButton, this.edgeButton);

    const jobs = el('div', 'hud-jobs panel');
    const head = el('div', 'jobs-head');
    this.jobsCount = el('span', 'jobs-count');
    head.append(el('span', 'jobs-title', 'Contrats'), this.jobsCount);
    this.jobsList = el('div', 'jobs-list');
    this.jobsEmpty = el('div', 'jobs-empty', 'Aucune offre pour le moment.');
    jobs.append(head, this.jobsList, this.jobsEmpty);

    this.info = el('div', 'hud-info panel');
    this.selection = el('div', 'hud-selection panel');
    const left = el('div', 'hud-left');
    left.append(this.selection, this.info);
    this.legend = el('div', 'hud-legend panel');
    this.legend.append(el('div', 'legend-title', 'Température'));
    const ramp = el('div', 'legend-ramp');
    const [t0, tN] = [HEAT_STOPS[0][0], HEAT_STOPS[HEAT_STOPS.length - 1][0]];
    const pct = (t: number) => ((t - t0) / (tN - t0)) * 100;
    ramp.style.background = `linear-gradient(to right, ${HEAT_STOPS.map(([t, r, g, b]) => `rgb(${r},${g},${b}) ${pct(t)}%`).join(', ')})`;
    const ticks = el('div', 'legend-ticks');
    for (const [t] of HEAT_STOPS) {
      const tick = el('span', undefined, `${t}°`);
      tick.style.left = `${pct(t)}%`;
      ticks.append(tick);
    }
    const threshold = el('div', 'legend-threshold');
    threshold.style.left = `${pct(FAILURE.thresholdC)}%`;
    threshold.title = `Au-delà de ${FAILURE.thresholdC} °C, les pannes se multiplient`;
    ramp.append(threshold);
    this.legend.append(ramp, ticks);

    const help = el('div', 'hud-help panel');
    help.innerHTML =
      '<b>WASD</b> déplacer · <b>molette</b> zoom · <b>Q/E</b> pivoter<br>' +
      '<b>clic/glisser</b> sélectionner des techniciens · <b>Maj</b> ajouter<br>' +
      '<b>clic droit</b> ordre : déplacer, construire, réparer · <b>Maj</b> en file<br>' +
      'en construction : <b>clic</b> poser · <b>clic droit/Échap</b> annuler';

    this.bankrupt = el('div', 'bankrupt');

    this.gameOver = el('div', 'game-over');
    const card = el('div', 'game-over-card panel');
    this.gameOverStats = el('p', 'game-over-stats');
    const again = el('button', 'btn primary', 'Recommencer');
    again.onclick = actions.restart;
    card.append(el('h1', undefined, 'Faillite'), this.gameOverStats, again);
    this.gameOver.append(card);

    this.toasts = el('div', 'toasts');
    root.append(top, bar, jobs, left, this.legend, help, this.bankrupt, this.gameOver, this.toasts);
  }

  update(
    s: GameState,
    ui: { tool: Tool; heatmap: boolean; edgePan: boolean; hover: { x: number; y: number } | null; selected: ReadonlySet<number> },
  ): void {
    const p = s.power;
    const t = tempStats(s);
    this.stat.money.textContent = money(s.money);
    this.stat.money.classList.toggle('danger', s.money < 0);
    this.goalBar.style.width = `${Math.min(100, Math.max(0, (s.money / ECONOMY.goalMoney) * 100))}%`;
    this.goalBar.classList.toggle('won', s.outcome === 'won');
    this.stat.time.textContent = `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`;
    this.stat.power.textContent =
      `${p.loadKW} / ${p.capacityKW} kW` + (p.shedCount ? ` · ${p.shedCount} délesté${p.shedCount > 1 ? 's' : ''}` : '');
    this.stat.power.classList.toggle('warn', p.shedCount > 0);
    this.stat.compute.textContent = `${s.compute.used} / ${s.compute.total} CU/s`;
    const { electricityPerS: elec, salariesPerS: salaries } = s.economy;
    this.stat.costs.textContent = `−${(elec + salaries).toFixed(1)} $/s`;
    this.stat.costs.title = `Électricité ${elec.toFixed(1)} $/s · salaires ${salaries.toFixed(1)} $/s`;
    const idle = s.techs.filter((t) => t.tasks.length === 0).length;
    this.stat.team.textContent = `${s.techs.length} tech · ${idle} libre${idle > 1 ? 's' : ''}`;
    this.stat.temp.textContent = `max ${t.max.toFixed(1)}° · moy ${t.avg.toFixed(1)}°`;
    this.stat.temp.classList.toggle('warn', t.max >= FAILURE.thresholdC);
    this.stat.temp.classList.toggle('danger', t.max >= FAILURE.thresholdC + 15);

    for (const [tool, b] of this.toolButtons) {
      b.classList.toggle('active', tool === ui.tool);
      b.disabled = tool !== 'demolish' && tool !== null && s.money < BUILD_COST[tool];
    }
    this.hireButton.disabled = s.money < TECH.hireCost || s.techs.length >= TECH.max;
    for (const [sp, b] of this.speedButtons) b.classList.toggle('active', sp === s.speed);
    this.heatButton.classList.toggle('active', ui.heatmap);
    this.edgeButton.classList.toggle('active', ui.edgePan);
    this.legend.style.display = ui.heatmap ? '' : 'none';

    this.updateHover(s, ui.hover);
    this.updateSelection(s, ui.selected);
    this.updateJobs(s);

    const timer = s.economy.bankruptTimer;
    this.bankrupt.style.display = timer > 0 && s.outcome !== 'lost' ? '' : 'none';
    if (timer > 0) this.bankrupt.textContent = `Trésorerie négative : faillite dans ${seconds(ECONOMY.bankruptcySeconds - timer)}`;

    this.gameOver.style.display = s.outcome === 'lost' ? '' : 'none';
    if (s.outcome === 'lost') {
      this.gameOverStats.textContent = `Tenu ${Math.floor(s.time / 60)} min ${Math.floor(s.time % 60)} s · ${s.economy.jobsDone} contrats livrés · ${s.economy.jobsFailed} en retard`;
    }

    for (const e of s.events) this.toast(e);
    s.events.length = 0;
  }

  /** Vide les cartes et messages, après un redémarrage. */
  reset(): void {
    this.cards.forEach((c) => c.root.remove());
    this.cards.clear();
    this.toasts.replaceChildren();
  }

  private updateHover(s: GameState, hover: { x: number; y: number } | null): void {
    this.info.style.display = hover ? '' : 'none';
    if (!hover) return;
    const { x, y } = hover;
    const b = buildingAt(s, x, y);
    let state = '';
    if (b?.status === 'construction') {
      const pct = Math.round((1 - b.workLeft / BUILD_TIME[b.kind]) * 100);
      state = ` · <span class="warn">chantier ${pct} %</span><br><span class="muted">technicien + clic droit pour construire</span>`;
    } else if (b?.kind === 'pdu') state = ' · en service';
    else if (b?.status === 'failed') {
      state = ` · <span class="danger">en panne</span><br><span class="muted">technicien + clic droit pour réparer (${money(REPAIR.cost)}, ${REPAIR.seconds} s)</span>`;
    } else if (b?.status === 'repairing') state = ` · <span class="warn">réparation ${seconds(b.workLeft)}</span>`;
    else if (b) state = b.powered ? ' · alimenté' : ' · <span class="danger">délesté</span>';
    this.info.innerHTML = `Case ${x},${y} · <b>${s.temp[idx(s, x, y)].toFixed(1)} °C</b>` + (b ? `<br>${LABEL[b.kind]}${state}` : '');
  }

  private updateSelection(s: GameState, selected: ReadonlySet<number>): void {
    const techs = s.techs.filter((t) => selected.has(t.id));
    this.selection.style.display = techs.length ? '' : 'none';
    if (!techs.length) return;
    const rows = techs.map((t) => `<div><b>Tech ${t.id}</b> · ${describeTask(s, t)}</div>`).join('');
    const html = `<div class="sel-title">${techs.length} technicien${techs.length > 1 ? 's' : ''} sélectionné${techs.length > 1 ? 's' : ''}</div>${rows}`;
    if (this.selection.innerHTML !== html) this.selection.innerHTML = html;
  }

  private updateJobs(s: GameState): void {
    const seen = new Set<number>();
    // Contrats en cours d'abord, par échéance ; puis les offres, par expiration.
    const sorted = [...s.jobs].sort((a, b) =>
      a.status !== b.status ? (a.status === 'active' ? -1 : 1) : a.status === 'active' ? a.deadline - b.deadline : a.expiresAt - b.expiresAt,
    );
    for (const job of sorted) {
      seen.add(job.id);
      let card = this.cards.get(job.id);
      if (card && card.status !== job.status) {
        card.root.remove();
        card = undefined;
      }
      if (!card) {
        card = this.createCard(job);
        this.cards.set(job.id, card);
      }
      this.jobsList.append(card.root); // append déplace : garde l'ordre trié
      this.fillCard(card, job, s);
    }
    for (const [id, card] of this.cards) {
      if (seen.has(id)) continue;
      card.root.remove();
      this.cards.delete(id);
    }
    const offers = s.jobs.filter((j) => j.status === 'offer').length;
    this.jobsCount.textContent = `${s.jobs.length - offers} en cours · ${offers} offre${offers > 1 ? 's' : ''}`;
    this.jobsEmpty.style.display = s.jobs.length ? 'none' : '';
  }

  private createCard(job: Job): JobCard {
    const root = el('div', `job ${job.status}`);
    const title = el('div', 'job-title', job.name);
    const meta = el('div', 'job-meta');
    const timer = el('span', 'job-timer');
    const track = el('div', 'job-track');
    const bar = el('div', 'job-bar');
    track.append(bar);
    const head = el('div', 'job-head');
    head.append(el('span', 'job-tag', job.status === 'offer' ? 'Offre' : 'En cours'), timer);
    root.append(head, title, meta, track);
    const card: JobCard = { root, status: job.status, meta, timer, bar };
    if (job.status === 'offer') {
      const buttons = el('div', 'job-actions');
      const accept = el('button', 'btn primary', 'Accepter');
      accept.onclick = () => this.actions.acceptJob(job.id);
      const reject = el('button', 'btn', 'Refuser');
      reject.onclick = () => this.actions.rejectJob(job.id);
      buttons.append(accept, reject);
      root.append(buttons);
      meta.innerHTML =
        `<b>${job.rateCU} CU/s</b> pendant ${job.durationS} s · délai ${job.deadlineInS} s<br>` +
        `<span class="ok">+${money(job.payment)}</span> · pénalité <span class="danger">−${money(job.penalty)}</span>`;
    } else {
      card.rate = el('span');
      meta.append(card.rate, el('span', 'muted', ` · +${money(job.payment)}`));
    }
    return card;
  }

  private fillCard(card: JobCard, job: Job, s: GameState): void {
    if (job.status === 'offer') {
      const left = job.expiresAt - s.time;
      card.timer.textContent = `expire dans ${seconds(left)}`;
      card.bar.style.width = `${Math.max(0, Math.min(100, (left / (job.expiresAt - job.offeredAt)) * 100))}%`;
      return;
    }
    const left = job.deadline - s.time;
    const remainingWork = (job.work - job.progress) / job.rateCU;
    card.timer.textContent = `échéance ${seconds(left)}`;
    // En retard si, même au débit plein, le travail restant ne tient plus dans le délai.
    card.timer.classList.toggle('danger', remainingWork > left);
    card.bar.style.width = `${(job.progress / job.work) * 100}%`;
    const starved = job.allocated < job.rateCU - 1e-6;
    card.rate!.textContent = `${Math.round(job.allocated)} / ${job.rateCU} CU/s`;
    card.rate!.className = starved ? 'warn' : 'ok';
  }

  private toast(e: GameEvent): void {
    // Glisser sur des cases invalides ne doit pas inonder l'écran.
    const now = performance.now();
    if (now - (this.recentToasts.get(e.message) ?? 0) < 1200) return;
    this.recentToasts.set(e.message, now);
    const t = el('div', `toast ${e.type}`, e.message);
    this.toasts.append(t);
    const life = e.type === 'success' || e.type === 'warning' ? 4000 : 2200;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 500);
  }
}
