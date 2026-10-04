import { BUILD_COST, BUILD_TIME, CRAC, DEMOLISH_REFUND, PDU, RACK, REPAIR, TECH } from '../sim/balance';
import type { Cell } from '../sim/entities';
import { buildingAt, idx, notify, type GameState, type Speed } from '../sim/state';
import type { Tool } from '../input/build';
import { tempToRgb } from '../render/overlays';
import { AlertFeed } from './components/alert-feed';
import { BuildBar } from './components/build-bar';
import { ContractsPanel } from './components/contracts-panel';
import { createHeatLegend } from './components/heat-legend';
import { CursorFlash } from './components/cursor-flash';
import { HelpOverlay } from './components/help-overlay';
import { Inspector } from './components/inspector';
import { Minimap, type MinimapCamera } from './components/minimap';
import { PauseMenu } from './components/pause-menu';
import { SaveSlots, type SaveSlotsActions } from './components/save-slots';
import { Tutorial } from './tutorial/tutorial';
import type { Command } from '../sim/commands';
import type { SettingsStore } from '../settings';
import { ResourceBar } from './components/resource-bar';
import { DefeatScreen, TitleScreen, VictoryScreen } from './components/screens';
import { BUILDING_LABEL, SelectionPanel } from './components/selection-panel';
import { Tooltip } from './components/tooltip';
import type { BuildingKind } from '../sim/entities';
import { el, icon, setHidden } from './dom';
import { celsius, money, moneyRate, percent, seconds, signedMoney } from './format';
import { LedgerHistory, TemperatureHistory } from './metrics';

export interface HudActions {
  setTool: (tool: Tool) => void;
  setSpeed: (speed: Speed) => void;
  toggleHeatmap: () => void;
  toggleEdgePan: () => void;
  hire: () => void;
  acceptJob: (id: number) => void;
  rejectJob: (id: number) => void;
  /** Lance une nouvelle partie (guidée depuis l'écran titre si demandé). */
  newGame: (guided?: boolean) => void;
  /** Le tutoriel passe ses commandes (panne d'exercice) et montre des cases. */
  enqueue: (c: Command) => void;
  pingCell: (cell: Cell) => void;
  /** Revient à l'écran titre. */
  showTitle: () => void;
  /** Copie un rapport de bug ; renvoie vrai si la copie a réussi. */
  reportBug: () => Promise<boolean>;
  /** Charge la sauvegarde la plus récente (écran titre). */
  continueGame: () => void;
  saves: SaveSlotsActions;
  /** Reprend la partie à sa vitesse précédente (après la victoire). */
  resume: () => void;
  /** Recentre la caméra sur une case (alerte cliquée). */
  focusCell: (cell: Cell) => void;
  /** Envoie le technicien le plus proche construire ou réparer cet équipement. */
  sendTechnician: (buildingId: number) => void;
  demolishAt: (cell: Cell) => void;
  closeInspector: () => void;
}

/** État d'interface (hors simulation) transmis à chaque image. */
export interface HudView {
  tool: Tool;
  heatmap: boolean;
  edgePan: boolean;
  hover: Cell | null;
  selected: ReadonlySet<number>;
  /** Équipement inspecté (id), ou null. */
  inspected: number | null;
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
  return el('span', undefined, dot, ` ${celsius(t)}`);
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
  private readonly alerts: AlertFeed;
  private readonly flash = new CursorFlash();
  private readonly minimap: Minimap;
  private readonly history = new LedgerHistory();
  private readonly temps = new TemperatureHistory();
  private readonly inspector: Inspector;
  private readonly tooltip = new Tooltip();
  private readonly title: TitleScreen;
  private readonly victory: VictoryScreen;
  private readonly defeat: DefeatScreen;
  private readonly overlay: HTMLElement;
  private readonly root: HTMLElement;
  private phase: 'title' | 'playing' = 'playing';
  /** La fenêtre de victoire ne s'ouvre qu'une fois par partie. */
  private victorySeen = false;
  private victoryOpen = false;
  private readonly actions: HudActions;
  readonly pause: PauseMenu;
  private readonly slots: SaveSlots;
  private readonly tutorial: Tutorial;
  /** Vitesse à rétablir en sortant du menu pause. */
  private speedBeforePause: Speed = 1;
  private state: GameState | null = null;

