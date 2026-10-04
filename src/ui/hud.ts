import { BUILD_COST, BUILD_TIME, CRAC, DEMOLISH_REFUND, PDU, RACK, REPAIR, TECH } from '../sim/balance';
import type { Cell } from '../sim/entities';
import { buildingAt, idx, type GameState, type Speed } from '../sim/state';
import type { Tool } from '../input/build';
import { tempToRgb } from '../render/overlays';
import { BuildBar } from './components/build-bar';
import { ContractsPanel } from './components/contracts-panel';
import { createHeatLegend } from './components/heat-legend';
import { HelpOverlay } from './components/help-overlay';
import { ResourceBar } from './components/resource-bar';
import { DefeatScreen } from './components/screens';
import { BUILDING_LABEL, SelectionPanel } from './components/selection-panel';
import { Toasts } from './components/toasts';
import { Tooltip } from './components/tooltip';
import { el, setHidden } from './dom';
import { money, percent, seconds } from './format';

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

/** État d'interface (hors simulation) transmis à chaque image. */
export interface HudView {
  tool: Tool;
  heatmap: boolean;
  edgePan: boolean;
  hover: Cell | null;
  selected: ReadonlySet<number>;
}

function region(name: string, ...children: HTMLElement[]): HTMLElement {
  return el('div', `region region-${name}`, ...children);
}

/** Contenu d'infobulle : un titre, des lignes « libellé / valeur », une astuce. */
function tip(title: Node | string, rows: [string, Node | string][], hint?: string): HTMLElement {
  return el(
    'div',
    undefined,
    el('div', 'tip-title', title),
    ...rows.map(([label, value]) => el('div', 'tip-row', el('span', undefined, label), el('span', 'mono', value))),
    hint ? el('div', 'tip-hint', hint) : null,
  );
}

function tempValue(t: number): HTMLElement {
  const [r, g, b] = tempToRgb(t);
  const dot = el('span', 'temp-dot');
  dot.style.background = `rgb(${r},${g},${b})`;
  return el('span', undefined, dot, ` ${t.toFixed(1)} °C`);
}

/**
 * Orchestrateur du HUD : crée les composants dans leurs zones et leur transmet l'état à
 * chaque image. Chaque composant ne touche au DOM que si une valeur a changé.
 */
export class Hud {
  private readonly resources: ResourceBar;
  private readonly build: BuildBar;
  private readonly contracts: ContractsPanel;
  private readonly selection = new SelectionPanel();
  private readonly legend = createHeatLegend();
  private readonly help = new HelpOverlay();
  private readonly toasts = new Toasts();
  private readonly tooltip = new Tooltip();
  private readonly defeat: DefeatScreen;
  private readonly overlay: HTMLElement;
  private state: GameState | null = null;

  constructor(root: HTMLElement, actions: HudActions) {
    this.resources = new ResourceBar(actions.setSpeed);
    this.build = new BuildBar({ ...actions, toggleHelp: () => this.help.toggle() });
    this.contracts = new ContractsPanel(actions);
    this.defeat = new DefeatScreen(actions.restart);
    this.overlay = region('overlay', this.defeat.root);
    this.bindBuildTips();

    root.append(
      region('top', this.resources.root),
      region('top-left', this.legend),
      region('right', this.contracts.root),
      region('bottom', this.build.root),
      region('bottom-left', this.selection.root),
      this.toasts.root,
      this.overlay,
      this.help.root,
      this.tooltip.root,
    );
  }

  /** Touches propres au HUD ; renvoie vrai si la touche a été consommée. */
  handleKey(e: KeyboardEvent): boolean {
    if (e.key === '?' || e.code === 'F1') {
      e.preventDefault();
      this.help.toggle();
      return true;
    }
    if (e.code === 'Escape' && this.help.isOpen) {
      this.help.close();
      return true;
    }
    return false;
  }

  /** Vide les cartes et messages, après un redémarrage. */
  reset(): void {
    this.contracts.reset();
    this.toasts.clear();
  }

