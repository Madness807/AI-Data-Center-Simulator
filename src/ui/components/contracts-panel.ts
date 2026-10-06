import { NETWORK, RACK } from '../../sim/balance';
import type { Job } from '../../sim/entities';
import { freeCapacity } from '../../sim/stats';
import { clusterSpeed, freeBlocks } from '../../sim/clusters';
import { modifiers } from '../../sim/progression';
import { networkActive } from '../../sim/network';
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
    accept.dataset.tuto = 'accept';
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
        job.kind === 'training'
          ? el('span', 'chip training', icon('rack', 12), `bloc de ${job.cluster} racks contigus`)
          : el('span', 'chip', icon('compute', 12), `${job.rateCU} CU/s`),
        el('span', 'chip', icon('time', 12), `${job.durationS} s`),
        el('span', 'chip', icon('target', 12), `délai ${job.deadlineInS} s`),
        job.sla ? el('span', 'chip sla', icon('alert', 12), 'SLA : débit garanti') : null,
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

  /**
   * Entraînement : existe-t-il un bloc libre assez grand ? Des racks côte à côte, et reliés à un
   * switch quand le réseau compte (Labo d'IA) ; à cheval sur plusieurs switchs, il irait moins vite.
   */
  private fillCluster(slot: HTMLElement, job: Job, s: GameState): void {
    const taken = new Set(s.jobs.flatMap((j) => (j.status === 'active' && j.assigned ? j.assigned : [])));
    const size = job.cluster ?? 1;
    const blocks = freeBlocks(s, job.minGen ?? 1, taken);
    const net = networkActive(s);
    const split = net && !modifiers(s).fabric && blocks.linked >= size && blocks.oneSwitch < size;
    const key = `cluster:${blocks.contiguous}:${blocks.linked}:${split}:${net}`;
    if (slot.dataset.key === key) return;
    slot.dataset.key = key;
    const largest = blocks.linked;
    const what = net ? 'plus grand bloc relié' : 'plus grand bloc libre';
    const chips =
      largest >= size
        ? [el('span', 'chip ok', icon('done', 12), `${what} : ${largest} racks`)]
        : [el('span', 'chip warn', icon('alert', 12), `${what} : ${largest} ${plural(largest, 'rack')} (${net ? 'côte à côte et reliés' : 'racks côte à côte'})`)];
    if (net && largest < size && blocks.contiguous >= size) chips.push(el('span', 'chip warn', icon('switch', 12), 'racks non reliés : posez un switch'));
    if (split) chips.push(el('span', 'chip warn', icon('switch', 12), `à cheval sur 2 switchs : vitesse ${percent(NETWORK.crossSwitch)}`));
    slot.replaceChildren(...chips);
  }

  /** Peut-on honorer l'offre avec le calcul encore libre ? Sinon, combien de racks manque-t-il ? */
  private fillCapacity(slot: HTMLElement, rate: number, free: number): void {
    const missing = rate - Math.max(0, free);
    const key = missing <= 0 ? `ok:${free}` : `miss:${missing}`;
    if (slot.dataset.key === key) return;
    slot.dataset.key = key;
    if (missing <= 0) {
      slot.replaceChildren(el('span', 'chip ok', icon('done', 12), `${free} CU/s libres`));
    } else {
      const racks = Math.ceil(missing / RACK.computeCU);
      slot.replaceChildren(el('span', 'chip warn', icon('alert', 12), `manque ${missing} CU/s (${racks} ${plural(racks, 'rack')})`));
    }
  }

  private fill(card: Card, job: Job, s: GameState): void {
    if (job.status === 'offer') {
      const left = job.expiresAt - s.time;
      setText(card.timer, `expire dans ${seconds(left)}`);
      setStyle(card.bar, 'width', `${Math.max(0, Math.min(1, left / (job.expiresAt - job.offeredAt))) * 100}%`);
      if (job.kind === 'training') this.fillCluster(card.capacity!, job, s);
      else this.fillCapacity(card.capacity!, job.rateCU, freeCapacity(s));
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
    if (job.kind === 'training') {
      // À cheval sur plusieurs switchs sans la Fabric, le bloc tourne au ralenti.
      const speed = job.assigned ? clusterSpeed(s, job.assigned) : 1;
      const net = speed < 1 ? ` · réseau ${percent(speed)}` : '';
      const waiting = networkActive(s) ? 'en attente d’un bloc relié' : 'en attente d’un bloc libre';
      setText(card.rate!, job.assigned ? `bloc de ${job.assigned.length} · ${Math.round(job.allocated)} CU/s${net}` : waiting);
      const tone = job.assigned && speed === 1 ? 'ok' : 'warn';
      card.rate!.className = tone;
      card.rateLed!.className = `led ${tone}`;
      return;
    }
    setText(card.rate!, `${Math.round(job.allocated)} / ${job.rateCU} CU/s${job.sla && (job.shortS ?? 0) > 0 ? ` · SLA ${Math.round(job.shortS ?? 0)} s manquées` : ''}`);
    card.rate!.className = starved ? 'warn' : 'ok';
    card.rateLed!.className = `led ${starved ? 'warn' : 'ok'}`;
  }
}
