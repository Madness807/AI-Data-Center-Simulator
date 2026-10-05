import { ECONOMY } from '../../sim/balance';
import type { GameState, Speed } from '../../sim/state';
import { tempStats } from '../../sim/stats';
import { TIERS } from '../../sim/progression';
import type { Balance } from '../metrics';
import type { DashboardTab } from './dashboard';
import { el, icon, setHidden, setStyle, setText } from '../dom';
import { celsius, clock, money, moneyRate, percent, plural, seconds } from '../format';
import type { IconName } from '../icons';
import { loadTone, roomTone } from '../tones';

const SPEEDS: { speed: Speed; label: string; key: string }[] = [
  { speed: 0, label: '', key: 'Espace' },
  { speed: 1, label: '×1', key: '1' },
  { speed: 2, label: '×2', key: '2' },
  { speed: 4, label: '×4', key: '3' },
];

/** Un bloc de la barre : icône, libellé, valeur, et une ligne secondaire (jauge, détail). */
function block(name: IconName, label: string, cls = '') {
  const value = el('span', 'res-value');
  const sub = el('div', 'res-sub');
  const root = el('div', `res ${cls}`, el('span', 'res-icon', icon(name, 16)), el('div', 'res-body', el('span', 'res-label', label), value, sub));
  return { root, value, sub };
}

function meter() {
  const fill = el('div', 'meter-fill');
  return { root: el('div', 'meter', fill), fill };
}

/** Barre du haut : trésorerie et objectif en premier, puis énergie, calcul, température, équipe, temps et vitesse. */
export class ResourceBar {
  readonly root: HTMLElement;
  private readonly moneyBlock = block('money', 'Trésorerie', 'res-money');
  /** Bloc trésorerie, pour y attacher l'infobulle du bilan. */
  readonly moneyCard = this.moneyBlock.root;
  private readonly trend = el('span', 'trend');
  private readonly moneyRate = el('span', 'mono');
  private readonly goal = meter();
  private readonly goalPct = el('span', 'mono');
  private readonly power = block('power', 'Énergie');
  private readonly powerMeter = meter();
  private readonly shed = el('span', 'chip danger');
  private readonly compute = block('compute', 'Calcul');
  private readonly computeMeter = meter();
  private readonly temp = block('temperature', 'Temp. max');
  private readonly team = block('team', 'Équipe');
  private readonly clock = el('span', 'speed-clock mono');
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();
  private readonly pauseBanner = el('div', 'banner banner-pause', icon('pause', 14), 'PAUSE — Espace pour reprendre');
  private readonly bankruptBanner = el('div', 'banner banner-bankrupt', icon('alert', 15));
  private readonly outageBanner = el('div', 'banner banner-outage', icon('power', 15));
  private readonly heatBanner = el('div', 'banner banner-heatwave', icon('weather', 15));
  private readonly heatText = el('span');
  private readonly outageText = el('span');
  private readonly bankruptText = el('span');

  constructor(setSpeed: (speed: Speed) => void, openMenu: () => void, panels: { dashboard: (tab: DashboardTab) => void; team: () => void }) {
    this.moneyBlock.sub.append(this.trend, this.moneyRate);
    const goalRow = el('div', 'res-sub', this.goal.root, this.goalPct);
    this.moneyBlock.root.querySelector('.res-body')!.append(goalRow);
    this.power.sub.append(this.powerMeter.root, this.shed);
    this.compute.sub.append(this.computeMeter.root);
    this.compute.root.dataset.res = 'compute';

    const speed = el('div', 'speed', el('span', 'speed-time', icon('time', 14), this.clock));
    for (const sp of SPEEDS) {
      const b = el('button', 'btn', sp.speed === 0 ? icon('pause', 14) : sp.label);
      b.title = `${sp.speed === 0 ? 'Pause' : `Vitesse ${sp.label}`} (${sp.key})`;
      b.onclick = () => setSpeed(sp.speed);
      speed.append(b);
      this.speedButtons.set(sp.speed, b);
    }
    // Chaque bloc ouvre son détail : l'onglet du tableau de bord (Tab), ou le panneau Équipe (G).
    const opens: [HTMLElement, () => void, string | null][] = [
      [this.moneyBlock.root, () => panels.dashboard('finances'), null],
      [this.power.root, () => panels.dashboard('operations'), 'Tableau de bord : exploitation (Tab)'],
      [this.compute.root, () => panels.dashboard('operations'), 'Tableau de bord : exploitation (Tab)'],
      [this.temp.root, () => panels.dashboard('thermal'), 'Tableau de bord : thermique (Tab)'],
      [this.team.root, panels.team, 'Équipe (G)'],
    ];
    for (const [root, open, title] of opens) {
      root.classList.add('clickable');
      root.onclick = open;
      if (title) root.title = title;
    }
    const menu = el('button', 'btn btn-icon menu-button', icon('menu', 16));
    menu.title = 'Menu (Échap)';
    menu.onclick = openMenu;
    speed.append(menu);
    const bar = el(
      'div',
      'resource-bar glass',
      this.moneyBlock.root,
      this.power.root,
      this.compute.root,
      this.temp.root,
      this.team.root,
      speed,
    );
    this.bankruptBanner.append(this.bankruptText);
    this.outageBanner.append(this.outageText);
    this.heatBanner.append(this.heatText);
    this.root = el('div', 'region-top-stack', bar, this.pauseBanner, this.outageBanner, this.heatBanner, this.bankruptBanner);
    this.root.style.display = 'contents';
  }

