import { FAILURE } from '../balance';
import { isRackActive, type Building } from '../entities';
import { modifiers, researchReserve } from '../progression';
import { rackRiskPerMinute } from './failures';
import { PREDICTIVE } from '../balance';
import { upsAutonomy } from './power';
import { rackTemp } from '../climate';
import { notify, type GameState } from '../state';

/** Seuils des alertes préventives : prévenir avant la casse, une fois par épisode. */
export const ALERTS = {
  /** °C : un rack approche du seuil de panne ; l'alerte se réarme quand il a refroidi. */
  hotC: FAILURE.thresholdC - 3,
  hotResetC: FAILURE.thresholdC - 5,
  /** Part de la capacité électrique demandée. */
  power: 0.9,
  powerReset: 0.85,
  /** Secondes de dépenses courantes (électricité, salaires) couvertes par la trésorerie. */
  cashS: 60,
  cashResetS: 120,
  /** Secondes d'une panne sans technicien affecté avant l'alerte. */
  unattendedS: 20,
  /** Un contrat tout juste accepté n'est pas jugé avant que le calcul lui soit attribué. */
  lateGraceS: 5,
  /** Secondes d'autonomie des onduleurs en coupure. */
  upsLowS: 20,
  /** Les alertes se calculent une fois par seconde de jeu. */
  everyTicks: 10,
};

export function updateAlerts(s: GameState): void {
  if (s.tick % ALERTS.everyTicks !== 0) return;
  hotRacks(s);
  power(s);
  lateJobs(s);
  cash(s);
  unattended(s);
  upsLow(s);
  predictive(s);
}

/** Maintenance prédictive (recherche) : un rack dont le risque dépasse le seuil est signalé avant la casse. */
function predictive(s: GameState): void {
  if (!modifiers(s).predictive) return;
  const known = new Set(s.alerts.wornRacks);
  const next: number[] = [];
  for (const b of s.buildings) {
    if (!isRackActive(b)) continue;
    const risk = rackRiskPerMinute(s, b);
    // Réarmement sous la moitié du seuil (après un entretien, typiquement).
    if (known.has(b.id) ? risk >= PREDICTIVE.warnPerMin / 2 : risk >= PREDICTIVE.warnPerMin) {
      next.push(b.id);
      if (!known.has(b.id)) {
        notify(s, 'warning', `Rack ${b.x},${b.y} : panne probable (${Math.round(risk * 100)} %/min, usure ${Math.round(b.wear ?? 0)} %) — entretien conseillé`, { cell: b, code: 'wearRisk' });
      }
    }
  }
  s.alerts.wornRacks = next;
}

/** Pendant une coupure, quand les batteries tiennent encore moins de 20 s sans groupe pour les relayer. */
function upsLow(s: GameState): void {
  if (s.power.grid) {
    s.alerts.upsLow = false;
    return;
  }
  if (s.alerts.upsLow || s.power.upsKW <= 0) return;
  const left = upsAutonomy(s);
  if (left === null || left > ALERTS.upsLowS) return;
  s.alerts.upsLow = true;
  notify(s, 'warning', `Batteries des onduleurs : environ ${Math.max(1, Math.round(left))} s d’autonomie`, { code: 'upsLow' });
}

const tempOf = (s: GameState, b: Building) => rackTemp(s, b);
const where = (b: Building) => `${b.x},${b.y}`;

function hotRacks(s: GameState): void {
  const known = new Set(s.alerts.hotRacks);
  const still: number[] = [];
  const fresh: Building[] = [];
  for (const b of s.buildings) {
    if (!isRackActive(b)) continue;
    const t = tempOf(s, b);
    if (known.has(b.id) ? t >= ALERTS.hotResetC : t >= ALERTS.hotC) {
      still.push(b.id);
      if (!known.has(b.id)) fresh.push(b);
    }
  }
  s.alerts.hotRacks = still;
  if (!fresh.length) return;
  // Plusieurs racks qui chauffent ensemble : une seule alerte, centrée sur le plus chaud.
  const hottest = fresh.reduce((m, b) => (tempOf(s, b) > tempOf(s, m) ? b : m));
  const t = Math.round(tempOf(s, hottest));
  const message =
    fresh.length === 1
      ? `Rack ${where(hottest)} à ${t} °C : pannes en hausse au-delà de ${FAILURE.thresholdC} °C`
      : `${fresh.length} racks au-dessus de ${ALERTS.hotC} °C (jusqu'à ${t} °C) : ajoutez du refroidissement`;
  notify(s, 'warning', message, { cell: hottest, code: 'overheat' });
}

