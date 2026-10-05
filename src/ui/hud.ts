import { BUILD_COST, BUILD_TIME, CDU, CRAC, DEMOLISH_REFUND, GENERATOR, GPU, PDU, RACKS_PER_CRAC, TECH, UPS } from '../sim/balance';
import type { Cell, Gen, Specialty } from '../sim/entities';
import { availableResearch, modifiers, unlockedBy } from '../sim/progression';
import { buildingAt, idx, notify, type GameState, type Speed } from '../sim/state';
import type { OverlayMode } from '../render/overlay-colors';
import { tempCss } from './color';
import { AlertFeed } from './components/alert-feed';
import { BUILD_FAMILIES, BuildBar, TOOL_INFO, toolAvailable, toolCost, type FamilyId } from './components/build-bar';
import { toolBuild, type Tool } from '../input/build';
import { HELP_CHAR, matches } from '../input/keymap';
import { ContractsPanel } from './components/contracts-panel';
import { CursorFlash } from './components/cursor-flash';
import { Dashboard, type DashboardTab } from './components/dashboard';
import { OverlayLegend } from './components/overlay-legend';
import { TeamPanel } from './components/team-panel';
import { TipCard } from './components/tip-card';
import { HelpOverlay } from './components/help-overlay';
import { Inspector } from './components/inspector';
import { Minimap, type MinimapCamera } from './components/minimap';
import { PauseMenu } from './components/pause-menu';
import { SaveSlots, type SaveSlotsActions } from './components/save-slots';
import { Tutorial } from './tutorial/tutorial';
import type { Command } from '../sim/commands';
import type { SettingsStore } from '../settings';
import { ResourceBar } from './components/resource-bar';
import { DefeatScreen, TierScreen, TitleScreen, VictoryScreen, type NewGameKind } from './components/screens';
import { ResearchPanel } from './components/research-panel';
import { SelectionPanel } from './components/selection-panel';
import { buildingName } from './catalog';
import { Tooltip } from './components/tooltip';
import { el, icon, setHidden } from './dom';
import { celsius, money, moneyRate, percent, seconds, signedMoney } from './format';
import { GameHistory, LedgerHistory, TemperatureHistory } from './metrics';
import type { ThumbnailKey } from '../render/thumbnails';

export interface HudActions {
  setTool: (tool: Tool) => void;
  /** Barre de construction : outil en main et sélection exacte (sans bascule). */
  currentTool: () => Tool;
  selectTool: (tool: Tool) => void;
  setSpeed: (speed: Speed) => void;
  setOverlay: (mode: OverlayMode | null) => void;
  toggleEdgePan: () => void;
  hire: () => void;
  /** Sélectionne ces techniciens ; `focus` centre la caméra sur le premier (panneau Équipe). */
  selectTechs: (ids: number[], focus: boolean) => void;
  acceptJob: (id: number) => void;
  rejectJob: (id: number) => void;
  /** Lance une nouvelle partie : carrière, partie rapide ou tutoriel. */
  newGame: (kind: NewGameKind) => void;
  /** Carrière : part du calcul pour la R&D, nœud à étudier, réparations automatiques. */
  setResearchShare: (share: number) => void;
  startResearch: (id: string | null) => void;
  setAutoRepair: (on: boolean) => void;
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
  /** Carrière : pivote un rack d'un quart de tour. */
  rotateBuilding: (id: number) => void;
  /** Carrière : modernise un rack, confié au technicien le plus proche. */
  upgradeBuilding: (id: number) => void;
  /** Carrière : entretien d'un rack, confié au technicien le plus proche. */
  maintainBuilding: (id: number) => void;
  /** Carrière : embauche d'un spécialiste ; réglage de la maintenance planifiée. */
  hireSpecialist: (specialty: Specialty) => void;
  setAutoMaintain: (on: boolean) => void;
}

