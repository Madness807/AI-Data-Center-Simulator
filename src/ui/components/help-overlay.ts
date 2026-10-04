import { el, icon } from '../dom';

const SECTIONS: { title: string; lines: [string, string[]][] }[] = [
  {
    title: 'Caméra',
    lines: [
      ['Se déplacer', ['W', 'A', 'S', 'D']],
      ['Pivoter', ['Q', 'E']],
      ['Zoomer', ['Molette']],
      ['Défilement par les bords', ['B']],
    ],
  },
  {
    title: 'Techniciens',
    lines: [
      ['Sélectionner', ['Clic', 'Glisser']],
      ['Ajouter à la sélection', ['Maj']],
      ['Déplacer, construire, réparer', ['Clic droit']],
      ['Mettre l’ordre en file', ['Maj', 'Clic droit']],
      ['Embaucher', ['T']],
    ],
  },
  {
    title: 'Construction',
    lines: [
      ['Rack, CRAC, PDU', ['R', 'C', 'P']],
      ['Démolir', ['X']],
      ['Poser (glisser pour enchaîner)', ['Clic']],
      ['Annuler', ['Clic droit', 'Échap']],
    ],
  },
  {
    title: 'Temps et affichage',
    lines: [
      ['Pause', ['Espace']],
      ['Vitesse ×1, ×2, ×4', ['1', '2', '3']],
      ['Carte de chaleur', ['H']],
      ['Cette aide', ['?', 'F1']],
    ],
  },
];

/** Aide clavier en fenêtre, ouverte à la demande (touche ? ou F1) au lieu d'un panneau permanent. */
export class HelpOverlay {
  readonly root: HTMLElement;

  constructor() {
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 16));
    close.onclick = () => this.close();
    const grid = el(
      'div',
      'help-grid',
      ...SECTIONS.map((section) =>
        el(
          'div',
          'help-section',
          el('h3', undefined, section.title),
          ...section.lines.map(([label, keys]) =>
            el('div', 'help-line', el('span', undefined, label), el('span', undefined, ...keys.map((k) => el('span', 'kbd', k)))),
          ),
        ),
      ),
    );
    const panel = el('div', 'help glass', el('div', 'help-head', el('span', 'panel-title', icon('keyboard', 14), 'Commandes'), close), grid);
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }

  close(): void {
    this.root.hidden = true;
  }
}
