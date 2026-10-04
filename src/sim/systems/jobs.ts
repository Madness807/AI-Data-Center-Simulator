import { JOBS, RACK, rackSpec, SLA, TRAINING } from '../balance';
import { clusterIntact, clusterRate, findCluster } from '../clusters';
import { isRackActive, type Job } from '../entities';
import { nextRandom } from '../rng';
import { earn, spend } from '../ledger';
import { advanceResearch, deliveryReputation, gainReputation, LATE_REPUTATION, modifiers, researchReserve, TIERS } from '../progression';
import { notify, type GameState } from '../state';

const KINDS = ['Entraînement LLM', 'Fine-tuning', 'Inférence batch', 'Rendu vidéo IA', 'Repliement de protéines', 'Prévision météo'];
const CLIENTS = ['Lumen Labs', 'Orbital ML', 'Nébuleuse IA', 'Kappa Research', 'Helix Bio', 'Quanta Finance', 'Atelier Vision', 'Synapse Studio'];

/**
 * Allocation du calcul, dans l'ordre : chaque entraînement occupe un bloc de racks contigus
 * qui lui est dédié ; puis la recherche prend sa part ; puis l'inférence se partage le reste
 * (pool global, échéance la plus proche d'abord, plafond au débit demandé).
 */
export function updateJobs(s: GameState, dt: number): void {
  let total = 0;
  for (const b of s.buildings) if (isRackActive(b)) total += rackSpec(b).computeCU;

  s.compute.total = total;
  const active = s.jobs.filter((j) => j.status === 'active').sort((a, b) => a.deadline - b.deadline);
  const trainingCU = allocateTraining(s, active, dt);
  let research = Math.min(researchReserve(s), total - trainingCU);
  let pool = total - trainingCU - research;
  for (const j of active) {
    if (j.kind === 'training') continue;
    const alloc = Math.min(pool, j.rateCU, (j.work - j.progress) / dt);
    j.allocated = alloc;
    j.progress += alloc * dt;
    pool -= alloc;
    // SLA : le temps passé sous le débit promis (hors dernier tick, où il reste moins à faire).
    if (j.sla && alloc < j.rateCU - 1e-6 && j.progress < j.work - 1e-6) j.shortS = (j.shortS ?? 0) + dt;
  }
  if (research > 0 && modifiers(s).opportunistic) {
    research += pool;
    pool = 0;
  }
  s.compute = { total, used: total - pool };
  if (s.rules.progression) advanceResearch(s, research, dt);

  const finished = new Set<Job>();
  for (const j of active) {
    if (j.progress >= j.work - 1e-6) {
      const breached = j.sla && (j.shortS ?? 0) > SLA.tolerance * (s.time - (j.deadline - j.deadlineInS));
      earn(s, breached ? j.payment - j.penalty : j.payment);
      s.economy.jobsDone++;
      if (s.rules.progression) gainReputation(s, breached ? 0 : deliveryReputation(j, s));
      if (breached) notify(s, 'warning', `SLA non respecté : ${j.name} (paiement −${fmt(j.penalty)})`, { code: 'slaBreach' });
      else notify(s, 'success', `Contrat livré : ${j.name} (+${fmt(j.payment)})`, { code: 'delivered' });
      finished.add(j);
    } else if (s.time >= j.deadline) {
      spend(s, 'penalties', j.penalty);
      s.economy.jobsFailed++;
      if (s.rules.progression) gainReputation(s, LATE_REPUTATION);
      notify(s, 'warning', `Délai dépassé : ${j.name} (−${fmt(j.penalty)})`, { code: 'late' });
      finished.add(j);
    }
  }
  for (const j of s.jobs) {
    if (j.status === 'offer' && s.time >= j.expiresAt) finished.add(j);
  }
  if (finished.size) s.jobs = s.jobs.filter((j) => !finished.has(j));

  if (s.time >= s.nextOfferAt) {
    if (s.jobs.filter((j) => j.status === 'offer').length < JOBS.maxOffers) {
      s.jobs.push(generateOffer(s));
      notify(s, 'info', 'Nouvelle offre de contrat', { code: 'offer' });
    }
    s.nextOfferAt = s.time + lerp(JOBS.offerInterval, nextRandom(s));
  }
}

/**
 * Entraînements : chaque contrat garde son bloc s'il tient encore, sinon il en cherche un ;
 * un bloc rompu (panne, délestage) ramène au dernier point de contrôle. Renvoie le calcul
 * des blocs, dédiés : il n'est plus disponible pour le reste.
 */
