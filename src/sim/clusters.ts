import { OPTICAL, rackSpec } from './balance';
import { isRackActive, type Building, type Gen } from './entities';
import { modifiers } from './progression';
import { DIRS4 } from './math';
import { buildingById, idx, inBounds, type GameState } from './state';

/** Pas entre deux racks voisins d'un bloc : côte à côte, ou plus loin avec l'interconnexion optique. */
function steps(s: GameState): readonly (readonly [number, number])[] {
  const r = OPTICAL.reach;
  return modifiers(s).optical ? [...DIRS4, [r, 0], [-r, 0], [0, r], [0, -r]] : DIRS4;
}

const eligible = (b: Building, minGen: Gen) => isRackActive(b) && (b.gen ?? 1) >= minGen;

/**
 * Cherche un bloc de `size` racks contigus, en service, de génération ≥ minGen, parmi ceux
 * qui ne sont pas déjà pris. Parcours en largeur depuis chaque rack libre ; renvoie les ids
 * du premier bloc assez grand (dans l'ordre du parcours), ou null.
 */
export function findCluster(s: GameState, size: number, minGen: Gen, taken: ReadonlySet<number>): number[] | null {
  for (const group of components(s, minGen, taken)) if (group.length >= size) return group.slice(0, size).map((b) => b.id);
  return null;
}

/** Taille du plus grand bloc libre (pour la faisabilité affichée sur une offre). */
export function largestFreeCluster(s: GameState, minGen: Gen, taken: ReadonlySet<number> = new Set()): number {
  return components(s, minGen, taken).reduce((m, g) => Math.max(m, g.length), 0);
}

/** Composantes connexes des racks libres éligibles, chacune dans l'ordre du parcours. */
function components(s: GameState, minGen: Gen, taken: ReadonlySet<number>): Building[][] {
  const out: Building[][] = [];
  const byCell = new Map<number, Building>();
  for (const b of s.buildings) if (!taken.has(b.id) && eligible(b, minGen)) byCell.set(idx(s, b.x, b.y), b);
  const seen = new Set<number>();
  const moves = steps(s);
  for (const start of byCell.values()) {
    if (seen.has(start.id)) continue;
    const group: Building[] = [];
    const queue = [start];
    seen.add(start.id);
    while (queue.length) {
      const b = queue.shift()!;
      group.push(b);
      for (const [dx, dy] of moves) {
        const x = b.x + dx;
        const y = b.y + dy;
        if (!inBounds(s, x, y)) continue;
        const n = byCell.get(idx(s, x, y));
        if (!n || seen.has(n.id)) continue;
        seen.add(n.id);
        queue.push(n);
      }
    }
    out.push(group);
  }
  return out;
}

/** Le bloc attribué tient-il encore (racks en service, génération suffisante, contigus, libres) ? */
export function clusterIntact(s: GameState, ids: readonly number[], minGen: Gen, taken: ReadonlySet<number>): boolean {
  const racks = ids.map((id) => buildingById(s, id));
  if (racks.some((b) => !b || !eligible(b, minGen) || taken.has(b.id))) return false;
  // Toujours d'un seul tenant : chaque rack rejoint les autres par des voisins du bloc.
  const set = new Set(ids);
  const moves = steps(s);
  const seen = new Set([ids[0]]);
  const queue = [racks[0]!];
  while (queue.length) {
    const b = queue.shift()!;
    for (const [dx, dy] of moves) {
      const n = racks.find((r) => r!.x === b.x + dx && r!.y === b.y + dy);
      if (n && set.has(n.id) && !seen.has(n.id)) {
        seen.add(n.id);
        queue.push(n);
      }
    }
  }
  return seen.size === ids.length;
}

/** Débit d'un bloc : la somme du calcul de ses racks (une génération récente va plus vite). */
export function clusterRate(s: GameState, ids: readonly number[]): number {
  return ids.reduce((sum, id) => {
    const b = buildingById(s, id);
    return sum + (b ? rackSpec(b).computeCU : 0);
  }, 0);
}
