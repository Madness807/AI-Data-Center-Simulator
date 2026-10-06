import { RESEARCH_RATE } from '../sim/balance';
import { levelOpen, levelTier, researchBlocker } from '../sim/progression';
import { BRANCHES, RESEARCH, researchById, type Branch, type ResearchNode } from '../sim/research';
import type { GameState } from '../sim/state';
import { buildingName, KIND_INFO, RESEARCH_ICON } from './catalog';
import { decimal, duration, integer, points } from './format';
import type { IconName } from './icons';

/**
 * Arbre de recherche, en données pures (testées sans navigateur) : la grille branche × niveau,
 * les liens de prérequis, l'état de chaque tuile et les textes du panneau. Le panneau
 * (components/research-panel.ts) ne fait que les afficher.
 */

/** Niveaux de recherche, dans l'ordre ; chacun s'ouvre à un palier (progression.ts › levelTier). */
export const LEVELS: readonly number[] = [...new Set(RESEARCH.map((n) => n.level))].sort((a, b) => a - b);

export type EdgeKind = 'straight' | 'lane' | 'cross';

/**
 * Lien de prérequis, à la couleur de la branche du prérequis. `straight` : vers la tuile juste
 * dessous ; `lane` : même branche, par la gouttière ; `cross` : d'une branche à une autre.
 */
export interface TreeEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  branch: Branch;
}

/** Place d'un nœud : colonne (ordre de BRANCHES), niveau, rang dans sa case. */
export interface TreePos {
  col: number;
  level: number;
  slot: number;
}

export interface TreeModel {
  /** Une case par branche et par niveau (vides comprises), niveau par niveau. */
  cells: { branch: Branch; col: number; level: number; ids: string[] }[];
  pos: ReadonlyMap<string, TreePos>;
  /** Tuiles empilées au plus dans une case de chaque niveau : la hauteur de la ligne. */
  slots: ReadonlyMap<number, number>;
  /** Liens droits, puis en couloir, puis traversants (dessinés en dernier, par-dessus). */
  edges: TreeEdge[];
  /** Ordre de lecture : niveau, colonne, rang. */
  order: string[];
  /** Chaque colonne, de haut en bas. */
  columns: string[][];
}

const node = (id: string): ResearchNode => researchById(id)!;

/**
 * Ordre dans une case : un prérequis passe au-dessus de ce qu'il débloque ; parmi les nœuds
 * prêts, celui qui a un débouché plus bas dans sa branche passe en dernier (son lien descend
 * alors tout droit) ; sinon, l'ordre de RESEARCH.
 */
function orderCell(ids: string[]): string[] {
  const deeper = (id: string) => RESEARCH.some((n) => n.branch === node(id).branch && n.level > node(id).level && n.requires.includes(id));
  const out: string[] = [];
  const left = [...ids];
  while (left.length) {
    const ready = left.filter((id) => node(id).requires.every((r) => !left.includes(r)));
    const pick = ready.find((id) => !deeper(id)) ?? ready[0] ?? left[0];
    out.push(pick);
    left.splice(left.indexOf(pick), 1);
  }
  return out;
}

export function buildTree(nodes: readonly ResearchNode[]): TreeModel {
  const cells: TreeModel['cells'] = [];
  const pos = new Map<string, TreePos>();
  const slots = new Map<number, number>();
  for (const level of LEVELS) {
    BRANCHES.forEach((b, col) => {
      const ids = orderCell(nodes.filter((n) => n.branch === b.id && n.level === level).map((n) => n.id));
      ids.forEach((id, slot) => pos.set(id, { col, level, slot }));
      cells.push({ branch: b.id, col, level, ids });
      slots.set(level, Math.max(slots.get(level) ?? 0, ids.length));
    });
  }
  const order = cells.flatMap((c) => c.ids);
  const columns = BRANCHES.map((_, col) => cells.filter((c) => c.col === col).flatMap((c) => c.ids));
  const kinds: Record<EdgeKind, TreeEdge[]> = { straight: [], lane: [], cross: [] };
  for (const n of nodes) {
    for (const from of n.requires) {
      const branch = node(from).branch;
      const column = columns[pos.get(from)!.col];
      const kind: EdgeKind = branch !== n.branch ? 'cross' : column[column.indexOf(from) + 1] === n.id ? 'straight' : 'lane';
      kinds[kind].push({ from, to: n.id, kind, branch });
    }
  }
  return { cells, pos, slots, edges: [...kinds.straight, ...kinds.lane, ...kinds.cross], order, columns };
}

/** L'arbre du jeu. */
export const TREE = buildTree(RESEARCH);

/** Prérequis et débouchés directs d'un nœud (surlignés autour de la tuile montrée). */
export function related(id: string): { requires: string[]; unlocks: string[] } {
  return { requires: [...node(id).requires], unlocks: RESEARCH.filter((n) => n.requires.includes(id)).map((n) => n.id) };
}

/**
 * Tuile voisine pour le clavier. Haut et bas suivent la colonne ; gauche et droite vont à la
 * colonne la plus proche qui a une tuile au même niveau (même rang si possible).
 */
