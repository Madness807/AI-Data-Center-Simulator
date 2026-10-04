import { ECONOMY } from '../../sim/balance';
import type { GameState } from '../../sim/state';
import { el, icon, setText } from '../dom';
import { clock, money } from '../format';
import type { IconName } from '../icons';

function stat(label: string): { root: HTMLElement; value: HTMLElement } {
  const value = el('b');
  return { root: el('div', undefined, value, el('span', undefined, label)), value };
}

function action(name: IconName, label: string, onClick: () => void, primary = false, key?: string): HTMLButtonElement {
  const b = el('button', `btn ${primary ? 'btn-primary' : ''}`, icon(name, 15), label, key ? el('span', 'kbd', key) : null);
  b.onclick = onClick;
  return b;
}

/** Résumé commun aux écrans de fin : durée, contrats livrés, trésorerie ou retards. */
class EndStats {
  readonly root: HTMLElement;
  private readonly time = stat('temps de jeu');
  private readonly done = stat('contrats livrés');
  private readonly third: { root: HTMLElement; value: HTMLElement };

  constructor(private readonly showMoney: boolean) {
    this.third = stat(showMoney ? 'trésorerie' : 'en retard');
    this.root = el('div', 'screen-stats', this.time.root, this.done.root, this.third.root);
  }

  update(s: GameState): void {
    setText(this.time.value, clock(s.time));
    setText(this.done.value, String(s.economy.jobsDone));
    setText(this.third.value, this.showMoney ? money(s.money) : String(s.economy.jobsFailed));
  }
}

/** Écran titre, au-dessus de la salle de démonstration qui tourne lentement. */
export class TitleScreen {
  readonly root: HTMLElement;

  constructor(start: () => void, showHelp: () => void) {
    this.root = el(
      'div',
      'screen title glass',
      el('div', 'logo', el('span', 'logo-mark', icon('rack', 26)), el('span', undefined, 'DATA CENTER ', el('em', undefined, 'IA'))),
      el('p', 'title-pitch', 'Construisez et exploitez un data center d’IA : honorez les contrats, gardez la salle au frais, réparez les pannes.'),
      el(
        'div',
        'title-rules',
        el('span', 'chip ok', icon('trophy', 12), `Objectif : ${money(ECONOMY.goalMoney)}`),
        el('span', 'chip danger', icon('alert', 12), `Faillite après ${ECONOMY.bankruptcySeconds} s dans le rouge`),
      ),
      el('div', 'screen-actions', action('play', 'Nouvelle partie', start, true, 'Entrée'), action('keyboard', 'Commandes', showHelp, false, '?')),
    );
  }
}

/** Fenêtre de victoire : la partie est en pause jusqu'au choix du joueur. */
export class VictoryScreen {
  readonly root: HTMLElement;
  private readonly stats = new EndStats(true);

  constructor(continueGame: () => void, newGame: () => void) {
    this.root = el(
      'div',
      'screen victory glass',
      el('div', 'screen-icon', icon('trophy', 28)),
      el('h1', undefined, 'Objectif atteint !'),
      el('p', undefined, `Votre data center a franchi les ${money(ECONOMY.goalMoney)}. Continuez à le faire grandir, ou relevez un nouveau défi.`),
      this.stats.root,
      el('div', 'screen-actions', action('play', 'Continuer en mode libre', continueGame, true), action('restart', 'Nouvelle partie', newGame)),
    );
  }

  update(s: GameState): void {
    this.stats.update(s);
  }
}

/** Écran de faillite : résumé de la partie, nouvelle partie ou retour au menu. */
export class DefeatScreen {
  readonly root: HTMLElement;
  private readonly stats = new EndStats(false);

  constructor(newGame: () => void, menu: () => void) {
    this.root = el(
      'div',
      'screen defeat glass',
      el('div', 'screen-icon', icon('trendDown', 28)),
      el('h1', undefined, 'Faillite'),
      el('p', undefined, 'La trésorerie est restée négative trop longtemps : le data center ferme ses portes.'),
      this.stats.root,
      el('div', 'screen-actions', action('restart', 'Nouvelle partie', newGame, true), action('home', 'Menu', menu)),
    );
  }

  update(s: GameState): void {
    this.stats.update(s);
  }
}
