import { CRAC, DT, HEAT, RACK, UPS } from '../balance';
import { modifiers } from '../progression';
import { idx, type GameState } from '../state';

// Diffusion explicite sur 4 voisins : instable au-delà de k·dt = 0.25.
if (HEAT.diffusion * DT > 0.2) {
  throw new Error(`HEAT.diffusion × DT = ${HEAT.diffusion * DT} > 0.2 : diffusion instable`);
}

export function updateHeat(s: GameState, dt: number): void {
  const { w, h, temp } = s;
  const C = HEAT.cellCapacity;
  const coolingKW = modifiers(s).cracCoolingKW;

  for (const b of s.buildings) {
    if (!b.powered) continue;
    if (b.kind === 'rack') temp[idx(s, b.x, b.y)] += (RACK.heatKW * dt) / C;
    else if (b.kind === 'ups') temp[idx(s, b.x, b.y)] += (UPS.heatKW * dt) / C;
    else if (b.kind === 'crac') cool(s, b.x, b.y, coolingKW * dt);
  }

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
