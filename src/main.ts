import './style.css';
import { DT, MAX_TICKS_PER_FRAME } from './sim/balance';
import type { Command } from './sim/commands';
import { processCommands } from './sim/commands';
import { step } from './sim/sim';
import { createInitialState, type Speed } from './sim/state';
import { SceneView } from './render/scene';
import { BuildController, type Tool } from './input/build';
import { Hud } from './ui/hud';

const state = createInitialState(Date.now() >>> 0);
const enqueue = (c: Command) => state.commands.push(c);

const view = new SceneView(document.getElementById('app')!, state.w, state.h);
const build = new BuildController(view.scene, () => view.rts.camera, view.domElement, () => state, enqueue, (ray) =>
  view.pickBuilding(ray),
);

let lastSpeed: Exclude<Speed, 0> = 1;
const setSpeed = (speed: Speed) => {
  if (speed !== 0) lastSpeed = speed as Exclude<Speed, 0>;
  enqueue({ type: 'setSpeed', speed });
};
const setTool = (tool: Tool) => build.setTool(build.tool === tool ? null : tool);
const toggleHeatmap = () => (view.heatmap.visible = !view.heatmap.visible);
const toggleEdgePan = () => (view.rts.edgePan = !view.rts.edgePan);

const hud = new Hud(document.getElementById('hud')!, { setTool, setSpeed, toggleHeatmap, toggleEdgePan });

const TOOL_KEYS: Record<string, Tool> = { KeyR: 'rack', KeyC: 'crac', KeyP: 'pdu', KeyX: 'demolish' };
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (e.code in TOOL_KEYS) setTool(TOOL_KEYS[e.code]);
  else if (e.code === 'Escape') build.setTool(null);
  else if (e.code === 'KeyH') toggleHeatmap();
  else if (e.code === 'KeyB') toggleEdgePan();
  else if (e.code === 'Space') {
    e.preventDefault();
    setSpeed(state.speed === 0 ? lastSpeed : 0);
  } else if (e.code === 'Digit1') setSpeed(1);
  else if (e.code === 'Digit2') setSpeed(2);
  else if (e.code === 'Digit3') setSpeed(4);
});

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

  build.update();
  view.render(state, now / 1000, realDt);
  hud.update(state, { tool: build.tool, heatmap: view.heatmap.visible, edgePan: view.rts.edgePan, hover: build.hover });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Débogage en dev : window.__game.step() fait avancer la simulation depuis la console.
if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { state, step: () => step(state) };
}
