import { NETWORK, OPTICAL } from './balance';
import type { Building, Cell } from './entities';
import { DIRS4, manhattan } from './math';
import { isUnlocked, modifiers } from './progression';
import { idx, inBounds, notify, type GameState } from './state';

/**
 * Réseau de calcul (carrière). Chaque rack se câble seul à un switch, par les cases libres (les
 * allées) : la longueur d'un câble compte les cases libres de son chemin, 0 si le rack touche le
 * switch. Un câble posé reste tant que son switch existe et que son chemin tient ; les racks
 * libres se câblent ensuite, les câbles les plus courts d'abord. Building.link garde le résultat :
 * seul updateNetwork l'écrit, une fois par tick. Les autres fonctions sont pures (aperçus, rendu).
 */

/** Pourquoi un rack n'est pas câblé. `pending` : il le sera au prochain passage. */
export type UnlinkedReason = 'noSwitch' | 'enclosed' | 'tooFar' | 'portsFull' | 'pending';

/** Un câble, et les cases libres qu'il emprunte, du côté du rack vers le côté du switch. */
export interface Cable {
  rack: number;
  sw: number;
  /** Cases du rack et du switch (celui d'un aperçu n'est pas encore dans la salle). */
  rackCell: Cell;
  switchCell: Cell;
  /** Switch construit et alimenté : la liaison est en service. */
  up: boolean;
  /** Cases de câble (0 : le rack touche son switch). */
  length: number;
  cells: Cell[];
}

export interface NetworkView {
  cables: Cable[];
  unlinked: Map<number, UnlinkedReason>;
  /** Ports occupés de chaque switch. */
  ports: Map<number, number>;
}

/** Hypothèses d'un aperçu : une case supposée occupée, ou un switch supposé posé sur une case libre. */
export interface NetworkPlanOptions {
  block?: Cell;
  addSwitch?: Cell;
}

/** Le réseau compte-t-il pour l'entraînement (carrière, à partir du palier NETWORK.minTier) ? */
export function networkActive(s: GameState): boolean {
  return s.rules.network && s.career.tier >= NETWORK.minTier;
}

/** Le réseau a-t-il sa place à l'écran (calque, aperçus) : carrière, switch débloqué ou déjà posé. */
export function networkVisible(s: GameState): boolean {
  return s.rules.network && (isUnlocked(s, 'switch') || s.buildings.some((b) => b.kind === 'switch'));
}

/** Longueur de câble maximale : plus longue avec l'interconnexion optique. */
export function cableReach(s: GameState): number {
  return modifiers(s).optical ? OPTICAL.cableReach : NETWORK.reach;
}

/** Switch construit et alimenté : ses liaisons sont en service. */
export function switchUp(b: Building): boolean {
  return b.kind === 'switch' && b.status === 'ok' && b.powered;
}

interface Switch extends Cell {
  id: number;
}

/** Le terrain du câblage : cases libres, switchs (réels, plus celui d'un aperçu), distances de câble. */
interface Survey {
  free: (x: number, y: number) => boolean;
  switches: Switch[];
  reach: number;
  fields: Map<number, Int16Array>;
}

function survey(s: GameState, opts: NetworkPlanOptions): Survey {
  const blocked = new Set<number>();
  for (const c of [opts.block, opts.addSwitch]) if (c && inBounds(s, c.x, c.y)) blocked.add(idx(s, c.x, c.y));
  const free = (x: number, y: number) => inBounds(s, x, y) && s.occupant[idx(s, x, y)] < 0 && !blocked.has(idx(s, x, y));
  const switches: Switch[] = s.buildings.filter((b) => b.kind === 'switch');
  // Le switch d'un aperçu prend l'id que la construction lui donnerait : il est le plus récent.
  if (opts.addSwitch) switches.push({ id: s.nextId, x: opts.addSwitch.x, y: opts.addSwitch.y });
  const reach = cableReach(s);
  const fields = new Map(switches.map((w) => [w.id, cableField(s, w, free, reach)]));
  return { free, switches, reach, fields };
}

