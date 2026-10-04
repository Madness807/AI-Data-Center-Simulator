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

applyTheme();

const state = createInitialState(Date.now() >>> 0);
const enqueue = (c: Command) => state.commands.push(c);

const view = new SceneView(document.getElementById('app')!, state.w, state.h);

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
  hint: (message) => notify(state, 'info', message),
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
const toggleEdgePan = () => (view.rts.edgePan = !view.rts.edgePan);
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
const newGame = () => {
  loadState(createInitialState(Date.now() >>> 0));
  view.rts.settle();
  hud.setPhase('playing');
};
/** Écran titre : salle de démonstration en pause, caméra en rotation lente. */
const showTitle = () => {
  loadState(createShowcaseState());
  view.rts.autoOrbit = true;
  hud.setPhase('title');
};
const resume = () => setSpeed(lastSpeed);

const focusCell = (cell: { x: number; y: number }) => {
  view.rts.focusOn(cell.x + 0.5, cell.y + 0.5);
  view.ping(cell, 'focus');
};

const hud = new Hud(
  document.getElementById('hud')!,
  { setTool, setSpeed, toggleHeatmap, toggleEdgePan, hire, acceptJob, rejectJob, newGame, showTitle, resume, focusCell },
  { w: state.w, h: state.h, camera: { footprint: () => view.rts.footprint(), setTarget: (x, z) => view.rts.setTarget(x, z) } },
);
// Vignettes des vrais modèles 3D dans la barre de construction.
for (const [key, url] of Object.entries(renderThumbnails())) hud.setThumbnail(key as ThumbnailKey, url);

const TOOL_KEYS: Record<string, Tool> = { KeyR: 'rack', KeyC: 'crac', KeyP: 'pdu', KeyX: 'demolish' };
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (hud.handleKey(e)) return;
  if (e.code in TOOL_KEYS) setTool(TOOL_KEYS[e.code]);
  else if (e.code === 'Escape') {
    if (build.tool) build.setTool(null);
    else selection.clear();
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

  selection.prune(state);
  build.update();
  view.render(state, now / 1000, realDt, acc / DT, selection.selected);
  hud.update(
    state,
    { tool: build.tool, heatmap: view.heatmap.visible, edgePan: view.rts.edgePan, hover: build.hover, selected: selection.selected },
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
