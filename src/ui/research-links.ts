import { TREE, type TreeEdge, type TreeModel } from './research-model';

/**
 * Tracé des liens de l'arbre de recherche, en données pures : à partir des boîtes mesurées des
 * tuiles (repère de la grille, en px de mise en page), des polylignes orthogonales à angles
 * arrondis, terminées par une flèche sur le bord de la tuile débloquée.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LinkFrame {
  /** Boîte de chaque tuile. */
  boxes: ReadonlyMap<string, Box>;
  /** Abscisse du couloir à gauche de chaque colonne (milieu de la gouttière). */
  lanes: readonly number[];
}

/** Rayon des angles, décalage des deux bouts d'un lien en couloir, longueur de la flèche. */
export const LINK = { radius: 6, port: 5, arrow: 4 };

type Point = readonly [number, number];

/** Couloirs : le milieu de la gouttière à gauche de chaque colonne (après l'en-tête des niveaux pour la première). */
export function lanesFrom(columns: readonly { x: number; w: number }[], headRight: number): number[] {
  return columns.map((c, i) => (i === 0 ? (headRight + c.x) / 2 : (columns[i - 1].x + columns[i - 1].w + c.x) / 2));
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Polyligne orthogonale en chemin SVG, chaque angle adouci d'un arc de rayon r. */
export function rounded(points: readonly Point[], r = LINK.radius): string {
  if (points.length < 2) return '';
  let d = `M${r1(points[0][0])} ${r1(points[0][1])}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    const [nx, ny] = points[i + 1];
    const into = Math.min(r, Math.hypot(cx - px, cy - py) / 2);
    const out = Math.min(r, Math.hypot(nx - cx, ny - cy) / 2);
    const ax = cx - Math.sign(cx - px) * into;
    const ay = cy - Math.sign(cy - py) * into;
    const bx = cx + Math.sign(nx - cx) * out;
    const by = cy + Math.sign(ny - cy) * out;
    d += ` L${r1(ax)} ${r1(ay)} Q${r1(cx)} ${r1(cy)} ${r1(bx)} ${r1(by)}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L${r1(lx)} ${r1(ly)}`;
}

export interface LinkShape {
  /** Polyligne complète, de la tuile du prérequis au bord de la tuile débloquée. */
  points: Point[];
  /** Le trait, raccourci de la longueur de la flèche. */
  d: string;
  /** La flèche, pointe sur le bord de la tuile débloquée. */
  arrow: string;
}

/** Forme d'un lien ; null si une des tuiles n'a pas de boîte. */
export function linkShape(edge: TreeEdge, frame: LinkFrame, model: TreeModel = TREE): LinkShape | null {
  const s = frame.boxes.get(edge.from);
  const t = frame.boxes.get(edge.to);
  if (!s || !t) return null;
  const cy = (b: Box) => b.y + b.h / 2;
  let points: Point[];
  if (edge.kind === 'straight') points = [[s.x + s.w / 2, s.y + s.h], [t.x + t.w / 2, t.y]];
  else if (edge.kind === 'lane') {
    // Par la gouttière à gauche de la colonne : on part un peu sous le milieu, on arrive un peu au-dessus.
    const lane = frame.lanes[model.pos.get(edge.from)!.col];
    points = [[s.x, cy(s) + LINK.port], [lane, cy(s) + LINK.port], [lane, cy(t) - LINK.port], [t.x, cy(t) - LINK.port]];
  } else {
    // D'une branche à l'autre, sur la même ligne : un trait horizontal entre les deux bords qui se font face.
    const leftward = s.x > t.x;
    points = [[leftward ? s.x : s.x + s.w, cy(s)], [leftward ? t.x + t.w : t.x, cy(t)]];
  }
  const [px, py] = points[points.length - 2];
  const [ex, ey] = points[points.length - 1];
  const len = Math.hypot(ex - px, ey - py) || 1;
  const [ux, uy] = [(ex - px) / len, (ey - py) / len];
  const a = LINK.arrow;
  const shortened = [...points.slice(0, -1), [ex - ux * a, ey - uy * a] as Point];
  const [bx, by] = [ex - ux * a, ey - uy * a];
  const half = a * 0.8;
  const arrow = `M${r1(ex)} ${r1(ey)} L${r1(bx - uy * half)} ${r1(by + ux * half)} L${r1(bx + uy * half)} ${r1(by - ux * half)} Z`;
  return { points, d: rounded(shortened), arrow };
}

/** Dimensions d'une grille idéale (celles du CSS), pour les tests et pour vérifier le tracé sans navigateur. */
export interface GridDims {
  headW: number;
  gutter: number;
  colW: number;
  headerH: number;
  rowGap: number;
  tileH: number;
  slotGap: number;
}

export const GRID_DIMS: GridDims = { headW: 72, gutter: 16, colW: 148, headerH: 24, rowGap: 14, tileH: 52, slotGap: 10 };

/** Boîtes et couloirs d'une grille idéale, sans navigateur. */
export function gridFrame(dims: GridDims = GRID_DIMS, model: TreeModel = TREE): LinkFrame {
  const columns = model.columns.map((_, col) => ({ x: dims.headW + dims.gutter + col * (dims.colW + dims.gutter), w: dims.colW }));
  const rowTop = new Map<number, number>();
  let y = dims.headerH + dims.rowGap;
  for (const [level, slots] of [...model.slots].sort((p, q) => p[0] - q[0])) {
    rowTop.set(level, y);
    y += slots * dims.tileH + (slots - 1) * dims.slotGap + dims.rowGap;
  }
  const boxes = new Map<string, Box>();
  for (const [id, p] of model.pos) boxes.set(id, { x: columns[p.col].x, y: rowTop.get(p.level)! + p.slot * (dims.tileH + dims.slotGap), w: dims.colW, h: dims.tileH });
  return { boxes, lanes: lanesFrom(columns, dims.headW) };
}
