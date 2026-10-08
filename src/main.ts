import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import { DT, MAX_TICKS_PER_FRAME } from './sim/balance';
import { processCommands, type Command } from './sim/commands';
import { step } from './sim/sim';
import { buildingAt, buildingById, createInitialState, notify, type GameEvent, type GameState, type Speed } from './sim/state';
import { SceneView } from './render/scene';
import { OVERLAY_MODES, overlayAvailable, type OverlayMode } from './render/overlay-colors';
import { renderThumbnails, type ThumbnailKey } from './render/thumbnails';
import { BuildController } from './input/build';
import { loadKeyboardLayout, matches, type KeyAction } from './input/keymap';
import { pickGroundCell, rayFromScreen } from './input/picking';
import { SelectionController } from './input/selection';
import { Hud } from './ui/hud';
import type { NewGameKind } from './ui/components/screens';
import type { FamilyId } from './ui/components/build-bar';
import { createShowcaseState } from './ui/showcase';
import { applyLayout } from './ui/layout';
import { applyTheme } from './ui/theme';
import { setColorblind } from './render/assets';
import { copyText, installCrashHandler, showFatal } from './ui/components/error-screen';
import { buildReport } from './report';
import { SettingsStore, safeStorage } from './settings';
import { SaveManager, deserialize, serialize, type SaveSlot } from './save';
import { AudioEngine } from './audio/engine';
import { ambienceOf, SoundDirector, type SoundId } from './audio/director';
import { idleTechs } from './sim/stats';
import { setupPwa } from './pwa/install';