/** Cases libres à portée de câble d'un switch : 1 pour ses voisines, puis une de plus par case libre. */
function cableField(s: GameState, sw: Cell, free: Survey['free'], reach: number): Int16Array {
  const d = new Int16Array(s.w * s.h);
  const queue: number[] = [];
  const visit = (x: number, y: number, dist: number) => {
    if (!free(x, y) || d[idx(s, x, y)]) return;
    d[idx(s, x, y)] = dist;
    queue.push(idx(s, x, y));
  };
  for (const [dx, dy] of DIRS4) visit(sw.x + dx, sw.y + dy, 1);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (d[i] >= reach) continue;
    const x = i % s.w;
    const y = (i - x) / s.w;
    for (const [dx, dy] of DIRS4) visit(x + dx, y + dy, d[i] + 1);
  }
  return d;
}

/** Case libre voisine du rack la plus proche du switch (à égalité, l'ordre de DIRS4), et sa distance. */
function landing(s: GameState, rack: Cell, field: Int16Array, free: Survey['free']): { cell: Cell; d: number } | null {
  let best: { cell: Cell; d: number } | null = null;
  for (const [dx, dy] of DIRS4) {
    const x = rack.x + dx;
    const y = rack.y + dy;
    if (!free(x, y)) continue;
    const d = field[idx(s, x, y)];
    if (d > 0 && (!best || d < best.d)) best = { cell: { x, y }, d };
  }
  return best;
}

function cableLength(s: GameState, rack: Cell, sw: Switch, sv: Survey): number {
  if (manhattan(rack, sw) === 1) return 0;
  return landing(s, rack, sv.fields.get(sw.id)!, sv.free)?.d ?? Infinity;
}

/** Attribution des ports : les câbles posés d'abord, puis les racks libres, les plus courts d'abord. */
function assign(s: GameState, sv: Survey): Map<number, number> {
  const links = new Map<number, number>();
  if (!sv.switches.length) return links;
  const byId = new Map(sv.switches.map((w) => [w.id, w]));
  const used = new Map<number, number>();
  const take = (rack: Building, w: Switch) => {
    links.set(rack.id, w.id);
    used.set(w.id, (used.get(w.id) ?? 0) + 1);
  };
  const full = (w: Switch) => (used.get(w.id) ?? 0) >= NETWORK.ports;
  const racks = s.buildings.filter((b) => b.kind === 'rack');
  for (const r of racks) {
    if (r.link === undefined) continue;
    const w = byId.get(r.link);
    if (w && !full(w) && cableLength(s, r, w, sv) <= sv.reach) take(r, w);
  }
  // Un rack dont le câble vient de sauter ne se recâble qu'au passage suivant : l'entraînement voit
  // toujours un tick sans liaison avant un changement de switch.
  const pairs: { length: number; rack: Building; sw: Switch }[] = [];
  for (const r of racks) {
    if (r.link !== undefined) continue;
    for (const w of sv.switches) {
      const length = cableLength(s, r, w, sv);
      if (length <= sv.reach) pairs.push({ length, rack: r, sw: w });
    }
  }
  pairs.sort((a, b) => a.length - b.length || a.rack.id - b.rack.id || a.sw.id - b.sw.id);
  for (const p of pairs) if (!links.has(p.rack.id) && !full(p.sw)) take(p.rack, p.sw);
  return links;
}

/** Câblage du prochain passage (rack → switch), sans rien modifier. */
export function planLinks(s: GameState, opts: NetworkPlanOptions = {}): Map<number, number> {
  if (!s.rules.network) return new Map();
  return assign(s, survey(s, opts));
}

/** Un passage par tick (sim.ts) : applique le câblage et signale les câbles coupés. */
export function updateNetwork(s: GameState): void {
  if (!s.rules.network) return;
  const links = planLinks(s);
  const lost: Building[] = [];
  for (const b of s.buildings) {
    if (b.kind !== 'rack') continue;
    const next = links.get(b.id);
    if (next !== undefined) {
      if (b.link !== next) b.link = next;
      continue;
    }
    if (b.link === undefined) continue;
    delete b.link;
    if (b.status !== 'construction') lost.push(b);
  }
  if (!lost.length || !networkActive(s)) return;
  const first = lost[0];
  const message = lost.length === 1 ? `Rack ${first.x},${first.y} : câble réseau coupé` : `${lost.length} racks ont perdu leur câble réseau`;
  notify(s, 'warning', message, { cell: { x: first.x, y: first.y }, code: 'linkLost' });
}

