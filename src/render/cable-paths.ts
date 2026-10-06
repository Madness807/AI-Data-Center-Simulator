import { cableReach, networkView, switchUp, type NetworkView } from '../sim/network';
import { idx, type GameState } from '../sim/state';

/**
 * Chemins de câbles, en données pures (testables sans WebGL) : un tronçon par paire de cases
 * voisines empruntée par au moins un câble, avec le nombre de câbles qu'il porte, et une
 * descente vers chaque rack et chaque switch câblés.
 */
export interface TraySegment {
  /** Indices des deux cases (a < b). */
  a: number;
  b: number;
  count: number;
}
export interface TrayDrop {
  cell: number;
  kind: 'rack' | 'switch';
  count: number;
}
export interface CableLayout {
  view: NetworkView;
  segments: TraySegment[];
  drops: TrayDrop[];
  /** Case libre → nombre de câbles qui la traversent. */
  cells: Map<number, number>;
}

export function trayGraph(s: GameState, view: NetworkView): Omit<CableLayout, 'view'> {
  const n = s.w * s.h;
  const edges = new Map<number, number>();
  const cells = new Map<number, number>();
  const drops = new Map<number, TrayDrop>();
  const add = <K>(map: Map<K, number>, key: K) => map.set(key, (map.get(key) ?? 0) + 1);
  const drop = (cell: number, kind: TrayDrop['kind']) => {
    const d = drops.get(cell) ?? { cell, kind, count: 0 };
    d.count++;
    drops.set(cell, d);
  };
  for (const c of view.cables) {
    const path = c.cells.map((p) => idx(s, p.x, p.y));
    const seq = [idx(s, c.rackCell.x, c.rackCell.y), ...path, idx(s, c.switchCell.x, c.switchCell.y)];
    for (let i = 1; i < seq.length; i++) add(edges, Math.min(seq[i - 1], seq[i]) * n + Math.max(seq[i - 1], seq[i]));
    for (const p of path) add(cells, p);
    drop(seq[0], 'rack');
    drop(seq[seq.length - 1], 'switch');
  }
  const segments = [...edges].sort(([p], [q]) => p - q).map(([key, count]) => ({ a: Math.floor(key / n), b: key % n, count }));
  return { segments, drops: [...drops.values()].sort((p, q) => p.cell - q.cell), cells };
}

/** Ce qui détermine le câblage : la portée, et la place, l'état et le câble de chaque équipement. */
function signature(s: GameState): string {
  if (!s.rules.network) return 'off';
  const parts = [`${s.w}x${s.h}`, String(cableReach(s))];
  for (const b of s.buildings) {
    parts.push(`${b.id}:${b.kind}:${b.x}:${b.y}:${b.status === 'construction' ? 1 : 0}:${b.link ?? ''}:${b.kind === 'switch' && switchUp(b) ? 1 : 0}`);
  }
  return parts.join('|');
}

let cached: { key: string; layout: CableLayout } | null = null;

/**
 * Câblage affiché (celui du prochain passage du réseau : en pause, une construction s'y voit
 * tout de suite). Le même objet est rendu tant que rien ne change : le rendu, le calque et
 * l'interface peuvent comparer les références au lieu de tout recalculer.
 */
export function cableLayout(s: GameState): CableLayout {
  const key = signature(s);
  if (cached?.key === key) return cached.layout;
  const view = networkView(s);
  const layout = { view, ...trayGraph(s, view) };
  cached = { key, layout };
  return layout;
}
