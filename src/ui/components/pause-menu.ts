import type { SettingsStore } from '../../settings';
import { actionKey } from '../../input/keymap';
import { CONFIRM_MS, ConfirmGate } from '../confirm';
import { el, icon } from '../dom';
import type { IconName } from '../icons';
import { OptionsPanel } from './options-panel';

export interface PauseActions {
  resume: () => void;
  showHelp: () => void;
  /** Copie un rapport de bug ; renvoie vrai si la copie a réussi. */
  reportBug: () => Promise<boolean>;
  mainMenu: () => void;
}

/** Menu pause (Échap) : la partie est figée tant qu'il est ouvert. */
export class PauseMenu {
  readonly root: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly options: OptionsPanel;
  private readonly extra = el('div', 'menu-extra');
  private readonly note = el('p', 'menu-note');
  private readonly quitConfirm = new ConfirmGate();

  constructor(settings: SettingsStore, actions: PauseActions) {
    this.options = new OptionsPanel(settings, () => this.show('menu'));
    const item = (name: IconName, label: string, onClick: (b: HTMLButtonElement) => void, primary = false) => {
      const b = el('button', `btn menu-item ${primary ? 'btn-primary' : ''}`, icon(name, 16), el('span', undefined, label));
      b.onclick = () => onClick(b);
      return b;
    };
    const report = item('bug', 'Signaler un bug', (b) => {
      void actions.reportBug().then((ok) => {
        this.flash(b, ok ? 'Rapport copié : collez-le dans votre message' : 'Copie impossible');
        this.note.textContent = ok
          ? 'Joignez si possible la partie en cours : Sauvegarder › Exporter la partie (.json). Elle permet de rejouer le problème.'
          : 'Le navigateur a refusé la copie : décrivez le problème et joignez la partie exportée (Sauvegarder › Exporter la partie).';
        this.note.hidden = false;
      });
    });
    const quit = item('quit', 'Menu principal', (b) => {
      if (this.quitConfirm.armed) {
        this.quitConfirm.disarm();
        actions.mainMenu();
        return;
      }
      this.quitConfirm.arm();
      this.flash(b, 'Quitter la partie ? Cliquez encore', CONFIRM_MS);
    });
    this.menu = el(
      'div',
      'pause-main',
      el('div', 'menu-head', el('span', 'panel-title', icon('pause', 14), 'Pause'), el('span', 'kbd', actionKey('cancel'))),
      item('play', 'Reprendre', () => actions.resume(), true),
      this.extra,
      item('settings', 'Options', () => this.show('options')),
      item('keyboard', 'Commandes', () => actions.showHelp()),
      report,
      quit,
      this.note,
    );
    const panel = el('div', 'pause glass', this.menu, this.options.root);
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.show('menu');
  }

  /** Emplacement pour des entrées ajoutées par d'autres modules (sauvegarde…). */
  addItems(...items: HTMLElement[]): void {
    this.extra.append(...items);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.show('menu');
    this.note.hidden = true;
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  private show(view: 'menu' | 'options'): void {
    this.menu.hidden = view !== 'menu';
    this.options.root.hidden = view !== 'options';
  }

  /** Remplace brièvement le libellé d'une entrée (confirmation, retour d'action). */
  private flash(button: HTMLButtonElement, text: string, ms = 2200): void {
    const label = button.querySelector('span')!;
    const original = label.dataset.original ?? label.textContent ?? '';
    label.dataset.original = original;
    label.textContent = text;
    button.classList.add('flash');
    setTimeout(() => {
      label.textContent = original;
      button.classList.remove('flash');
    }, ms);
  }
}
