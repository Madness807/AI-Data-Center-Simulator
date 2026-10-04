import { FAILURE } from '../../sim/balance';
import { isRackActive } from '../../sim/entities';
import { OPERATING, type ExpenseKind } from '../../sim/ledger';
import { idx, type GameState } from '../../sim/state';
import { availability, pue, tempStats } from '../../sim/stats';
import { ALERTS } from '../../sim/systems/alerts';
import { failureRiskPerMinute } from '../../sim/systems/failures';
import { el, icon, setText } from '../dom';
import { celsius, clock, decimal, money, moneyRate, percent, percentFine, plural, signedMoney } from '../format';
import type { IconName } from '../icons';
import type { Balance, GameHistory, Sample } from '../metrics';
import { LineChart } from './line-chart';

export type DashboardTab = 'finances' | 'operations' | 'thermal';
type Tab = DashboardTab;

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'finances', label: 'Finances', icon: 'money' },
  { id: 'operations', label: 'Exploitation', icon: 'compute' },
  { id: 'thermal', label: 'Thermique', icon: 'temperature' },
];

const EXPENSES: { kind: ExpenseKind; label: string }[] = [
  { kind: 'electricity', label: 'Électricité' },
  { kind: 'fuel', label: 'Carburant des groupes' },
  { kind: 'salaries', label: 'Salaires' },
  { kind: 'repairs', label: 'Réparations' },
  { kind: 'penalties', label: 'Pénalités de retard' },
  { kind: 'construction', label: 'Construction' },
  { kind: 'hiring', label: 'Embauches' },
];

/** Au plus autant de points par courbe : le SVG reste léger, même après des heures de jeu. */
const MAX_POINTS = 240;
const REFRESH_MS = 300;

function thin<T>(list: readonly T[]): T[] {
  const stride = Math.max(1, Math.ceil(list.length / MAX_POINTS));
  const out = list.filter((_, i) => i % stride === 0);
  if (list.length && out[out.length - 1] !== list[list.length - 1]) out.push(list[list.length - 1]);
  return out;
}

interface Kpi {
  root: HTMLElement;
  value: HTMLElement;
  sub: HTMLElement;
}

function kpi(label: string): Kpi {
  const value = el('b', 'kpi-value mono');
  const sub = el('span', 'kpi-sub');
  return { root: el('div', 'kpi', el('span', 'kpi-label', label), value, sub), value, sub };
}

function setKpi(k: Kpi, value: string, sub: string, tone: '' | 'ok' | 'warn' | 'danger' = ''): void {
  setText(k.value, value);
  setText(k.sub, sub);
  k.value.className = `kpi-value mono ${tone}`;
}

/** Tableau de bord (Tab) : tendances financières, exploitation et températures depuis le début de la partie. */
export class Dashboard {
  readonly root: HTMLElement;
  private tab: Tab = 'finances';
  private lastRefresh = -Infinity;
  private readonly tabButtons = new Map<Tab, HTMLButtonElement>();
  private readonly pages = new Map<Tab, HTMLElement>();

  private readonly fin = { money: kpi('Trésorerie'), net: kpi('Bilan'), revenue: kpi('Recettes'), spent: kpi('Dépenses d’exploitation') };
  private readonly finChart = new LineChart('Recettes et dépenses par minute', { format: (v) => money(v), min: 0 });
  private readonly expenseRows = new Map<ExpenseKind | 'revenue', { value: HTMLElement; bar: HTMLElement }>();

  private readonly ops = { pue: kpi('PUE'), availability: kpi('Disponibilité'), use: kpi('Calcul utilisé'), failures: kpi('Pannes'), jobs: kpi('Contrats') };
  private readonly useChart = new LineChart('Calcul et disponibilité', { format: (v) => `${Math.round(v)} %`, min: 0, max: 100 });
  private readonly pueChart = new LineChart('PUE (énergie totale ÷ énergie des racks)', { format: (v) => decimal(v, 2), min: 1 });

