import { actionKey, HELP_CHAR, keyLabel, type KeyAction } from '../../input/keymap';
import { el, icon } from '../dom';

const keys = (...actions: KeyAction[]) => actions.map(actionKey);

/** Les lignes de l'aide, tirées de la table des raccourcis (libellés selon le clavier du joueur). */
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
        ['Cette aide', [HELP_CHAR, actionKey('help')]],
      ],
    },
  ];
}

/** Aide clavier en fenêtre, ouverte à la demande (touche ? ou F1) au lieu d'un panneau permanent. */
export class HelpOverlay {
  readonly root: HTMLElement;

  private readonly grid = el('div', 'help-grid');

  constructor() {
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 16));
    close.onclick = () => this.close();
    const panel = el('div', 'help glass', el('div', 'help-head', el('span', 'panel-title', icon('keyboard', 14), 'Commandes'), close), this.grid);
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  /** Recompose les lignes : la disposition du clavier peut n'être connue qu'après le démarrage. */
  private render(): void {
    this.grid.replaceChildren(
      ...sections().map((section) =>
        el(
          'div',
          'help-section',
          el('h3', undefined, section.title),
          ...section.lines.map(([label, labels]) =>
            el('div', 'help-line', el('span', undefined, label), el('span', undefined, ...labels.map((k) => el('span', 'kbd', k)))),
          ),
        ),
      ),
    );
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.root.hidden) this.render();
    this.root.hidden = !this.root.hidden;
  }

  close(): void {
    this.root.hidden = true;
  }
}
