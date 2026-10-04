import { BUILD_COST, CRAC, PDU, RACK, TECH } from '../src/sim/balance';
import { canBuild } from '../src/sim/commands';
import type { Building, BuildingKind, Technician } from '../src/sim/entities';
import { step } from '../src/sim/sim';
import { availableResearch } from '../src/sim/progression';
import { createInitialState, type GameState } from '../src/sim/state';
import { freeCapacity, tempStats } from '../src/sim/stats';

/**
 * Joueur automatique pour l'équilibrage. Il passe par les mêmes commandes que l'interface
 * et ne lit que ce que le HUD affiche. Chaque profil lui retire une compétence.
 */
export interface BotProfile {
  /** Pose un CRAC tous les 3 racks ; sinon, des racks et des PDU seulement. */
  cooling: boolean;
  /** Accepte les offres qu'il peut honorer ; sinon, il les refuse toutes. */
  contracts: boolean;
  /** Taille visée du parc : au-delà, le bot ne fait plus qu'exploiter. */
  maxRacks: number;
  /** Trésorerie gardée de côté pour les réparations, l'électricité et les salaires. */
  reserve: number;
  /** Mode carrière : il consacre une part du calcul à la recherche, dans l'ordre RESEARCH_ORDER. */
  career?: boolean;
}

/** Ordre d'étude du bot de carrière : d'abord ce qui économise du travail et de l'argent. */
const RESEARCH_ORDER = ['auto-repair', 'crac-he', 'pdu-hc', 'opportunistic', 'fast-techs'];
export const CAREER_RESEARCH_SHARE = 0.2;

export const COMPETENT: BotProfile = { cooling: true, contracts: true, maxRacks: 14, reserve: 4000 };

export interface BotRun {
  state: GameState;
  /** Carrière : temps de passage de chaque palier (indice = palier). */
  tierAt: number[];
  /** Carrière : nœud de recherche → temps de fin. */
  researchAt: Record<string, number>;
  /** Temps de jeu de la victoire / de la faillite, null si elle n'a pas eu lieu. */
  wonAt: number | null;
  lostAt: number | null;
  firstDeliveryAt: number | null;
  /** Température maximale relevée dans la salle. */
  maxTemp: number;
  /** Relevé minute par minute, pour comprendre une partie. */
  timeline: string[];
}

type Item = { kind: BuildingKind; x: number; y: number };

const row = (y: number, items: Array<[BuildingKind, number]>): Item[] => items.map(([kind, x]) => ({ kind, x, y }));

/**
 * Disposition visée : deux rangées de racks (y = 10 puis y = 6), un CRAC tous les 3 racks,
 * allées libres entre elles. Le CRAC de départ (8,8) couvre le premier bloc.
 */
const LAYOUT: Item[] = [
  ...row(10, [['rack', 7], ['rack', 9], ['rack', 8]]),
  ...row(10, [['crac', 12], ['rack', 11], ['rack', 13], ['rack', 10]]),
  ...row(10, [['crac', 16], ['rack', 15], ['rack', 17], ['rack', 14]]),
  ...row(10, [['crac', 20], ['rack', 19], ['rack', 21], ['rack', 18]]),
  ...row(6, [['crac', 12], ['rack', 11], ['rack', 13], ['rack', 14]]),
  ...row(6, [['crac', 8], ['rack', 9], ['rack', 10], ['rack', 7]]),
  ...row(6, [['crac', 16], ['rack', 15], ['rack', 17], ['rack', 18]]),
  ...row(6, [['crac', 20], ['rack', 19], ['rack', 21], ['rack', 22]]),
  ...row(10, [['rack', 22], ['rack', 6]]),
];

/** PDU le long du mur du fond, une case sur deux. */
const PDU_SPOTS: Item[] = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21].map((x) => ({ kind: 'pdu', x, y: 1 }));

const THINK_EVERY_TICKS = 10;

const kw = (kind: BuildingKind) => (kind === 'rack' ? RACK.powerKW : kind === 'crac' ? CRAC.powerKW : 0);

function plannedPower(s: GameState): { demand: number; capacity: number } {
  let demand = 0;
  let capacity = 0;
  for (const b of s.buildings) {
    demand += kw(b.kind);
    if (b.kind === 'pdu') capacity += PDU.capacityKW;
  }
  return { demand, capacity };
}

/** Le technicien le moins chargé, puis le plus proche. */
function pickTech(s: GameState, at: Building | Item): Technician | undefined {
  const dist = (t: Technician) => Math.abs(t.x - at.x) + Math.abs(t.y - at.y);
  return [...s.techs].sort((a, b) => a.tasks.length - b.tasks.length || dist(a) - dist(b))[0];
}

class Bot {
  private next = 0;

  constructor(private readonly profile: BotProfile) {}

  think(s: GameState): void {
    if (this.profile.career) this.research(s);
    this.repair(s);
    this.contracts(s);
    this.expand(s);
    this.hire(s);
  }

  private research(s: GameState): void {
    if (s.research.share !== CAREER_RESEARCH_SHARE) s.commands.push({ type: 'setResearchShare', share: CAREER_RESEARCH_SHARE });
    if (s.research.current) return;
    const open = availableResearch(s);
    const next = RESEARCH_ORDER.find((id) => open.includes(id)) ?? open[0];
    if (next) s.commands.push({ type: 'startResearch', id: next });
  }

  private repair(s: GameState): void {
    for (const b of s.buildings) {
      if (b.kind !== 'rack' || b.status !== 'failed') continue;
      if (s.techs.some((t) => t.tasks.some((k) => k.type === 'repair' && k.target === b.id))) continue;
      const tech = pickTech(s, b);
      if (tech) s.commands.push({ type: 'order', techs: [tech.id], task: { type: 'repair', target: b.id }, append: true });
    }
  }

