import { ECONOMY } from '../../sim/balance';
import type { Command } from '../../sim/commands';
import type { Cell } from '../../sim/entities';
import type { GameState } from '../../sim/state';
import { inCoolingRange } from '../../sim/systems/heat';
import { money } from '../format';

/** Ce que le tutoriel observe : la partie et l'état de l'interface. */
export interface TutorialContext {
  s: GameState;
  selected: ReadonlySet<number>;
  inspected: number | null;
  heatmap: boolean;
}

/** Mémoire du tutoriel entre les étapes. */
export interface TutorialMemo {
  /** CRAC présents au lancement : l'étape « Refroidir » attend un CRAC posé par le joueur. */
  startCracs: number[];
  /** Rack mis en panne pour l'exercice de réparation. */
  failedRackId: number | null;
  /** Pannes du rack avant l'exercice : la réparation compte une fois la panne survenue. */
  failuresBefore: number;
}

export function createMemo(s: GameState): TutorialMemo {
  return { startCracs: s.buildings.filter((b) => b.kind === 'crac').map((b) => b.id), failedRackId: null, failuresBefore: 0 };
}

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** Élément du HUD à mettre en avant (sélecteur CSS). */
  highlight?: string;
  /** Case conseillée dans la salle, montrée par un ping. */
  target?: (ctx: TutorialContext, memo: TutorialMemo) => Cell | null;
  /** Action à l'entrée de l'étape (ex. provoquer la panne d'exercice). */
  enter?: (ctx: TutorialContext, memo: TutorialMemo, enqueue: (c: Command) => void) => void;
  done: (ctx: TutorialContext, memo: TutorialMemo) => boolean;
}

const racks = (s: GameState) => s.buildings.filter((b) => b.kind === 'rack');
const builtRacks = (s: GameState) => racks(s).filter((b) => b.status !== 'construction');

/** Première case libre à côté des racks, pour suggérer où poser le CRAC. */
function freeCellNear(s: GameState, origin: Cell): Cell | null {
  for (const [dx, dy] of [[0, 2], [0, -2], [2, 0], [-2, 0], [1, 2], [-1, 2], [0, 3]]) {
    const x = origin.x + dx;
    const y = origin.y + dy;
    if (x >= 1 && y >= 0 && x < s.w && y < s.h && s.occupant[y * s.w + x] < 0) return { x, y };
  }
  return null;
}

export const STEPS: TutorialStep[] = [
  {
    id: 'select',
    title: 'Vos techniciens',
    text: 'Ils construisent et réparent tout. Cliquez sur l’un d’eux, à l’entrée de la salle (ou tracez un rectangle autour).',
    target: ({ s }) => (s.techs[0] ? { x: Math.round(s.techs[0].x), y: Math.round(s.techs[0].y) } : null),
    done: ({ selected }) => selected.size > 0,
  },
  {
    id: 'racks',
    title: 'Poser des racks',
    text: 'Technicien sélectionné, choisissez « Rack GPU » (touche R) puis cliquez deux cases voisines : le technicien vient construire les chantiers.',
    highlight: '[data-tool="rack"]',
    // Hors de portée du CRAC de départ : l'étape « Refroidir » garde tout son sens.
    target: () => ({ x: 16, y: 6 }),
    done: ({ s }) => racks(s).length >= 2,
  },
  {
    id: 'contract',
    title: 'Accepter un contrat',
    text: 'Les clients demandent du calcul (CU/s) pendant une durée, avant un délai. Acceptez l’offre dans le panneau Contrats : elle paie à la livraison.',
    highlight: '.contract.offer .btn-primary',
    done: ({ s }) => s.jobs.some((j) => j.status === 'active') || s.economy.jobsDone > 0,
  },
  {
    id: 'built',
    title: 'Mise en service',
    text: 'Chaque chantier prend quelques secondes. Une fois en service, les racks calculent pour vos contrats : suivez la jauge « Calcul » en haut.',
    highlight: '[data-res="compute"]',
    done: ({ s }) => builtRacks(s).length >= 2,
  },
  {
    id: 'heatmap',
    title: 'Surveiller la chaleur',
    text: 'Les racks chauffent. Ouvrez la carte de chaleur (touche H) : au-delà de 35 °C, les pannes se multiplient.',
    highlight: '[data-toggle="heatmap"]',
    done: ({ heatmap }) => heatmap,
  },
  {
    id: 'crac',
    title: 'Refroidir',
    text: 'Posez un CRAC (touche C) à moins de 3 cases des racks : le cercle montre sa portée. Un CRAC refroidit environ 3 racks.',
    highlight: '[data-tool="crac"]',
    target: ({ s }) => (builtRacks(s)[0] ? freeCellNear(s, builtRacks(s)[0]) : null),
    done: ({ s }, memo) =>
      s.buildings.some((c) => c.kind === 'crac' && !memo.startCracs.includes(c.id) && racks(s).some((r) => inCoolingRange(c.x, c.y, r.x, r.y))),
  },
  {
    id: 'inspect',
    title: 'Inspecter un équipement',
    text: 'Cliquez sur un rack : température, risque de panne, refroidissement, tout est dans l’inspecteur (en bas à gauche).',
    target: ({ s }) => builtRacks(s)[0] ?? null,
    done: ({ s, inspected }) => s.buildings.some((b) => b.id === inspected && b.kind === 'rack'),
  },
  {
    id: 'repair',
    title: 'Réparer une panne',
    text: 'Un rack vient de tomber en panne ! Dans l’inspecteur, cliquez « Envoyer réparer » (ou technicien sélectionné + clic droit sur le rack).',
    highlight: '.inspector .btn-primary',
    enter: ({ s }, memo, enqueue) => {
      const rack = builtRacks(s).find((b) => b.status === 'ok');
      if (!rack) return;
      memo.failedRackId = rack.id;
      memo.failuresBefore = rack.failures;
      enqueue({ type: 'forceFailure', id: rack.id });
    },
    target: ({ s }, memo) => s.buildings.find((b) => b.id === memo.failedRackId) ?? null,
    done: ({ s }, memo) => {
      const rack = s.buildings.find((b) => b.id === memo.failedRackId);
      // Panne impossible à provoquer ou rack démoli : on passe à la suite.
      if (memo.failedRackId === null || !rack) return true;
      // La panne n'est appliquée qu'au tick suivant : on compte les pannes plutôt que d'observer l'état.
      return rack.failures > memo.failuresBefore && rack.status === 'ok';
    },
  },
  {
    id: 'goal',
    title: 'À vous de jouer',
    text: `Objectif : ${money(ECONOMY.goalMoney)}. Enchaînez les contrats, ajoutez un PDU quand l’énergie sature, gardez la salle au frais. Échap ouvre le menu (sauvegarde, options).`,
    done: () => false,
  },
];

/**
 * Avance tant que les étapes sont accomplies ; appelle `enter` de chaque nouvelle étape.
 * Fonction pure (hors `enqueue`) : le tutoriel se teste sans navigateur.
 */
export function advance(index: number, ctx: TutorialContext, memo: TutorialMemo, enqueue: (c: Command) => void): number {
  let i = index;
  while (i < STEPS.length && STEPS[i].done(ctx, memo)) {
    i++;
    STEPS[i]?.enter?.(ctx, memo, enqueue);
  }
  return i;
}
