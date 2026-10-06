import { HEAT } from '../sim/balance';
import { isRackActive } from '../sim/entities';
import type { EventCode, GameEvent, GameState } from '../sim/state';
import { tempStats } from '../sim/stats';

/** Ambiance de la salle : l'activité suit les racks en service, la chaleur l'écart à l'air neuf. */
export const AMBIENCE = { fullRacks: 20, heatRangeC: 30 };

/** Intensités de l'ambiance, de 0 à 1 (activité des ventilateurs, chaleur). */
export function ambienceOf(s: GameState): { load: number; heat: number } {
  const racks = s.buildings.filter(isRackActive).length;
  const heat = (tempStats(s).max - HEAT.ambient) / AMBIENCE.heatRangeC;
  return { load: Math.min(1, racks / AMBIENCE.fullRacks), heat: Math.min(1, Math.max(0, heat)) };
}

export type SoundId =
  | 'click'
  | 'place'
  | 'order'
  | 'built'
  | 'accept'
  | 'delivered'
  | 'late'
  | 'failure'
  | 'repaired'
  | 'shed'
  | 'refused'
  | 'bankruptTick'
  | 'victory'
  | 'defeat'
  | 'saved'
  | 'offer'
  | 'caution'
  | 'tierUp'
  | 'research'
  | 'outage'
  | 'gridBack';

/** Son associé à un événement de la simulation (null : silencieux). */
export function soundForEvent(code: EventCode | undefined): SoundId | null {
  switch (code) {
    case 'failure':
      return 'failure';
    case 'built':
      return 'built';
    case 'repaired':
      return 'repaired';
    case 'delivered':
      return 'delivered';
    case 'late':
      return 'late';
    case 'offer':
      return 'offer';
    case 'won':
      return 'victory';
    case 'bankrupt':
      return 'defeat';
    case 'refused':
      return 'refused';
    case 'saved':
      return 'saved';
    case 'overheat':
    case 'powerHigh':
    case 'lateRisk':
    case 'cashLow':
    case 'unattended':
    case 'linkLost':
      return 'caution';
    case 'tierUp':
      return 'tierUp';
    case 'researchDone':
      return 'research';
    case 'outage':
      return 'outage';
    case 'gridBack':
      return 'gridBack';
    case 'upsLow':
    case 'heatwave':
    case 'wearRisk':
    case 'slaBreach':
    case 'trainingBroken':
      return 'caution';
    case 'maintained':
      return 'repaired';
    case 'heatwaveEnd':
      return 'gridBack';
    default:
      return null;
  }
}

/** Délai minimal entre deux occurrences d'un même son (ms) : 5 pannes simultanées = 1 alarme. */
const COOLDOWN: Partial<Record<SoundId, number>> = { caution: 2500, failure: 1500, refused: 400, offer: 2000, place: 60, click: 40, built: 300, repaired: 300 };
const DEFAULT_COOLDOWN = 150;

/**
 * Chef d'orchestre : traduit les événements et les changements d'état en sons, sans
 * répétitions agaçantes. Aucune dépendance au navigateur : testable tel quel.
 */
export class SoundDirector {
  private readonly lastPlayed = new Map<SoundId, number>();
  private shed = 0;
  private sites = 0;
  private bankruptSecond = -1;
  private activeJobs = 0;

  constructor(
    private readonly play: (id: SoundId) => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  trigger(id: SoundId): void {
    const t = this.now();
    if (t - (this.lastPlayed.get(id) ?? -Infinity) < (COOLDOWN[id] ?? DEFAULT_COOLDOWN)) return;
    this.lastPlayed.set(id, t);
    this.play(id);
  }

  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      const id = soundForEvent(e.code);
      if (id) this.trigger(id);
    }
  }

  /** Transitions d'état qui n'ont pas d'événement dédié (chantier posé, délestage, compte à rebours). */
  onFrame(s: GameState): void {
    const sites = s.buildings.filter((b) => b.status === 'construction').length;
    if (sites > this.sites) this.trigger('place');
    this.sites = sites;

    if (s.power.shedCount > this.shed) this.trigger('shed');
    this.shed = s.power.shedCount;

    const active = s.jobs.filter((j) => j.status === 'active').length;
    if (active > this.activeJobs) this.trigger('accept');
    this.activeJobs = active;

    // Un bip par seconde pendant le compte à rebours de faillite.
    const second = s.economy.bankruptTimer > 0 && s.outcome !== 'lost' ? Math.floor(s.economy.bankruptTimer) : -1;
    if (second >= 0 && second !== this.bankruptSecond) this.trigger('bankruptTick');
    this.bankruptSecond = second;
  }

  /** Après un chargement ou une nouvelle partie : repartir de l'état courant sans rejouer de sons. */
  sync(s: GameState): void {
    this.sites = s.buildings.filter((b) => b.status === 'construction').length;
    this.shed = s.power.shedCount;
    this.activeJobs = s.jobs.filter((j) => j.status === 'active').length;
    this.bankruptSecond = -1;
  }
}