  /** Les offres les mieux payées au CU d'abord, tant que le parc en service suffit. */
  private contracts(s: GameState): void {
    let free = freeCapacity(s);
    const offers = s.jobs.filter((j) => j.status === 'offer').sort((a, b) => b.payment / b.work - a.payment / a.work);
    for (const j of offers) {
      if (!this.profile.contracts) s.commands.push({ type: 'rejectJob', id: j.id });
      else if (j.rateCU <= free) {
        s.commands.push({ type: 'acceptJob', id: j.id });
        free -= j.rateCU;
      }
    }
  }

  /** Plus de racks quand le calcul manque : une offre ne rentre pas, ou moins d'un rack libre. */
  private wantsCapacity(s: GameState): boolean {
    // Sans contrats, il construit à l'aveugle : le joueur qui n'a pas compris l'écran des contrats.
    if (!this.profile.contracts) return true;
    const building = s.buildings.filter((b) => b.kind === 'rack' && b.status === 'construction').length;
    const free = freeCapacity(s) + building * RACK.computeCU;
    const offers = s.jobs.filter((j) => j.status === 'offer');
    return free < RACK.computeCU || offers.some((j) => j.rateCU > free);
  }

  private expand(s: GameState): void {
    while (this.next < LAYOUT.length && LAYOUT[this.next].kind === 'crac' && !this.profile.cooling) this.next++;
    const item = LAYOUT[this.next];
    if (!item) return;
    const racks = s.buildings.filter((b) => b.kind === 'rack').length;
    if (racks >= this.profile.maxRacks) return;
    const sites = s.buildings.filter((b) => b.status === 'construction').length;
    if (sites >= s.techs.length) return;
    // Un CRAC précède ses racks : il est posé dès que le rack suivant devient utile.
    if (item.kind === 'rack' && !this.wantsCapacity(s)) return;
    if (item.kind === 'crac' && !this.wantsCapacity(s)) return;

    const power = plannedPower(s);
    if (power.demand + kw(item.kind) > power.capacity) {
      const spot = PDU_SPOTS.find((p) => canBuild(s, 'pdu', p.x, p.y) === null);
      if (spot && s.money >= BUILD_COST.pdu + this.profile.reserve) this.build(s, spot);
      return;
    }
    if (s.money < BUILD_COST[item.kind] + this.profile.reserve) return;
    if (canBuild(s, item.kind, item.x, item.y) !== null) {
      // Case prise (technicien de passage…) : on retentera au prochain tour.
      return;
    }
    this.build(s, item);
    this.next++;
  }

  private build(s: GameState, item: Item): void {
    const tech = pickTech(s, item);
    s.commands.push({ type: 'build', kind: item.kind, x: item.x, y: item.y, assign: tech ? [tech.id] : [] });
  }

  /** Un technicien de plus tous les 8 racks. */
  private hire(s: GameState): void {
    const racks = s.buildings.filter((b) => b.kind === 'rack').length;
    const wanted = Math.min(TECH.max, TECH.start + Math.floor(racks / 8));
    if (s.techs.length < wanted && s.money >= TECH.hireCost + this.profile.reserve) s.commands.push({ type: 'hire' });
  }
}

/** Joue une partie complète sans rendu ; s'arrête à la victoire, à la faillite ou au délai. */
export function playBot(seed: number, profile: BotProfile, maxSeconds: number): BotRun {
  const s = createInitialState(seed, profile.career ? 'career' : 'quick');
  const bot = new Bot(profile);
  const run: BotRun = { state: s, tierAt: [0], researchAt: {}, wonAt: null, lostAt: null, firstDeliveryAt: null, maxTemp: 0, timeline: [] };
  const totalTicks = Math.round(maxSeconds * 10);
  for (let tick = 0; tick < totalTicks; tick++) {
    if (tick % THINK_EVERY_TICKS === 0) bot.think(s);
    step(s);
    for (const e of s.events) {
      if (e.code === 'delivered' && run.firstDeliveryAt === null) run.firstDeliveryAt = s.time;
      if (e.code === 'tierUp' || (e.code === 'won' && s.mode === 'career')) run.tierAt[s.career.tier] = s.time;
      if (e.code === 'researchDone') run.researchAt[s.research.done[s.research.done.length - 1]] = s.time;
    }
    s.events.length = 0;
    run.maxTemp = Math.max(run.maxTemp, tempStats(s).max);
    if (s.tick % 600 === 0) run.timeline.push(describe(s));
    if (s.outcome === 'won') {
      run.wonAt = s.time;
      break;
    }
    if (s.outcome === 'lost') {
      run.lostAt = s.time;
      break;
    }
  }
  return run;
}

function describe(s: GameState): string {
  const count = (kind: BuildingKind) => s.buildings.filter((b) => b.kind === kind).length;
  const failures = s.buildings.reduce((n, b) => n + b.failures, 0);
  const use = s.compute.total ? Math.round((100 * s.compute.used) / s.compute.total) : 0;
  return [
    `${Math.round(s.time / 60)} min`,
    `${Math.round(s.money)} $`,
    `${count('rack')} racks / ${count('crac')} CRAC / ${count('pdu')} PDU / ${s.techs.length} tech.`,
    `calcul ${use} %`,
    `max ${tempStats(s).max.toFixed(1)} °C`,
    `${failures} pannes`,
    `${s.economy.jobsDone} livrés / ${s.economy.jobsFailed} en retard`,
    ...(s.mode === 'career' ? [`palier ${s.career.tier} (${s.career.reputation} rép.)`, `recherche ${s.research.done.length}`] : []),
  ].join(' · ');
}
