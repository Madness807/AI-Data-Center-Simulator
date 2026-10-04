import { BUILD_COST, CRAC, PDU, RACK } from '../sim/balance';
import type { BuildingKind } from '../sim/entities';
import { buildingAt, idx, type GameState, type Speed } from '../sim/state';
import { computeCU, tempStats } from '../sim/stats';
import type { Tool } from '../input/build';
import { HEAT_STOPS } from '../render/overlays';

export interface HudActions {
  setTool: (tool: Tool) => void;
  setSpeed: (speed: Speed) => void;
  toggleHeatmap: () => void;
  toggleEdgePan: () => void;
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

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export class Hud {
  private readonly stat: Record<'money' | 'time' | 'power' | 'compute' | 'temp', HTMLElement>;
  private readonly toolButtons = new Map<Tool, HTMLButtonElement>();
  private readonly speedButtons = new Map<Speed, HTMLButtonElement>();
  private readonly heatButton: HTMLButtonElement;
  private readonly edgeButton: HTMLButtonElement;
  private readonly info: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly recentToasts = new Map<string, number>();

  constructor(root: HTMLElement, actions: HudActions) {
    const top = el('div', 'hud-top panel');
    const stat = (label: string) => {
      const box = el('div', 'stat');
      box.append(el('span', 'stat-label', label));
      const v = el('span', 'stat-value');
      box.append(v);
      top.append(box);
      return v;
    };
    this.stat = {
      money: stat('Trésorerie'),
      time: stat('Temps'),
      power: stat('Énergie'),
      compute: stat('Calcul'),
      temp: stat('Température'),
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
    bar.append(el('div', 'sep'));
    this.heatButton = el('button', 'btn tool');
    this.heatButton.append(el('span', 'tool-key', 'H'), el('span', 'tool-label', 'Heatmap'));
    this.heatButton.onclick = actions.toggleHeatmap;
    this.edgeButton = el('button', 'btn tool');
    this.edgeButton.append(el('span', 'tool-key', 'B'), el('span', 'tool-label', 'Pan bords'));
    this.edgeButton.title = "Déplacer la caméra quand la souris touche le bord de l'écran";
    this.edgeButton.onclick = actions.toggleEdgePan;
    bar.append(this.heatButton, this.edgeButton);

    this.info = el('div', 'hud-info panel');
    this.legend = el('div', 'hud-legend panel');
    this.legend.append(el('div', 'legend-title', 'Température'));
    const ramp = el('div', 'legend-ramp');
    const [t0, tN] = [HEAT_STOPS[0][0], HEAT_STOPS[HEAT_STOPS.length - 1][0]];
    ramp.style.background = `linear-gradient(to right, ${HEAT_STOPS.map(
      ([t, r, g, b]) => `rgb(${r},${g},${b}) ${((t - t0) / (tN - t0)) * 100}%`,
    ).join(', ')})`;
    const ticks = el('div', 'legend-ticks');
    for (const [t] of HEAT_STOPS) {
      const tick = el('span', undefined, `${t}°`);
      tick.style.left = `${((t - t0) / (tN - t0)) * 100}%`;
      ticks.append(tick);
    }
    this.legend.append(ramp, ticks);

    const help = el('div', 'hud-help panel');
    help.innerHTML =
      '<b>WASD</b> déplacer · <b>molette</b> zoom · <b>Q/E</b> pivoter<br>' +
      '<b>clic</b> poser (glisser pour enchaîner) · <b>clic droit/Échap</b> annuler';

    this.toasts = el('div', 'toasts');
    root.append(top, bar, this.info, this.legend, help, this.toasts);
  }

  update(s: GameState, ui: { tool: Tool; heatmap: boolean; edgePan: boolean; hover: { x: number; y: number } | null }): void {
    const p = s.power;
    const t = tempStats(s);
    const minutes = Math.floor(s.time / 60);
    this.stat.money.textContent = money(s.money);
    this.stat.time.textContent = `${minutes}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`;
    this.stat.power.textContent = `${p.loadKW} / ${p.capacityKW} kW` + (p.shedCount ? ` · ${p.shedCount} délesté${p.shedCount > 1 ? 's' : ''}` : '');
    this.stat.power.classList.toggle('warn', p.shedCount > 0);
    this.stat.compute.textContent = `${computeCU(s)} CU/s`;
    this.stat.temp.textContent = `max ${t.max.toFixed(1)}° · moy ${t.avg.toFixed(1)}°`;
    this.stat.temp.classList.toggle('warn', t.max >= 35);
    this.stat.temp.classList.toggle('danger', t.max >= 50);

    for (const [tool, b] of this.toolButtons) {
      b.classList.toggle('active', tool === ui.tool);
      b.disabled = tool !== 'demolish' && tool !== null && s.money < BUILD_COST[tool];
    }
    for (const [sp, b] of this.speedButtons) b.classList.toggle('active', sp === s.speed);
    this.heatButton.classList.toggle('active', ui.heatmap);
    this.edgeButton.classList.toggle('active', ui.edgePan);
    this.legend.style.display = ui.heatmap ? '' : 'none';

    this.info.style.display = ui.hover ? '' : 'none';
    if (ui.hover) {
      const { x, y } = ui.hover;
      const b = buildingAt(s, x, y);
      const state = !b ? '' : b.kind === 'pdu' ? ' · en service' : b.powered ? ' · alimenté' : ' · <span class="danger">délesté</span>';
      this.info.innerHTML =
        `Case ${x},${y} · <b>${s.temp[idx(s, x, y)].toFixed(1)} °C</b>` + (b ? `<br>${LABEL[b.kind]}${state}` : '');
    }

    for (const e of s.events) this.toast(e.message);
    s.events.length = 0;
  }

  private toast(message: string): void {
    // Glisser sur des cases invalides ne doit pas inonder l'écran.
    const now = performance.now();
    if (now - (this.recentToasts.get(message) ?? 0) < 1200) return;
    this.recentToasts.set(message, now);
    const t = el('div', 'toast', message);
    this.toasts.append(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2300);
  }
}
