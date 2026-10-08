import { COMMERCIAL } from '../balance';
import type { CommercialPolicy } from '../career';
import { freeBlocks } from '../clusters';
import type { Job } from '../entities';
import { modifiers, researchReserve } from '../progression';
import { notify, type GameState } from '../state';
import { committedCompute } from '../stats';
import { acceptOffer } from './jobs';

/** Prix payé par CU livré. */
export const pricePerCU = (j: Job) => j.payment / j.work;

/** Réglages relus ou reçus de l'interface, bornés : jamais de prix ni de marge absurdes. */
export function sanitizeCommercial(p: CommercialPolicy): CommercialPolicy {
  const clamp = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  return {
    enabled: !!p.enabled,
    inference: !!p.inference,
    sla: !!p.sla,
    training: !!p.training,
    minPricePerCU: clamp(p.minPricePerCU, 0, COMMERCIAL.minPriceMax),
    margin: clamp(p.margin, 0, Math.max(...COMMERCIAL.margins)),
  };
}

/** Le commercial travaille-t-il dans cette partie (recherche faite, réglage allumé) ? */
export function commercialActive(s: GameState): boolean {
  return s.rules.progression && modifiers(s).autoAccept && s.policies.commercial.enabled;
}

/**
 * Pourquoi le commercial laisse cette offre, ou null s'il la prend. Il ne promet jamais plus que le
 * calcul en service (hors part de la recherche) moins la marge réglée, plus large pour un SLA ; un
 * entraînement demande en plus un bloc libre de la bonne taille (sur un seul switch sans la Fabric),
 * et un seul attend son bloc à la fois.
 */
export function commercialRefusal(s: GameState, job: Job, p: CommercialPolicy = s.policies.commercial): string | null {
  const training = job.kind === 'training';
  if (training ? !p.training : job.sla ? !p.sla : !p.inference) return 'type de contrat exclu';
  if (pricePerCU(job) < p.minPricePerCU) return 'prix trop bas';
  const margin = p.margin + (job.sla ? COMMERCIAL.slaExtraMargin : 0);
  const budget = (s.compute.total - researchReserve(s)) * (1 - margin) - committedCompute(s);
  if (job.rateCU > budget) return 'calcul libre insuffisant';
  if (training) {
    const active = s.jobs.filter((j) => j.status === 'active' && j.kind === 'training');
    if (active.some((j) => !j.assigned)) return 'un entraînement attend déjà son bloc';
    const taken = new Set(active.flatMap((j) => j.assigned ?? []));
    const blocks = freeBlocks(s, job.minGen ?? 1, taken);
    if ((modifiers(s).fabric ? blocks.linked : blocks.oneSwitch) < (job.cluster ?? 1)) return 'pas de bloc libre assez grand';
  }
  return null;
}

/**
 * Commercial automatique (recherche) : à chaque tick, il prend les offres que la salle peut tenir,
 * les mieux payées par CU d'abord, en recomptant le calcul promis après chaque acceptation. Rien
 * pendant une coupure du réseau électrique : le calcul en service y est trompeur. Sans tirage au
 * sort : la partie reste reproductible.
 */
export function autoAcceptOffers(s: GameState): void {
  if (!commercialActive(s) || !s.power.grid) return;
  const offers = s.jobs.filter((j) => j.status === 'offer').sort((a, b) => pricePerCU(b) - pricePerCU(a) || a.id - b.id);
  for (const job of offers) {
    if (commercialRefusal(s, job)) continue;
    acceptOffer(s, job);
    notify(s, 'info', `Contrat accepté automatiquement : ${job.name} (+${Math.round(job.payment).toLocaleString('fr-FR')} $)`, { code: 'autoAccepted' });
  }
}
