import { BUILD_TIME, buildCost, CDU, CRAC, DEMOLISH_REFUND, FAILURE, GENERATOR, GPU, HEAT, MAINTENANCE, rackSpec, UPS, WEAR } from '../../sim/balance';
import { upgradeBlocker, upgradeCost } from '../../sim/commands';
import { failureRiskPerMinute, rackRiskPerMinute, wearActive } from '../../sim/systems/failures';
import { breathesExhaust, cracWeatherFactor, exhaustIndex, intakeIndex, liquidLoads, rackTemp } from '../../sim/climate';
import { isRackActive, type Building, type Cell, type Technician } from '../../sim/entities';
import { modifiers } from '../../sim/progression';
import { idx, type GameState } from '../../sim/state';
import { busyRackIds, coolersCovering, cracHeatLoad, redundancy, siteProgress } from '../../sim/stats';
import { upsAutonomy } from '../../sim/systems/power';
import { isTaskAssigned } from '../../sim/systems/technicians';
import { tempCss } from '../color';
import { buildingName, KIND_INFO } from '../catalog';
import { ConfirmGate } from '../confirm';
import { batteryTone, intakeTone, loadTone, riskTone, WEAR_DANGER, wearTone, type Tone } from '../tones';
import { el, icon, setHidden, setStyle, setText } from '../dom';
import { celsius, clock, decimal, money, ordinal, percent, plural, riskPerMinute, seconds, signedMoney } from '../format';
import type { IconName } from '../icons';
import type { TemperatureHistory } from '../metrics';
import { Sparkline } from './sparkline';