  constructor(
    root: HTMLElement,
    actions: HudActions,
    world: { w: number; h: number; camera: MinimapCamera },
    settings: SettingsStore,
  ) {
    this.root = root;
    this.actions = actions;
    this.resources = new ResourceBar(actions.setSpeed, () => this.openPause());
    this.pause = new PauseMenu(settings, {
      resume: () => this.closePause(),
      showHelp: () => this.help.toggle(),
      reportBug: actions.reportBug,
      mainMenu: () => {
        this.pause.close();
        actions.showTitle();
      },
    });
    this.build = new BuildBar({ ...actions, toggleHelp: () => this.help.toggle() });
    this.contracts = new ContractsPanel(actions);
    this.slots = new SaveSlots(actions.saves);
    this.title = new TitleScreen(
      () => actions.newGame(true),
      () => actions.newGame(false),
      () => this.help.toggle(),
      actions.continueGame,
      () => this.slots.open('load'),
    );
    this.tutorial = new Tutorial({
      enqueue: actions.enqueue,
      ping: actions.pingCell,
      onFinish: () => this.state && notify(this.state, 'success', 'Tutoriel terminé : à vous de jouer !'),
    });
    const pauseItem = (name: 'save' | 'load', label: string) => {
      const b = el('button', 'btn menu-item', icon(name, 16), el('span', undefined, label));
      b.onclick = () => this.slots.open(name);
      return b;
    };
    this.pause.addItems(pauseItem('save', 'Sauvegarder'), pauseItem('load', 'Charger'));
    this.victory = new VictoryScreen(() => {
      this.victoryOpen = false;
      actions.resume();
    }, actions.newGame);
    this.defeat = new DefeatScreen(actions.newGame, actions.showTitle);
    this.alerts = new AlertFeed(actions.focusCell);
    this.minimap = new Minimap(world.w, world.h, world.camera);
    this.inspector = new Inspector({
      sendTechnician: actions.sendTechnician,
      demolish: actions.demolishAt,
      focus: actions.focusCell,
      close: actions.closeInspector,
    });
    this.overlay = region('overlay', this.title.root, this.victory.root, this.defeat.root);
    this.overlay.classList.add('interactive');
    this.bindBuildTips();
    this.bindBalanceTip();

    root.append(
      region('top', this.resources.root, this.tutorial.root),
      region('top-left', this.minimap.root, this.legend, this.alerts.root),
      region('right', this.contracts.root),
      region('bottom', this.build.root),
      region('bottom-left', this.inspector.root, this.selection.root),
      this.flash.root,
      this.overlay,
      this.pause.root,
      this.slots.root,
      this.help.root,
      this.tooltip.root,
    );
  }

  startTutorial(s: GameState): void {
    this.tutorial.start(s);
  }

  stopTutorial(): void {
    this.tutorial.stop();
  }

  /** Ouvre le menu pause et fige la partie (elle reprendra à sa vitesse d'avant). */
  openPause(): void {
    if (this.phase !== 'playing' || this.pause.isOpen || this.victoryOpen || this.state?.outcome === 'lost') return;
    this.speedBeforePause = this.state?.speed ?? 1;
    this.actions.setSpeed(0);
    this.pause.open();
  }

  closePause(): void {
    if (!this.pause.isOpen) return;
    this.pause.close();
    if (this.speedBeforePause !== 0) this.actions.setSpeed(this.speedBeforePause);
  }

  /** Écran titre (salle de démonstration, HUD masqué) ou partie en cours. */
  setPhase(phase: 'title' | 'playing'): void {
    this.phase = phase;
    this.root.classList.toggle('phase-title', phase === 'title');
    this.slots.close();
    this.pause.close();
    if (phase === 'title') this.title.setSaves(this.actions.saves.list().length > 0);
  }