  private readonly thermal = { max: kpi('Température max'), avg: kpi('Moyenne'), hot: kpi(`Racks ≥ ${ALERTS.hotC} °C`), risk: kpi('Risque max') };
  private readonly tempChart = new LineChart('Températures de la salle', {
    format: (v) => `${Math.round(v)} °C`,
    threshold: { value: FAILURE.thresholdC, label: `seuil de panne ${FAILURE.thresholdC} °C` },
  });

  constructor() {
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 16));
    close.title = 'Fermer (Tab ou Échap)';
    close.onclick = () => this.close();
    const tabs = el('div', 'dash-tabs');
    for (const t of TABS) {
      const b = el('button', 'btn dash-tab', icon(t.icon, 14), t.label);
      b.onclick = () => this.show(t.id);
      this.tabButtons.set(t.id, b);
      tabs.append(b);
    }

    const table = el('div', 'expense-table');
    for (const row of [{ kind: 'revenue' as const, label: 'Contrats livrés' }, ...EXPENSES]) {
      const value = el('span', 'mono');
      const bar = el('span', `expense-bar ${row.kind === 'revenue' ? 'ok' : ''}`);
      table.append(el('span', undefined, row.label), el('span', 'expense-track', bar), value);
      this.expenseRows.set(row.kind, { value, bar });
    }
    this.pages.set(
      'finances',
      el(
        'div',
        'dash-page',
        el('div', 'kpis', ...Object.values(this.fin).map((k) => k.root)),
        this.finChart.root,
        el('div', 'dash-section', el('div', 'dash-section-title', 'Depuis le début de la partie'), table),
      ),
    );
    this.pages.set('operations', el('div', 'dash-page', el('div', 'kpis', ...Object.values(this.ops).map((k) => k.root)), this.useChart.root, this.pueChart.root));
    this.pages.set('thermal', el('div', 'dash-page', el('div', 'kpis', ...Object.values(this.thermal).map((k) => k.root)), this.tempChart.root));

    const panel = el(
      'div',
      'dashboard glass',
      el('div', 'menu-head', el('span', 'panel-title', icon('dashboard', 14), 'Tableau de bord'), tabs, el('span', 'kbd', 'Tab'), close),
      ...this.pages.values(),
    );
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    this.show('finances');
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  get currentTab(): Tab {
    return this.tab;
  }

  open(tab: Tab = this.tab): void {
    this.show(tab);
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private show(tab: Tab): void {
    this.tab = tab;
    for (const [id, b] of this.tabButtons) b.classList.toggle('active', id === tab);
    for (const [id, page] of this.pages) page.hidden = id !== tab;
    this.lastRefresh = -Infinity;
  }

  update(s: GameState, history: GameHistory, balance: Balance | null, now: number): void {
    if (!this.isOpen || now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    const samples = thin(history.samples);
    if (this.tab === 'finances') this.updateFinances(s, history, balance);
    else if (this.tab === 'operations') this.updateOperations(s, samples);
    else this.updateThermal(s, samples);
  }

  private updateFinances(s: GameState, history: GameHistory, balance: Balance | null): void {
    const l = s.economy.ledger;
    const spent = OPERATING.reduce((sum, k) => sum + l[k], 0);
    setKpi(this.fin.money, money(s.money), s.money < 0 ? 'dans le rouge' : 'disponible', s.money < 0 ? 'danger' : '');
    const net = balance?.netPerSecond ?? null;
    setKpi(this.fin.net, net === null ? '—' : moneyRate(net), 'sur la dernière minute', net === null ? '' : net >= 0 ? 'ok' : 'danger');
    setKpi(this.fin.revenue, money(l.revenue), `${s.economy.jobsDone} ${plural(s.economy.jobsDone, 'contrat livré', 'contrats livrés')}`, 'ok');
    setKpi(this.fin.spent, money(spent), `+ ${money(l.construction + l.hiring)} investis`);

    const flows = thin(history.flows());
    this.finChart.update(
      flows.map((f) => f.time),
      [
        { label: 'Recettes', color: 'var(--ok)', values: flows.map((f) => f.revenue) },
        { label: 'Dépenses d’exploitation', color: 'var(--danger)', values: flows.map((f) => f.operating) },
      ],
      clock,
    );

    const largest = Math.max(1, l.revenue, ...EXPENSES.map((e) => l[e.kind]));
    for (const [kind, row] of this.expenseRows) {
      const amount = kind === 'revenue' ? l.revenue : l[kind];
      setText(row.value, kind === 'revenue' ? signedMoney(amount) : signedMoney(-amount));
      row.bar.style.width = `${(amount / largest) * 100}%`;
    }
  }

  private updateOperations(s: GameState, samples: readonly Sample[]): void {
    const p = pue(s);
    setKpi(this.ops.pue, p === null ? '—' : decimal(p, 2), 'idéal : 1,00', p !== null && p > 1.3 ? 'warn' : '');
    const a = availability(s);
    setKpi(this.ops.availability, a === null ? '—' : percentFine(a), 'racks en service', a !== null && a < 0.95 ? 'warn' : '');
    const use = s.compute.total ? s.compute.used / s.compute.total : 0;
    setKpi(this.ops.use, percent(use), `${s.compute.used} / ${s.compute.total} CU/s`);
    const hours = s.time / 3600;
    const perHour = hours > 0.01 ? s.economy.failures / hours : 0;
    setKpi(this.ops.failures, String(s.economy.failures), hours > 0.05 ? `${decimal(perHour)} par heure` : 'depuis le début');
    setKpi(this.ops.jobs, String(s.economy.jobsDone), `livrés · ${s.economy.jobsFailed} en retard`, s.economy.jobsFailed ? 'warn' : '');

    const times = samples.map((x) => x.time);
    this.useChart.update(
      times,
      [
        { label: 'Calcul utilisé', color: 'var(--accent)', values: samples.map((x) => (x.computeTotal ? (100 * x.computeUsed) / x.computeTotal : null)) },
        { label: 'Disponibilité', color: 'var(--ok)', values: samples.map((x) => (x.availability === null ? null : 100 * x.availability)) },
      ],
      clock,
    );
    this.pueChart.update(times, [{ label: 'PUE', color: 'var(--warn)', values: samples.map((x) => x.pue) }], clock);
  }

  private updateThermal(s: GameState, samples: readonly Sample[]): void {
    const t = tempStats(s);
    setKpi(this.thermal.max, celsius(t.max), `seuil de panne ${FAILURE.thresholdC} °C`, t.max >= FAILURE.thresholdC ? 'danger' : t.max >= ALERTS.hotC ? 'warn' : 'ok');
    setKpi(this.thermal.avg, celsius(t.avg), 'sur toute la salle');
    const racks = s.buildings.filter(isRackActive);
    const hot = racks.filter((b) => s.temp[idx(s, b.x, b.y)] >= ALERTS.hotC).length;
    setKpi(this.thermal.hot, String(hot), `sur ${racks.length} ${plural(racks.length, 'rack')} en service`, hot ? 'warn' : '');
    const risk = racks.reduce((m, b) => Math.max(m, failureRiskPerMinute(s.temp[idx(s, b.x, b.y)])), 0);
    setKpi(this.thermal.risk, `${percentFine(risk)} / min`, 'rack le plus exposé', risk >= 0.05 ? 'danger' : risk >= 0.02 ? 'warn' : '');

    this.tempChart.update(
      samples.map((x) => x.time),
      [
        { label: 'Maximum', color: 'var(--danger)', values: samples.map((x) => x.maxTemp) },
        { label: 'Moyenne', color: 'var(--accent)', values: samples.map((x) => x.avgTemp) },
      ],
      clock,
    );
  }
}