/** État d'interface (hors simulation) transmis à chaque image. */
export interface HudView {
  tool: Tool;
  /** Calque affiché au sol, ou null. */
  overlay: OverlayMode | null;
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
  const dot = el('span', 'temp-dot');
  dot.style.background = tempCss(t);
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
  private readonly legend = new OverlayLegend();
  private readonly dashboard = new Dashboard();
  private readonly team: TeamPanel;
  private readonly research: ResearchPanel;
  private readonly tier: TierScreen;
  private tierOpen = false;
  private readonly gameHistory = new GameHistory();
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
  private readonly tips: TipCard;
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
    this.resources = new ResourceBar(actions.setSpeed, () => this.openPause(), {
      dashboard: (tab) => this.togglePanel('dashboard', tab),
      team: () => this.togglePanel('team'),
    });
    this.team = new TeamPanel({
      select: actions.selectTechs,
      hire: actions.hire,
      hireSpecialist: actions.hireSpecialist,
      setAutoRepair: actions.setAutoRepair,
      setAutoMaintain: actions.setAutoMaintain,
    });
    this.research = new ResearchPanel({ setShare: actions.setResearchShare, start: actions.startResearch });
    this.tier = new TierScreen(() => {
      this.tierOpen = false;
      actions.resume();
    });
    this.pause = new PauseMenu(settings, {
      resume: () => this.closePause(),
      showHelp: () => this.help.toggle(),
      reportBug: actions.reportBug,
      mainMenu: () => {
        this.pause.close();
        actions.showTitle();
      },
    });
    this.build = new BuildBar({ ...actions, toggleHelp: () => this.help.toggle(), toggleResearch: () => this.togglePanel('research') });
    this.contracts = new ContractsPanel(actions);
    this.slots = new SaveSlots(actions.saves);
    this.title = new TitleScreen(actions.newGame, () => this.help.toggle(), actions.continueGame, () => this.slots.open('load'));
    // « Nouvelle partie » depuis une fin de partie : même mode que la partie terminée.
    const again = () => actions.newGame(this.state?.mode === 'career' ? 'career' : 'quick');
    this.tutorial = new Tutorial({
      enqueue: actions.enqueue,
      ping: actions.pingCell,
      onFinish: () => this.state && notify(this.state, 'success', 'Tutoriel terminé : à vous de jouer !'),
    });
    this.tips = new TipCard(settings);
    const pauseItem = (name: 'save' | 'load', label: string) => {
      const b = el('button', 'btn menu-item', icon(name, 16), el('span', undefined, label));
      b.onclick = () => this.slots.open(name);
      return b;
    };
    this.pause.addItems(pauseItem('save', 'Sauvegarder'), pauseItem('load', 'Charger'));
    this.victory = new VictoryScreen(() => {
      this.victoryOpen = false;
      actions.resume();
    }, again);
    this.defeat = new DefeatScreen(again, actions.showTitle);
    this.alerts = new AlertFeed(actions.focusCell);
    this.minimap = new Minimap(world.w, world.h, world.camera);
    this.inspector = new Inspector({
      sendTechnician: actions.sendTechnician,
      demolish: actions.demolishAt,
      focus: actions.focusCell,
      close: actions.closeInspector,
      rotate: actions.rotateBuilding,
      upgrade: actions.upgradeBuilding,
      maintain: actions.maintainBuilding,
    });
    this.overlay = region('overlay', this.title.root, this.tier.root, this.victory.root, this.defeat.root);
    this.overlay.classList.add('interactive');
    this.bindBuildTips();
    this.bindBalanceTip();

