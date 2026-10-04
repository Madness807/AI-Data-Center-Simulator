import type { Job } from '../../sim/entities';
import type { GameState } from '../../sim/state';
import { el, icon, setStyle, setText } from '../dom';
import { percent, plural, seconds, signedMoney } from '../format';

export interface ContractsActions {
  acceptJob: (id: number) => void;
  rejectJob: (id: number) => void;
}

/** Carte d'un contrat, créée une fois et mise à jour en place (recréer à chaque image casserait les clics). */
interface Card {
  root: HTMLElement;
  status: Job['status'];
  timer: HTMLElement;
  bar: HTMLElement;
  pct?: HTMLElement;
  rate?: HTMLElement;
  rateLed?: HTMLElement;
  capacity?: HTMLElement;
}

/** « Inférence batch — Lumen Labs » → type de travail et client. */
function splitName(name: string): { kind: string; client: string } {
  const [kind, client] = name.split(' — ');
  return { kind, client: client ?? kind };
}

/** Couleur stable par client, pour reconnaître ses contrats d'un coup d'œil. */
function avatar(client: string): HTMLElement {
  let h = 0;
  for (const c of client) h = (h * 31 + c.charCodeAt(0)) % 360;
  const a = el('span', 'avatar', client[0]);
  a.style.background = `hsl(${h} 70% 64%)`;
  return a;
}

/** Panneau des contrats : en cours d'abord (par échéance), puis les offres (par expiration). Repliable. */
export class ContractsPanel {
  readonly root: HTMLElement;
  private readonly list = el('div', 'contracts-list');
  private readonly empty = el('div', 'contracts-empty', 'Aucune offre pour le moment.');
  private readonly count = el('span', 'contracts-count');
  private readonly chevron = el('span', 'dim');
  private readonly cards = new Map<number, Card>();
  private collapsed = false;

  constructor(private readonly actions: ContractsActions) {
    const head = el('div', 'contracts-head', el('span', 'panel-title', icon('build', 14), 'Contrats'), el('span', 'dim', this.count, ' ', this.chevron));
    head.onclick = () => this.toggle();
    this.root = el('div', 'contracts glass', head, this.list, this.empty);
    this.renderChevron();
  }

  reset(): void {
    this.cards.forEach((c) => c.root.remove());
    this.cards.clear();
  }

  private toggle(): void {
    this.collapsed = !this.collapsed;
    this.root.classList.toggle('collapsed', this.collapsed);
    this.renderChevron();
  }

  private renderChevron(): void {
    this.chevron.replaceChildren(icon(this.collapsed ? 'expand' : 'collapse', 14));
  }

  update(s: GameState): void {
    const seen = new Set<number>();
    const sorted = [...s.jobs].sort((a, b) =>
      a.status !== b.status ? (a.status === 'active' ? -1 : 1) : a.status === 'active' ? a.deadline - b.deadline : a.expiresAt - b.expiresAt,
    );
    sorted.forEach((job, i) => {
      seen.add(job.id);
      let card = this.cards.get(job.id);
      if (card && card.status !== job.status) {
        card.root.remove();
        card = undefined;
      }
      if (!card) {
        card = job.status === 'offer' ? this.offerCard(job) : this.activeCard(job);
        this.cards.set(job.id, card);
      }
      // Ne déplace le nœud que si l'ordre a changé (un déplacement ferait perdre le survol).
      if (this.list.children[i] !== card.root) this.list.insertBefore(card.root, this.list.children[i] ?? null);
      this.fill(card, job, s);
    });
    for (const [id, card] of this.cards) {
      if (seen.has(id)) continue;
      card.root.remove();
      this.cards.delete(id);
    }
    const offers = s.jobs.filter((j) => j.status === 'offer').length;
    const active = s.jobs.length - offers;
    setText(this.count, `${active} en cours · ${offers} ${plural(offers, 'offre')}`);
    this.empty.hidden = s.jobs.length > 0;
  }

  private offerCard(job: Job): Card {
    const { kind, client } = splitName(job.name);
    const bar = el('div');
    const timer = el('span', 'contract-timer');
    const accept = el('button', 'btn btn-primary', icon('done', 14), 'Accepter');
    accept.onclick = () => this.actions.acceptJob(job.id);
    const reject = el('button', 'btn btn-ghost', 'Refuser');
    reject.onclick = () => this.actions.rejectJob(job.id);
    const capacity = el('div', 'chips');
    const root = el(
      'div',
      'contract offer',
      el('div', 'contract-expiry', bar),
      el('div', 'contract-head', avatar(client), el('div', 'contract-who', el('div', 'contract-client', client), el('div', 'contract-kind', kind)), timer),
      el(
        'div',
        'chips',
        el('span', 'chip', icon('compute', 12), `${job.rateCU} CU/s`),
        el('span', 'chip', icon('time', 12), `${job.durationS} s`),
        el('span', 'chip', icon('target', 12), `délai ${job.deadlineInS} s`),
      ),
      el('div', 'contract-reward', el('span', 'reward', signedMoney(job.payment)), el('span', 'penalty', `pénalité ${signedMoney(-job.penalty)}`)),
      capacity,
      el('div', 'contract-actions', accept, reject),
    );
    return { root, status: 'offer', timer, bar, capacity };
  }

  private activeCard(job: Job): Card {
    const { kind, client } = splitName(job.name);
    const timer = el('span', 'contract-timer');
    const bar = el('div', 'meter-fill ok');
    const pct = el('span', 'pct');
    const rateLed = el('span', 'led');
    const rate = el('span');
    const root = el(
      'div',
      'contract active',
      el('div', 'contract-head', avatar(client), el('div', 'contract-who', el('div', 'contract-client', client), el('div', 'contract-kind', kind)), timer),
      el('div', 'contract-progress', el('div', 'meter', bar), pct),
      el('div', 'contract-reward', el('span', 'contract-rate', rateLed, rate), el('span', 'reward', signedMoney(job.payment))),
    );
    return { root, status: 'active', timer, bar, pct, rate, rateLed };
  }

  private fill(card: Card, job: Job, s: GameState): void {
    if (job.status === 'offer') {
      const left = job.expiresAt - s.time;
      setText(card.timer, `expire dans ${seconds(left)}`);
      setStyle(card.bar, 'width', `${Math.max(0, Math.min(1, left / (job.expiresAt - job.offeredAt))) * 100}%`);
      return;
    }
    const left = job.deadline - s.time;
    // En retard si, même au débit plein, le travail restant ne tient plus dans le délai.
    const late = (job.work - job.progress) / job.rateCU > left;
    setText(card.timer, `échéance ${seconds(left)}`);
    card.timer.classList.toggle('danger', late);
    card.root.classList.toggle('late', late);
    const done = job.progress / job.work;
    setStyle(card.bar, 'width', `${done * 100}%`);
    setText(card.pct!, percent(done));
    const starved = job.allocated < job.rateCU - 1e-6;
    setText(card.rate!, `${Math.round(job.allocated)} / ${job.rateCU} CU/s`);
    card.rate!.className = starved ? 'warn' : 'ok';
    card.rateLed!.className = `led ${starved ? 'warn' : 'ok'}`;
  }
}