export function neighbour(id: string, dir: 'up' | 'down' | 'left' | 'right'): string | null {
  const p = TREE.pos.get(id)!;
  if (dir === 'up' || dir === 'down') {
    const column = TREE.columns[p.col];
    return column[column.indexOf(id) + (dir === 'up' ? -1 : 1)] ?? null;
  }
  const step = dir === 'left' ? -1 : 1;
  for (let col = p.col + step; col >= 0 && col < BRANCHES.length; col += step) {
    const ids = TREE.cells.find((c) => c.col === col && c.level === p.level)!.ids;
    if (ids.length) return ids[Math.min(p.slot, ids.length - 1)];
  }
  return null;
}

export type TileState = 'done' | 'current' | 'available' | 'locked' | 'tier';

/** État d'une tuile : terminée, en cours, disponible, verrouillée par un prérequis ou par le palier. */
export function tileState(s: GameState, id: string): TileState {
  const r = s.research;
  if (r.done.includes(id)) return 'done';
  if (r.current === id) return 'current';
  if (!levelOpen(s, node(id).level)) return 'tier';
  return researchBlocker(s, id) === null ? 'available' : 'locked';
}

/** Avancement de 0 à 1 ; jamais « 100 % » avant la fin. */
export function progressOf(s: GameState, id: string): number {
  if (s.research.done.includes(id)) return 1;
  return Math.min(0.99, (s.research.progress[id] ?? 0) / node(id).cost);
}

export type EdgeState = 'done' | 'ready' | 'pending';

/** Lien terminé (la cible est faite), prêt (le prérequis est fait) ou en attente. */
export function edgeState(s: GameState, e: TreeEdge): EdgeState {
  if (s.research.done.includes(e.to)) return 'done';
  return s.research.done.includes(e.from) ? 'ready' : 'pending';
}

/** Ce qui change la forme du panneau (états, pictogrammes) ; l'avancement en cours est mis à jour à part. */
export function structureKey(s: GameState): string {
  const r = s.research;
  const started = Object.keys(r.progress)
    .filter((id) => r.progress[id] > 0)
    .sort()
    .join(',');
  return `${s.career.tier}|${r.done.join(',')}|${r.current ?? ''}|${started}`;
}

/** Tuile choisie à l'ouverture : la recherche en cours, sinon la première disponible, sinon la première à faire. */
export function defaultSelection(s: GameState): string {
  const r = s.research;
  if (r.current && TREE.pos.has(r.current)) return r.current;
  return TREE.order.find((id) => tileState(s, id) === 'available') ?? TREE.order.find((id) => !r.done.includes(id)) ?? TREE.order[0];
}

/** Points par seconde : ceux du moment, ou ceux qu'apporterait la part réservée si rien n'est en cours. */
export function projectedRate(s: GameState): number {
  const r = s.research;
  return r.current ? r.ratePerS : s.compute.total * r.share * RESEARCH_RATE.pointsPerCU;
}

/** Secondes pour finir un nœud au rythme donné (Infinity sans calcul). */
export function remainingSeconds(s: GameState, id: string, rate = projectedRate(s)): number {
  const left = Math.max(0, node(id).cost - (s.research.progress[id] ?? 0));
  return rate > 0 ? left / rate : Infinity;
}

const branchName = (b: Branch) => BRANCHES.find((x) => x.id === b)!.name;
const pct = (ratio: number) => `${Math.floor(ratio * 100)} %`;

const STATE_WORD: Record<TileState, string> = {
  done: 'terminée',
  current: 'en cours',
  available: 'disponible',
  locked: 'verrouillée',
  tier: 'palier requis',
};

export interface TileView {
  state: TileState;
  glyph: IconName;
  meta: string;
  progress: number;
  /** Nom complet pour les lecteurs d'écran. */
  label: string;
}

/** Ce que montre une tuile : pictogramme d'état, coût ou avancement. */
export function tileView(s: GameState, id: string): TileView {
  const n = node(id);
  const state = tileState(s, id);
  const progress = progressOf(s, id);
  const started = progress > 0 && state !== 'done';
  let glyph: IconName = 'lock';
  let meta = points(n.cost);
  if (state === 'done') [glyph, meta] = ['done', 'Terminée'];
  else if (state === 'current') {
    const left = remainingSeconds(s, id);
    [glyph, meta] = ['running', `${pct(progress)} · ${left === Infinity ? 'à l’arrêt' : duration(left)}`];
  } else if (state === 'available') [glyph, meta] = started ? ['paused', `${pct(progress)} · ${points(n.cost)}`] : ['launch', points(n.cost)];
  const label = `${n.name} (${branchName(n.branch)}, niveau ${n.level}) : ${STATE_WORD[state]}, ${points(n.cost)}`;
  return { state, glyph, meta, progress: state === 'done' ? 1 : progress, label };
}

export interface DetailButton {
  label: string;
  icon: IconName;
  /** Le bouton lance (ou reprend) la recherche ; sinon il ne fait qu'indiquer l'état. */
  launches: boolean;
}

