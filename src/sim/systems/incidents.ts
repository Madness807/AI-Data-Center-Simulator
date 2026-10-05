import { CDU, CRAC, HEATWAVE, OUTAGE, rackSpec, UPS } from '../balance';
import { outsideTemp, weatherActive } from '../climate';
import { isRackActive } from '../entities';
import { lerp } from '../math';
import { nextRandom } from '../rng';
import { notify, type GameState } from '../state';
import { failRack } from './failures';

/**
 * Incidents de la carrière, tirés par le générateur aléatoire de la partie (rejouables avec la
 * graine). Coupures du réseau à partir du palier OUTAGE.minTier : la première quelques
 * minutes après l'avoir atteint, pour laisser le temps de s'équiper.
 */
export function updateIncidents(s: GameState): void {
  if (!s.rules.incidents) return;
  outages(s);
  heatwaves(s);
}

/** Le réseau peut-il être coupé (carrière, à partir du palier OUTAGE.minTier) ? */
export function outagesActive(s: GameState): boolean {
  return s.rules.incidents && s.career.tier >= OUTAGE.minTier;
}

/** Canicules à partir du palier où la météo compte : les CRAC perdent en efficacité. */
function heatwaves(s: GameState): void {
  const inc = s.incidents;
  if (inc.heatwaveEndsAt !== null) {
    if (s.time < inc.heatwaveEndsAt) return;
    inc.heatwaveEndsAt = null;
    inc.nextHeatwaveAt = s.time + lerp(HEATWAVE.interval, nextRandom(s));
    notify(s, 'success', 'Fin de la canicule : les CRAC retrouvent leur efficacité', { code: 'heatwaveEnd' });
    return;
  }
  if (!weatherActive(s)) return;
  if (inc.nextHeatwaveAt === null) {
    inc.nextHeatwaveAt = s.time + HEATWAVE.firstDelayS;
    return;
  }
  if (s.time < inc.nextHeatwaveAt) return;
  const duration = Math.round(lerp(HEATWAVE.duration, nextRandom(s)));
  inc.heatwaveEndsAt = s.time + duration;
  inc.nextHeatwaveAt = null;
  const t = Math.round(outsideTemp(s) ?? 0);
  notify(s, 'warning', `Canicule : ${t} °C dehors, les CRAC perdent en efficacité (environ ${Math.round(duration / 60)} min)`, { code: 'heatwave' });
}

function outages(s: GameState): void {
  const inc = s.incidents;
  if (inc.outageEndsAt !== null) {
    if (s.time < inc.outageEndsAt) return;
    inc.outageEndsAt = null;
    inc.nextOutageAt = s.time + lerp(OUTAGE.interval, nextRandom(s));
    notify(s, 'success', 'Réseau électrique rétabli', { code: 'gridBack' });
    return;
  }
  if (!outagesActive(s)) return;
  if (inc.nextOutageAt === null) {
    inc.nextOutageAt = s.time + OUTAGE.firstDelayS;
    return;
  }
  if (s.time < inc.nextOutageAt) return;
  // Tirée même pour la première coupure (durée fixe) : la suite de hasard de la carrière en dépend.
  const roll = nextRandom(s);
  const duration = inc.outages === 0 ? OUTAGE.firstDurationS : Math.round(lerp(OUTAGE.duration, roll));
  inc.outageEndsAt = s.time + duration;
  inc.nextOutageAt = null;
  inc.outages++;
  const backup = s.buildings.some((b) => (b.kind === 'ups' || b.kind === 'generator') && b.status === 'ok');
  crashUnprotected(s);
  const message = backup
    ? `Coupure du réseau électrique : les secours prennent le relais (environ ${duration} s)`
    : `Coupure du réseau électrique, sans secours : la salle s'arrête (environ ${duration} s)`;
  notify(s, 'error', message, { code: 'outage' });
}

/**
 * Au premier instant d'une coupure, seuls les onduleurs chargés tiennent (les groupes démarrent) :
 * les racks qu'ils ne couvrent pas perdent brutalement le courant, au risque d'une panne.
 */
function crashUnprotected(s: GameState): void {
  let left = s.buildings.reduce((sum, b) => sum + (b.kind === 'ups' && b.status === 'ok' && (b.charge ?? 0) > 0 ? UPS.powerKW : 0), 0);
  for (const b of s.buildings) {
    if ((b.kind === 'crac' || b.kind === 'cdu') && b.status === 'ok') left -= b.kind === 'crac' ? CRAC.powerKW : CDU.powerKW;
  }
  for (const b of s.buildings) {
    if (!isRackActive(b)) continue;
    if (left >= rackSpec(b).powerKW) {
      left -= rackSpec(b).powerKW;
      continue;
    }
    if (nextRandom(s) < OUTAGE.crashChance) failRack(s, b, ' : arrêt brutal pendant la coupure');
  }
}
