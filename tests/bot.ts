import { buildCost, CRAC, GENERATOR, GPU, RACK, TECH, TICK_HZ, UPS, WEATHER } from '../src/sim/balance';
import { rackTemp } from '../src/sim/climate';
import { largestFreeCluster } from '../src/sim/clusters';
import { canBuild, upgradeBlocker } from '../src/sim/commands';
import { isRackActive, type Building, type BuildingKind, type Facing, type Gen, type Technician } from '../src/sim/entities';
import { step } from '../src/sim/sim';
import { availableResearch, isUnlocked, modifiers, TIERS } from '../src/sim/progression';
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
  /** Carrière : il ignore l'énergie de secours (ni recherche, ni onduleurs, ni groupes). */
  noBackup?: boolean;
  /** Carrière : il ne fait aucune recherche (tout le calcul va aux contrats). */
  noResearch?: boolean;
}

/** Ordre d'étude du bot de carrière : d'abord ce qui économise du travail et de l'argent. */
export const RESEARCH_ORDER = [
  'auto-repair', 'crac-he', 'pdu-hc', 'ups', 'generators', 'spare-parts', 'containment', 'planned-maintenance', 'gpu-g2',
  'opportunistic', 'retrofit', 'fast-techs', 'checkpoints', 'free-cooling', 'green-power', 'liquid-cooling', 'gpu-g3',
  'specialties', 'switchover-2n', 'predictive', 'heat-reuse', 'optical',
];
export const CAREER_RESEARCH_SHARE = 0.2;

export const COMPETENT: BotProfile = { cooling: true, contracts: true, maxRacks: 14, reserve: 4000 };

/** Réglages de la stratégie du bot (l'équilibrage du jeu, lui, est dans src/sim/balance.ts). */
const BOT = {
  /** Avant la météo, le froid prévu des CRAC doit couvrir la chaleur prévue avec cette marge. */
  coolingMargin: 0.85,
  /** Usure (%) à partir de laquelle il envoie un entretien manuel. */
  maintainWear: 60,
  /** Part du calcul libre qu'il ose engager sur un contrat avec SLA. */
  slaHeadroom: 0.8,
  /** Trésorerie (en plus de sa réserve) à partir de laquelle il modernise un rack. */
  retrofitMoney: 40000,
  /** Il grandit vers le calcul exigé par le palier suivant dès cette part de la réputation requise. */
  growAtReputation: 0.6,
  /** Parc visé en carrière : le dernier palier exige 400 CU/s. */
  careerRacks: 22,
  /** Un technicien de plus tous les N racks. */
  racksPerTech: 8,
  /** Le bot réfléchit une fois par seconde de jeu. */
  thinkEveryTicks: TICK_HZ,
};

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
  /** Température maximale relevée dans la salle (allées chaudes comprises). */
  maxTemp: number;
  /** Température maximale de l'air aspiré par un rack en service : celle qui fixe le risque de panne. */
  maxIntake: number;
  /** Relevé minute par minute, pour comprendre une partie. */
  timeline: string[];
}

type Item = { kind: BuildingKind; x: number; y: number; facing?: Facing; gen?: Gen };

/**
 * Une rangée : en carrière, les racks tournent le dos à l'allée centrale (y = 8), où soufflent
 * les deux rangées et où se trouve le CRAC de départ ; ils aspirent côté mur.
 */
const row = (y: number, items: Array<[BuildingKind, number]>): Item[] =>
  items.map(([kind, x]) => ({ kind, x, y, facing: (y < 8 ? 2 : 0) as Facing }));

/**
 * Disposition visée : deux rangées de racks (y = 10 puis y = 6), un CRAC tous les 3 racks,
 * allées libres entre elles. Le CRAC de départ (8,8) couvre le premier bloc.
 */