  update(s: GameState, view: HudView): void {
    this.state = s;
    this.resources.update(s);
    this.build.update(s, { tool: view.tool, heatmap: view.heatmap, edgePan: view.edgePan, helpOpen: this.help.isOpen });
    this.contracts.update(s);
    this.selection.update(s, view.selected);
    setHidden(this.legend, !view.heatmap);
    this.defeat.update(s);
    setHidden(this.overlay, s.outcome !== 'lost');
    this.updateWorldTip(s, view.hover);
    for (const e of s.events) this.toasts.show(e);
    s.events.length = 0;
  }

  private updateWorldTip(s: GameState, cell: Cell | null): void {
    if (!cell) {
      this.tooltip.setWorld('', null);
      return;
    }
    const { x, y } = cell;
    const b = buildingAt(s, x, y);
    const t = s.temp[idx(s, x, y)];
    const key = `${x},${y}|${b?.id}|${b?.status}|${b?.powered}|${t.toFixed(1)}|${b ? Math.ceil(b.workLeft) : ''}`;
    this.tooltip.setWorld(key, () => {
      const rows: [string, Node | string][] = [['Température', tempValue(t)]];
      if (!b) return tip(`Case ${x},${y}`, rows);
      let chip: HTMLElement;
      let hint: string | undefined;
      if (b.status === 'construction') {
        chip = el('span', 'chip warn', 'chantier');
        rows.push(['Avancement', percent(1 - b.workLeft / BUILD_TIME[b.kind])]);
        hint = 'Technicien sélectionné + clic droit pour construire';
      } else if (b.status === 'failed') {
        chip = el('span', 'chip danger', 'en panne');
        hint = `Technicien sélectionné + clic droit pour réparer (${money(REPAIR.cost)}, ${REPAIR.seconds} s)`;
      } else if (b.status === 'repairing') {
        chip = el('span', 'chip warn', `réparation ${seconds(b.workLeft)}`);
      } else if (b.kind === 'pdu' || b.powered) {
        chip = el('span', 'chip ok', b.kind === 'pdu' ? 'en service' : 'alimenté');
      } else {
        chip = el('span', 'chip danger', 'délesté');
        hint = 'Pas assez de capacité électrique : ajoutez un PDU';
      }
      return tip(el('span', undefined, `${BUILDING_LABEL[b.kind]} ${x},${y} `, chip), rows, hint);
    });
  }

  /** Infobulles riches des cartes de construction : coût, effets, durée de chantier. */
  private bindBuildTips(): void {
    const tips: Record<Exclude<Tool, null>, () => Node> = {
      rack: () =>
        tip(`Rack GPU · ${money(BUILD_COST.rack)}`, [
          ['Calcul', `${RACK.computeCU} CU/s`],
          ['Consommation', `${RACK.powerKW} kW`],
          ['Chaleur dégagée', `${RACK.heatKW} kW`],
          ['Chantier', `${BUILD_TIME.rack} s`],
        ], 'Laissez une case libre devant pour l’entretien.'),
      crac: () =>
        tip(`CRAC · ${money(BUILD_COST.crac)}`, [
          ['Refroidissement', `${CRAC.coolingKW} kW`],
          ['Portée', `${CRAC.radius} cases`],
          ['Consommation', `${CRAC.powerKW} kW`],
          ['Chantier', `${BUILD_TIME.crac} s`],
        ], 'Un CRAC suffit pour environ 3 racks.'),
      pdu: () =>
        tip(`PDU · ${money(BUILD_COST.pdu)}`, [
          ['Capacité', `+${PDU.capacityKW} kW`],
          ['Chantier', `${BUILD_TIME.pdu} s`],
        ], 'Sans capacité suffisante, les racks les plus récents sont délestés.'),
      demolish: () =>
        tip('Démolir', [['Remboursement', `${DEMOLISH_REFUND * 100} %`]], 'Un chantier pas encore commencé est remboursé en entier.'),
    };
    for (const [tool, card] of this.build.toolCards) this.tooltip.bind(card, tips[tool]);
    this.tooltip.bind(this.build.hireCard, () =>
      tip(`Technicien · ${money(TECH.hireCost)}`, [
        ['Salaire', `${TECH.salaryPerS} $/s`],
        ['Équipe', `${this.state?.techs.length ?? 0} / ${TECH.max}`],
      ], 'Construit les chantiers et répare les pannes.'),
    );
  }
}
