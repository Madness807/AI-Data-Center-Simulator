import { JOBS, RACK } from '../balance';
import { isRackActive, type Job } from '../entities';
import { nextRandom } from '../rng';
import { earn, spend } from '../ledger';
import { advanceResearch, deliveryReputation, gainReputation, LATE_REPUTATION, modifiers, researchReserve, TIERS } from '../progression';
import { notify, type GameState } from '../state';

const KINDS = ['Entraînement LLM', 'Fine-tuning', 'Inférence batch', 'Rendu vidéo IA', 'Repliement de protéines', 'Prévision météo'];
const CLIENTS = ['Lumen Labs', 'Orbital ML', 'Nébuleuse IA', 'Kappa Research', 'Helix Bio', 'Quanta Finance', 'Atelier Vision', 'Synapse Studio'];

/**
 * Pool global : le calcul des racks actifs va aux contrats par échéance la plus
 * proche, chacun plafonné à son débit demandé (pas de rattrapage). En carrière, la part
 * réservée à la recherche est prélevée d'abord.
 */
export function updateJobs(s: GameState, dt: number): void {
  let total = 0;
  for (const b of s.buildings) if (isRackActive(b)) total += RACK.computeCU;

  s.compute.total = total;
  let research = researchReserve(s);
  let pool = total - research;
  const active = s.jobs.filter((j) => j.status === 'active').sort((a, b) => a.deadline - b.deadline);
  for (const j of active) {
    const alloc = Math.min(pool, j.rateCU, (j.work - j.progress) / dt);
    j.allocated = alloc;
    j.progress += alloc * dt;
    pool -= alloc;
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
      earn(s, j.payment);
      s.economy.jobsDone++;
      if (s.rules.progression) gainReputation(s, deliveryReputation(j));
      notify(s, 'success', `Contrat livré : ${j.name} (+${fmt(j.payment)})`, { code: 'delivered' });
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

/** Taille calée sur le parc de racks, pour que l'offre reste à portée du joueur. */
export function generateOffer(s: GameState): Job {
  const r = () => nextRandom(s);
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
