import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import { DT, MAX_TICKS_PER_FRAME } from './sim/balance';
import { processCommands, type Command } from './sim/commands';
import { step } from './sim/sim';
import { buildingAt, createInitialState, notify, type GameState, type Speed } from './sim/state';
import { SceneView } from './render/scene';
import { renderThumbnails, type ThumbnailKey } from './render/thumbnails';
import { BuildController, type Tool } from './input/build';
import { pickGroundCell, rayFromScreen } from './input/picking';
import { SelectionController } from './input/selection';
import { Hud } from './ui/hud';
import { createShowcaseState } from './ui/showcase';
import { applyTheme } from './ui/theme';
import { copyText, installCrashHandler, showFatal } from './ui/components/error-screen';
import { buildReport } from './report';
import { SettingsStore, safeStorage } from './settings';
import { SaveManager, deserialize, serialize, type SaveSlot } from './save';
import type { GameEvent } from './sim/state';

applyTheme();
const settings = new SettingsStore();
const saves = new SaveManager(safeStorage(), __APP_VERSION__);
/** Écran titre ou partie en cours : on ne sauvegarde que les vraies parties. */
let phase: 'title' | 'playing' = 'title';
const canSave = () => phase === 'playing' && state.outcome !== 'lost';

const state = createInitialState(Date.now() >>> 0);
const enqueue = (c: Command) => state.commands.push(c);
/** Derniers événements de la partie, pour les rapports de bug. */
const eventLog: GameEvent[] = [];
const report = (error?: unknown) =>
  buildReport(
    {
      state,
      settings: settings.value,
      events: eventLog,
      error,
      environment: { userAgent: navigator.userAgent, screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x` },
    },
    __APP_VERSION__,
  );
installCrashHandler({
  buildReport: report,
  // Sauvegarde de secours : la partie en cours survit à un plantage.
  onCrash: () => canSave() && saves.save('auto', state),
});

function webglAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
if (!webglAvailable()) {
  showFatal(
    'WebGL 2 indisponible',
    'Ce jeu a besoin de WebGL 2. Utilisez une version récente de Chrome, Firefox, Edge ou Safari, et vérifiez que l’accélération matérielle est activée.',
  );
  throw new Error('WebGL 2 indisponible');
}

const view = new SceneView(document.getElementById('app')!, state.w, state.h, settings.value);

const pickTarget = (clientX: number, clientY: number) => {
  const ray = rayFromScreen(view.rts.camera, view.domElement, clientX, clientY);
  const hit = view.pickBuilding(ray);
  const building = hit ? buildingAt(state, hit.x, hit.y) : undefined;
  return { building, cell: hit ?? pickGroundCell(ray, state.w, state.h) };
};

// La sélection écoute la souris avant la construction : un clic droit qui annule l'outil
// ne doit pas aussi devenir un ordre.
const selection = new SelectionController(view.domElement, {
  getState: () => state,
  isToolActive: () => build.tool !== null,
  techScreenPositions: () => view.techScreenPositions(),
  pickTarget,
  enqueue,
  ping: (cell, kind) => view.ping(cell, kind),
});
const build = new BuildController(
  view.scene,
  () => view.rts.camera,
  view.domElement,
  () => state,
  enqueue,
  (ray) => view.pickBuilding(ray),
  () => [...selection.selected],
);

let lastSpeed: Exclude<Speed, 0> = 1;
const setSpeed = (speed: Speed) => {
  if (speed !== 0) lastSpeed = speed as Exclude<Speed, 0>;
  enqueue({ type: 'setSpeed', speed });
};
const setTool = (tool: Tool) => build.setTool(build.tool === tool ? null : tool);
const toggleHeatmap = () => (view.heatmap.visible = !view.heatmap.visible);
const toggleEdgePan = () => settings.update({ edgePan: !settings.value.edgePan });
const hire = () => enqueue({ type: 'hire' });
const acceptJob = (id: number) => enqueue({ type: 'acceptJob', id });
const rejectJob = (id: number) => enqueue({ type: 'rejectJob', id });
/** Remplace l'état champ par champ : il est partagé par référence (contrôleurs, rendu). */
const loadState = (next: GameState) => {
  Object.assign(state, next);
  lastSpeed = 1;
  build.setTool(null);
  selection.clear();
  hud.reset();
};
let lastAutosave = 0;
const startPlaying = (next: GameState) => {
  loadState(next);
  lastAutosave = next.time;
  phase = 'playing';
  view.rts.settle();
  hud.setPhase('playing');
};
const newGame = () => startPlaying(createInitialState(Date.now() >>> 0));
/** Écran titre : salle de démonstration en pause, caméra en rotation lente. */
const showTitle = () => {
  phase = 'title';
  loadState(createShowcaseState());
  view.rts.autoOrbit = true;
  hud.setPhase('title');
};

/** Sauvegarde automatique : toutes les 60 s de jeu, à la mise en arrière-plan et à la fermeture. */
const autosave = () => {
  if (!canSave()) return;
  saves.save('auto', state);
  lastAutosave = state.time;
};
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && autosave());
window.addEventListener('pagehide', autosave);

const loadSlot = (slot: SaveSlot): string | null => {
  const result = saves.load(slot);
  if (!result.ok) return result.error;
  startPlaying(result.state);
  return null;
};
const saveSlot = (slot: SaveSlot): string | null => {
  if (!canSave()) return 'Rien à sauvegarder pour l’instant.';
  const error = saves.save(slot, state);
  if (!error) notify(state, 'success', `Partie sauvegardée (${slot === 'auto' ? 'automatique' : `emplacement ${slot}`})`);
  return error;
};
/** Export de la partie en fichier .json (à joindre à un rapport de bug). */
const exportGame = () => {
  const blob = new Blob([serialize(state, __APP_VERSION__)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `datacenter-ia-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
const importText = (text: string): string | null => {
  const result = deserialize(text);
  if (!result.ok) return result.error;
  startPlaying(result.state);
  return null;
};
const continueGame = () => {
  const slot = saves.latest();
  if (slot !== null) loadSlot(slot);
};
const resume = () => setSpeed(lastSpeed);

const focusCell = (cell: { x: number; y: number }) => {
  view.rts.focusOn(cell.x + 0.5, cell.y + 0.5);
  view.ping(cell, 'focus');
};

/** Le technicien le plus proche, de préférence libre, part construire ou réparer l'équipement. */
const sendTechnician = (id: number) => {
  const b = state.buildings.find((o) => o.id === id);
  if (!b) return;
  if (!state.techs.length) {
    notify(state, 'error', 'Aucun technicien : embauchez-en un (T)');
    return;
  }
  const idle = state.techs.filter((t) => t.tasks.length === 0);
  const pool = idle.length ? idle : state.techs;
  const dist = (t: { x: number; y: number }) => Math.abs(t.x - b.x) + Math.abs(t.y - b.y);
  const tech = pool.reduce((best, t) => (dist(t) < dist(best) ? t : best));
  const type = b.status === 'construction' ? 'build' : 'repair';
  // Un technicien occupé finit d'abord ce qu'il fait : l'ordre passe en file.
  enqueue({ type: 'order', techs: [tech.id], task: { type, target: id }, append: idle.length === 0 });
  view.ping(b, type);
};
const demolishAt = (cell: { x: number; y: number }) => enqueue({ type: 'demolish', ...cell });
const closeInspector = () => (selection.inspected = null);

const hud = new Hud(
  document.getElementById('hud')!,
  {
    setTool,
    setSpeed,
    toggleHeatmap,
    toggleEdgePan,
    hire,
    acceptJob,
    rejectJob,
    newGame,
    showTitle,
    resume,
    focusCell,
    sendTechnician,
    demolishAt,
    closeInspector,
    reportBug: () =>
      copyText(report()).then(
        () => true,
        () => false,
      ),
    continueGame,
    saves: { list: () => saves.list(), save: saveSlot, load: loadSlot, importText, exportGame },
  },
  { w: state.w, h: state.h, camera: { footprint: () => view.rts.footprint(), setTarget: (x, z) => view.rts.setTarget(x, z) } },
  settings,
);

/**
 * Taille d'interface effective et seuils de disposition. Le zoom choisi est plafonné à ce
 * que la fenêtre permet (le HUD est conçu pour au moins 1 000 × 680 px effectifs), puis les
 * seuils se calculent sur la largeur effective (fenêtre ÷ zoom).
 */
const applyLayout = () => {
  const scale = Math.max(0.9, Math.min(settings.value.uiScale, innerWidth / 1000, innerHeight / 680));
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  const width = innerWidth / scale;
  const root = document.getElementById('hud')!;
  for (const limit of [1520, 1320, 1100]) root.classList.toggle(`lt-${limit}`, width <= limit);
};
window.addEventListener('resize', applyLayout);

// Les options s'appliquent en direct (l'anticrénelage, lui, au prochain lancement).
settings.subscribe((s) => {
  view.applyGraphics(s);
  view.rts.edgePan = s.edgePan;
  applyLayout();
});
// Vignettes des vrais modèles 3D dans la barre de construction.
for (const [key, url] of Object.entries(renderThumbnails())) hud.setThumbnail(key as ThumbnailKey, url);

const TOOL_KEYS: Record<string, Tool> = { KeyR: 'rack', KeyC: 'crac', KeyP: 'pdu', KeyX: 'demolish' };
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (hud.handleKey(e)) return;
  if (e.code in TOOL_KEYS) setTool(TOOL_KEYS[e.code]);
  else if (e.code === 'Escape') {
    // Échap annule d'abord ce qui est en cours, puis ouvre le menu pause.
    if (build.tool) build.setTool(null);
    else if (selection.selected.size || selection.inspected !== null) selection.clear();
    else hud.openPause();
  } else if (e.code === 'KeyT') hire();
  else if (e.code === 'KeyH') toggleHeatmap();
  else if (e.code === 'KeyB') toggleEdgePan();
  else if (e.code === 'Space') {
    e.preventDefault();
    setSpeed(state.speed === 0 ? lastSpeed : 0);
  } else if (e.code === 'Digit1') setSpeed(1);
  else if (e.code === 'Digit2') setSpeed(2);
  else if (e.code === 'Digit3') setSpeed(4);
});

showTitle();

// Pas fixe : la vitesse change le nombre de ticks par seconde réelle, jamais le dt.
let acc = 0;
let last = performance.now();
function frame(now: number) {
  const realDt = Math.min((now - last) / 1000, 0.25);
  last = now;

  processCommands(state); // en pause aussi : on construit pendant la pause
  acc += realDt * state.speed;
  let ticks = 0;
  while (acc >= DT && ticks < MAX_TICKS_PER_FRAME) {
    step(state);
    acc -= DT;
    ticks++;
  }
  if (ticks === MAX_TICKS_PER_FRAME) acc = 0;

  if (phase === 'playing' && state.time - lastAutosave >= 60) autosave();

  selection.prune(state);
  build.update();
  const inspected = selection.inspected === null ? null : (state.buildings.find((b) => b.id === selection.inspected) ?? null);
  view.render(state, now / 1000, realDt, acc / DT, selection.selected, inspected);
  if (state.events.length) {
    eventLog.push(...state.events);
    eventLog.splice(0, Math.max(0, eventLog.length - 20));
  }
  hud.update(
    state,
    {
      tool: build.tool,
      heatmap: view.heatmap.visible,
      edgePan: view.rts.edgePan,
      hover: build.hover,
      selected: selection.selected,
      inspected: selection.inspected,
    },
    now,
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Débogage en dev : window.__game.step() fait avancer la simulation depuis la console,
// et __game.view.renderer.info donne les compteurs de rendu (appels de dessin, triangles).
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { state, step: () => step(state), selection, view, hud };
}