function power(s: GameState): void {
  const { demandKW, capacityKW } = s.power;
  if (capacityKW <= 0) return;
  const ratio = demandKW / capacityKW;
  if (!s.alerts.power && ratio >= ALERTS.power) {
    s.alerts.power = true;
    notify(s, 'warning', `Énergie à ${Math.round(ratio * 100)} % de la capacité : prévoyez un PDU`, { code: 'powerHigh' });
  } else if (s.alerts.power && ratio < ALERTS.powerReset) {
    s.alerts.power = false;
  }
}

/**
 * Fin prévue de chaque contrat en cours si le calcul disponible ne change plus : même règle
 * que updateJobs (échéance la plus proche d'abord, plafond au débit demandé). Infinity si
 * le contrat n'avancerait plus.
 */
export function predictCompletion(s: GameState): Map<number, number> {
  const ends = new Map<number, number>();
  // Entraînement : au débit de son bloc ; sans bloc, il n'avance pas.
  for (const j of s.jobs) {
    if (j.status !== 'active' || j.kind !== 'training') continue;
    ends.set(j.id, j.allocated > 0 ? s.time + (j.work - j.progress) / j.allocated : Infinity);
  }
  let left = s.jobs
    .filter((j) => j.status === 'active' && j.kind !== 'training')
    .sort((a, b) => a.deadline - b.deadline)
    .map((j) => ({ id: j.id, rate: j.rateCU, work: j.work - j.progress }));
  let t = s.time;
  // Chaque tour termine au moins un contrat ; la garde couvre les arrondis.
  for (let guard = 0; left.length && guard <= s.jobs.length; guard++) {
    let pool = s.compute.total - researchReserve(s) - s.jobs.reduce((sum, j) => sum + (j.status === 'active' && j.kind === 'training' ? j.allocated : 0), 0);
    const alloc = left.map((j) => {
      const a = Math.min(pool, j.rate);
      pool -= a;
      return a;
    });
    let step = Infinity;
    left.forEach((j, i) => {
      if (alloc[i] > 0) step = Math.min(step, j.work / alloc[i]);
    });
    if (!Number.isFinite(step)) break;
    t += step;
    left.forEach((j, i) => (j.work -= alloc[i] * step));
    left = left.filter((j) => {
      if (j.work > 1e-6) return true;
      ends.set(j.id, t);
      return false;
    });
  }
  for (const j of left) ends.set(j.id, Infinity);
  return ends;
}

function lateJobs(s: GameState): void {
  const known = new Set(s.alerts.lateJobs);
  const ends = predictCompletion(s);
  const next: number[] = [];
  for (const j of s.jobs) {
    if (j.status !== 'active') continue;
    if (known.has(j.id)) {
      next.push(j.id);
      continue;
    }
    if (s.time - (j.deadline - j.deadlineInS) < ALERTS.lateGraceS) continue;
    if ((ends.get(j.id) ?? Infinity) <= j.deadline) continue;
    next.push(j.id);
    const left = Math.max(0, Math.ceil(j.deadline - s.time));
    notify(s, 'warning', `Retard probable : ${j.name} (échéance dans ${left} s)`, { code: 'lateRisk' });
  }
  s.alerts.lateJobs = next;
}

function cash(s: GameState): void {
  const burn = s.economy.electricityPerS + s.economy.salariesPerS;
  if (burn <= 0) return;
  const covered = s.money / burn;
  // Dans le rouge, le compte à rebours de faillite prend le relais.
  if (!s.alerts.cash && s.money >= 0 && covered < ALERTS.cashS) {
    s.alerts.cash = true;
    notify(s, 'warning', `Trésorerie basse : ${Math.floor(covered)} s de dépenses courantes`, { code: 'cashLow' });
  } else if (s.alerts.cash && covered > ALERTS.cashResetS) {
    s.alerts.cash = false;
  }
}

function unattended(s: GameState): void {
  const prev = new Map(s.alerts.unattended.map((u) => [u.id, u]));
  const next: typeof s.alerts.unattended = [];
  const fresh: Building[] = [];
  for (const b of s.buildings) {
    if (b.kind !== 'rack' || b.status !== 'failed') continue;
    if (s.techs.some((t) => t.tasks.some((k) => k.type === 'repair' && k.target === b.id))) continue;
    const u = prev.get(b.id) ?? { id: b.id, since: s.time, notified: false };
    if (!u.notified && s.time - u.since >= ALERTS.unattendedS) {
      u.notified = true;
      fresh.push(b);
    }
    next.push(u);
  }
  s.alerts.unattended = next;
  if (!fresh.length) return;
  const message =
    fresh.length === 1
      ? `Rack ${where(fresh[0])} en panne depuis ${ALERTS.unattendedS} s : aucun technicien envoyé`
      : `${fresh.length} racks en panne sans technicien : clic droit pour les faire réparer`;
  notify(s, 'warning', message, { cell: fresh[0], code: 'unattended' });
}