export const LAYOUT: Item[] = [
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

/**
 * Disposition de carrière : deux rangées continues (y = 10 puis y = 6), dos à l'allée centrale,
 * pour former de grands blocs d'entraînement. Les CRAC vont sur la ligne centrale (y = 8),
 * entre les deux allées chaudes, à mesure que la chaleur des racks l'exige.
 */
export const CAREER_RACKS: Item[] = [
  ...[7, 8, 9, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((x) => ({ kind: 'rack' as const, x, y: 10, facing: 0 as Facing })),
  ...[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map((x) => ({ kind: 'rack' as const, x, y: 6, facing: 2 as Facing })),
];
export const CAREER_CRACS = [11, 14, 17, 20, 5, 12, 15, 18, 9, 21, 6, 13, 16, 19, 10, 22, 7].map((x) => ({ kind: 'crac' as const, x, y: 8 }));

/**
 * Chaleur prévue des racks (construits ou en chantier) face au froid prévu des CRAC. Une fois
 * la météo en jeu, il garde de quoi tenir une canicule (CRAC au plus bas de leur efficacité).
 */
function coolingDeficit(s: GameState): boolean {
  const heat = s.buildings.reduce((sum, b) => sum + (b.kind === 'rack' ? GPU[b.gen ?? 1].heatKW : 0), 0);
  const cold = s.buildings.filter((b) => b.kind === 'crac').length * modifiers(s).cracCoolingKW;
  return heat > cold * (s.career.tier >= WEATHER.minTier ? WEATHER.cracMin : BOT.coolingMargin);
}

/** Secours le long du mur du bas, une case sur deux, puis devant les PDU du fond. */
export const BACKUP_SPOTS = [
  ...[2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((x) => ({ x, y: 14 })),
  ...[4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((x) => ({ x, y: 3 })),
];

/** PDU le long du mur du fond, une case sur deux. */
export const PDU_SPOTS: Item[] = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21].map((x) => ({ kind: 'pdu', x, y: 1 }));


const kw = (kind: BuildingKind, gen: Gen = 1) => (kind === 'rack' ? GPU[gen].powerKW : kind === 'crac' ? CRAC.powerKW : 0);

function plannedPower(s: GameState): { demand: number; capacity: number } {
  let demand = 0;
  let capacity = 0;
  const pduKW = modifiers(s).pduCapacityKW;
  for (const b of s.buildings) {
    demand += kw(b.kind, b.gen);
    if (b.kind === 'pdu') capacity += pduKW;
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
  private readonly layout: Item[];

  constructor(private readonly profile: BotProfile) {
    this.layout = profile.career ? CAREER_RACKS : LAYOUT;
  }

  think(s: GameState): void {
    if (this.profile.career) this.research(s);
    this.repair(s);
    if (this.profile.career) this.maintain(s);
    this.contracts(s);
    if (this.profile.career && this.addPdu(s)) return;
    if (this.profile.career && !this.profile.noBackup && this.backup(s)) return;
    if (this.profile.career && this.retrofit(s)) return;
    this.expand(s);
    this.hire(s);
  }

  private research(s: GameState): void {
    if (this.profile.noResearch) return;
    if (s.research.share !== CAREER_RESEARCH_SHARE) s.commands.push({ type: 'setResearchShare', share: CAREER_RESEARCH_SHARE });
    const open = availableResearch(s);
    // L'avertissement du palier Scale-up : les secours électriques passent avant tout le reste.
    const urgent = this.profile.noBackup ? undefined : ['ups', 'generators'].find((id) => open.includes(id));
    if (urgent && s.research.current !== urgent && !['ups', 'generators'].includes(s.research.current ?? '')) {
      s.commands.push({ type: 'startResearch', id: urgent });
      return;
    }
    if (s.research.current) return;
    const order = this.profile.noBackup ? RESEARCH_ORDER.filter((id) => !['ups', 'generators', 'switchover-2n'].includes(id)) : RESEARCH_ORDER;
    const next = order.find((id) => open.includes(id)) ?? open.find((id) => !this.profile.noBackup || !['ups', 'generators'].includes(id));
    if (next) s.commands.push({ type: 'startResearch', id: next });
  }

  /**
   * Secours (carrière) : des groupes pour toute la demande, des onduleurs pour couvrir leur
   * démarrage. Renvoie vrai s'il vient de lancer un chantier.
   */
  private backup(s: GameState): boolean {
    const demand = plannedPower(s).demand;
    const count = (kind: BuildingKind) => s.buildings.filter((b) => b.kind === kind).length;
    const want: [BuildingKind, number][] = [
      ['ups', isUnlocked(s, 'ups') ? Math.ceil(demand / UPS.powerKW) - count('ups') : 0],
      ['generator', isUnlocked(s, 'generator') ? Math.ceil(demand / GENERATOR.powerKW) - count('generator') : 0],
    ];
    const [kind, missing] = want.reduce((a, b) => (b[1] > a[1] ? b : a));
    if (missing <= 0) return false;
    if (s.buildings.filter((b) => b.status === 'construction').length >= s.techs.length) return false;
    if (s.money < buildCost(kind) + this.profile.reserve) return false;
    const spot = BACKUP_SPOTS.find((p) => canBuild(s, kind, p.x, p.y) === null);
    if (!spot) return false;
    this.build(s, { kind, ...spot });
    return true;
  }

  /** Entretien manuel (avant la maintenance planifiée) : un rack usé à 60 % part chez un technicien libre. */
  private maintain(s: GameState): void {
    for (const b of s.buildings) {
      if (b.kind !== 'rack' || b.status !== 'ok' || (b.wear ?? 0) < BOT.maintainWear) continue;
      if (s.techs.some((t) => t.tasks.some((k) => k.type === 'maintain' && k.target === b.id))) continue;
      const idle = s.techs.find((t) => t.tasks.length === 0);
      if (!idle) return;
      s.commands.push({ type: 'order', techs: [idle.id], task: { type: 'maintain', target: b.id }, append: true });
    }
  }

  private repair(s: GameState): void {
    for (const b of s.buildings) {
      if (b.kind !== 'rack' || b.status !== 'failed') continue;
      if (s.techs.some((t) => t.tasks.some((k) => k.type === 'repair' && k.target === b.id))) continue;
      const tech = pickTech(s, b);
      if (tech) s.commands.push({ type: 'order', techs: [tech.id], task: { type: 'repair', target: b.id }, append: true });
    }
  }

  /**
   * Les offres les mieux payées au CU d'abord, tant que le parc en service suffit. Un
   * entraînement n'est pris que si un bloc libre assez grand existe (hors blocs déjà pris).
   */
  private contracts(s: GameState): void {
    let free = freeCapacity(s);
    let training = s.jobs.some((j) => j.status === 'active' && j.kind === 'training' && !j.assigned);
    const offers = s.jobs.filter((j) => j.status === 'offer').sort((a, b) => b.payment / b.work - a.payment / a.work);
    for (const j of offers) {
      if (!this.profile.contracts) s.commands.push({ type: 'rejectJob', id: j.id });
      else if (j.kind === 'training') {
        const taken = new Set(s.jobs.flatMap((o) => (o.status === 'active' && o.assigned ? o.assigned : [])));
        if (!training && largestFreeCluster(s, j.minGen ?? 1, taken) >= (j.cluster ?? 1) && free >= j.rateCU) {
          s.commands.push({ type: 'acceptJob', id: j.id });
          free -= j.rateCU;
          training = true;
        }
      } else if (j.rateCU <= free * (j.sla ? BOT.slaHeadroom : 1)) {
        s.commands.push({ type: 'acceptJob', id: j.id });
        free -= j.rateCU;
      }
    }
  }

  /**
   * Modernisation : quand l'argent abonde, le plus ancien rack G1 passe en G2. Jamais en G3 :
   * le bot ne pose pas de CDU, et un G3 refroidi à l'air seul surchauffe.
   */
  private retrofit(s: GameState): boolean {
    if (!modifiers(s).retrofit || s.money < BOT.retrofitMoney + this.profile.reserve) return false;
    if (s.buildings.some((b) => b.status === 'construction')) return false;
    const target = s.buildings.find((b) => b.kind === 'rack' && (b.gen ?? 1) === 1 && upgradeBlocker(s, b) === null);
    if (!target) return false;
    // Un G2 consomme davantage : la puissance d'abord.
    if (this.addPdu(s, GPU[2].powerKW - GPU[1].powerKW)) return true;
    const tech = pickTech(s, target);
    s.commands.push({ type: 'upgrade', id: target.id, assign: tech ? [tech.id] : [] });
    return true;
  }

  /**
   * Carrière : un PDU dès que la demande prévue (plus `extra` kW) dépasse la capacité — un
   * CRAC ou une modernisation consomme aussi. Vrai s'il vient d'en poser un.
   */
  private addPdu(s: GameState, extra = 0): boolean {
    const power = plannedPower(s);
    if (power.demand + extra <= power.capacity) return false;
    const spot = PDU_SPOTS.find((p) => canBuild(s, 'pdu', p.x, p.y) === null);
    if (!spot || s.money < buildCost('pdu') + this.profile.reserve) return false;
    this.build(s, spot);
    return true;
  }

  /** Plus de racks quand le calcul manque : une offre ne rentre pas, ou moins d'un rack libre. */
  private wantsCapacity(s: GameState): boolean {
    // Sans contrats, il construit à l'aveugle : le joueur qui n'a pas compris l'écran des contrats.
    if (!this.profile.contracts) return true;
    // Carrière : le palier suivant exige du calcul en service ; il grandit jusqu'à l'atteindre.
    const next = this.profile.career ? TIERS[s.career.tier + 1] : undefined;
    if (next?.computeCU && s.career.reputation >= next.reputation * BOT.growAtReputation && s.compute.total < next.computeCU) return true;
    const building = s.buildings.filter((b) => b.kind === 'rack' && b.status === 'construction').length;
    const free = freeCapacity(s) + building * RACK.computeCU;
    const offers = s.jobs.filter((j) => j.status === 'offer');
    return free < RACK.computeCU || offers.some((j) => j.rateCU > free);
  }

  private expand(s: GameState): void {
    const layout = this.layout;
    while (this.next < layout.length && layout[this.next].kind === 'crac' && !this.profile.cooling) this.next++;
    // Carrière : un CRAC dès que la chaleur prévue dépasse le froid disponible.
    if (this.profile.career && this.profile.cooling && coolingDeficit(s)) {
      const spot = CAREER_CRACS.find((c) => canBuild(s, 'crac', c.x, c.y) === null);
      const sites = s.buildings.filter((b) => b.status === 'construction').length;
      if (spot && sites < s.techs.length && s.money >= buildCost('crac') + this.profile.reserve) this.build(s, spot);
      return;
    }
    const base = layout[this.next];
    // Les nouveaux racks prennent la meilleure génération étudiée.
    const item = base && base.kind === 'rack' && this.profile.career ? { ...base, gen: modifiers(s).maxGen === 3 ? 2 : modifiers(s).maxGen } : base;
    if (!item) return;
    const racks = s.buildings.filter((b) => b.kind === 'rack').length;
    // En carrière, le dernier palier exige 400 CU/s : le bot vise un parc plus grand.
    if (racks >= (this.profile.career ? Math.max(this.profile.maxRacks, BOT.careerRacks) : this.profile.maxRacks)) return;
    const sites = s.buildings.filter((b) => b.status === 'construction').length;
    if (sites >= s.techs.length) return;
    // Un CRAC précède ses racks : il est posé dès que le rack suivant devient utile.
    if (item.kind === 'rack' && !this.wantsCapacity(s)) return;
    if (item.kind === 'crac' && !this.wantsCapacity(s)) return;

    const power = plannedPower(s);
    if (power.demand + kw(item.kind, item.gen) > power.capacity) {
      const spot = PDU_SPOTS.find((p) => canBuild(s, 'pdu', p.x, p.y) === null);
      if (spot && s.money >= buildCost('pdu') + this.profile.reserve) this.build(s, spot);
      return;
    }
    if (s.money < buildCost(item.kind, item.gen) + this.profile.reserve) return;
    if (canBuild(s, item.kind, item.x, item.y, item.gen) !== null) {
      // Case prise (technicien de passage…) : on retentera au prochain tour.
      return;
    }
    this.build(s, item);
    this.next++;
  }

  private build(s: GameState, item: Item): void {
    const tech = pickTech(s, item);
    s.commands.push({ type: 'build', kind: item.kind, x: item.x, y: item.y, facing: item.facing, gen: item.gen, assign: tech ? [tech.id] : [] });
  }

  /** Un technicien de plus tous les 8 racks. */
  private hire(s: GameState): void {
    const racks = s.buildings.filter((b) => b.kind === 'rack').length;
    const wanted = Math.min(TECH.max, TECH.start + Math.floor(racks / BOT.racksPerTech));
    if (s.techs.length < wanted && s.money >= TECH.hireCost + this.profile.reserve) s.commands.push({ type: 'hire' });
  }
}

/** Joue une partie complète sans rendu ; s'arrête à la victoire, à la faillite ou au délai. */
export function playBot(seed: number, profile: BotProfile, maxSeconds: number): BotRun {
  const s = createInitialState(seed, profile.career ? 'career' : 'quick');
  const bot = new Bot(profile);
  const run: BotRun = { state: s, tierAt: [0], researchAt: {}, wonAt: null, lostAt: null, firstDeliveryAt: null, maxTemp: 0, maxIntake: 0, timeline: [] };
  const totalTicks = Math.round(maxSeconds * TICK_HZ);
  for (let tick = 0; tick < totalTicks; tick++) {
    if (tick % BOT.thinkEveryTicks === 0) bot.think(s);
    step(s);
    for (const e of s.events) {
      if (e.code === 'delivered' && run.firstDeliveryAt === null) run.firstDeliveryAt = s.time;
      if (e.code === 'tierUp' || (e.code === 'won' && s.mode === 'career')) run.tierAt[s.career.tier] = s.time;
      if (e.code === 'researchDone') run.researchAt[s.research.done[s.research.done.length - 1]] = s.time;
    }
    s.events.length = 0;
    run.maxTemp = Math.max(run.maxTemp, tempStats(s).max);
    for (const b of s.buildings) if (isRackActive(b)) run.maxIntake = Math.max(run.maxIntake, rackTemp(s, b));
    if (s.tick % (60 * TICK_HZ) === 0) run.timeline.push(timelineLine(s));
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

function timelineLine(s: GameState): string {
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
