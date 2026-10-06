import type { UnlinkedReason } from '../sim/network';
import { plural } from './format';

/** Textes du réseau de calcul, partagés par l'inspecteur, les infobulles et les contrats. */

/** Pourquoi un rack n'est pas relié, en quelques mots. */
export function unlinkedLabel(reason: UnlinkedReason, reach: number): string {
  switch (reason) {
    case 'noSwitch':
      return 'aucun switch';
    case 'enclosed':
      return 'aucune case libre autour';
    case 'tooFar':
      return `switch à plus de ${reach} cases`;
    case 'portsFull':
      return 'switchs à portée pleins';
    case 'pending':
      return 'câblage en cours';
  }
}

/** Ce qu'il faut faire pour relier le rack (vide quand il le sera au prochain instant). */
export function unlinkedAdvice(reason: UnlinkedReason): string {
  switch (reason) {
    case 'noSwitch':
      return 'posez un switch au bout de la rangée, les câbles passent par les allées libres.';
    case 'enclosed':
      return 'libérez une case autour du rack, le câble a besoin d’une allée.';
    case 'tooFar':
      return 'rapprochez un switch, ou dégagez une allée plus courte.';
    case 'portsFull':
      return 'les switchs à portée sont pleins, ajoutez-en un.';
    case 'pending':
      return '';
  }
}

/** Longueur d'un câble (« câble direct » quand le rack touche son switch). */
export function cableText(length: number): string {
  return length === 0 ? 'câble direct' : `câble de ${length} ${plural(length, 'case')}`;
}
