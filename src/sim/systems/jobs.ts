import { JOBS, RACK, rackSpec, REPUTATION, SLA, TRAINING } from '../balance';
import { clusterFault, clusterRate, clusterSpeed, findCluster } from '../clusters';
import { isRackActive, type Job } from '../entities';
import { lerp, roundTo10 } from '../math';
import { nextRandom } from '../rng';
import { earn, spend } from '../ledger';
import { advanceResearch, deliveryReputation, gainReputation, modifiers, promote, researchReserve, TIERS } from '../progression';
import { notify, type GameState } from '../state';

const KINDS = ['Entraînement LLM', 'Fine-tuning', 'Inférence batch', 'Rendu vidéo IA', 'Repliement de protéines', 'Prévision météo'];
/** Clients par palier de carrière : chaque palier en amène de plus gros. La partie rapide garde les premiers. */
const CLIENTS: readonly (readonly string[])[] = [
  ['Lumen Labs', 'Orbital ML', 'Nébuleuse IA', 'Kappa Research', 'Helix Bio', 'Quanta Finance', 'Atelier Vision', 'Synapse Studio'],
  ['Clinique des Tilleuls', 'Fintech Albatros', 'Studio Mirage', 'Ciel Ouvert Météo', 'Logistique Boréale', 'Éditions Papyrus'],
  ['Institut Pascaline', 'Consortium Europa IA', 'Observatoire Céleste', 'Génomique Atlas', 'Robotique Ferrand', 'Agence Hélios'],
  ['Titan Models', 'Stratos Cloud', 'Mégalithe IA', 'Archipel Intelligence', 'Réseau Continental', 'Fondation Prométhée'],
];

/** Clients qui démarchent le joueur : ceux de son palier et du précédent (un seul tirage, comme avant). */
export function clientsFor(s: GameState): readonly string[] {
  const t = s.rules.progression ? Math.min(s.career.tier, CLIENTS.length - 1) : 0;
  return t === 0 ? CLIENTS[0] : [...CLIENTS[t - 1], ...CLIENTS[t]];
}

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
  let research = researchCut(s, total, trainingCU);
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
  if (s.rules.progression) {
    advanceResearch(s, research, dt);
    // Un palier peut aussi s'ouvrir parce que le parc a grandi (exigence de calcul).
    promote(s);
  }

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
      if (s.rules.progression) gainReputation(s, REPUTATION.late);
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
    const fault = j.assigned ? clusterFault(s, j.assigned, minGen, taken) : null;
    if (fault) {
      const share = modifiers(s).checkpoints ? TRAINING.rollbackCheckpoints : TRAINING.rollback;
      j.progress = Math.max(0, j.progress - j.work * share);
      j.assigned = undefined;
      const cause = fault === 'link' ? ' (réseau)' : '';
      notify(s, 'warning', `Entraînement interrompu${cause} : ${j.name} recule de ${Math.round(share * 100)} %`, { code: 'trainingBroken' });
    }
    if (!j.assigned) j.assigned = findCluster(s, j.cluster ?? 1, minGen, taken) ?? undefined;
    if (!j.assigned) {
      j.allocated = 0;
      continue;
    }
    for (const id of j.assigned) taken.add(id);
    const capacity = clusterRate(s, j.assigned);
    // À cheval sur plusieurs switchs, le bloc reste entièrement réservé mais avance moins vite.
    const rate = Math.min(capacity * clusterSpeed(s, j.assigned), (j.work - j.progress) / dt);
    j.allocated = rate;
    j.progress += rate * dt;
    used += capacity;
  }
  return used;
}

/** Part de la R&D, prélevée avant l'inférence, sans dépasser ce que l'entraînement laisse. */
function researchCut(s: GameState, total: number, trainingCU: number): number {
  return Math.min(researchReserve(s), total - trainingCU);
}

/** Calcul que se partagent les contrats d'inférence : le total, moins l'entraînement et la R&D. */
export function inferencePool(s: GameState, total: number, trainingCU: number): number {
  return total - trainingCU - researchCut(s, total, trainingCU);
}

/** Des offres d'entraînement ou avec SLA peuvent-elles arriver (carrière, dès le palier de l'une d'elles) ? */
export function specialOffersActive(s: GameState): boolean {
  return s.rules.progression && s.career.tier >= Math.min(TRAINING.minTier, SLA.minTier);
}