export interface DetailView {
  icon: IconName;
  name: string;
  branch: Branch;
  /** « Refroidissement · niveau 3 · Labo d’IA ». */
  where: string;
  state: TileState;
  stateLabel: string;
  description: string;
  unlocks: { icon: IconName; text: string }[];
  requires: { name: string; done: boolean; branch: string | null }[];
  /** Palier qui ouvre le niveau (absent au niveau 1). */
  tier: { open: boolean; text: string } | null;
  cost: string;
  button: DetailButton;
  /** Le bouton Arrêter accompagne la recherche en cours. */
  canStop: boolean;
  /** Raison du verrou, ou ce qu'un lancement changerait. */
  note: string;
}

/** La fiche d'un nœud, hors valeurs vivantes (liveView). */
export function detailView(s: GameState, id: string): DetailView {
  const n = node(id);
  const state = tileState(s, id);
  const r = s.research;
  const unlocks = (n.effect.unlocks ?? []).map((k) => ({ icon: KIND_INFO[k].icon, text: KIND_INFO[k].name }));
  if (n.effect.gen) unlocks.push({ icon: 'rack', text: buildingName('rack', n.effect.gen) });
  const requires = n.requires.map((rid) => ({
    name: node(rid).name,
    done: r.done.includes(rid),
    branch: node(rid).branch === n.branch ? null : branchName(node(rid).branch),
  }));
  const tierName = levelTier(n.level).name;
  const tier = n.level > 1 ? { open: levelOpen(s, n.level), text: levelOpen(s, n.level) ? `Palier ${tierName}` : `S’ouvre au palier ${tierName}` } : null;
  const started = (r.progress[id] ?? 0) > 0;
  let button: DetailButton;
  if (state === 'done') button = { label: 'Terminée', icon: 'done', launches: false };
  else if (state === 'current') button = { label: 'En cours', icon: 'running', launches: false };
  else if (state === 'available') button = { label: started ? 'Reprendre la recherche' : 'Lancer la recherche', icon: 'launch', launches: true };
  else button = { label: 'Verrouillée', icon: 'lock', launches: false };
  let note = '';
  if (state === 'locked' || state === 'tier') note = researchBlocker(s, id) ?? '';
  else if (state === 'available' && r.current) note = `« ${node(r.current).name} » se met en pause, sans rien perdre.`;
  else if (state === 'available' && projectedRate(s) <= 0) note = s.compute.total > 0 ? 'Aucun calcul ne va à la R&D : montez la part ci-dessus.' : 'Aucun rack en service : la recherche n’avancerait pas.';
  return {
    icon: RESEARCH_ICON[id],
    name: n.name,
    branch: n.branch,
    where: `${branchName(n.branch)} · niveau ${n.level} · ${tierName}`,
    state,
    stateLabel: STATE_WORD[state][0].toUpperCase() + STATE_WORD[state].slice(1),
    description: n.description,
    unlocks,
    requires,
    tier,
    cost: points(n.cost),
    button,
    canStop: state === 'current',
    note,
  };
}

export interface LiveView {
  /** « ≈ 8 min au rythme actuel », « encore 4 min », ou vide. */
  timing: string;
  /** Avancement d'un nœud entamé (non terminé), sinon null. */
  progress: number | null;
  progressText: string;
  /** Pour un niveau pas encore ouvert : où en est le palier. */
  tierProgress: string | null;
}

/** Valeurs de la fiche qui bougent à chaque image. */
export function liveView(s: GameState, id: string): LiveView {
  const n = node(id);
  const state = tileState(s, id);
  const done = s.research.progress[id] ?? 0;
  const left = remainingSeconds(s, id);
  let timing = '';
  if (state === 'current') timing = left === Infinity ? 'À l’arrêt : aucun calcul ne va à la R&D' : `encore ${duration(left)}`;
  else if (state !== 'done' && left !== Infinity) timing = `≈ ${duration(left)} au rythme actuel`;
  const started = done > 0 && state !== 'done';
  let tierProgress: string | null = null;
  if (state === 'tier') {
    const t = levelTier(n.level);
    const compute = t.computeCU ? ` · calcul ${integer(s.compute.total)} / ${integer(t.computeCU)} CU/s` : '';
    tierProgress = `réputation ${integer(s.career.reputation)} / ${integer(t.reputation)}${compute}`;
  }
  return { timing, progress: started ? progressOf(s, id) : null, progressText: started ? `${integer(done)} / ${points(n.cost)}` : '', tierProgress };
}

/** Débit affiché dans l'en-tête. */
export function rateText(s: GameState): string {
  return s.research.current ? `${decimal(s.research.ratePerS)} pt/s` : 'à l’arrêt';
}

/** Ce que la part réservée retire aux contrats (ou rien, sans étude en cours). */
export function shareNote(s: GameState): string {
  const total = s.compute.total;
  return s.research.current ? `${Math.round(total * s.research.share)} CU/s sur ${total} retirés aux contrats` : '';
}

/** Bandeau sans étude en cours. */
export const IDLE_TEXT = 'Aucune étude en cours : tout le calcul va aux contrats.';
