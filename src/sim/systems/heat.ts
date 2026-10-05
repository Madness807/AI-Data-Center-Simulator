import { AISLE, CRAC, DT, HEAT, rackSpec, UPS } from '../balance';
import { cracWeatherFactor, exhaustIndex, hotAisleCells, liquidCapture, outsideTemp } from '../climate';
import type { Building } from '../entities';
import { modifiers } from '../progression';
import { idx, type GameState } from '../state';

// Diffusion explicite sur 4 voisins : instable au-delà de k·dt = 0.25.
if (HEAT.diffusion * DT > 0.2) {
  throw new Error(`HEAT.diffusion × DT = ${HEAT.diffusion * DT} > 0.2 : diffusion instable`);
}

/**
 * Sources et puits dans l'ordre des bâtiments, puis diffusion. En carrière : les CDU captent
 * une part de la chaleur des racks (rejetée dehors), un rack souffle l'essentiel de la sienne
 * sur sa case arrière, la météo module les CRAC, et le confinement les renforce près d'une
 * allée chaude. En partie rapide, rien de tout cela : le calcul est celui de la bêta.
 */
export function updateHeat(s: GameState, dt: number): void {
  const { w, h, temp } = s;
  const C = HEAT.cellCapacity;
  const m = modifiers(s);
  const factor = cracWeatherFactor(s);
  const coolingKW = m.cracCoolingKW * factor;
  const capture = liquidCapture(s);
  const hot = m.containment ? hotAisleCells(s) : null;
  let liquidKW = 0;

  for (const b of s.buildings) {
    if (!b.powered) continue;
    if (b.kind === 'rack') {
      const captured = capture.get(b.id) ?? 0;
      liquidKW += captured;
      const air = ((rackSpec(b).heatKW - captured) * dt) / C;
      const own = idx(s, b.x, b.y);
      const ex = exhaustIndex(s, b);
      if (ex === null) temp[own] += air;
      else {
        temp[ex] += air * AISLE.exhaustShare;
        temp[own] += air * (1 - AISLE.exhaustShare);
      }
    } else if (b.kind === 'ups') temp[idx(s, b.x, b.y)] += (UPS.heatKW * dt) / C;
    else if (b.kind === 'crac') {
      const boost = hot && nearHotAisle(b, hot, w) ? AISLE.containmentBoost : 1;
      cool(s, b.x, b.y, coolingKW * boost * dt);
    }
  }
  s.cooling = { liquidKW, outsideC: outsideTemp(s), cracFactor: factor };

  // Bords isolants : on n'échange qu'avec les voisines dans la grille.
  const next = temp.slice();
  const k = HEAT.diffusion * dt;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = temp[i];
      let flux = 0;
      if (x > 0) flux += temp[i - 1] - t;
      if (x < w - 1) flux += temp[i + 1] - t;
      if (y > 0) flux += temp[i - w] - t;
      if (y < h - 1) flux += temp[i + w] - t;
      next[i] = t + k * flux;
    }
  }

  const loss = HEAT.ambientLoss * dt;
  for (let i = 0; i < next.length; i++) {
    temp[i] = next[i] + (HEAT.ambient - next[i]) * loss;
  }
}

/** Une case d'allée chaude est-elle à portée de ce CRAC ? */
function nearHotAisle(crac: Building, hot: Set<number>, w: number): boolean {
  for (const i of hot) if (inCoolingRange(crac.x, crac.y, i % w, Math.floor(i / w))) return true;
  return false;
}

/** Vrai si la case (x, y) est dans la portée du CRAC posé en (cx, cy) (disque de rayon CRAC.radius). */
export function inCoolingRange(cx: number, cy: number, x: number, y: number): boolean {
  return (x - cx) ** 2 + (y - cy) ** 2 <= CRAC.radius * CRAC.radius;
}

/**
 * Retire au plus `energyKJ` des cases dans le rayon, en proportion de leur
 * excès au-dessus de la cible, sans jamais descendre sous la cible.
 */
function cool(s: GameState, cx: number, cy: number, energyKJ: number): void {
  const r = CRAC.radius;
  const cells: number[] = [];
  let totalExcess = 0;
  for (let y = Math.max(0, cy - r); y <= Math.min(s.h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(s.w - 1, cx + r); x++) {
      if (!inCoolingRange(cx, cy, x, y)) continue;
      const i = idx(s, x, y);
      const excess = s.temp[i] - HEAT.cracTarget;
      if (excess <= 0) continue;
      cells.push(i);
      totalExcess += excess;
    }
  }
  if (totalExcess === 0) return;
  const C = HEAT.cellCapacity;
  for (const i of cells) {
    const excess = s.temp[i] - HEAT.cracTarget;
    const removed = Math.min((energyKJ * excess) / totalExcess, excess * C);
    s.temp[i] -= removed / C;
  }
}