    root.append(
      region('top', this.resources.root, this.tutorial.root, this.tips.root),
      region('top-left', this.minimap.root, this.legend.root, this.alerts.root),
      region('right', this.contracts.root),
      region('bottom', this.build.root),
      region('bottom-left', this.inspector.root, this.selection.root),
      this.flash.root,
      this.overlay,
      this.dashboard.root,
      this.team.root,
      this.research.root,
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

  /** Touche d'une famille de la barre (R, C, P, X) : variante suivante, puis aucun outil. */
  cycleBuild(id: FamilyId): void {
    this.build.cycle(id);
  }

  /** Ouvre le menu pause et fige la partie (elle reprendra à sa vitesse d'avant). */
  openPause(): void {
    if (this.phase !== 'playing' || this.pause.isOpen || this.victoryOpen || this.tierOpen || this.state?.outcome === 'lost') return;
    this.speedBeforePause = this.state?.speed ?? 1;
    this.actions.setSpeed(0);
    this.pause.open();
  }

  closePause(): void {
    if (!this.pause.isOpen) return;
    this.pause.close();
    if (this.speedBeforePause !== 0) this.actions.setSpeed(this.speedBeforePause);
  }

  /**
   * Ouvre ou ferme le tableau de bord (sur l'onglet demandé) ou le panneau Équipe ; un seul
   * des deux à la fois. Un clic sur un autre onglet que celui affiché change d'onglet.
   */
  togglePanel(which: 'dashboard' | 'team' | 'research', tab?: DashboardTab): void {
    if (this.phase !== 'playing') return;
    if (which === 'research' && !this.state?.rules.progression) return;
    for (const [name, panel] of [['team', this.team], ['research', this.research], ['dashboard', this.dashboard]] as const) {
      if (name !== which) panel.close();
    }
    if (which === 'team') this.team.toggle();
    else if (which === 'research') this.research.toggle();
    else if (this.dashboard.isOpen && (!tab || tab === this.dashboard.currentTab)) this.dashboard.close();
    else this.dashboard.open(tab);
  }

  private get panelOpen(): boolean {
    return this.dashboard.isOpen || this.team.isOpen || this.research.isOpen;
  }

  /** Écran titre (salle de démonstration, HUD masqué) ou partie en cours. */
  setPhase(phase: 'title' | 'playing'): void {
    this.phase = phase;
    this.root.classList.toggle('phase-title', phase === 'title');
    this.slots.close();
    this.pause.close();
    this.dashboard.close();
    this.team.close();
    this.research.close();
    this.tips.hide();
    if (phase === 'title') this.title.setSaves(this.actions.saves.list().length > 0);
  }

  /**
   * Touches propres au HUD ; renvoie vrai si la touche a été consommée. Pendant l'écran
   * titre ou une fenêtre de fin, les raccourcis de jeu sont bloqués.
   */
  handleKey(e: KeyboardEvent): boolean {
    if (e.key === HELP_CHAR || matches('help', e)) {
      e.preventDefault();
      this.help.toggle();
      return true;
    }
    if (matches('cancel', e) && this.help.isOpen) {
      this.help.close();
      return true;
    }
    if (this.slots.isOpen) {
      if (matches('cancel', e)) this.slots.close();
      return true;
    }
    if (this.pause.isOpen) {
      if (matches('cancel', e)) this.closePause();
      return true;
    }
    if (this.phase === 'title') {
      if (matches('confirm', e)) this.title.primary();
      return true;
    }
    if (this.tierOpen) {
      if (matches('confirm', e) || matches('cancel', e)) this.tier.root.querySelector<HTMLButtonElement>('.btn-primary')?.click();
      return true;
    }
    if (this.victoryOpen || this.state?.outcome === 'lost') return true;
    const panelKey = matches('dashboard', e) ? 'dashboard' : matches('team', e) ? 'team' : matches('research', e) ? 'research' : null;
    if (panelKey) {
      e.preventDefault();
      this.togglePanel(panelKey);
      return true;
    }
    if (this.panelOpen) {
      if (matches('cancel', e)) {
        this.dashboard.close();
        this.team.close();
        this.research.close();
        return true;
      }
      // Fenêtre ouverte : seules la pause et la vitesse passent au jeu.
      return !(['pause', 'speed1', 'speed2', 'speed4'] as const).some((action) => matches(action, e));
    }
    return false;
  }

  /** Vide les cartes et l'historique, après un redémarrage. */
  reset(): void {
    this.contracts.reset();
    this.alerts.clear();
    this.gameHistory.clear();
    this.team.reset();
    this.tips.hide();
    this.victorySeen = false;
    this.victoryOpen = false;
    this.tierOpen = false;
  }

  /** Remplace l'icône d'une carte de construction par la vignette du vrai modèle. */
  setThumbnail(key: ThumbnailKey, url: string): void {
    this.build.setThumbnail(key, url);
    if (key !== 'technician') this.inspector.setThumbnail(key, url);
  }

  update(s: GameState, view: HudView, now = performance.now()): void {
    this.state = s;
    this.history.record(s.time, s.economy.ledger);
    this.temps.record(s.time, s.temp);
    this.gameHistory.record(s);
    const balance = this.history.balance();
    this.resources.update(s, balance);
    this.minimap.update(s, view.overlay === 'heat', view.selected, now);
    this.build.update(s, {
      tool: view.tool,
      overlay: view.overlay,
      edgePan: view.edgePan,
      helpOpen: this.help.isOpen,
      research: s.rules.progression ? { open: this.research.isOpen, active: s.research.current !== null || availableResearch(s).length === 0 } : null,
    });
    this.dashboard.update(s, this.gameHistory, balance, now);
    this.team.update(s);
    this.research.update(s);
    // Passage de palier : pause et fenêtre des nouveautés (pas pendant l'écran titre).
    if (this.phase === 'playing' && s.events.some((e) => e.code === 'tierUp')) {
      this.tier.show(s.career.tier);
      this.tierOpen = true;
      this.actions.setSpeed(0);
    }
    this.contracts.update(s);
    this.selection.update(s, view.selected);
    const inspected = view.inspected === null ? null : (s.buildings.find((b) => b.id === view.inspected) ?? null);
    this.inspector.update(s, inspected, this.temps);
    if (this.phase === 'playing') {
      this.tutorial.update({ s, selected: view.selected, inspected: view.inspected, heatmap: view.overlay === 'heat' }, now);
    }
    this.legend.update(view.overlay, s);
    // Première victoire de la partie : pause et fenêtre de choix.
    if (this.phase === 'playing' && s.outcome === 'won' && !this.victorySeen) {
      this.victorySeen = true;
      this.victoryOpen = true;
      this.actions.setSpeed(0);
    }
    const lost = this.phase === 'playing' && s.outcome === 'lost';
    // Conseils de carrière : ils attendent la fin des fenêtres bloquantes.
    this.tips.update(s, now, this.phase === 'playing' && !this.tierOpen && !this.victoryOpen && !this.pause.isOpen && !lost);
    setHidden(this.title.root, this.phase !== 'title');
    setHidden(this.tier.root, !this.tierOpen || this.victoryOpen || lost);
    setHidden(this.victory.root, !this.victoryOpen || lost);
    setHidden(this.defeat.root, !lost);
    if (this.victoryOpen) this.victory.update(s);
    if (lost) this.defeat.update(s);
    setHidden(this.overlay, this.phase !== 'title' && !this.victoryOpen && !this.tierOpen && !lost);
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
        hint = `Technicien sélectionné + clic droit pour réparer (${money(modifiers(s).repairCost)}, ${modifiers(s).repairSeconds} s)`;
      } else if (b.status === 'repairing') {
        chip = el('span', 'chip warn', `réparation ${seconds(b.workLeft)}`);
      } else if (b.kind === 'pdu' || b.powered) {
        chip = el('span', 'chip ok', b.kind === 'pdu' ? 'en service' : 'alimenté');
      } else {
        chip = el('span', 'chip danger', 'délesté');
        hint = 'Pas assez de capacité électrique : ajoutez un PDU';
      }
      return tip(el('span', undefined, `${buildingName(b.kind, b.gen)} ${x},${y} `, chip), rows, hint);
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
        'Le bilan exclut les investissements (construction, embauche). Clic : tableau de bord.',
      );
    });
  }

  /** Infobulles riches des cartes de construction : coût, effets, durée de chantier. */
  private bindBuildTips(): void {
    const rackTip = (gen: Gen) => () => {
      const spec = GPU[gen];
      const hint =
        gen === 3
          ? 'Trop dense pour l’air seul : posez-le à portée d’un CDU.'
          : this.state?.rules.aisles
            ? 'F : pivoter. L’avant aspire l’air froid, l’arrière souffle la chaleur.'
            : 'Laissez une case libre devant pour l’entretien.';
      return tip(`${buildingName('rack', gen)} · ${money(spec.cost)}`, [
        ['Calcul', `${spec.computeCU} CU/s`],
        ['Consommation', `${spec.powerKW} kW`],
        ['Chaleur dégagée', `${spec.heatKW} kW`],
        ['Chantier', `${BUILD_TIME.rack} s`],
      ], hint);
    };
    const tips: Record<Exclude<Tool, null>, () => Node> = {
      rack: rackTip(1),
      rack2: rackTip(2),
      rack3: rackTip(3),
      crac: () =>
        tip(`${buildingName('crac')} · ${money(BUILD_COST.crac)}`, [
          ['Refroidissement', `${Math.round(this.state ? modifiers(this.state).cracCoolingKW : CRAC.coolingKW)} kW`],
          ['Portée', `${CRAC.radius} cases`],
          ['Consommation', `${CRAC.powerKW} kW`],
          ['Chantier', `${BUILD_TIME.crac} s`],
        ], `Un CRAC suffit pour environ ${RACKS_PER_CRAC} racks.`),
      pdu: () =>
        tip(`${buildingName('pdu')} · ${money(BUILD_COST.pdu)}`, [
          ['Capacité', `+${Math.round(this.state ? modifiers(this.state).pduCapacityKW : PDU.capacityKW)} kW`],
          ['Chantier', `${BUILD_TIME.pdu} s`],
        ], 'Sans capacité suffisante, les racks les plus récents sont délestés.'),
      ups: () =>
        tip(`${buildingName('ups')} · ${money(BUILD_COST.ups)}`, [
          ['Batterie', `${Math.round(this.state ? modifiers(this.state).upsStoreKJ : UPS.storeKJ)} kJ`],
          ['Puissance', `${UPS.powerKW} kW`],
          ['Recharge', `${UPS.rechargeKW} kW sur le réseau`],
          ['Chantier', `${BUILD_TIME.ups} s`],
        ], 'Prend le relais dès la première seconde d’une coupure, environ une minute.'),
      generator: () =>
        tip(`${buildingName('generator')} · ${money(BUILD_COST.generator)}`, [
          ['Puissance', `${GENERATOR.powerKW} kW`],
          ['Démarrage', `${this.state ? modifiers(this.state).generatorStartS : GENERATOR.startS} s`],
          ['Carburant', `${GENERATOR.fuelPerKWs} $ par kW·s`],
          ['Chantier', `${BUILD_TIME.generator} s`],
        ], 'Tient toute la coupure ; un onduleur couvre son démarrage.'),
      cdu: () =>
        tip(`${buildingName('cdu')} · ${money(BUILD_COST.cdu)}`, [
          ['Capte', `${CDU.captured * 100} % de la chaleur des racks`],
          ['Portée', `${CDU.radius} cases`],
          ['Capacité', `${CDU.capacityKW} kW`],
          ['Consommation', `${CDU.powerKW} kW (pompes)`],
          ['Chantier', `${BUILD_TIME.cdu} s`],
        ], 'La chaleur captée part dehors : indispensable aux racks les plus denses.'),
      demolish: () =>
        tip('Démolir', [['Remboursement', `${DEMOLISH_REFUND * 100} %`]], 'Un chantier pas encore commencé est remboursé en entier.'),
    };
    for (const [id, card] of this.build.familyCards) {
      this.tooltip.bind(card, () => {
        const node = tips[this.build.shownTool(id)]() as HTMLElement;
        const family = BUILD_FAMILIES.find((f) => f.id === id)!;
        const s = this.state;
        if (family.variants.length > 1 && s) {
          // Les variantes de la famille, et ce qu'il faut pour débloquer les autres.
          const rows = family.variants.map((v) => {
            const tool = v as Exclude<typeof v, 'demolish'>;
            const { kind, gen } = toolBuild(tool);
            const open = toolAvailable(s, v);
            const need = gen > 1 ? `GPU génération ${gen}` : unlockedBy(kind)?.name;
            return el(
              'div',
              `tip-variant ${open ? '' : 'locked'}`,
              icon(open ? TOOL_INFO[v].icon : 'lock', 12),
              el('span', undefined, TOOL_INFO[v].label),
              el('span', 'mono', open ? money(toolCost(tool)) : s.rules.progression ? `recherche : ${need}` : 'carrière'),
            );
          });
          node.append(el('div', 'tip-variants', el('div', 'tip-hint', `${family.key} : variante suivante`), ...rows));
        }
        return node;
      });
    }
    this.tooltip.bind(this.build.hireCard, () =>
      tip(`Technicien · ${money(TECH.hireCost)}`, [
        ['Salaire', `${TECH.salaryPerS} $/s`],
        ['Équipe', `${this.state?.techs.length ?? 0} / ${TECH.max}`],
      ], 'Construit les chantiers et répare les pannes.'),
    );
  }
}
