import type { SaveSlot, SlotInfo } from '../../save';
import { SAVE_SLOTS } from '../../save';
import { el, icon, setText } from '../dom';
import { clock, money, plural } from '../format';

export interface SaveSlotsActions {
  list: () => SlotInfo[];
  /** Renvoient null si tout va bien, sinon le message d'erreur à afficher. */
  save: (slot: SaveSlot) => string | null;
  load: (slot: SaveSlot) => string | null;
  importText: (text: string) => string | null;
  exportGame: () => void;
}

const CONFIRM_MS = 3000;
const slotName = (slot: SaveSlot) => (slot === 'auto' ? 'Sauvegarde automatique' : `Emplacement ${slot}`);

function describe(info: SlotInfo | undefined): string {
  if (!info) return 'vide';
  const s = info.summary;
  const date = new Date(info.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const issue = s.outcome === 'won' ? ' · objectif atteint' : s.outcome === 'lost' ? ' · faillite' : '';
  return `${date} · ${clock(s.time)} de jeu · ${money(s.money)} · ${s.racks} ${plural(s.racks, 'rack')}${issue}`;
}

/** Fenêtre des emplacements : sauvegarder (en partie) ou charger, plus export / import de fichier. */
export class SaveSlots {
  readonly root: HTMLElement;
  private readonly title = el('span', 'panel-title');
  private readonly rows = el('div', 'slots');
  private readonly status = el('div', 'slots-status');
  private readonly exportButton: HTMLButtonElement;
  private mode: 'save' | 'load' = 'load';
  private armed: { slot: SaveSlot; until: number } | null = null;

  constructor(private readonly actions: SaveSlotsActions) {
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 15));
    close.onclick = () => this.close();
    this.exportButton = el('button', 'btn', icon('download', 14), 'Exporter la partie');
    this.exportButton.onclick = () => actions.exportGame();
    const file = el('input');
    Object.assign(file, { type: 'file', accept: '.json,application/json', hidden: true });
    file.onchange = async () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      const error = actions.importText(await f.text());
      if (error) this.report(error, true);
    };
    const importButton = el('button', 'btn', icon('upload', 14), 'Importer un fichier…');
    importButton.onclick = () => file.click();
    const panel = el(
      'div',
      'slots-panel glass',
      el('div', 'menu-head', this.title, close),
      this.rows,
      this.status,
      el('div', 'slots-files', this.exportButton, importButton, file),
    );
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(mode: 'save' | 'load'): void {
    this.mode = mode;
    this.armed = null;
    this.title.replaceChildren(icon(mode === 'save' ? 'save' : 'load', 14), mode === 'save' ? 'Sauvegarder' : 'Charger une partie');
    this.exportButton.hidden = mode !== 'save';
    setText(this.status, '');
    this.render();
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  private report(text: string, error = false): void {
    setText(this.status, text);
    this.status.classList.toggle('danger', error);
  }

  private render(): void {
    const infos = new Map(this.actions.list().map((i) => [i.slot, i] as const));
    this.rows.replaceChildren(
      ...SAVE_SLOTS.filter((slot) => this.mode === 'load' || slot !== 'auto').map((slot) => {
        const info = infos.get(slot);
        const button = el('button', `btn ${this.mode === 'load' ? 'btn-primary' : ''}`);
        if (this.mode === 'load') {
          button.append(icon('load', 14), 'Charger');
          button.disabled = !info;
          button.onclick = () => {
            const error = this.actions.load(slot);
            if (error) this.report(error, true);
          };
        } else {
          button.append(icon('save', 14), info ? 'Écraser' : 'Sauvegarder ici');
          button.onclick = () => {
            // Écraser une sauvegarde existante demande un second clic.
            if (info && !(this.armed?.slot === slot && performance.now() < this.armed.until)) {
              this.armed = { slot, until: performance.now() + CONFIRM_MS };
              button.replaceChildren(icon('save', 14), 'Confirmer ?');
              button.classList.add('confirm');
              return;
            }
            const error = this.actions.save(slot);
            this.report(error ?? `Partie sauvegardée dans « ${slotName(slot)} ».`, !!error);
            this.armed = null;
            this.render();
          };
        }
        return el(
          'div',
          `slot ${info ? '' : 'empty'}`,
          el('div', 'slot-text', el('b', undefined, slotName(slot)), el('span', 'dim', describe(info))),
          button,
        );
      }),
    );
  }
}
