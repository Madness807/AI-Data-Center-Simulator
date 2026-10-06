import type { GameState } from '../../sim/state';
import { el, icon, restartAnimation, setHidden, setStyle, setText } from '../dom';
import { detailView, liveView, type DetailView } from '../research-model';

export interface DetailActions {
  launch: (id: string) => void;
  stop: () => void;
}

/**
 * Fiche du panneau R&D : ce que fait la recherche montrée, ce qu'elle débloque, ce qu'il lui
 * faut, son coût et son délai, et le bouton pour la lancer. La partie fixe n'est refaite que si
 * la tuile montrée ou l'état de l'arbre change ; les valeurs vivantes, à chaque image.
 */
export class ResearchDetail {
  readonly root = el('aside', 'rt-detail');
  private readonly glyph = el('span', 'rt-d-icon');
  private readonly name = el('h2', 'rt-d-name');
  private readonly where = el('div', 'rt-d-where');
  private readonly state = el('span', 'chip rt-d-state');
  private readonly desc = el('p', 'rt-d-desc');
  private readonly unlocks = el('div', 'rt-d-section');
  private readonly requires = el('div', 'rt-d-section');
  private readonly cost = el('b', 'mono');
  private readonly timing = el('span', 'rt-d-timing');
  private readonly progress = el('div', 'rt-d-progress');
  private readonly progressFill = el('div', 'rt-d-progress-fill');
  private readonly progressText = el('span', 'mono');
  private readonly tierProgress = el('div', 'rt-d-tier-progress');
  private readonly button = el('button', 'btn rt-launch');
  private readonly stopButton = el('button', 'btn', icon('pause', 13), 'Arrêter');
  private readonly note = el('p', 'rt-d-note');
  private readonly hint = el('p', 'rt-d-hint', 'Cliquez pour choisir cette recherche');
  private readonly actionsRow = el('div', 'rt-d-buttons', this.button, this.stopButton);
  private id: string | null = null;
  private key = '';
  private view: DetailView | null = null;

  constructor(actions: DetailActions) {
    this.note.id = 'rt-detail-note';
    this.button.setAttribute('aria-describedby', this.note.id);
    this.button.onclick = () => {
      if (this.id) actions.launch(this.id);
    };
    this.stopButton.onclick = () => actions.stop();
    this.progress.append(el('div', 'rt-d-meter', this.progressFill), this.progressText);
    this.root.append(
      el('div', 'rt-d-head', this.glyph, el('div', 'rt-d-title', this.name, this.where)),
      this.state,
      el('div', 'rt-d-body', this.desc, this.unlocks, this.requires, el('div', 'rt-d-cost', this.cost, this.timing), this.progress, this.tierProgress),
      el('div', 'rt-d-actions', this.actionsRow, this.note, this.hint),
    );
  }

  /** Montre une recherche ; `preview` : simple survol, le bouton attend un clic sur la tuile. */
  show(s: GameState, id: string, preview: boolean, structure: string): void {
    const key = `${id}|${structure}|${preview}`;
    if (key === this.key) return;
    this.key = key;
    this.id = id;
    const v = detailView(s, id);
    this.view = v;
    this.root.style.setProperty('--b', `var(--branch-${v.branch})`);
    this.root.style.setProperty('--b-rgb', `var(--branch-${v.branch}-rgb)`);
    this.root.classList.toggle('preview', preview);
    this.glyph.replaceChildren(icon(v.icon, 22));
    setText(this.name, v.name);
    setText(this.where, v.where);
    this.state.className = `chip rt-d-state ${v.state}`;
    this.state.replaceChildren(icon(STATE_GLYPH[v.state], 12), v.stateLabel);
    setText(this.desc, v.description);
    this.unlocks.replaceChildren(
      ...(v.unlocks.length ? [el('div', 'rt-d-label', 'Débloque'), ...v.unlocks.map((u) => el('div', 'rt-d-item', icon(u.icon, 13), u.text))] : []),
    );
    setHidden(this.unlocks, v.unlocks.length === 0);
    const rows = v.requires.map((r) =>
      el('div', `rt-d-item ${r.done ? 'ok' : 'missing'}`, icon(r.done ? 'done' : 'pending', 13), r.name, r.branch ? el('span', 'rt-d-branch', r.branch) : null),
    );
    if (v.tier) rows.push(el('div', `rt-d-item ${v.tier.open ? 'ok' : 'missing'}`, icon(v.tier.open ? 'done' : 'lock', 13), v.tier.text));
    this.requires.replaceChildren(el('div', 'rt-d-label', 'Prérequis'), ...(rows.length ? rows : [el('div', 'rt-d-item ok', 'Aucun')]));
    setText(this.cost, v.cost);
    // Le bouton : lancer, reprendre, ou dire l'état (en cours, terminée, verrouillée).
    setHidden(this.actionsRow, preview);
    setHidden(this.hint, !preview);
    this.button.className = `btn rt-launch${v.button.launches ? ' btn-primary' : ''}`;
    this.button.replaceChildren(icon(v.button.icon, 15), v.button.label);
    this.button.setAttribute('aria-disabled', String(!v.button.launches));
    setHidden(this.stopButton, !v.canStop);
    setText(this.note, v.note);
    setHidden(this.note, preview || !v.note);
    this.update(s);
  }

  /** Valeurs vivantes : délai, avancement, progression vers le palier. */
  update(s: GameState): void {
    if (!this.id) return;
    const live = liveView(s, this.id);
    setText(this.timing, live.timing);
    setHidden(this.progress, live.progress === null);
    if (live.progress !== null) {
      setStyle(this.progressFill, 'width', `${live.progress * 100}%`);
      setText(this.progressText, live.progressText);
    }
    setHidden(this.tierProgress, live.tierProgress === null);
    if (live.tierProgress !== null) setText(this.tierProgress, live.tierProgress);
  }

  /** Lancement refusé : la raison clignote. */
  refuse(): void {
    if (!this.view?.note) return;
    setHidden(this.note, false);
    restartAnimation(this.note, 'flash');
  }

  /** Oublie la recherche montrée (nouvelle partie). */
  reset(): void {
    this.id = null;
    this.key = '';
    this.view = null;
  }
}

/** Pictogramme de chaque état, partagé avec les tuiles et la légende. */
export const STATE_GLYPH = { done: 'done', current: 'running', available: 'launch', locked: 'lock', tier: 'lock' } as const;
