import type { Technician } from './entities';
import type { GameState } from './state';

const FIRST_NAMES = [
  'Inès', 'Karim', 'Léa', 'Hugo', 'Chloé', 'Malik', 'Sarah', 'Théo', 'Aïcha', 'Lucas', 'Nora', 'Yanis',
  'Emma', 'Samir', 'Julie', 'Bastien', 'Fatou', 'Mathis', 'Camille', 'Nicolas', 'Zoé', 'Omar', 'Manon', 'Rayan',
];

const orders = new Map<number, string[]>();

/** Ordre des prénoms propre à une partie : un mélange tiré de la graine, sans toucher au hasard du jeu. */
function orderFor(seed: number): string[] {
  let order = orders.get(seed);
  if (order) return order;
  let r = seed | 0;
  const random = () => {
    r = (r + 0x6d2b79f5) | 0;
    let t = Math.imul(r ^ (r >>> 15), r | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  order = [...FIRST_NAMES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  orders.set(seed, order);
  return order;
}

/** Prénom d'un technicien : stable pour une partie (graine + numéro d'embauche), unique au sein de l'équipe. */
export function techName(s: GameState, t: Technician): string {
  const order = orderFor(s.seed);
  const i = t.id - 1;
  const name = order[i % order.length];
  return i < order.length ? name : `${name} ${Math.floor(i / order.length) + 1}`;
}