/** Liaisons en service (rack → switch) quand le réseau compte pour l'entraînement ; null sinon. */
export function activeLinks(s: GameState): Map<number, number> | null {
  if (!networkActive(s)) return null;
  const up = new Set(s.buildings.filter(switchUp).map((b) => b.id));
  const out = new Map<number, number>();
  for (const b of s.buildings) if (b.kind === 'rack' && b.link !== undefined && up.has(b.link)) out.set(b.id, b.link);
  return out;
}

/** Chemin d'un câble : de la case libre voisine du rack, en descendant les distances jusqu'au switch. */
function route(s: GameState, rack: Cell, sw: Switch, sv: Survey): Cell[] {
  if (manhattan(rack, sw) === 1) return [];
  const field = sv.fields.get(sw.id)!;
  const start = landing(s, rack, field, sv.free);
  if (!start) return [];
  const cells = [start.cell];
  let cur = start.cell;
  for (let d = start.d; d > 1; d--) {
    const next = DIRS4.map(([dx, dy]) => ({ x: cur.x + dx, y: cur.y + dy })).find((c) => sv.free(c.x, c.y) && field[idx(s, c.x, c.y)] === d - 1);
    if (!next) break;
    cells.push(next);
    cur = next;
  }
  return cells;
}

/** Ce que montre le jeu : câbles et chemins, ports occupés, racks non câblés et pourquoi. */
export function networkView(s: GameState, opts: NetworkPlanOptions = {}): NetworkView {
  const view: NetworkView = { cables: [], unlinked: new Map(), ports: new Map() };
  if (!s.rules.network) return view;
  const sv = survey(s, opts);
  const links = assign(s, sv);
  const byId = new Map(sv.switches.map((w) => [w.id, w]));
  const up = new Set(s.buildings.filter(switchUp).map((b) => b.id));
  for (const b of s.buildings) {
    if (b.kind !== 'rack') continue;
    const swId = links.get(b.id);
    if (swId !== undefined) {
      const sw = byId.get(swId)!;
      view.cables.push({
        rack: b.id,
        sw: swId,
        rackCell: { x: b.x, y: b.y },
        switchCell: { x: sw.x, y: sw.y },
        up: up.has(swId),
        length: cableLength(s, b, sw, sv),
        cells: route(s, b, sw, sv),
      });
      view.ports.set(swId, (view.ports.get(swId) ?? 0) + 1);
    } else view.unlinked.set(b.id, unlinkedReason(s, b, sv, links));
  }
  return view;
}

function unlinkedReason(s: GameState, rack: Building, sv: Survey, links: Map<number, number>): UnlinkedReason {
  if (!sv.switches.length) return 'noSwitch';
  const inReach = sv.switches.filter((w) => cableLength(s, rack, w, sv) <= sv.reach);
  if (!inReach.length) {
    const open = DIRS4.some(([dx, dy]) => sv.free(rack.x + dx, rack.y + dy));
    return open ? 'tooFar' : 'enclosed';
  }
  const used = (w: Switch) => [...links.values()].filter((id) => id === w.id).length;
  return inReach.some((w) => used(w) < NETWORK.ports) ? 'pending' : 'portsFull';
}

/** Cases libres à portée de câble du switch posé en `cell`, ou d'un switch supposé posé là (aperçu de l'outil). */
export function switchReach(s: GameState, cell: Cell): number[] {
  const existing = s.buildings.find((b) => b.kind === 'switch' && b.x === cell.x && b.y === cell.y);
  const sv = survey(s, existing ? {} : { addSwitch: cell });
  const field = sv.fields.get(existing ? existing.id : s.nextId)!;
  const out: number[] = [];
  for (let i = 0; i < field.length; i++) if (field[i] > 0) out.push(i);
  return out;
}