export interface InspectorActions {
  /** Envoie le technicien le plus proche (de préférence libre) construire ou réparer. */
  sendTechnician: (buildingId: number) => void;
  demolish: (cell: Cell) => void;
  focus: (cell: Cell) => void;
  close: () => void;
  /** Carrière : fait pivoter un rack d'un quart de tour. */
  rotate: (buildingId: number) => void;
  /** Carrière : modernise un rack (génération suivante), confié au technicien le plus proche. */
  upgrade: (buildingId: number) => void;
  /** Carrière : entretien d'un rack usé, confié au technicien le plus proche. */
  maintain: (buildingId: number) => void;
}


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
  private readonly battery = new Gauge('Charge de la batterie', 'ups');
  private readonly liquidLoad = new Gauge('Chaleur captée', 'cdu');
  private readonly wearGauge = new Gauge('Usure', 'repair');

  private readonly risk = new Row('Risque de panne', 'alert');
  private readonly intake = new Row('Air aspiré', 'temperature');
  private readonly exhaust = new Row('Soufflage', 'heatmap');
  private readonly cooling = new Row('Refroidissement', 'crac');
  private readonly power = new Row('Énergie', 'power');
  private readonly shedOrder = new Row('Ordre de délestage', 'power');
  private readonly compute = new Row('Calcul', 'compute');
  private readonly coverage = new Row('Portée', 'target');
  private readonly network = new Row('Réseau', 'pdu');
  private readonly backupState = new Row('État', 'power');
  private readonly autonomy = new Row('Autonomie', 'time');
  private readonly fuel = new Row('Carburant', 'money');
  private readonly n1 = new Row('Redondance N+1', 'power');
  private readonly crewRow = new Row('Techniciens', 'team');
  private readonly remaining = new Row('Temps restant', 'time');
  private readonly uptime = new Row('En service depuis', 'time');
  private readonly failures = new Row('Pannes', 'repair');
  private readonly hint = el('div', 'insp-hint');

  private readonly sendButton = el('button', 'btn btn-primary');
  private readonly rotateButton = el('button', 'btn btn-icon', icon('rotate', 15));
  private readonly upgradeButton = el('button', 'btn insp-upgrade');
  private readonly maintainButton = el('button', 'btn');
  private readonly demolishButton = el('button', 'btn btn-ghost insp-demolish');
  /** Vignettes par type d'équipement, et par génération pour les racks (rack2, rack3). */
  private readonly thumbnails: Partial<Record<string, string>> = {};
  private current: Building | null = null;
  private headerKey = '';
  private readonly demolishConfirm = new ConfirmGate();

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
    this.rotateButton.title = 'Pivoter d’un quart de tour (F)';
    this.rotateButton.onclick = () => this.current && actions.rotate(this.current.id);
    this.upgradeButton.onclick = () => this.current && actions.upgrade(this.current.id);
    this.maintainButton.replaceChildren(icon('repair', 14), `Entretien · ${money(MAINTENANCE.cost)}`);
    this.maintainButton.title = 'Remet l’usure à zéro ; le rack continue de tourner (clic droit avec un technicien sélectionné)';
    this.maintainButton.onclick = () => this.current && actions.maintain(this.current.id);
    this.sendButton.dataset.tuto = 'send';
    this.demolishButton.onclick = () => {
      if (!this.current) return;
      if (this.demolishConfirm.armed) {
        this.demolishConfirm.disarm();
        actions.demolish(this.current);
      } else this.demolishConfirm.arm();
    };

    this.root = el(
      'div',
      'inspector glass',
      el('div', 'insp-head', this.thumb, el('div', 'insp-name', el('div', undefined, this.title, ' ', this.coords), this.status), close),
      this.progress.root,
      this.zoneLoad.root,
      this.gridLoad.root,
      this.battery.root,
      this.liquidLoad.root,
      this.wearGauge.root,
      this.tempBlock,
      el(
        'div',
        'insp-rows',
        ...[
          this.risk,
          this.intake,
          this.exhaust,
          this.cooling,
          this.power,
          this.shedOrder,
          this.compute,
          this.coverage,
          this.network,
          this.backupState,
          this.autonomy,
          this.fuel,
          this.n1,
          this.crewRow,
          this.remaining,
          this.uptime,
          this.failures,
        ].map((r) => r.root),
      ),
      this.hint,
      el('div', 'insp-actions', this.sendButton, this.maintainButton, this.upgradeButton, this.rotateButton, focus, this.demolishButton),
    );
    this.root.hidden = true;
  }

  setThumbnail(kind: string, url: string): void {
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
    setText(this.tempValue, celsius(temp));
    this.tempValue.style.color = tempCss(temp);
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
      this.renderUps(s, b, b.kind === 'ups' && !site),
      this.renderGenerator(s, b, b.kind === 'generator' && !site),
      this.renderCdu(s, b, b.kind === 'cdu' && !site),
      this.renderSite(s, b, site),
    ];
    const hint = hints.find((h) => h) ?? '';
    setText(this.hint, hint);
    setHidden(this.hint, !hint);

    setHidden(this.rotateButton, !(b.kind === 'rack' && s.rules.aisles));
    this.renderUpgrade(s, b);
    this.uptime.show(!site);
    if (!site) this.uptime.set(b.builtAt === null ? '—' : clock(s.time - b.builtAt));

    // Actions : envoyer un technicien quand il y a du travail, démolir avec confirmation.
    const needsWork = site || b.status === 'failed' || b.status === 'repairing';
    setHidden(this.sendButton, !needsWork);
    if (needsWork) {
      const label = site ? 'Envoyer construire' : `Envoyer réparer${b.status === 'failed' ? ` (${money(modifiers(s).repairCost)})` : ''}`;
      if (this.sendButton.dataset.label !== label) {
        this.sendButton.dataset.label = label;
        this.sendButton.replaceChildren(icon(site ? 'build' : 'repair', 14), label);
      }
      this.sendButton.disabled = s.techs.length === 0;
    }
    const untouched = site && b.workLeft >= BUILD_TIME[b.kind];
    const refund = Math.round(buildCost(b.kind, b.gen) * (untouched ? 1 : DEMOLISH_REFUND));
    const confirming = this.demolishConfirm.armed;
    const demolishLabel = confirming ? 'Confirmer ?' : `Démolir (${signedMoney(refund)})`;
    if (this.demolishButton.dataset.label !== demolishLabel) {
      this.demolishButton.dataset.label = demolishLabel;
      this.demolishButton.replaceChildren(icon('demolish', 14), demolishLabel);
      this.demolishButton.classList.toggle('confirm', confirming);
    }
  }

  private renderHeader(b: Building): void {
    const key = `${b.id}|${b.kind}|${b.status === 'construction'}|${b.gen ?? 1}`;
    if (key === this.headerKey) return;
    this.headerKey = key;
    this.demolishConfirm.disarm();
    const url = this.thumbnails[b.kind === 'rack' && (b.gen ?? 1) > 1 ? `rack${b.gen}` : b.kind];
    this.thumb.replaceChildren(url ? Object.assign(document.createElement('img'), { src: url, alt: '' }) : icon(KIND_INFO[b.kind].icon, 22));
    const label = buildingName(b.kind, b.gen);
    setText(this.title, b.status === 'construction' ? `Chantier : ${label}` : label);
    setText(this.coords, `${b.x},${b.y}`);
  }

  private renderStatus(s: GameState, b: Building): void {
    let text: string;
    let tone: Tone;
    if (b.status === 'construction') [text, tone] = ['chantier', 'warn'];
    else if (b.status === 'failed') [text, tone] = ['en panne', 'danger'];
    else if (b.status === 'repairing') [text, tone] = [`réparation ${seconds(b.workLeft)}`, 'warn'];
    else if (b.kind === 'pdu') [text, tone] = ['en service', 'ok'];
    else if (b.kind === 'ups') [text, tone] = !s.power.grid && s.power.upsKW > 0 ? ['alimente la salle', 'warn'] : (b.charge ?? 0) > 0 ? ['prêt', 'ok'] : ['batterie vide', 'danger'];
    else if (b.kind === 'generator') [text, tone] = b.warmup === undefined ? ['en veille', ''] : b.warmup > 0 ? ['démarrage', 'warn'] : ['en marche', 'ok'];
    else if (!b.powered) [text, tone] = [b.kind === 'rack' ? 'délesté' : 'sans courant', 'danger'];
    else if (b.kind === 'crac') [text, tone] = ['en marche', 'ok'];
    else [text, tone] = busyRackIds(s).has(b.id) ? ['en calcul', 'ok'] : ['inactif', ''];
    setText(this.status, text);
    const cls = `chip ${tone}`;
    if (this.status.className !== cls) this.status.className = cls;
  }

  private renderRack(s: GameState, b: Building, temp: number, on: boolean): string {
    for (const row of [this.risk, this.cooling, this.power, this.shedOrder, this.compute, this.failures]) row.show(on);
    this.intake.show(on && s.rules.aisles);
    this.exhaust.show(on && s.rules.aisles);
    if (!on) return '';
    const running = isRackActive(b);
    // En carrière, le risque se lit sur l'air aspiré (devant le rack), pas sur sa case.
    const intakeTemp = rackTemp(s, b);
    // Risque réel : air aspiré, puis usure et âge (carrière).
    const risk = b.status === 'ok' ? rackRiskPerMinute(s, b) : failureRiskPerMinute(intakeTemp);
    const worn = wearActive(s);
    this.wearGauge.show(worn);
    if (worn) {
      const w = b.wear ?? 0;
      this.wearGauge.set(w / 100, `${Math.round(w)} %`, wearTone(w));
    }
    const servicing = isTaskAssigned(s, 'maintain', b.id);
    setHidden(this.maintainButton, !(worn && b.status === 'ok' && (b.wear ?? 0) >= 10 && !servicing));
    if (s.rules.aisles) {
      const own = idx(s, b.x, b.y);
      this.intake.set(`${celsius(intakeTemp)} · ${intakeIndex(s, b) === own ? 'sur sa case (avant bouché)' : 'devant'}`, intakeTone(intakeTemp));
      const ex = exhaustIndex(s, b);
      this.exhaust.set(ex === null ? 'gardée (mur ou équipement derrière)' : 'vers l’arrière', ex === null ? 'warn' : '');
    }
    this.risk.show(b.status === 'ok');
    this.risk.set(riskPerMinute(risk), riskTone(risk));

    const coolers = coolersCovering(s, b.x, b.y);
    this.cooling.set(
      coolers.length ? `${coolers.length} CRAC · ${Math.round(coolers.length * modifiers(s).cracCoolingKW * cracWeatherFactor(s))} kW` : 'aucun CRAC à portée',
      coolers.length ? 'ok' : 'danger',
    );
    const spec = rackSpec(b);
    this.power.set(running ? `${spec.powerKW} kW` : b.status === 'ok' ? '0 kW (délesté)' : '0 kW', running ? '' : 'danger');

    // Les racks les plus récents sont délestés en premier.
    const order = s.buildings.filter((o) => o.kind === 'rack' && o.status === 'ok').sort((a, c) => c.id - a.id);
    const rank = order.findIndex((o) => o.id === b.id) + 1;
    this.shedOrder.show(b.status === 'ok' && order.length > 1);
    this.shedOrder.set(`${ordinal(rank)} sur ${order.length}`, rank <= s.power.shedCount ? 'danger' : '');

    const busy = busyRackIds(s).has(b.id);
    const training = s.jobs.find((j) => j.status === 'active' && j.assigned?.includes(b.id));
    const use = training ? `entraînement (bloc de ${training.assigned!.length})` : busy ? 'en calcul' : 'disponible';
    this.compute.set(running ? `${spec.computeCU} CU/s · ${use}` : '0 CU/s', running ? (busy ? 'ok' : '') : 'danger');
    this.failures.set(String(b.failures), b.failures ? 'warn' : '');

    // Une astuce quand la situation appelle une décision.
    const cduNear = s.buildings.some((c) => c.kind === 'cdu' && c.status === 'ok' && (c.x - b.x) ** 2 + (c.y - b.y) ** 2 <= CDU.radius ** 2);
    if ((b.gen ?? 1) === 3 && !cduNear) return `Un rack G3 dégage ${GPU[3].heatKW} kW : sans CDU à ${CDU.radius} cases, il surchauffe.`;
    if (worn && (b.wear ?? 0) >= WEAR_DANGER && b.status === 'ok') return `Usure ${Math.round(b.wear ?? 0)} % : le risque de panne est ${(1 + ((b.wear ?? 0) / 100) * WEAR.failureMult).toFixed(1).replace('.', ',')} fois plus élevé. Un entretien le remet à neuf.`;
    if (breathesExhaust(s, b)) return 'Ce rack aspire l’air chaud qu’un autre souffle : pivotez-le (F) pour former des allées chaude et froide, dos à dos.';
    if (!coolers.length && temp >= FAILURE.thresholdC) return `Au-delà de ${FAILURE.thresholdC} °C les pannes se multiplient : posez un CRAC à portée.`;
    if (b.status === 'ok' && !b.powered) return 'Capacité électrique insuffisante : ajoutez un PDU.';
    if (b.status === 'failed') return 'Un technicien doit venir le réparer ; les pièces sont payées à son arrivée.';
    return '';
  }

  private renderCrac(s: GameState, b: Building, on: boolean): string {
    if (b.kind !== 'rack') {
      this.wearGauge.show(false);
      setHidden(this.maintainButton, true);
    }
    this.zoneLoad.show(on);
    this.coverage.show(on);
    if (!on) return '';
    const { racks, heatKW } = cracHeatLoad(s, b);
    // Capacité réelle : recherche et météo comprises (une canicule l'abaisse).
    const capacity = Math.round(modifiers(s).cracCoolingKW * cracWeatherFactor(s));
    const ratio = heatKW / capacity;
    this.zoneLoad.set(
      ratio,
      `${heatKW} / ${capacity} kW${ratio > 1 ? ' · saturé' : ''}`,
      ratio > 1 ? 'danger' : ratio > 0.8 ? 'warn' : 'ok',
    );
    this.coverage.set(`${CRAC.radius} cases · ${racks} ${plural(racks, 'rack')}`);
    if (!b.powered) return 'Sans courant, il ne refroidit plus : ajoutez un PDU.';
    return ratio > 1 ? 'Zone saturée : ajoutez un CRAC ou espacez les racks.' : '';
  }

  private renderUps(s: GameState, b: Building, on: boolean): string {
    this.battery.show(on);
    this.autonomy.show(on);
    if (!on) return '';
    const store = modifiers(s).upsStoreKJ;
    const charge = b.charge ?? 0;
    const ratio = charge / store;
    this.battery.set(ratio, `${percent(ratio)} · ${Math.round(charge)} / ${Math.round(store)} kJ`, ratio > 0.5 ? 'ok' : ratio > 0.2 ? 'warn' : 'danger');
    const left = upsAutonomy(s);
    const draw = s.power.grid ? 'à la demande actuelle' : 'au débit actuel';
    this.autonomy.set(left === null ? '—' : left === Infinity ? 'illimitée' : `${seconds(left)} ${draw}`, left === null ? '' : batteryTone(left));
    if (s.power.grid && ratio < 1) return `Recharge sur le réseau (${UPS.rechargeKW} kW) : pleine dans ${seconds(((store - charge) / UPS.rechargeKW))}.`;
    if (!s.power.grid && ratio < 0.2) return 'Batterie presque vide : un groupe électrogène prendrait le relais pour toute la coupure.';
    return '';
  }

  private renderGenerator(s: GameState, b: Building, on: boolean): string {
    this.backupState.show(on);
    this.fuel.show(on);
    this.n1.show(on || this.n1Visible);
    if (!on) return '';
    const running = b.warmup !== undefined && b.warmup <= 0;
    const share = running ? s.power.generatorKW / Math.max(1, s.buildings.filter((o) => o.kind === 'generator' && o.warmup !== undefined && o.warmup <= 0).length) : 0;
    this.backupState.set(
      b.warmup === undefined ? `en veille · démarre en ${modifiers(s).generatorStartS} s` : b.warmup > 0 ? `démarrage · ${seconds(b.warmup)}` : `en marche · ${Math.round(share)} / ${GENERATOR.powerKW} kW`,
      b.warmup === undefined ? '' : b.warmup > 0 ? 'warn' : 'ok',
    );
    this.fuel.set(running ? `−${decimal(share * GENERATOR.fuelPerKWs)} $/s` : `${decimal(GENERATOR.fuelPerKWs, 2)} $ par kW·s`, running ? 'warn' : '');
    const r = redundancy(s);
    this.n1.set(r.backup ? 'oui' : 'non', r.backup ? 'ok' : 'warn');
    return r.backup ? '' : 'Sans N+1, la panne d’un groupe pendant une coupure délesterait des racks : ajoutez-en un.';
  }

  private renderCdu(s: GameState, b: Building, on: boolean): string {
    this.liquidLoad.show(on);
    if (!on) return '';
    const kw = liquidLoads(s).byCdu.get(b.id) ?? 0;
    const ratio = kw / CDU.capacityKW;
    this.liquidLoad.set(ratio, `${Math.round(kw)} / ${CDU.capacityKW} kW`, ratio > 0.95 ? 'warn' : 'ok');
    this.coverage.show(true);
    const racks = s.buildings.filter((r) => r.kind === 'rack' && (r.x - b.x) ** 2 + (r.y - b.y) ** 2 <= CDU.radius ** 2).length;
    this.coverage.set(`${CDU.radius} cases · ${racks} ${plural(racks, 'rack')}`);
    if (!b.powered) return 'Sans courant, la pompe s’arrête : la chaleur revient dans la salle.';
    return ratio > 0.95 ? 'Capacité atteinte : un second CDU soulagerait les racks de la zone.' : '';
  }

  /** Bouton Moderniser (carrière, recherche faite) : génération suivante, prix, raison d'un refus. */
  private renderUpgrade(s: GameState, b: Building): void {
    const gen = b.gen ?? 1;
    const show = b.kind === 'rack' && s.rules.progression && modifiers(s).retrofit && gen < 3 && b.status !== 'construction';
    setHidden(this.upgradeButton, !show);
    if (!show) return;
    const blocker = upgradeBlocker(s, b);
    const label = `G${gen + 1} · ${money(upgradeCost(b))}`;
    if (this.upgradeButton.dataset.label !== label) {
      this.upgradeButton.dataset.label = label;
      this.upgradeButton.replaceChildren(icon('build', 14), label);
    }
    this.upgradeButton.disabled = blocker !== null;
    this.upgradeButton.title = blocker ?? `Moderniser en G${gen + 1} : ${GPU[(gen + 1) as 2 | 3].computeCU} CU/s, ${GPU[(gen + 1) as 2 | 3].heatKW} kW de chaleur`;
  }

  /** La ligne N+1 sert au PDU comme au groupe : visible si l'un des deux l'a demandée. */
  private n1Visible = false;

  private renderPdu(s: GameState, on: boolean): string {
    this.network.show(on);
    this.gridLoad.show(on);
    this.n1Visible = on;
    this.n1.show(on);
    if (!on) return '';
    const r = redundancy(s);
    this.n1.set(r.pdu ? 'oui' : 'non', r.pdu ? 'ok' : 'warn');
    const p = s.power;
    const pdus = s.buildings.filter((o) => o.kind === 'pdu' && o.status === 'ok').length;
    this.gridLoad.set(p.capacityKW ? p.loadKW / p.capacityKW : 1, `${p.loadKW} / ${p.capacityKW} kW`, loadTone(p.loadKW / p.capacityKW, p.shedCount > 0));
    this.network.set(`${pdus} PDU · +${Math.round(modifiers(s).pduCapacityKW)} kW chacun${p.shedCount ? ` · ${p.shedCount} ${plural(p.shedCount, 'délesté')}` : ''}`, p.shedCount ? 'danger' : '');
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
    const done = siteProgress(b);
    this.progress.set(done, percent(done), 'ok');
    const working = team.filter((m) => m.state === 'au travail').length;
    this.remaining.set(working ? seconds(b.workLeft / working) : 'en attente', working ? '' : 'warn');
    return team.length ? '' : 'Aucun technicien affecté : envoyez-en un pour lancer le chantier.';
  }
}
