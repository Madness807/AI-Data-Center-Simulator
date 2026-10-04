import { MAX_RESEARCH_SHARE } from '../../sim/career';
import { researchBlocker, TIERS } from '../../sim/progression';
import { BRANCHES, RESEARCH, researchById, type ResearchNode } from '../../sim/research';
import type { GameState } from '../../sim/state';
import { el, icon, setStyle, setText } from '../dom';
import { decimal, percent } from '../format';

export interface ResearchActions {
  setShare: (share: number) => void;
  /** null : arrête l'étude en cours (la part réservée retourne aux contrats). */
  start: (id: string | null) => void;
}

interface Card {
  root: HTMLButtonElement;
  status: HTMLElement;
  fill: HTMLElement;
}

const minutes = (s: number) => (s < 90 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`);

/** Panneau Recherche (U, carrière) : part du calcul pour la R&D et arbre en quatre branches. */
export class ResearchPanel {
  readonly root: HTMLElement;
  private readonly rate = el('span', 'mono');
  private readonly slider: HTMLInputElement;
  private readonly shareValue = el('span', 'mono research-share-value');
  private readonly shareNote = el('span', 'research-note');
  private readonly currentName = el('b');
  private readonly currentInfo = el('span', 'research-note mono');
  private readonly currentFill = el('div', 'meter-fill ok');
  private readonly stopButton: HTMLButtonElement;
  private readonly cards = new Map<string, Card>();

  constructor(private readonly actions: ResearchActions) {
    const close = el('button', 'btn btn-ghost btn-icon', icon('close', 16));
    close.title = 'Fermer (U ou Échap)';
    close.onclick = () => this.close();

    this.slider = el('input', 'research-slider');
    Object.assign(this.slider, { type: 'range', min: '0', max: String(MAX_RESEARCH_SHARE * 100), step: '5' });
    this.slider.oninput = () => actions.setShare(Number(this.slider.value) / 100);
    this.stopButton = el('button', 'btn', icon('pause', 13), 'Arrêter');
    this.stopButton.onclick = () => actions.start(null);

    const columns = el('div', 'research-tree');
    for (const branch of BRANCHES) {
      const col = el('div', 'research-branch', el('div', 'research-branch-title', branch.name));
      const nodes = RESEARCH.filter((n) => n.branch === branch.id);
      for (const level of [...new Set(nodes.map((n) => n.level))].sort()) {
        col.append(el('div', 'research-level', `Niveau ${level} · ${TIERS[level - 1].name}`));
        for (const node of nodes.filter((n) => n.level === level)) col.append(this.card(node));
      }
      columns.append(col);
    }

    const panel = el(
      'div',
      'research glass',
      el('div', 'menu-head', el('span', 'panel-title', icon('research', 14), 'Recherche · ', this.rate), el('span', 'kbd', 'U'), close),
      el(
        'div',
        'research-controls',
        el('label', 'research-share', el('span', undefined, 'Part du calcul pour la R&D'), this.slider, this.shareValue),
        this.shareNote,
      ),
      el(
        'div',
        'research-current',
        el('div', 'research-current-head', this.currentName, this.currentInfo, this.stopButton),
        el('div', 'meter', this.currentFill),
      ),
      columns,
    );
    this.root = el('div', 'modal-backdrop interactive', panel);
    this.root.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  private card(node: ResearchNode): HTMLElement {
    const status = el('span', 'research-status');
    const fill = el('div', 'meter-fill ok');
    const root = el(
      'button',
      'research-node',
      el('div', 'research-node-head', el('b', undefined, node.name), el('span', 'mono research-cost', `${node.cost} pts`)),
      el('p', undefined, node.description),
      el('div', 'meter', fill),
      status,
    );
    root.onclick = () => this.actions.start(node.id);
    this.cards.set(node.id, { root, status, fill });
    return root;
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.root.hidden = false;
  }

  close(): void {
    this.root.hidden = true;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  update(s: GameState): void {
    if (!this.isOpen) return;
    const r = s.research;
    setText(this.rate, `${decimal(r.ratePerS)} pt/s`);
    const share = Math.round(r.share * 100);
    if (document.activeElement !== this.slider) this.slider.value = String(share);
    setText(this.shareValue, percent(r.share));
    const reserved = s.compute.total * r.share;
    setText(
      this.shareNote,
      r.current
        ? `${Math.round(reserved)} CU/s sur ${s.compute.total} retirés aux contrats`
        : 'Aucune étude en cours : tout le calcul va aux contrats.',
    );

    const current = r.current ? researchById(r.current) : undefined;
    this.stopButton.hidden = !current;
    if (current) {
      const done = r.progress[current.id] ?? 0;
      setText(this.currentName, current.name);
      const eta = r.ratePerS > 0 ? ` · encore ${minutes((current.cost - done) / r.ratePerS)}` : ' · aucun calcul disponible';
      setText(this.currentInfo, `${Math.floor(done)} / ${current.cost} pts${eta}`);
      setStyle(this.currentFill, 'width', `${Math.min(100, (done / current.cost) * 100)}%`);
    } else {
      setText(this.currentName, 'Aucune étude en cours');
      setText(this.currentInfo, 'cliquez sur un nœud disponible pour le lancer');
      setStyle(this.currentFill, 'width', '0%');
    }

    for (const [id, card] of this.cards) {
      const node = researchById(id)!;
      const progress = r.progress[id] ?? 0;
      const isDone = r.done.includes(id);
      const isCurrent = r.current === id;
      const blocker = isDone ? null : researchBlocker(s, id);
      card.root.className = `research-node ${isDone ? 'done' : isCurrent ? 'current' : blocker ? 'locked' : 'available'}`;
      card.root.disabled = isDone || isCurrent || blocker !== null;
      setStyle(card.fill, 'width', `${isDone ? 100 : Math.min(100, (progress / node.cost) * 100)}%`);
      setText(card.status, isDone ? 'Terminé' : isCurrent ? 'En cours' : blocker ?? (progress > 0 ? 'Reprendre' : 'Lancer'));
    }
  }
}