function allocateTraining(s: GameState, active: Job[], dt: number): number {
  const taken = new Set<number>();
  let used = 0;
  for (const j of active) {
    if (j.kind !== 'training') continue;
    const minGen = j.minGen ?? 1;
    if (j.assigned && !clusterIntact(s, j.assigned, minGen, taken)) {
      const share = modifiers(s).checkpoints ? TRAINING.rollbackCheckpoints : TRAINING.rollback;
      j.progress = Math.max(0, j.progress - j.work * share);
      j.assigned = undefined;
      notify(s, 'warning', `Entraînement interrompu : ${j.name} recule de ${Math.round(share * 100)} %`, { code: 'trainingBroken' });
    }
    if (!j.assigned) j.assigned = findCluster(s, j.cluster ?? 1, minGen, taken) ?? undefined;
    if (!j.assigned) {
      j.allocated = 0;
      continue;
    }
    for (const id of j.assigned) taken.add(id);
    const capacity = clusterRate(s, j.assigned);
    const rate = Math.min(capacity, (j.work - j.progress) / dt);
    j.allocated = rate;
    j.progress += rate * dt;
    used += capacity;
  }
  return used;
}

/** Taille calée sur le parc de racks, pour que l'offre reste à portée du joueur. */
export function generateOffer(s: GameState): Job {
  const r = () => nextRandom(s);
  // Labo d'IA et au-delà : une partie des offres sont des entraînements ou des inférences avec SLA.
  // (Ce tirage n'a lieu qu'en carrière : la partie rapide garde exactement sa suite de hasard.)
  let special: 'training' | 'sla' | null = null;
  if (s.rules.progression && s.career.tier >= TRAINING.minTier) {
    const roll = r();
    special = roll < TRAINING.share ? 'training' : roll < TRAINING.share + SLA.share ? 'sla' : null;
  }
  if (special === 'training') return trainingOffer(s, r);
  const racks = s.buildings.filter((b) => b.kind === 'rack').length;
  // En carrière, le palier plafonne la taille des offres et fixe le niveau des prix.
  const tier = s.rules.progression ? TIERS[s.career.tier] : null;
  const maxUnits = Math.min(tier?.maxUnits ?? JOBS.maxUnits, Math.max(2, Math.ceil(racks * 0.6)));
  const rateCU = (1 + Math.floor(r() * maxUnits)) * RACK.computeCU;
  const durationS = Math.round(lerp(JOBS.duration, r()) / 10) * 10;
  const slack = lerp(JOBS.slack, r());
  const tightBonus = 1 + (JOBS.slack[1] - slack) * 0.6;
  const payment = Math.round((rateCU * durationS * JOBS.pricePerCU * (0.85 + 0.35 * r()) * tightBonus * (tier?.priceMult ?? 1)) / 10) * 10;
  const name = `${pick(KINDS, r())} — ${pick(CLIENTS, r())}`;
  if (special === 'sla') {
    const paid = Math.round((payment * SLA.priceMult) / 10) * 10;
    return {
      id: s.nextJobId++,
      name: `${name} (SLA ${Math.round((1 - SLA.tolerance) * 100)} %)`,
      status: 'offer',
      rateCU,
      durationS,
      work: rateCU * durationS,
      progress: 0,
      deadlineInS: Math.round(durationS * slack),
      payment: paid,
      penalty: Math.round((paid * JOBS.penaltyRatio) / 10) * 10,
      offeredAt: s.time,
      expiresAt: s.time + JOBS.offerExpiry,
      deadline: 0,
      allocated: 0,
      sla: true,
      shortS: 0,
    };
  }
  return {
    id: s.nextJobId++,
    name,
    status: 'offer',
    rateCU,
    durationS,
    work: rateCU * durationS,
    progress: 0,
    deadlineInS: Math.round(durationS * slack),
    payment,
    penalty: Math.round((payment * JOBS.penaltyRatio) / 10) * 10,
    offeredAt: s.time,
    expiresAt: s.time + JOBS.offerExpiry,
    deadline: 0,
    allocated: 0,
  };
}

function lerp([a, b]: readonly [number, number], t: number): number {
  return a + (b - a) * t;
}

function pick<T>(list: readonly T[], t: number): T {
  return list[Math.floor(t * list.length)];
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} $`;

/** Offre d'entraînement : un bloc de racks contigus pendant toute la durée, mieux payé. */
function trainingOffer(s: GameState, r: () => number): Job {
  const tier = TIERS[s.career.tier];
  const [lo, hi] = TRAINING.cluster[Math.min(s.career.tier, 3)] ?? TRAINING.cluster[2];
  const size = lo + Math.floor(r() * (hi - lo + 1));
  const rateCU = size * RACK.computeCU;
  const durationS = Math.round(lerp(TRAINING.duration, r()) / 10) * 10;
  const slack = lerp([1.5, 2.2], r());
  const payment = Math.round((rateCU * durationS * JOBS.pricePerCU * TRAINING.priceMult * tier.priceMult * (0.9 + 0.3 * r())) / 10) * 10;
  return {
    id: s.nextJobId++,
    name: `Entraînement LLM — ${pick(CLIENTS, r())}`,
    status: 'offer',
    rateCU,
    durationS,
    work: rateCU * durationS,
    progress: 0,
    deadlineInS: Math.round(durationS * slack),
    payment,
    penalty: Math.round((payment * JOBS.penaltyRatio) / 10) * 10,
    offeredAt: s.time,
    expiresAt: s.time + JOBS.offerExpiry,
    deadline: 0,
    allocated: 0,
    kind: 'training',
    cluster: size,
    minGen: 1,
  };
}