  /**
   * Touches propres au HUD ; renvoie vrai si la touche a été consommée. Pendant l'écran
   * titre ou une fenêtre de fin, les raccourcis de jeu sont bloqués.
   */
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
    if (this.slots.isOpen) {
      if (e.code === 'Escape') this.slots.close();
      return true;
    }
    if (this.pause.isOpen) {
      if (e.code === 'Escape') this.closePause();
      return true;
    }
    if (this.phase === 'title') {
      if (e.code === 'Enter') this.title.primary();
      return true;
    }
    return this.victoryOpen || this.state?.outcome === 'lost';
  }

  /** Vide les cartes et l'historique, après un redémarrage. */
  reset(): void {
    this.contracts.reset();
    this.alerts.clear();
    this.victorySeen = false;
    this.victoryOpen = false;
  }

  /** Remplace l'icône d'une carte de construction par la vignette du vrai modèle. */
  setThumbnail(key: BuildingKind | 'technician', url: string): void {
    this.build.setThumbnail(key, url);
    if (key !== 'technician') this.inspector.setThumbnail(key, url);
  }

  update(s: GameState, view: HudView, now = performance.now()): void {
    this.state = s;
    this.history.record(s.time, s.economy.ledger);
    this.temps.record(s.time, s.temp);
    this.resources.update(s, this.history.balance());
    this.minimap.update(s, view.heatmap, view.selected, now);
    this.build.update(s, { tool: view.tool, heatmap: view.heatmap, edgePan: view.edgePan, helpOpen: this.help.isOpen });
    this.contracts.update(s);
    this.selection.update(s, view.selected);
    const inspected = view.inspected === null ? null : (s.buildings.find((b) => b.id === view.inspected) ?? null);
    this.inspector.update(s, inspected, this.temps);
    if (this.phase === 'playing') {
      this.tutorial.update({ s, selected: view.selected, inspected: view.inspected, heatmap: view.heatmap }, now);
    }
    setHidden(this.legend, !view.heatmap);
    // Première victoire de la partie : pause et fenêtre de choix.
    if (this.phase === 'playing' && s.outcome === 'won' && !this.victorySeen) {
      this.victorySeen = true;
      this.victoryOpen = true;
      this.actions.setSpeed(0);
    }
    const lost = this.phase === 'playing' && s.outcome === 'lost';
    setHidden(this.title.root, this.phase !== 'title');
    setHidden(this.victory.root, !this.victoryOpen || lost);
    setHidden(this.defeat.root, !lost);
    if (this.victoryOpen) this.victory.update(s);
    if (lost) this.defeat.update(s);
    setHidden(this.overlay, this.phase !== 'title' && !this.victoryOpen && !lost);
    this.overlay.classList.toggle('dim', this.phase !== 'title');
    this.updateWorldTip(s, view.hover);
    // Les refus vont près du curseur ; le reste rejoint l'historique des alertes.
    for (const e of s.events) {
      if (e.code === 'refused') this.flash.show(e.message);
      else this.alerts.push(e);
    }
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

  /** Détail du bilan de la dernière minute, par poste, investissements à part. */
  private bindBalanceTip(): void {
    this.tooltip.bind(this.resources.moneyCard, () => {
      const b = this.history.balance();
      if (!b) return tip('Bilan d’exploitation', [], 'Disponible après quelques secondes de jeu.');
      const o = b.operating;
      return tip(
        `Bilan sur ${Math.round(b.seconds)} s : ${moneyRate(b.netPerSecond)}`,
        [
          ['Contrats livrés', signedMoney(b.revenue)],
          ['Électricité', signedMoney(-o.electricity)],
          ['Salaires', signedMoney(-o.salaries)],
          ['Réparations', signedMoney(-o.repairs)],
          ['Pénalités', signedMoney(-o.penalties)],
          ['Investissements', signedMoney(-b.investment)],
        ],
        'Le bilan exclut les investissements (construction, embauche).',
      );
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
