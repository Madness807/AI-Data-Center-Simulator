import { BUILD_COST, BUILD_TIME, CRAC, DEMOLISH_REFUND, FAILURE, HEAT, PDU, RACK, REPAIR } from '../../sim/balance';
import { isRackActive, type Building, type BuildingKind, type Cell, type Technician } from '../../sim/entities';
import { idx, type GameState } from '../../sim/state';
import { busyRackIds, coolersCovering, cracHeatLoad } from '../../sim/stats';
import { failureRiskPerMinute } from '../../sim/systems/failures';
import { tempToRgb } from '../../render/overlays';
import { el, icon, setHidden, setStyle, setText } from '../dom';
import { celsius, clock, money, percent, percentFine, plural, seconds, signedMoney } from '../format';
import type { IconName } from '../icons';
import type { TemperatureHistory } from '../metrics';
import { BUILDING_LABEL } from './selection-panel';
import { Sparkline } from './sparkline';

export interface InspectorActions {
  /** Envoie le technicien le plus proche (de préférence libre) construire ou réparer. */
  sendTechnician: (buildingId: number) => void;
  demolish: (cell: Cell) => void;
  focus: (cell: Cell) => void;
  close: () => void;
}

type Tone = '' | 'ok' | 'warn' | 'danger';

const KIND_ICON: Record<BuildingKind, IconName> = { rack: 'rack', crac: 'crac', pdu: 'pdu' };
const CONFIRM_MS = 3000;

/** Ligne « libellé / valeur », mise à jour en place. */
class Row {
  readonly root: HTMLElement;
  private readonly value = el('span', 'mono');

  constructor(label: string, name: IconName) {
    this.root = el('div', 'insp-row', el('span', 'insp-label', icon(name, 13), label), this.value);
  }

  set(text: string, tone: Tone = ''): this {
    setText(this.value, text);
    const cls = `mono ${tone}`;
    if (this.value.className !== cls) this.value.className = cls;
    return this;
  }

  show(on: boolean): void {
    setHidden(this.root, !on);
  }
}

/** Jauge avec libellé et valeur (charge d'une zone, avancement d'un chantier). */
class Gauge {
  readonly root: HTMLElement;
  private readonly fill = el('div', 'meter-fill');
  private readonly value = el('span', 'mono');

  constructor(label: string, name: IconName) {
    this.root = el('div', 'insp-gauge', el('div', 'insp-row', el('span', 'insp-label', icon(name, 13), label), this.value), el('div', 'meter', this.fill));
  }

  set(ratio: number, text: string, tone: Tone): void {
    setStyle(this.fill, 'width', `${Math.min(1, Math.max(0, ratio)) * 100}%`);
    const cls = `meter-fill ${tone}`;
    if (this.fill.className !== cls) this.fill.className = cls;
    setText(this.value, text);
  }

  show(on: boolean): void {
    setHidden(this.root, !on);
  }
}

const ordinal = (n: number) => (n === 1 ? '1er' : `${n}e`);

/** Ce que fait chaque technicien vis-à-vis de cet équipement (au travail, en route, en file). */
function crew(s: GameState, id: number): { tech: Technician; state: string }[] {
  const out: { tech: Technician; state: string }[] = [];
  for (const t of s.techs) {
    const at = t.tasks.findIndex((task) => task.type !== 'move' && task.target === id);
    if (at < 0) continue;
    out.push({ tech: t, state: at > 0 ? 'en file' : t.working ? 'au travail' : 'en route' });
  }
  return out;
}

/**
 * Inspecteur d'équipement : tout ce qu'il faut savoir pour décider (état, température et
 * sa courbe, risque de panne, refroidissement, énergie, calcul, historique) et les actions
 * utiles (envoyer un technicien, centrer la caméra, démolir avec confirmation).
 */
export class Inspector {
  readonly root: HTMLElement;
  private readonly thumb = el('span', 'insp-thumb');
  private readonly title = el('span', 'insp-title');
  private readonly coords = el('span', 'insp-coords mono');
  private readonly status = el('span', 'chip');

  private readonly tempValue = el('span', 'insp-temp mono');
  private readonly tempTrend = el('span', 'insp-trend');
  private readonly spark = new Sparkline();
  private readonly tempBlock: HTMLElement;