  update(s: GameState, balance: Balance | null): void {
    setText(this.moneyBlock.value, money(s.money));
    this.moneyBlock.value.classList.toggle('danger', s.money < 0);
    // Bilan d'exploitation sur la dernière minute : gagne-t-on de l'argent ?
    const net = balance?.netPerSecond ?? -(s.economy.electricityPerS + s.economy.salariesPerS);
    setText(this.moneyRate, `${moneyRate(net)} bilan`);
    this.moneyRate.className = `mono ${net >= 0 ? 'ok' : 'danger'}`;
    const dir = net >= 0 ? 'trendUp' : 'trendDown';
    if (this.trend.dataset.dir !== dir) {
      this.trend.dataset.dir = dir;
      this.trend.className = `trend ${net >= 0 ? 'ok' : 'danger'}`;
      this.trend.replaceChildren(icon(dir, 13));
    }
    if (s.rules.progression) {
      // Carrière : progression de la réputation vers le palier suivant.
      const { tier, reputation } = s.career;
      const here = TIERS[tier];
      const next = TIERS[tier + 1];
      const f = next ? Math.min(1, Math.max(0, (reputation - here.reputation) / (next.reputation - here.reputation))) : 1;
      setStyle(this.goal.fill, 'width', `${f * 100}%`);
      this.goal.fill.classList.toggle('won', !next);
      // Réputation acquise mais pas le calcul exigé : c'est lui qu'on affiche, en attente.
      const cuShort = !!next?.computeCU && f >= 1 && s.compute.total < next.computeCU;
      setText(this.goalPct, !next ? here.name : cuShort ? `${s.compute.total}/${next.computeCU} CU/s` : `${here.name} ${percent(f)}`);
      this.goalPct.classList.toggle('warn', cuShort);
      this.goal.root.title = next
        ? `Palier ${next.name} : réputation ${reputation} / ${next.reputation}${next.computeCU ? ` · calcul ${s.compute.total} / ${next.computeCU} CU/s` : ''}`
        : `Dernier palier atteint (${reputation} de réputation)`;
    } else {
      const goal = Math.min(1, Math.max(0, s.money / ECONOMY.goalMoney));
      setStyle(this.goal.fill, 'width', `${goal * 100}%`);
      this.goal.fill.classList.toggle('won', s.outcome === 'won');
      setText(this.goalPct, s.outcome === 'won' ? 'objectif atteint' : `${percent(goal)} objectif`);
      this.goalPct.classList.remove('warn');
      this.goal.root.title = `Objectif : ${money(ECONOMY.goalMoney)}`;
    }

    const p = s.power;
    // Pendant une coupure, la capacité est celle des secours.
    const cap = p.grid ? p.capacityKW : Math.min(p.capacityKW, Math.round(p.backupKW));
    setText(this.power.value, `${Math.round(p.loadKW)} / ${cap} kW`);
    this.power.root.classList.toggle('outage', !p.grid);
    const load = cap ? p.loadKW / cap : 1;
    setStyle(this.powerMeter.fill, 'width', `${Math.min(1, load) * 100}%`);
    this.powerMeter.fill.className = `meter-fill ${loadTone(load, p.shedCount > 0)}`;
    setHidden(this.shed, p.shedCount === 0);
    setHidden(this.powerMeter.root, p.shedCount > 0);
    setText(this.shed, `${p.shedCount} ${plural(p.shedCount, 'délesté')}`);

    setText(this.compute.value, `${s.compute.used} / ${s.compute.total} CU/s`);
    setStyle(this.computeMeter.fill, 'width', `${s.compute.total ? (s.compute.used / s.compute.total) * 100 : 0}%`);

    const t = tempStats(s);
    setText(this.temp.value, celsius(t.max));
    this.temp.value.className = `res-value ${roomTone(t.max)}`;
    // Carrière, palier de la météo : la température extérieure remplace la moyenne de la salle.
    const outside = s.cooling.outsideC;
    setText(this.temp.sub, outside === null ? `moy. ${celsius(t.avg)}` : `ext. ${celsius(outside)}`);
    this.temp.sub.classList.toggle('warn', s.incidents.heatwaveEndsAt !== null);

    const idle = s.techs.filter((tech) => tech.tasks.length === 0).length;
    setText(this.team.value, `${s.techs.length} tech.`);
    setText(this.team.sub, `${idle} ${plural(idle, 'libre')}`);

    setText(this.clock, clock(s.time));
    for (const [sp, b] of this.speedButtons) b.classList.toggle('active', sp === s.speed);

    setHidden(this.pauseBanner, s.speed !== 0 || s.outcome === 'lost');
    const wave = s.incidents.heatwaveEndsAt;
    setHidden(this.heatBanner, wave === null || s.outcome === 'lost');
    if (wave !== null) {
      setText(this.heatText, `Canicule : ${Math.round(s.cooling.outsideC ?? 0)} °C dehors · CRAC à ${Math.round(s.cooling.cracFactor * 100)} % · fin dans ${seconds(wave - s.time)}`);
    }
    const ends = s.incidents.outageEndsAt;
    setHidden(this.outageBanner, ends === null || s.outcome === 'lost');
    if (ends !== null) {
      const backup = p.generatorKW > 0 ? `groupes ${Math.round(p.generatorKW)} kW` : p.upsKW > 0 ? `onduleurs ${Math.round(p.upsKW)} kW` : 'aucun secours';
      setText(this.outageText, `Coupure du réseau : ${backup}${p.shedCount ? ` · ${p.shedCount} ${plural(p.shedCount, 'équipement délesté', 'équipements délestés')}` : ''} · retour dans ${seconds(ends - s.time)}`);
    }
    const timer = s.economy.bankruptTimer;
    setHidden(this.bankruptBanner, !(timer > 0 && s.outcome !== 'lost'));
    if (timer > 0) setText(this.bankruptText, `Trésorerie négative : faillite dans ${seconds(ECONOMY.bankruptcySeconds - timer)}`);
  }
}
