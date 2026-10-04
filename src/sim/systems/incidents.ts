import { OUTAGE } from '../balance';
import { nextRandom } from '../rng';
import { notify, type GameState } from '../state';

const lerp = ([a, b]: readonly [number, number], t: number) => a + (b - a) * t;

/**
 * Incidents de la carrière, tirés par le générateur aléatoire de la partie (rejouables avec la
 * graine). Coupures du réseau à partir du palier OUTAGE.minTier : la première quelques
 * minutes après l'avoir atteint, pour laisser le temps de s'équiper.
 */
export function updateIncidents(s: GameState): void {
  if (!s.rules.incidents) return;
  const inc = s.incidents;
  if (inc.outageEndsAt !== null) {
    if (s.time < inc.outageEndsAt) return;
    inc.outageEndsAt = null;
    inc.nextOutageAt = s.time + lerp(OUTAGE.interval, nextRandom(s));
    notify(s, 'success', 'Réseau électrique rétabli', { code: 'gridBack' });
    return;
  }
  if (s.career.tier < OUTAGE.minTier) return;
  if (inc.nextOutageAt === null) {
    inc.nextOutageAt = s.time + OUTAGE.firstDelayS;
    return;
  }
  if (s.time < inc.nextOutageAt) return;
  const roll = nextRandom(s);
  const duration = inc.outages === 0 ? OUTAGE.firstDurationS : Math.round(lerp(OUTAGE.duration, roll));
  inc.outageEndsAt = s.time + duration;
  inc.nextOutageAt = null;
  inc.outages++;
  const backup = s.buildings.some((b) => (b.kind === 'ups' || b.kind === 'generator') && b.status === 'ok');
  notify(
    s,
    'error',
    backup ? `Coupure du réseau électrique : les secours prennent le relais (environ ${duration} s)` : `Coupure du réseau électrique, sans secours : la salle s'arrête (environ ${duration} s)`,
    { code: 'outage' },
  );
}
