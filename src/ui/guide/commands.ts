import { actionKey, HELP_CHAR, keyLabel, type KeyAction } from '../../input/keymap';
import type { GuideChapter } from './model';

const keys = (...actions: KeyAction[]) => actions.map(actionKey);

/** Les lignes de l'aide clavier, tirées de la table des raccourcis (libellés selon le clavier du joueur). */
function sections(): { title: string; lines: [string, string[]][] }[] {
  return [
    {
      title: 'Caméra',
      lines: [
        ['Se déplacer', keys('panUp', 'panLeft', 'panDown', 'panRight')],
        ['… ou avec les flèches', ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].map(keyLabel)],
        ['Pivoter', keys('rotateLeft', 'rotateRight')],
        ['Zoomer', ['Molette']],
        ['Défilement par les bords', keys('edgePan')],
      ],
    },
    {
      title: 'Techniciens',
      lines: [
        ['Sélectionner', ['Clic', 'Glisser']],
        ['Ajouter à la sélection', ['Maj']],
        ['Déplacer, construire, réparer, entretenir', ['Clic droit']],
        ['Mettre l’ordre en file', ['Maj', 'Clic droit']],
        ['Embaucher', keys('hire')],
      ],
    },
    {
      title: 'Construction',
      lines: [
        ['Inspecter un équipement', ['Clic']],
        ['Fermer l’inspecteur', keys('cancel')],
        ['Calcul, froid, énergie (réappuyer : variante)', keys('buildCompute', 'buildCooling', 'buildPower')],
        ['Switch réseau (carrière)', keys('buildNetwork')],
        ['Pivoter un rack (carrière)', keys('rotateBuilding')],
        ['Démolir', keys('demolish')],
        ['Poser (glisser pour enchaîner)', ['Clic']],
        ['Annuler', ['Clic droit', actionKey('cancel')]],
      ],
    },
    {
      title: 'Temps et affichage',
      lines: [
        ['Pause', keys('pause')],
        ['Vitesse ×1, ×2, ×4', keys('speed1', 'speed2', 'speed4')],
        ['Calques (chaleur, énergie, froid…)', [actionKey('overlay'), `Maj ${actionKey('overlay')}`]],
        ['Tableau de bord', keys('dashboard')],
        ['Équipe', keys('team')],
        ['Recherche (carrière)', keys('research')],
        ['Ce guide (chapitre Commandes)', [HELP_CHAR, actionKey('help')]],
      ],
    },
  ];
}

/**
 * Chapitre Commandes du guide : recalculé à chaque ouverture, la disposition du clavier
 * pouvant n'être connue qu'après le démarrage.
 */
export function commandsChapter(): GuideChapter {
  return {
    id: 'commandes',
    title: 'Commandes',
    icon: 'keyboard',
    blocks: sections().map((s) => ({ kind: 'keys', title: s.title, lines: s.lines })),
  };
}
