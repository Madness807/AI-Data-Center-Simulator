import { NETWORK, OPTICAL, rackSpec } from './balance';
import { isRackActive, type Building, type Gen } from './entities';
import { modifiers } from './progression';
import { DIRS4 } from './math';
import { activeLinks } from './network';
import { buildingById, idx, inBounds, type GameState } from './state';

/** Pas entre deux racks voisins d'un bloc : côte à côte, ou plus loin avec l'interconnexion optique. */
function steps(s: GameState): readonly (readonly [number, number])[] {
  const r = OPTICAL.reach;
  return modifiers(s).optical ? [...DIRS4, [r, 0], [-r, 0], [0, r], [0, -r]] : DIRS4;
}

const eligible = (b: Building, minGen: Gen) => isRackActive(b) && (b.gen ?? 1) >= minGen;

/** Liaisons réseau en service (rack → switch), ou null quand le réseau ne compte pas. */
type Links = ReadonlyMap<number, number> | null;

/**
 * Cherche un bloc de `size` racks contigus, en service, de génération ≥ minGen, parmi ceux
 * qui ne sont pas déjà pris. Parcours en largeur depuis chaque rack libre ; renvoie les ids
 * du premier bloc assez grand (dans l'ordre du parcours), ou null. Quand le réseau compte
 * (carrière, Labo d'IA), seuls les racks reliés à un switch en service comptent, et un bloc
 * sur un seul switch passe avant un bloc à cheval, qui entraînerait moins vite.
 */
export function findCluster(s: GameState, size: number, minGen: Gen, taken: ReadonlySet<number>): number[] | null {
  const net = activeLinks(s);
  for (const oneSwitch of net ? [true, false] : [false]) {
    for (const group of components(s, minGen, taken, net, oneSwitch)) if (group.length >= size) return group.slice(0, size).map((b) => b.id);
  }
  return null;
}

/** Plus grands blocs libres : sans compter le réseau, reliés, et reliés à un seul switch. */
export interface FreeBlocks {
  contiguous: number;
  linked: number;
  oneSwitch: number;
}

/** Les trois tailles sont égales quand le réseau ne compte pas. */
export function freeBlocks(s: GameState, minGen: Gen, taken: ReadonlySet<number> = new Set()): FreeBlocks {
  const largest = (groups: Building[][]) => groups.reduce((m, g) => Math.max(m, g.length), 0);
  const contiguous = largest(components(s, minGen, taken, null, false));
  const net = activeLinks(s);
  if (!net) return { contiguous, linked: contiguous, oneSwitch: contiguous };
  return { contiguous, linked: largest(components(s, minGen, taken, net, false)), oneSwitch: largest(components(s, minGen, taken, net, true)) };
}

/** Taille du plus grand bloc libre utilisable (pour la faisabilité affichée sur une offre). */
export function largestFreeCluster(s: GameState, minGen: Gen, taken: ReadonlySet<number> = new Set()): number {
  return freeBlocks(s, minGen, taken).linked;
}

/**
 * Composantes connexes des racks libres éligibles, chacune dans l'ordre du parcours. `net` :
 * seuls les racks reliés ; `oneSwitch` : deux voisins ne se rejoignent que sur le même switch.
 */
function components(s: GameState, minGen: Gen, taken: ReadonlySet<number>, net: Links, oneSwitch: boolean): Building[][] {
  const out: Building[][] = [];
  const byCell = new Map<number, Building>();
  for (const b of s.buildings) if (!taken.has(b.id) && eligible(b, minGen) && (!net || net.has(b.id))) byCell.set(idx(s, b.x, b.y), b);
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
        if (oneSwitch && net!.get(n.id) !== net!.get(b.id)) continue;
        seen.add(n.id);
        queue.push(n);
      }
    }
    out.push(group);
  }
  return out;
}

/** Ce qui rompt un bloc : un rack hors service ou pris, une liaison réseau perdue, un bloc coupé en deux. */
export type ClusterFault = 'rack' | 'link' | 'split';

/** Le bloc attribué tient-il encore ? null s'il tient, sinon la cause de la rupture. */
export function clusterFault(s: GameState, ids: readonly number[], minGen: Gen, taken: ReadonlySet<number>): ClusterFault | null {
  const racks = ids.map((id) => buildingById(s, id));
  if (racks.some((b) => !b || !eligible(b, minGen) || taken.has(b.id))) return 'rack';
  // Un rack qui change de switch passe toujours un tick sans liaison (network.ts) : la rupture se voit.
  const net = activeLinks(s);
  if (net && ids.some((id) => !net.has(id))) return 'link';
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
  return seen.size === ids.length ? null : 'split';
}

/** Le bloc attribué tient-il encore (racks en service, génération suffisante, reliés, contigus, libres) ? */
export function clusterIntact(s: GameState, ids: readonly number[], minGen: Gen, taken: ReadonlySet<number>): boolean {
  return clusterFault(s, ids, minGen, taken) === null;
}

/** Switchs distincts auxquels un bloc est relié (0 quand le réseau ne compte pas). */
export function clusterSwitches(s: GameState, ids: readonly number[]): number {
  const net = activeLinks(s);
  return net ? new Set(ids.map((id) => net.get(id))).size : 0;
}

/** Vitesse d'entraînement d'un bloc : pleine sur un seul switch (ou avec la Fabric), réduite à cheval. */
export function clusterSpeed(s: GameState, ids: readonly number[]): number {
  return clusterSwitches(s, ids) > 1 && !modifiers(s).fabric ? NETWORK.crossSwitch : 1;
}

/** Débit d'un bloc : la somme du calcul de ses racks (une génération récente va plus vite). */
export function clusterRate(s: GameState, ids: readonly number[]): number {
  return ids.reduce((sum, id) => {
    const b = buildingById(s, id);
    return sum + (b ? rackSpec(b).computeCU : 0);
  }, 0);
}