/** Taille calée sur le parc de racks, pour que l'offre reste à portée du joueur. */
export function generateOffer(s: GameState): Job {
  const r = () => nextRandom(s);
  // Labo d'IA et au-delà : une partie des offres sont des entraînements ou des inférences avec SLA.
  // (Ce tirage n'a lieu qu'en carrière : la partie rapide garde exactement sa suite de hasard.)
  // Un seul tirage dès que l'une des deux est ouverte ; chacune suit ensuite son propre palier.
  let special: 'training' | 'sla' | null = null;
  if (specialOffersActive(s)) {
    const roll = r();
    if (roll < TRAINING.share) special = s.career.tier >= TRAINING.minTier ? 'training' : null;
    else if (roll < TRAINING.share + SLA.share) special = s.career.tier >= SLA.minTier ? 'sla' : null;
  }
  if (special === 'training') return trainingOffer(s, r);
  const racks = s.buildings.filter((b) => b.kind === 'rack').length;
  // En carrière, le palier plafonne la taille des offres et fixe le niveau des prix.
  const tier = s.rules.progression ? TIERS[s.career.tier] : null;
  const maxUnits = Math.min(tier?.maxUnits ?? JOBS.maxUnits, Math.max(JOBS.minUnits, Math.ceil(racks * JOBS.unitsPerRack)));
  const rateCU = (1 + Math.floor(r() * maxUnits)) * RACK.computeCU;
  const durationS = roundTo10(lerp(JOBS.duration, r()));
  const slack = lerp(JOBS.slack, r());
  const tightBonus = 1 + (JOBS.slack[1] - slack) * JOBS.tightBonus;
  const jitter = JOBS.priceJitter.min + JOBS.priceJitter.spread * r();
  const payment = roundTo10(rateCU * durationS * JOBS.pricePerCU * jitter * tightBonus * (tier?.priceMult ?? 1));
  const name = `${pick(KINDS, r())} — ${pick(clientsFor(s), r())}`;
  if (special === 'sla') {
    const paid = roundTo10(payment * SLA.priceMult);
    const slaName = `${name} (SLA ${Math.round((1 - SLA.tolerance) * 100)} %)`;
    return makeOffer(s, { name: slaName, rateCU, durationS, slack, payment: paid }, { sla: true, shortS: 0 });
  }
  return makeOffer(s, { name, rateCU, durationS, slack, payment });
}

/** Une offre : le travail, l'échéance, la pénalité et l'expiration se déduisent du débit, de la durée et du prix. */
function makeOffer(
  s: GameState,
  o: { name: string; rateCU: number; durationS: number; slack: number; payment: number },
  extra: Partial<Pick<Job, 'kind' | 'cluster' | 'minGen' | 'sla' | 'shortS'>> = {},
): Job {
  return {
    id: s.nextJobId++,
    name: o.name,
    status: 'offer',
    rateCU: o.rateCU,
    durationS: o.durationS,
    work: o.rateCU * o.durationS,
    progress: 0,
    deadlineInS: Math.round(o.durationS * o.slack),
    payment: o.payment,
    penalty: roundTo10(o.payment * JOBS.penaltyRatio),
    offeredAt: s.time,
    expiresAt: s.time + JOBS.offerExpiry,
    deadline: 0,
    allocated: 0,
    ...extra,
  };
}

function pick<T>(list: readonly T[], t: number): T {
  return list[Math.floor(t * list.length)];
}

const fmt = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} $`;

/** Offre d'entraînement : un bloc de racks contigus pendant toute la durée, mieux payé. */
function trainingOffer(s: GameState, r: () => number): Job {
  const tier = TIERS[s.career.tier];
  const [lo, hi] = TRAINING.cluster[Math.min(s.career.tier, TIERS.length - 1)] ?? TRAINING.cluster[TRAINING.minTier];
  const size = lo + Math.floor(r() * (hi - lo + 1));
  const rateCU = size * RACK.computeCU;
  const durationS = roundTo10(lerp(TRAINING.duration, r()));
  const slack = lerp(TRAINING.slack, r());
  const jitter = TRAINING.priceJitter.min + TRAINING.priceJitter.spread * r();
  const payment = roundTo10(rateCU * durationS * JOBS.pricePerCU * TRAINING.priceMult * tier.priceMult * jitter);
  const name = `Entraînement LLM — ${pick(clientsFor(s), r())}`;
  return makeOffer(s, { name, rateCU, durationS, slack, payment }, { kind: 'training', cluster: size, minGen: TRAINING.minGen });
}