  private readonly progress = new Gauge('Avancement', 'build');
  private readonly zoneLoad = new Gauge('Chaleur de la zone', 'temperature');
  private readonly gridLoad = new Gauge('Charge du réseau', 'power');

  private readonly risk = new Row('Risque de panne', 'alert');
  private readonly cooling = new Row('Refroidissement', 'crac');
  private readonly power = new Row('Énergie', 'power');
  private readonly shedOrder = new Row('Ordre de délestage', 'power');
  private readonly compute = new Row('Calcul', 'compute');
  private readonly coverage = new Row('Portée', 'target');
  private readonly network = new Row('Réseau', 'pdu');
  private readonly crewRow = new Row('Techniciens', 'team');
  private readonly remaining = new Row('Temps restant', 'time');
  private readonly uptime = new Row('En service depuis', 'time');
  private readonly failures = new Row('Pannes', 'repair');
  private readonly hint = el('div', 'insp-hint');

  private readonly sendButton = el('button', 'btn btn-primary');
  private readonly demolishButton = el('button', 'btn btn-ghost insp-demolish');
  private readonly thumbnails: Partial<Record<BuildingKind, string>> = {};
  private current: Building | null = null;
  private headerKey = '';
  private confirmUntil = 0;

  constructor(actions: InspectorActions) {
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 15));
    close.title = 'Fermer (Échap)';
    close.onclick = () => actions.close();

    this.tempBlock = el(
      'div',
      'insp-temp-block',
      el('div', 'insp-row', el('span', 'insp-label', icon('temperature', 13), 'Température · 60 s'), el('span', 'insp-temp-now', this.tempTrend, this.tempValue)),
      this.spark.root,
    );

    const focus = el('button', 'btn btn-icon', icon('target', 15));
    focus.title = 'Centrer la caméra';
    focus.onclick = () => this.current && actions.focus(this.current);
    this.sendButton.onclick = () => this.current && actions.sendTechnician(this.current.id);
    this.demolishButton.onclick = () => {
      if (!this.current) return;
      if (performance.now() < this.confirmUntil) {
        this.confirmUntil = 0;
        actions.demolish(this.current);
      } else this.confirmUntil = performance.now() + CONFIRM_MS;
    };

    this.root = el(
      'div',
      'inspector glass',
      el('div', 'insp-head', this.thumb, el('div', 'insp-name', el('div', undefined, this.title, ' ', this.coords), this.status), close),
      this.progress.root,
      this.zoneLoad.root,
      this.gridLoad.root,
      this.tempBlock,
      el(
        'div',
        'insp-rows',
        ...[
          this.risk,
          this.cooling,
          this.power,
          this.shedOrder,
          this.compute,
          this.coverage,
          this.network,
          this.crewRow,
          this.remaining,
          this.uptime,
          this.failures,
        ].map((r) => r.root),
      ),
      this.hint,
      el('div', 'insp-actions', this.sendButton, focus, this.demolishButton),
    );
    this.root.hidden = true;
  }

  setThumbnail(kind: BuildingKind, url: string): void {
    this.thumbnails[kind] = url;
    this.headerKey = '';
  }

  update(s: GameState, b: Building | null, history: TemperatureHistory): void {
    this.current = b;
    setHidden(this.root, !b);
    if (!b) return;
    const site = b.status === 'construction';
    this.renderHeader(b);
    this.renderStatus(s, b);

    // Température de la case, sa courbe et sa tendance sur 10 s.
    const cell = idx(s, b.x, b.y);
    const temp = s.temp[cell];
    const series = history.series(cell);
    const [r, g, bl] = tempToRgb(temp);
    setText(this.tempValue, celsius(temp));
    this.tempValue.style.color = `rgb(${r},${g},${bl})`;
    const before = series[Math.max(0, series.length - 11)] ?? temp;
    const trend = temp - before > 0.3 ? 'up' : before - temp > 0.3 ? 'down' : 'flat';
    if (this.tempTrend.dataset.trend !== trend) {
      this.tempTrend.dataset.trend = trend;
      this.tempTrend.className = `insp-trend ${trend === 'up' ? 'warn' : trend === 'down' ? 'ok' : 'dim'}`;
      this.tempTrend.replaceChildren(trend === 'flat' ? '' : icon(trend === 'up' ? 'trendUp' : 'trendDown', 14));
    }
    this.spark.update([...series, temp], FAILURE.thresholdC, HEAT.ambient);

    // Chaque partie renvoie son astuce éventuelle ; une seule s'affiche.
    const hints = [
      this.renderRack(s, b, temp, b.kind === 'rack' && !site),
      this.renderCrac(s, b, b.kind === 'crac' && !site),
      this.renderPdu(s, b.kind === 'pdu' && !site),
      this.renderSite(s, b, site),
    ];
    const hint = hints.find((h) => h) ?? '';
    setText(this.hint, hint);
    setHidden(this.hint, !hint);

    this.uptime.show(!site);
    if (!site) this.uptime.set(b.builtAt === null ? '—' : clock(s.time - b.builtAt));

    // Actions : envoyer un technicien quand il y a du travail, démolir avec confirmation.
    const needsWork = site || b.status === 'failed' || b.status === 'repairing';
    setHidden(this.sendButton, !needsWork);
    if (needsWork) {
      const label = site ? 'Envoyer construire' : `Envoyer réparer${b.status === 'failed' ? ` (${money(REPAIR.cost)})` : ''}`;
      if (this.sendButton.dataset.label !== label) {
        this.sendButton.dataset.label = label;
        this.sendButton.replaceChildren(icon(site ? 'build' : 'repair', 14), label);
      }
      this.sendButton.disabled = s.techs.length === 0;
    }
    const untouched = site && b.workLeft >= BUILD_TIME[b.kind];
    const refund = Math.round(BUILD_COST[b.kind] * (untouched ? 1 : DEMOLISH_REFUND));
    const confirming = performance.now() < this.confirmUntil;
    const demolishLabel = confirming ? 'Confirmer ?' : `Démolir (${signedMoney(refund)})`;
    if (this.demolishButton.dataset.label !== demolishLabel) {
      this.demolishButton.dataset.label = demolishLabel;
      this.demolishButton.replaceChildren(icon('demolish', 14), demolishLabel);
      this.demolishButton.classList.toggle('confirm', confirming);
    }
  }

  private renderHeader(b: Building): void {
    const key = `${b.id}|${b.kind}|${b.status === 'construction'}`;
    if (key === this.headerKey) return;
    this.headerKey = key;
    this.confirmUntil = 0;
    const url = this.thumbnails[b.kind];
    this.thumb.replaceChildren(url ? Object.assign(document.createElement('img'), { src: url, alt: '' }) : icon(KIND_ICON[b.kind], 22));
    setText(this.title, b.status === 'construction' ? `Chantier : ${BUILDING_LABEL[b.kind]}` : BUILDING_LABEL[b.kind]);
    setText(this.coords, `${b.x},${b.y}`);
  }

  private renderStatus(s: GameState, b: Building): void {
    let text: string;
    let tone: Tone;
    if (b.status === 'construction') [text, tone] = ['chantier', 'warn'];
    else if (b.status === 'failed') [text, tone] = ['en panne', 'danger'];
    else if (b.status === 'repairing') [text, tone] = [`réparation ${seconds(b.workLeft)}`, 'warn'];
    else if (b.kind === 'pdu') [text, tone] = ['en service', 'ok'];
    else if (!b.powered) [text, tone] = [b.kind === 'rack' ? 'délesté' : 'sans courant', 'danger'];
    else if (b.kind === 'crac') [text, tone] = ['en marche', 'ok'];
    else [text, tone] = busyRackIds(s).has(b.id) ? ['en calcul', 'ok'] : ['inactif', ''];
    setText(this.status, text);
    const cls = `chip ${tone}`;
    if (this.status.className !== cls) this.status.className = cls;
  }

  private renderRack(s: GameState, b: Building, temp: number, on: boolean): string {
    for (const row of [this.risk, this.cooling, this.power, this.shedOrder, this.compute, this.failures]) row.show(on);
    if (!on) return '';
    const running = isRackActive(b);
    const risk = failureRiskPerMinute(temp);
    this.risk.show(b.status === 'ok');
    this.risk.set(risk < 0.001 ? '< 0,1 % / min' : `${percentFine(risk)} / min`, risk < 0.02 ? '' : risk < 0.15 ? 'warn' : 'danger');

    const coolers = coolersCovering(s, b.x, b.y);
    this.cooling.set(
      coolers.length ? `${coolers.length} CRAC · ${coolers.length * CRAC.coolingKW} kW` : 'aucun CRAC à portée',
      coolers.length ? 'ok' : 'danger',
    );
    this.power.set(running ? `${RACK.powerKW} kW` : b.status === 'ok' ? '0 kW (délesté)' : '0 kW', running ? '' : 'danger');

    // Les racks les plus récents sont délestés en premier.
    const order = s.buildings.filter((o) => o.kind === 'rack' && o.status === 'ok').sort((a, c) => c.id - a.id);
    const rank = order.findIndex((o) => o.id === b.id) + 1;
    this.shedOrder.show(b.status === 'ok' && order.length > 1);
    this.shedOrder.set(`${ordinal(rank)} sur ${order.length}`, rank <= s.power.shedCount ? 'danger' : '');

    const busy = busyRackIds(s).has(b.id);
    this.compute.set(running ? `${RACK.computeCU} CU/s · ${busy ? 'en calcul' : 'disponible'}` : '0 CU/s', running ? (busy ? 'ok' : '') : 'danger');
    this.failures.set(String(b.failures), b.failures ? 'warn' : '');

    // Une astuce quand la situation appelle une décision.
    if (!coolers.length && temp >= FAILURE.thresholdC) return `Au-delà de ${FAILURE.thresholdC} °C les pannes se multiplient : posez un CRAC à portée.`;
    if (b.status === 'ok' && !b.powered) return 'Capacité électrique insuffisante : ajoutez un PDU.';
    if (b.status === 'failed') return 'Un technicien doit venir le réparer ; les pièces sont payées à son arrivée.';
    return '';
  }

  private renderCrac(s: GameState, b: Building, on: boolean): string {
    this.zoneLoad.show(on);
    this.coverage.show(on);
    if (!on) return '';
    const { racks, heatKW } = cracHeatLoad(s, b);
    const ratio = heatKW / CRAC.coolingKW;
    this.zoneLoad.set(
      ratio,
      `${heatKW} / ${CRAC.coolingKW} kW${ratio > 1 ? ' · saturé' : ''}`,
      ratio > 1 ? 'danger' : ratio > 0.8 ? 'warn' : 'ok',
    );
    this.coverage.set(`${CRAC.radius} cases · ${racks} ${plural(racks, 'rack')}`);
    if (!b.powered) return 'Sans courant, il ne refroidit plus : ajoutez un PDU.';
    return ratio > 1 ? 'Zone saturée : ajoutez un CRAC ou espacez les racks.' : '';
  }

  private renderPdu(s: GameState, on: boolean): string {
    this.network.show(on);
    this.gridLoad.show(on);
    if (!on) return '';
    const p = s.power;
    const pdus = s.buildings.filter((o) => o.kind === 'pdu' && o.status === 'ok').length;
    this.gridLoad.set(p.capacityKW ? p.loadKW / p.capacityKW : 1, `${p.loadKW} / ${p.capacityKW} kW`, p.shedCount ? 'danger' : p.loadKW / p.capacityKW > 0.85 ? 'warn' : 'ok');
    this.network.set(`${pdus} PDU · +${PDU.capacityKW} kW chacun${p.shedCount ? ` · ${p.shedCount} ${plural(p.shedCount, 'délesté')}` : ''}`, p.shedCount ? 'danger' : '');
    return p.shedCount ? 'Des racks sont délestés : un PDU de plus les réalimenterait.' : '';
  }

  private renderSite(s: GameState, b: Building, on: boolean): string {
    this.progress.show(on);
    this.remaining.show(on);
    const team = crew(s, b.id);
    this.crewRow.show(on || b.status === 'failed' || b.status === 'repairing');
    this.crewRow.set(
      team.length ? team.map(({ tech, state }) => `Tech ${tech.id} (${state})`).join(', ') : 'aucun',
      team.length ? '' : 'warn',
    );
    if (!on) return '';
    const done = 1 - b.workLeft / BUILD_TIME[b.kind];
    this.progress.set(done, percent(done), 'ok');
    const working = team.filter((m) => m.state === 'au travail').length;
    this.remaining.set(working ? seconds(b.workLeft / working) : 'en attente', working ? '' : 'warn');
    return team.length ? '' : 'Aucun technicien affecté : envoyez-en un pour lancer le chantier.';
  }
}