const settings = new SettingsStore();
const hudRoot = document.getElementById('hud')!;
const audio = new AudioEngine();
/** Derniers sons joués (vérification en mode dev). */
const soundLog: SoundId[] = [];
const director = new SoundDirector((id) => {
  audio.play(id);
  soundLog.push(id);
  soundLog.splice(0, Math.max(0, soundLog.length - 30));
});
// Les navigateurs n'autorisent le son qu'après un geste du joueur.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => audio.unlock(), { capture: true });
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
  ping: (cell, kind) => {
    view.ping(cell, kind);
    director.trigger('order');
  },
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
const setOverlay = (mode: OverlayMode | null) => (view.overlay.mode = mode);
/** H : calque suivant (Maj : précédent), en passant par « aucun ». Seuls les calques de la partie défilent. */
const cycleOverlay = (dir: 1 | -1) => {
  const order: (OverlayMode | null)[] = [null, ...OVERLAY_MODES.filter((m) => overlayAvailable(m, state))];
  view.overlay.mode = order[(order.indexOf(view.overlay.mode) + dir + order.length) % order.length];
};
/** Panneau Équipe : sélection des techniciens et caméra sur le premier. */
const selectTechs = (ids: number[], focus: boolean) => {
  selection.clear();
  for (const id of ids) selection.selected.add(id);
  const first = state.techs.find((t) => t.id === ids[0]);
  if (focus && first) view.rts.focusOn(first.x + 0.5, first.y + 0.5);
};
const toggleEdgePan = () => settings.update({ edgePan: !settings.value.edgePan });
const hire = () => enqueue({ type: 'hire' });
const acceptJob = (id: number) => enqueue({ type: 'acceptJob', id });
const rejectJob = (id: number) => enqueue({ type: 'rejectJob', id });
/** Remplace l'état champ par champ : il est partagé par référence (contrôleurs, rendu). */
const loadState = (next: GameState) => {
  Object.assign(state, next);
  lastSpeed = 1;
  // Le calque réseau n'a pas de sens dans une partie qui n'en a pas.
  if (view.overlay.mode && !overlayAvailable(view.overlay.mode, state)) view.overlay.mode = null;
  build.setTool(null);
  selection.clear();
  hud.reset();
};
let lastAutosave = 0;
const startPlaying = (next: GameState) => {
  hud.stopTutorial();
  loadState(next);
  lastAutosave = next.time;
  director.sync(next);
  phase = 'playing';
  view.rts.settle();
  hud.setPhase('playing');
};
/** Carrière, partie rapide, ou tutoriel (sur les règles de la partie rapide). */
const newGame = (kind: NewGameKind) => {
  startPlaying(createInitialState(Date.now() >>> 0, kind === 'career' ? 'career' : 'quick'));
  if (kind === 'tutorial') hud.startTutorial(state);
};
/** Écran titre : salle de démonstration en pause, caméra en rotation lente. */
const showTitle = () => {
  phase = 'title';
  hud.stopTutorial();
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
  if (!error) notify(state, 'success', `Partie sauvegardée (${slot === 'auto' ? 'automatique' : `emplacement ${slot}`})`, { code: 'saved' });
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
  const b = buildingById(state, id);
  if (!b) return;
  if (!state.techs.length) {
    notify(state, 'error', 'Aucun technicien : embauchez-en un (T)', { code: 'refused' });
    return;
  }
  const idle = idleTechs(state);
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
const rotateBuilding = (id: number) => enqueue({ type: 'rotate', id });
/** Entretien : le technicien le plus proche (de préférence libre) part remettre le rack à neuf. */
const maintainBuilding = (id: number) => {
  const b = buildingById(state, id);
  if (!b || !state.techs.length) return;
  const idle = idleTechs(state);
  const pool = idle.length ? idle : state.techs;
  const dist = (t: { x: number; y: number }) => Math.abs(t.x - b.x) + Math.abs(t.y - b.y);
  const tech = pool.reduce((best, t) => (dist(t) < dist(best) ? t : best));
  enqueue({ type: 'order', techs: [tech.id], task: { type: 'maintain', target: id }, append: idle.length === 0 });
  view.ping(b, 'maintain');
};
/** Modernisation : le rack repasse en chantier, confié au technicien le plus proche (de préférence libre). */
const upgradeBuilding = (id: number) => {
  const b = buildingById(state, id);
  if (!b) return;
  const idle = idleTechs(state);
  const pool = idle.length ? idle : state.techs;
  const dist = (t: { x: number; y: number }) => Math.abs(t.x - b.x) + Math.abs(t.y - b.y);
  const tech = pool.length ? pool.reduce((best, t) => (dist(t) < dist(best) ? t : best)) : null;
  enqueue({ type: 'upgrade', id, ...(tech ? { assign: [tech.id] } : {}) });
  view.ping(b, 'build');
};
/** F (carrière) : pivote le fantôme pendant la pose d'un rack (toutes générations), sinon le rack inspecté. */
const rotate = () => {
  if (!state.rules.aisles) return;
  if (build.tool === 'rack' || build.tool === 'rack2' || build.tool === 'rack3') build.rotate();
  else if (selection.inspected !== null) rotateBuilding(selection.inspected);
};

const hud = new Hud(
  hudRoot,
  {
    currentTool: () => build.tool,
    selectTool: (tool) => build.setTool(tool),
    setSpeed,
    setOverlay,
    toggleEdgePan,
    hire,
    selectTechs,
    acceptJob,
    rejectJob,
    newGame,
    setResearchShare: (share) => enqueue({ type: 'setResearchShare', share }),
    startResearch: (id) => enqueue({ type: 'startResearch', id }),
    setAutoRepair: (on) => enqueue({ type: 'setPolicy', autoRepair: on }),
    setCommercial: (commercial) => enqueue({ type: 'setPolicy', commercial }),
    showTitle,
    resume,
    focusCell,
    sendTechnician,
    demolishAt,
    closeInspector,
    rotateBuilding,
    upgradeBuilding,
    maintainBuilding,
    hireSpecialist: (specialty) => enqueue({ type: 'hire', specialty }),
    setAutoMaintain: (on) => enqueue({ type: 'setPolicy', autoMaintain: on }),
    reportBug: () =>
      copyText(report()).then(
        () => true,
        () => false,
      ),
    continueGame,
    enqueue,
    pingCell: (cell) => view.ping(cell, 'focus'),
    saves: { list: () => saves.list(), save: saveSlot, load: loadSlot, importText, exportGame },
  },
  { w: state.w, h: state.h, camera: { footprint: () => view.rts.footprint(), setTarget: (x, z) => view.rts.setTarget(x, z) } },
  settings,
);

view.rts.inputBlocked = () => hud.blocksWorldInput();
// Jeu installable et jouable hors ligne (build seulement).
setupPwa((install) => hud.setInstall(install));

hudRoot.addEventListener('pointerdown', (e) => {
  if ((e.target as Element).closest('button')) director.trigger('click');
});

// Disposition selon la largeur effective (src/ui/layout.ts), recalculée au redimensionnement.
const relayout = () => applyLayout(hudRoot, settings.value.uiScale);
window.addEventListener('resize', relayout);

// Les options s'appliquent en direct (l'anticrénelage, lui, au prochain lancement).
settings.subscribe((s) => {
  setColorblind(s.colorblind);
  applyTheme();
  audio.setVolumes({ master: s.volumeMaster, sfx: s.volumeSfx, ambience: s.volumeAmbience });
  view.applyGraphics(s);
  view.rts.edgePan = s.edgePan;
  relayout();
});
// Vignettes des vrais modèles 3D dans la barre de construction.
for (const [key, url] of Object.entries(renderThumbnails())) hud.setThumbnail(key as ThumbnailKey, url);

/** Une touche par famille de la barre : un nouvel appui passe à la variante suivante. */
const FAMILY_KEYS: [KeyAction, FamilyId][] = [
  ['buildCompute', 'compute'],
  ['buildCooling', 'cooling'],
  ['buildPower', 'power'],
  ['buildNetwork', 'network'],
  ['demolish', 'demolish'],
];
loadKeyboardLayout();
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (hud.handleKey(e)) return;
  const family = FAMILY_KEYS.find(([action]) => matches(action, e));
  if (family) hud.cycleBuild(family[1]);
  else if (matches('cancel', e)) {
    // Échap annule d'abord ce qui est en cours, puis ouvre le menu pause.
    if (build.tool) build.setTool(null);
    else if (selection.selected.size || selection.inspected !== null) selection.clear();
    else hud.openPause();
  } else if (matches('hire', e)) hire();
  else if (matches('overlay', e)) cycleOverlay(e.shiftKey ? -1 : 1);
  else if (matches('edgePan', e)) toggleEdgePan();
  else if (matches('rotateBuilding', e)) rotate();
  else if (matches('pause', e)) {
    e.preventDefault();
    setSpeed(state.speed === 0 ? lastSpeed : 0);
  } else if (matches('speed1', e)) setSpeed(1);
  else if (matches('speed2', e)) setSpeed(2);
  else if (matches('speed4', e)) setSpeed(4);
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
  const inspected = selection.inspected === null ? null : (buildingById(state, selection.inspected) ?? null);
  view.render(state, now / 1000, realDt, acc / DT, selection.selected, inspected, build.preview);
  // Son : événements et transitions de la partie, ambiance qui suit l'activité et la chaleur.
  if (phase === 'playing') {
    director.onEvents(state.events);
    director.onFrame(state);
  }
  const ambience = ambienceOf(state);
  audio.setAmbience(ambience.load, ambience.heat, state.speed === 0);
  if (state.events.length) {
    eventLog.push(...state.events);
    eventLog.splice(0, Math.max(0, eventLog.length - 20));
  }
  hud.update(
    state,
    {
      tool: build.tool,
      overlay: view.overlay.mode,
      edgePan: view.rts.edgePan,
      hover: build.hover,
      preview: build.preview,
      selected: selection.selected,
      inspected: selection.inspected,
    },
    now,
  );
  // Les événements du tick ont servi (son, rapport de bug, alertes du HUD) : on repart à vide.
  state.events.length = 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Débogage en dev : window.__game.step() fait avancer la simulation depuis la console,
// et __game.view.renderer.info donne les compteurs de rendu (appels de dessin, triangles).
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { state, step: () => step(state), selection, view, hud, sounds: soundLog, audio, director };
}
