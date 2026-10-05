import { CDU, CRAC, HEATWAVE, rackSpec, WEATHER } from './balance';
import { FACING_STEP, isRackActive, type Building, type Cell } from './entities';
import { modifiers } from './progression';
import { idx, inBounds, type GameState } from './state';

/** La météo compte-t-elle (carrière, à partir du palier WEATHER.minTier) ? */
export function weatherActive(s: GameState): boolean {
  return s.rules.weather && s.career.tier >= WEATHER.minTier;
}

/** Température extérieure (°C), ou null quand la météo ne joue pas (partie rapide, palier trop bas). */
export function outsideTemp(s: GameState): number | null {
  if (!weatherActive(s)) return null;
  const wave = s.incidents.heatwaveEndsAt !== null ? HEATWAVE.boostC : 0;
  return WEATHER.meanC + WEATHER.swingC * Math.sin((2 * Math.PI * s.time) / WEATHER.periodS) + wave;
}

/** Efficacité des CRAC selon la température extérieure : 1 sans météo. */
export function cracWeatherFactor(s: GameState): number {
  const t = outsideTemp(s);
  if (t === null) return 1;
  return Math.min(WEATHER.cracMax, Math.max(WEATHER.cracMin, 1 + (WEATHER.meanC - t) * WEATHER.cracPerC));
}

/** Consommation d'un CRAC : le free cooling (recherche) la réduit quand il fait frais dehors. */
export function cracPowerKW(s: GameState): number {
  const t = outsideTemp(s);
  return modifiers(s).freeCooling && t !== null && t < WEATHER.freeCoolingBelowC ? CRAC.powerKW * WEATHER.freeCoolingPowerMult : CRAC.powerKW;
}

const step = (b: Building) => FACING_STEP[b.facing ?? 0];

/** Case libre de la salle, où l'air circule (ni mur, ni équipement). */
function openCell(s: GameState, c: Cell): boolean {
  return inBounds(s, c.x, c.y) && s.occupant[idx(s, c.x, c.y)] < 0;
}

export function frontCell(b: Building): Cell {
  const [dx, dy] = step(b);
  return { x: b.x + dx, y: b.y + dy };
}

export function backCell(b: Building): Cell {
  const [dx, dy] = step(b);
  return { x: b.x - dx, y: b.y - dy };
}

/**
 * Case dont le rack aspire l'air : devant lui quand l'orientation compte (carrière) et que
 * la case est libre ; sinon la sienne.
 */
export function intakeIndex(s: GameState, b: Building): number {
  if (s.rules.aisles) {
    const f = frontCell(b);
    if (openCell(s, f)) return idx(s, f.x, f.y);
  }
  return idx(s, b.x, b.y);
}

/** Température de l'air aspiré par un rack : c'est elle qui fixe son risque de panne. */
export function rackTemp(s: GameState, b: Building): number {
  return s.temp[intakeIndex(s, b)];
}

/** Case où le rack souffle l'essentiel de sa chaleur, ou null s'il la garde (mur, équipement, partie rapide). */
export function exhaustIndex(s: GameState, b: Building): number | null {
  if (!s.rules.aisles) return null;
  const c = backCell(b);
  return openCell(s, c) ? idx(s, c.x, c.y) : null;
}

/** Cases d'allée chaude : là où au moins un rack en service souffle. */
export function hotAisleCells(s: GameState): Set<number> {
  const out = new Set<number>();
  for (const b of s.buildings) {
    if (!isRackActive(b)) continue;
    const ex = exhaustIndex(s, b);
    if (ex !== null) out.add(ex);
  }
  return out;
}

/** Le rack aspire-t-il l'air qu'un autre rack souffle ? (mauvaise orientation) */
export function breathesExhaust(s: GameState, b: Building, hot = hotAisleCells(s)): boolean {
  if (!s.rules.aisles) return false;
  const intake = intakeIndex(s, b);
  return intake !== idx(s, b.x, b.y) && hot.has(intake);
}

/**
 * Chaleur captée par les CDU, rack par rack (kW). Chaque CDU en service capte une part de
 * la chaleur des racks à sa portée, jusqu'à sa capacité ; les racks les plus anciens d'abord.
 */
export function liquidCapture(s: GameState): Map<number, number> {
  return liquidLoads(s).byRack;
}

/** Chaleur captée par rack et par CDU (kW). */
export function liquidLoads(s: GameState): { byRack: Map<number, number>; byCdu: Map<number, number> } {
  const out = new Map<number, number>();
  const byCdu = new Map<number, number>();
  const cdus = s.buildings.filter((b) => b.kind === 'cdu' && b.status === 'ok' && b.powered).map((b) => ({ b, left: CDU.capacityKW }));
  if (!cdus.length) return { byRack: out, byCdu };
  for (const r of s.buildings) {
    if (!isRackActive(r)) continue;
    let want = rackSpec(r).heatKW * CDU.captured;
    for (const c of cdus) {
      if (want <= 0) break;
      if (c.left <= 0 || (r.x - c.b.x) ** 2 + (r.y - c.b.y) ** 2 > CDU.radius * CDU.radius) continue;
      const take = Math.min(want, c.left);
      c.left -= take;
      want -= take;
      out.set(r.id, (out.get(r.id) ?? 0) + take);
      byCdu.set(c.b.id, (byCdu.get(c.b.id) ?? 0) + take);
    }
  }
  return { byRack: out, byCdu };
}
