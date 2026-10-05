import { CDU, GPU, TRAINING, WEATHER } from '../sim/balance';
import { modifiers } from '../sim/progression';
import { wearActive } from '../sim/systems/failures';
import type { GameState } from '../sim/state';
import type { IconName } from './icons';

/** Conseil de carrière : affiché une seule fois, la première fois que sa situation se présente. */
export interface CareerTip {
  id: string;
  icon: IconName;
  title: string;
  text: string;
  when: (s: GameState) => boolean;
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Seuil d'usure qui déclenche le conseil d'entretien (%). */
const WORN = 60;

/** Par ordre de priorité : une situation urgente passe devant les autres. */
export const CAREER_TIPS: readonly CareerTip[] = [
  {
    id: 'outage',
    icon: 'power',
    title: 'Coupure du réseau',
    text: 'Sans secours, les racks s’arrêtent net et certains tombent en panne. Les onduleurs prennent le relais dès la première seconde, les groupes électrogènes tiennent toute la coupure : ils s’étudient dans la recherche (U).',
    when: (s) => s.incidents.outageEndsAt !== null,
  },
  {
    id: 'heatwave',
    icon: 'weather',
    title: 'Canicule',
    text: `Tant qu’elle dure, les CRAC perdent jusqu’à ${pct(1 - WEATHER.cracMin)} de leur froid. Gardez de la marge, surveillez le calque chaleur (H), ou captez la chaleur à la source avec des CDU.`,
    when: (s) => s.incidents.heatwaveEndsAt !== null,
  },
  {
    id: 'career',
    icon: 'tier',
    title: 'Mode carrière',
    text: 'Chaque contrat livré à l’heure rapporte de la réputation ; chaque palier ouvre des clients plus gros et de nouvelles recherches. Ouvrez la recherche (U) et réservez-lui une part du calcul.',
    when: (s) => s.time >= 5,
  },
  {
    id: 'wear',
    icon: 'repair',
    title: 'Un rack s’use',
    text: 'Un rack usé tombe plus souvent en panne, surtout s’il a chaud. Clic droit dessus avec un technicien sélectionné, ou bouton Entretien de l’inspecteur : son usure repart à zéro.',
    when: (s) => wearActive(s) && s.buildings.some((b) => b.kind === 'rack' && (b.wear ?? 0) >= WORN),
  },
  {
    id: 'training',
    icon: 'compute',
    title: 'Contrat d’entraînement',
    text: `Il occupe un bloc de racks voisins du début à la fin ; sa carte affiche le plus grand bloc libre. Si un rack du bloc s’arrête, l’entraînement recule de ${pct(TRAINING.rollback)} (${pct(TRAINING.rollbackCheckpoints)} avec les points de contrôle).`,
    when: (s) => s.jobs.some((j) => j.kind === 'training'),
  },
  {
    id: 'g3',
    icon: 'rack',
    title: 'GPU G3',
    text: `${GPU[3].computeCU} CU/s par rack, mais ${GPU[3].heatKW} kW de chaleur sur une seule case : posez-les à ${CDU.radius} cases au plus d’un CDU, sinon ils surchauffent.`,
    when: (s) => modifiers(s).maxGen >= 3,
  },
];

/** Le conseil à afficher maintenant, ou null (partie rapide, défaite, rien de nouveau). */
export function dueTip(s: GameState, seen: readonly string[]): CareerTip | null {
  if (s.mode !== 'career' || s.outcome === 'lost') return null;
  return CAREER_TIPS.find((t) => !seen.includes(t.id) && t.when(s)) ?? null;
}
