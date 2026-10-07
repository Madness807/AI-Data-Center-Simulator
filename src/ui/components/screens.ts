import { ECONOMY } from '../../sim/balance';
import { TIERS } from '../../sim/progression';
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

/** Crédits repliés sous la version : composants tiers et lien vers leurs licences complètes. */
function credits(): { toggle: HTMLButtonElement; panel: HTMLElement } {
  const licenses = el('a', undefined, 'Textes complets des licences');
  Object.assign(licenses, { href: 'assets/LICENSES.md', target: '_blank', rel: 'noopener' });
  const panel = el(
    'div',
    'title-credits',
    el('p', undefined, 'Modèles 3D, textures et sons sont générés par le code du jeu.'),
    el('p', undefined, 'Moteur 3D three.js (MIT) · icônes Lucide (ISC) · polices Inter et JetBrains Mono (SIL OFL 1.1).'),
    el('p', undefined, licenses),
  );
  panel.hidden = true;
  const toggle = el('button', 'link-button', 'Crédits');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
  };
  return { toggle, panel };
}

export type NewGameKind = 'career' | 'quick' | 'tutorial';

/** Carte d'un mode de jeu sur l'écran titre : icône, nom et règle du mode en une ligne. */
function modeCard(name: IconName, label: string, rule: string, onClick: () => void): HTMLButtonElement {
  const b = el(
    'button',
    'mode-card',
    el('span', 'mode-icon', icon(name, 18)),
    el('span', 'mode-text', el('b', undefined, label), el('span', undefined, rule)),
  );
  b.onclick = onClick;
  return b;
}

/**
 * Écran titre, au-dessus de la salle de démonstration qui tourne lentement : « Continuer »
 * s'il existe une sauvegarde, les deux modes en cartes, puis les liens secondaires.
 */
export class TitleScreen {
  readonly root: HTMLElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly careerCard: HTMLButtonElement;
  private readonly loadButton: HTMLButtonElement;

  constructor(start: (kind: NewGameKind) => void, showHelp: () => void, continueGame: () => void, openLoad: () => void) {
    this.continueButton = action('play', 'Continuer la partie', continueGame, true);
    this.continueButton.classList.add('title-continue');
    this.careerCard = modeCard(
      'tier',
      'Carrière',
      `${TIERS.length} paliers, de ${TIERS[0].name} à ${TIERS[TIERS.length - 1].name}`,
      () => start('career'),
    );
    const quickCard = modeCard('trophy', 'Partie rapide', `Atteindre ${money(ECONOMY.goalMoney)} de trésorerie`, () => start('quick'));
    this.loadButton = action('load', 'Charger', openLoad);
    const about = credits();
    this.root = el(
      'div',
      'screen title glass',
      el('div', 'logo', el('span', 'logo-mark', icon('rack', 26)), el('span', undefined, 'DATA CENTER ', el('em', undefined, 'IA'))),
      el('p', 'title-pitch', 'Construisez et exploitez un data center d’IA : honorez les contrats, gardez la salle au frais, réparez les pannes.'),
      this.continueButton,
      el('div', 'title-modes', this.careerCard, quickCard),
      el('p', 'title-rule', icon('alert', 12), `Dans les deux modes : faillite après ${ECONOMY.bankruptcySeconds} s dans le rouge.`),
      el(
        'div',
        'title-links',
        action('target', 'Tutoriel', () => start('tutorial')),
        this.loadButton,
        action('keyboard', 'Commandes', showHelp, false, '?'),
      ),
      el('div', 'title-foot mono', `version ${__APP_VERSION__} · `, about.toggle),
      about.panel,
    );
    this.setSaves(false);
  }

  /**
   * « Continuer » et « Charger » n'apparaissent que s'il existe une sauvegarde ; sinon la
   * carte Carrière est mise en avant comme action principale.
   */
  setSaves(available: boolean): void {
    this.continueButton.hidden = !available;
    this.loadButton.hidden = !available;
    this.careerCard.classList.toggle('featured', !available);
  }

  /** Action de la touche Entrée : continuer s'il y a une sauvegarde, sinon la carrière. */
  primary(): void {
    (this.continueButton.hidden ? this.careerCard : this.continueButton).click();
  }
}

/** Fenêtre de victoire : la partie est en pause jusqu'au choix du joueur. */
export class VictoryScreen {
  readonly root: HTMLElement;
  private readonly stats = new EndStats(true);
  private readonly title = el('h1');
  private readonly text = el('p');

  constructor(continueGame: () => void, newGame: () => void) {
    this.root = el(
      'div',
      'screen victory glass',
      el('div', 'screen-icon', icon('trophy', 28)),
      this.title,
      this.text,
      this.stats.root,
      el('div', 'screen-actions', action('play', 'Continuer en mode libre', continueGame, true), action('restart', 'Nouvelle partie', newGame)),
    );
  }

  update(s: GameState): void {
    const top = TIERS[TIERS.length - 1].name;
    setText(this.title, s.mode === 'career' ? `${top} !` : 'Objectif atteint !');
    setText(
      this.text,
      s.mode === 'career'
        ? `Votre data center a gravi les ${TIERS.length} paliers : les plus grands clients vous confient leurs calculs. Continuez à le faire grandir, ou relevez un nouveau défi.`
        : `Votre data center a franchi les ${money(ECONOMY.goalMoney)}. Continuez à le faire grandir, ou relevez un nouveau défi.`,
    );
    this.stats.update(s);
  }
}

/** Passage de palier (carrière) : la partie est en pause le temps de lire les nouveautés. */
export class TierScreen {
  readonly root: HTMLElement;
  private readonly title = el('h1');
  private readonly perks = el('ul', 'tier-perks');
  private readonly next = el('p', 'tier-next');

  constructor(resume: () => void) {
    this.root = el(
      'div',
      'screen tier glass',
      el('div', 'screen-icon', icon('tier', 28)),
      this.title,
      el('p', undefined, 'Votre réputation attire de plus gros clients.'),
      this.perks,
      this.next,
      el('div', 'screen-actions', action('play', 'Continuer', resume, true)),
    );
  }

  show(tier: number): void {
    const t = TIERS[tier];
    setText(this.title, `Nouveau palier : ${t.name}`);
    this.perks.replaceChildren(...t.perks.map((p) => el('li', undefined, icon('done', 14), p)));
    const next = TIERS[tier + 1];
    setText(
      this.next,
      next ? `Prochain palier : ${next.name}, à ${next.reputation} de réputation${next.computeCU ? ` et ${next.computeCU} CU/s de calcul en service` : ''}.` : '',
    );
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
