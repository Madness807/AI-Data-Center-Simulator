import { ECONOMY, FAILURE } from '../../sim/balance';
import type { GameState, Speed } from '../../sim/state';
import { tempStats } from '../../sim/stats';
import type { Balance } from '../metrics';
import { el, icon, setHidden, setStyle, setText } from '../dom';
import { clock, money, moneyRate, percent, plural, seconds } from '../format';
import type { IconName } from '../icons';

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
  private readonly time = block('time', 'Temps');
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();
  private readonly pauseBanner = el('div', 'banner banner-pause', icon('pause', 14), 'PAUSE — Espace pour reprendre');
  private readonly bankruptBanner = el('div', 'banner banner-bankrupt', icon('alert', 15));
  private readonly bankruptText = el('span');

  constructor(setSpeed: (speed: Speed) => void) {
    this.moneyBlock.sub.append(this.trend, this.moneyRate);
    const goalRow = el('div', 'res-sub', this.goal.root, this.goalPct);
    this.moneyBlock.root.querySelector('.res-body')!.append(goalRow);
    this.power.sub.append(this.powerMeter.root, this.shed);
    this.compute.sub.append(this.computeMeter.root);

    const speed = el('div', 'speed');
    for (const sp of SPEEDS) {
      const b = el('button', 'btn', sp.speed === 0 ? icon('pause', 14) : sp.label);
      b.title = `${sp.speed === 0 ? 'Pause' : `Vitesse ${sp.label}`} (${sp.key})`;
      b.onclick = () => setSpeed(sp.speed);
      speed.append(b);
      this.speedButtons.set(sp.speed, b);
    }
    const bar = el(
      'div',
      'resource-bar glass',
      this.moneyBlock.root,
      this.power.root,
      this.compute.root,
      this.temp.root,
      this.team.root,
      this.time.root,
      speed,
    );
    this.bankruptBanner.append(this.bankruptText);
    this.root = el('div', 'region-top-stack', bar, this.pauseBanner, this.bankruptBanner);
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
    const goal = Math.min(1, Math.max(0, s.money / ECONOMY.goalMoney));
    setStyle(this.goal.fill, 'width', `${goal * 100}%`);
    this.goal.fill.classList.toggle('won', s.outcome === 'won');
    setText(this.goalPct, s.outcome === 'won' ? 'objectif atteint' : `${percent(goal)} objectif`);
    this.goal.root.title = `Objectif : ${money(ECONOMY.goalMoney)}`;

    const p = s.power;
    setText(this.power.value, `${p.loadKW} / ${p.capacityKW} kW`);
    const load = p.capacityKW ? p.loadKW / p.capacityKW : 1;
    setStyle(this.powerMeter.fill, 'width', `${Math.min(1, load) * 100}%`);
    this.powerMeter.fill.className = `meter-fill ${p.shedCount ? 'danger' : load > 0.85 ? 'warn' : 'ok'}`;
    setHidden(this.shed, p.shedCount === 0);
    setText(this.shed, `${p.shedCount} ${plural(p.shedCount, 'délesté')}`);

    setText(this.compute.value, `${s.compute.used} / ${s.compute.total} CU/s`);
    setStyle(this.computeMeter.fill, 'width', `${s.compute.total ? (s.compute.used / s.compute.total) * 100 : 0}%`);

    const t = tempStats(s);
    setText(this.temp.value, `${t.max.toFixed(1)} °C`);
    this.temp.value.className = `res-value ${t.max >= FAILURE.thresholdC + 15 ? 'danger' : t.max >= FAILURE.thresholdC ? 'warn' : ''}`;
    setText(this.temp.sub, `moy. ${t.avg.toFixed(1)} °C`);

    const idle = s.techs.filter((tech) => tech.tasks.length === 0).length;
    setText(this.team.value, `${s.techs.length} tech.`);
    setText(this.team.sub, `${idle} ${plural(idle, 'libre')}`);

    setText(this.time.value, clock(s.time));
    for (const [sp, b] of this.speedButtons) b.classList.toggle('active', sp === s.speed);

    setHidden(this.pauseBanner, s.speed !== 0 || s.outcome === 'lost');
    const timer = s.economy.bankruptTimer;
    setHidden(this.bankruptBanner, !(timer > 0 && s.outcome !== 'lost'));
    if (timer > 0) setText(this.bankruptText, `Trésorerie négative : faillite dans ${seconds(ECONOMY.bankruptcySeconds - timer)}`);
  }
}
