import { CRAC, OUTAGE, rackSpec } from '../sim/balance';
import { isRackActive, type Building } from '../sim/entities';
import type { GameState } from '../sim/state';
import { busyRackIds, cracCoolingKW, cracHeatLoad } from '../sim/stats';
import { rackRiskPerMinute } from '../sim/systems/failures';
import { inCoolingRange } from '../sim/systems/heat';
import { hotAisleCells, liquidCapture } from '../sim/climate';
import { plannedGeneratorKW, plannedUpsKW } from '../sim/systems/power';
import { statusColor, type StatusName } from './assets/status-colors';

/** Calques posés sur le sol de la salle ; H les fait défiler. */
export type OverlayMode = 'heat' | 'power' | 'cooling' | 'occupancy' | 'risk';
export const OVERLAY_MODES: readonly OverlayMode[] = ['heat', 'power', 'cooling', 'occupancy', 'risk'];

export type Rgb = readonly [number, number, number];

/** Paliers de la rampe de couleurs de la chaleur (°C → RGB). */
export const HEAT_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [22, 40, 80, 200],
  [30, 40, 190, 170],
  [40, 230, 210, 50],
  [55, 235, 70, 40],
  [75, 255, 230, 230],
];

export function tempToRgb(t: number): [number, number, number] {
  const stops = HEAT_STOPS;
  if (t <= stops[0][0]) return [stops[0][1], stops[0][2], stops[0][3]];
  for (let i = 1; i < stops.length; i++) {
    const [t1, r1, g1, b1] = stops[i];
    if (t <= t1) {
      const [t0, r0, g0, b0] = stops[i - 1];
      const f = (t - t0) / (t1 - t0);
      return [r0 + (r1 - r0) * f, g0 + (g1 - g0) * f, b0 + (b1 - b0) * f];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

const hex = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const status = (name: StatusName): Rgb => hex(statusColor(name));
const mix = (a: Rgb, b: Rgb, f: number): Rgb => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

/** Froid disponible : la couleur d'accent du HUD, distincte des états des racks. */
const COOL: Rgb = [79, 209, 255];
/** Allée chaude (air soufflé par les racks) et refroidissement liquide. */
const HOT_AISLE: Rgb = [255, 138, 61];
const LIQUID: Rgb = [150, 120, 255];
/** Racks pris par un entraînement (bloc dédié). */
const TRAINING_RGB: Rgb = [255, 110, 200];
/** Sol assombri sous les calques par équipement : les cases colorées ressortent. */
const DIM = [8, 12, 18, 130] as const;

/**
 * Risque de panne par minute : vert (ou bleu en mode daltonien) au frais, orange vers
 * 3 %/min, rouge à partir de 15 %/min. Mêmes couleurs que les états des racks.
 */
export const RISK_TICKS = [0, 0.03, 0.15] as const;

export function riskToRgb(risk: number): Rgb {
  const [, mid, high] = RISK_TICKS;
  if (risk <= mid) return mix(status('busy'), status('repairing'), Math.max(0, risk) / mid);
  return mix(status('repairing'), status('failed'), Math.min(1, (risk - mid) / (high - mid)));
}

/** Marge d'un CRAC : part de sa puissance de froid encore libre (négative s'il est débordé). */
export function cracHeadroom(s: GameState, crac: Building): number {
  const capacity = cracCoolingKW(s);
  return (capacity - cracHeatLoad(s, crac).heatKW) / capacity;
}

/** Couleur d'une marge de froid : confortable, à la limite (3 racks pour un CRAC), débordée. */
export function headroomToRgb(h: number): Rgb {
  if (h < -1e-9) return status('failed');
  if (h < 1 / 3) return status('repairing');
  return COOL;
}

export interface LegendItem {
  label: string;
  rgb: Rgb;
}

/** Légende de chaque calque, construite avec les couleurs réellement utilisées. */
export function overlayLegend(mode: Exclude<OverlayMode, 'heat'>): { title: string; items: LegendItem[] } {
  switch (mode) {
    case 'power':
      return {
        title: 'Énergie',
        items: [
          { label: 'Alimenté', rgb: status('busy') },
          { label: 'Sans secours', rgb: status('repairing') },
          { label: 'Délesté', rgb: status('shed') },
          { label: 'Secours', rgb: COOL },
        ],
      };
    case 'cooling':
      return {
        title: 'Froid · portée des CRAC',
        items: [
          { label: 'Marge', rgb: COOL },
          { label: 'À la limite', rgb: status('repairing') },
          { label: 'Débordé, sans froid', rgb: status('failed') },
          { label: 'Allée chaude', rgb: HOT_AISLE },
          { label: 'Liquide', rgb: LIQUID },
        ],
      };
    case 'occupancy':
      return {
        title: 'Activité des racks',
        items: [
          { label: 'Calcule', rgb: status('busy') },
          { label: 'Entraînement', rgb: TRAINING_RGB },
          { label: 'Inactif', rgb: status('idle') },
          { label: 'Délesté', rgb: status('shed') },
          { label: 'En panne', rgb: status('failed') },
        ],
      };
    case 'risk':
      return {
        title: 'Risque de panne par minute',
        items: [
          { label: '< 1 %', rgb: riskToRgb(0) },
          { label: `${RISK_TICKS[1] * 100} %`, rgb: riskToRgb(RISK_TICKS[1]) },
          { label: `≥ ${RISK_TICKS[2] * 100} %`, rgb: riskToRgb(RISK_TICKS[2]) },
        ],
      };
  }
}

/**
 * Remplit `out` (RGBA, w×h, ligne y = 0 en premier) pour le calque demandé. Fonction pure :
 * le rendu ne fait que copier le résultat dans une texture.
 */
export function paintOverlay(mode: OverlayMode, s: GameState, out: Uint8Array): void {
  const put = (i: number, rgb: Rgb, a: number) => {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = a;
  };
  if (mode === 'heat') {
    for (let i = 0; i < s.temp.length; i++) {
      const t = s.temp[i];
      // Discret à l'ambiant, opaque dès que ça chauffe : le sol reste lisible.
      put(i, tempToRgb(t), 90 + 165 * Math.min(Math.max((t - HEAT_STOPS[0][0]) / 12, 0), 1));
    }
    return;
  }
  for (let i = 0; i < s.temp.length; i++) put(i, [DIM[0], DIM[1], DIM[2]], DIM[3]);
  const cell = (b: Building) => b.y * s.w + b.x;

  if (mode === 'power') {
    const load = s.power.capacityKW > 0 ? s.power.demandKW / s.power.capacityKW : 1;
    const covered = backupCoverage(s);
    for (const b of s.buildings) {
      const i = cell(b);
      if (b.status === 'construction') put(i, status('idle'), 140);
      else if (b.status === 'failed' || b.status === 'repairing') put(i, status('failed'), 235);
      else if (b.kind === 'pdu') put(i, load >= 1 ? status('shed') : load >= 0.85 ? status('repairing') : status('busy'), 235);
      else if (b.kind === 'ups' || b.kind === 'generator') put(i, COOL, 235);
      else if (!b.powered) put(i, status('shed'), 235);
      // Alimenté mais qui tomberait si le réseau coupait : orange.
      else put(i, covered && !covered.has(b.id) ? status('repairing') : status('busy'), 235);
    }
    return;
  }

  if (mode === 'occupancy') {
    const busy = busyRackIds(s);
    const training = new Set(s.jobs.flatMap((j) => (j.status === 'active' && j.assigned ? j.assigned : [])));
    for (const b of s.buildings) {
      if (b.kind !== 'rack') continue;
      if (training.has(b.id) && isRackActive(b)) {
        put(cell(b), TRAINING_RGB, 235);
        continue;
      }
      const name: StatusName =
        b.status === 'failed' ? 'failed' : b.status === 'repairing' ? 'repairing' : b.status === 'construction' ? 'idle' : !b.powered ? 'shed' : busy.has(b.id) ? 'busy' : 'idle';
      put(cell(b), status(name), b.status === 'construction' ? 120 : 235);
    }
    return;
  }

  if (mode === 'risk') {
    for (const b of s.buildings) {
      if (b.kind !== 'rack') continue;
      if (isRackActive(b)) put(cell(b), riskToRgb(rackRiskPerMinute(s, b)), 235);
      else put(cell(b), status(b.status === 'failed' ? 'failed' : 'idle'), 120);
    }
    return;
  }

  // Refroidissement : chaque case prend la meilleure marge parmi les CRAC qui la couvrent.
  const cracs = s.buildings.filter((b) => b.kind === 'crac' && b.status === 'ok' && b.powered);
  const best = new Float32Array(s.temp.length).fill(-Infinity);
  for (const c of cracs) {
    const h = cracHeadroom(s, c);
    for (let y = Math.max(0, c.y - CRAC.radius); y <= Math.min(s.h - 1, c.y + CRAC.radius); y++) {
      for (let x = Math.max(0, c.x - CRAC.radius); x <= Math.min(s.w - 1, c.x + CRAC.radius); x++) {
        if (inCoolingRange(c.x, c.y, x, y)) best[y * s.w + x] = Math.max(best[y * s.w + x], h);
      }
    }
  }
  for (let i = 0; i < best.length; i++) if (best[i] > -Infinity) put(i, headroomToRgb(best[i]), 85);
  // Carrière : les allées chaudes (là où les racks soufflent) et les racks refroidis par liquide.
  if (s.rules.aisles) for (const i of hotAisleCells(s)) put(i, HOT_AISLE, 120);
  for (const c of cracs) put(cell(c), headroomToRgb(cracHeadroom(s, c)), 240);
  const liquid = liquidCapture(s);
  for (const b of s.buildings) {
    if (b.kind === 'cdu' && b.status === 'ok') put(cell(b), LIQUID, 240);
    if (!isRackActive(b)) continue;
    const h = best[cell(b)];
    put(cell(b), liquid.has(b.id) ? LIQUID : h === -Infinity ? status('failed') : headroomToRgb(h), 235);
  }
}

/**
 * Équipements qui tiendraient une coupure : servis dans l'ordre (CRAC puis racks) avec la
 * puissance des groupes et des onduleurs construits. null quand les coupures ne concernent
 * pas la partie (partie rapide, palier trop bas) : le calque n'affiche alors pas ce critère.
 */
export function backupCoverage(s: GameState): Set<number> | null {
  if (!s.rules.incidents || s.career.tier < OUTAGE.minTier) return null;
  let left = plannedGeneratorKW(s) + plannedUpsKW(s);
  const out = new Set<number>();
  const loads = s.buildings
    .filter((b) => b.status === 'ok' && b.powered && (b.kind === 'crac' || b.kind === 'rack'))
    .sort((a, b) => (a.kind === b.kind ? a.id - b.id : a.kind === 'crac' ? -1 : 1));
  for (const b of loads) {
    const kw = b.kind === 'crac' ? CRAC.powerKW : rackSpec(b).powerKW;
    if (left < kw) break;
    left -= kw;
    out.add(b.id);
  }
  return out;
}

/** Charge électrique en part de la capacité, pour le titre du calque énergie. */
export function powerLoadLabel(s: GameState): string {
  const pdus = s.buildings.filter((b) => b.kind === 'pdu' && b.status === 'ok').length;
  const base = `${Math.round(s.power.demandKW)} / ${Math.round(s.power.capacityKW)} kW demandés · ${pdus} PDU`;
  if (!s.rules.incidents || s.career.tier < OUTAGE.minTier) return base;
  return `${base} · secours ${plannedGeneratorKW(s) + plannedUpsKW(s)} kW`;
}
