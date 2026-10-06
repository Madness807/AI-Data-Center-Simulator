import { describe, expect, it } from 'vitest';
import { COMPETENT, playBot, type BotRun } from './bot';

/**
 * Garde-fous d'équilibrage : des parties complètes jouées par un bot sans rendu. Si un
 * réglage de src/sim/balance.ts les fait échouer, c'est l'expérience de jeu qui a changé.
 */
const SEEDS = [1, 2, 3, 4, 5, 6];
const minutes = (s: number | null) => (s === null ? null : s / 60);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const wonAt = (run: BotRun) => minutes(run.wonAt) ?? Infinity;

/** Une partie rapide se joue en 45 minutes au plus ; une carrière, jusqu'à deux heures. */
const QUICK_HORIZON_S = 45 * 60;
const CAREER_HORIZON_S = 130 * 60;
/** Durées maximales des tests (une partie de bot dure de quelques dixièmes à quelques secondes). */
const QUICK_TIMEOUT_MS = 30_000;
const CAREER_TIMEOUT_MS = 120_000;

/** Les parties du joueur compétent servent à deux tests : jouées une seule fois. */
const quickRuns = new Map<number, BotRun>();
function quickRun(seed: number): BotRun {
  let run = quickRuns.get(seed);
  if (!run) quickRuns.set(seed, (run = playBot(seed, COMPETENT, QUICK_HORIZON_S)));
  return run;
}

/** Les parties du joueur soigné en carrière servent aussi à plusieurs tests. */
const careerRuns = new Map<number, BotRun>();
function careerRun(seed: number): BotRun {
  let run = careerRuns.get(seed);
  if (!run) careerRuns.set(seed, (run = playBot(seed, { ...COMPETENT, career: true }, CAREER_HORIZON_S)));
  return run;
}

describe('équilibrage', () => {
  it('un joueur compétent atteint l’objectif en 25 à 40 minutes de jeu, sans frôler la faillite', () => {
    for (const seed of SEEDS) {
      const run = quickRun(seed);
      expect(run.lostAt, `graine ${seed}`).toBeNull();
      expect(minutes(run.wonAt), `graine ${seed}`).toBeGreaterThanOrEqual(25);
      expect(minutes(run.wonAt), `graine ${seed}`).toBeLessThanOrEqual(40);
      expect(run.state.economy.jobsFailed, `graine ${seed}`).toBe(0);
      expect(run.maxTemp, `graine ${seed}`).toBeLessThan(35);
    }
  }, QUICK_TIMEOUT_MS);

  it('grandir paie : un petit parc de 6 racks gagne nettement plus tard', () => {
    const competent = median(SEEDS.map((seed) => wonAt(quickRun(seed))));
    const small = median(SEEDS.map((seed) => wonAt(playBot(seed, { ...COMPETENT, maxRacks: 6 }, 60 * 60))));
    expect(small).toBeGreaterThan(competent + 4);
  }, QUICK_TIMEOUT_MS);

  it('sans refroidissement, c’est la faillite', () => {
    for (const seed of SEEDS) {
      const run = playBot(seed, { ...COMPETENT, cooling: false }, 40 * 60);
      expect(run.wonAt, `graine ${seed}`).toBeNull();
      expect(minutes(run.lostAt), `graine ${seed}`).toBeLessThan(40);
      expect(run.maxTemp, `graine ${seed}`).toBeGreaterThan(50);
    }
  }, QUICK_TIMEOUT_MS);

  it('en refusant tous les contrats, la trésorerie s’effondre', () => {
    for (const seed of SEEDS) {
      const run = playBot(seed, { ...COMPETENT, contracts: false }, 40 * 60);
      expect(run.state.economy.ledger.revenue, `graine ${seed}`).toBe(0);
      expect(minutes(run.lostAt), `graine ${seed}`).toBeLessThan(40);
    }
  }, QUICK_TIMEOUT_MS);

  it('carrière : Scale-up en 8 à 16 minutes, les secours prêts avant le Labo d’IA, victoire en 75 à 120 minutes', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const run = careerRun(seed);
      expect(run.lostAt, `graine ${seed}`).toBeNull();
      expect(minutes(run.tierAt[1] ?? null), `graine ${seed}`).toBeGreaterThanOrEqual(8);
      expect(minutes(run.tierAt[1] ?? null), `graine ${seed}`).toBeLessThanOrEqual(16);
      expect(run.researchAt.generators, `graine ${seed}`).toBeLessThan(run.tierAt[2] ?? Infinity);
      // Le réseau est prêt pour les entraînements du Labo d'IA, et il sert.
      expect(run.researchAt.switches, `graine ${seed}`).toBeLessThan(run.tierAt[2] ?? Infinity);
      expect(run.trainingsDone, `graine ${seed}`).toBeGreaterThan(20);
      // Entraînements et SLA sont risqués par nature : des retards, mais peu.
      expect(run.state.economy.jobsFailed, `graine ${seed}`).toBeLessThanOrEqual(12);
      expect(run.maxIntake, `graine ${seed}`).toBeLessThan(30);
      expect(minutes(run.wonAt), `graine ${seed}`).toBeGreaterThanOrEqual(75);
      expect(minutes(run.wonAt), `graine ${seed}`).toBeLessThanOrEqual(120);
    }
  }, CAREER_TIMEOUT_MS);

  it('carrière : sans recherche, le parc plafonne au palier Labo d’IA', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const run = playBot(seed, { ...COMPETENT, career: true, noResearch: true }, CAREER_HORIZON_S);
      expect(run.lostAt, `graine ${seed}`).toBeNull();
      expect(run.wonAt, `graine ${seed}`).toBeNull();
      expect(run.state.career.tier, `graine ${seed}`).toBeGreaterThanOrEqual(1);
      expect(run.state.career.tier, `graine ${seed}`).toBeLessThanOrEqual(2);
    }
  }, CAREER_TIMEOUT_MS);

  it('carrière : sans énergie de secours, les coupures coûtent des retards et du temps', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const careful = careerRun(seed);
      const reckless = playBot(seed, { ...COMPETENT, career: true, noBackup: true }, CAREER_HORIZON_S);
      const failures = (r: BotRun) => r.state.buildings.reduce((n, b) => n + b.failures, 0);
      expect(reckless.state.incidents.outages, `graine ${seed}`).toBeGreaterThanOrEqual(3);
      expect(reckless.state.economy.jobsFailed, `graine ${seed}`).toBeGreaterThanOrEqual(careful.state.economy.jobsFailed + 3);
      // Arrêts brutaux : les racks non secourus tombent en panne.
      expect(failures(reckless), `graine ${seed}`).toBeGreaterThan(failures(careful) + 8);
      expect(wonAt(reckless), `graine ${seed}`).toBeGreaterThan(wonAt(careful));
    }
  }, CAREER_TIMEOUT_MS);

  it('carrière : sans réseau, aucun entraînement, et une victoire nettement plus tardive', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const careful = careerRun(seed);
      const blind = playBot(seed, { ...COMPETENT, career: true, noNetwork: true }, CAREER_HORIZON_S);
      expect(blind.lostAt, `graine ${seed}`).toBeNull();
      expect(blind.trainingsDone, `graine ${seed}`).toBe(0);
      expect(wonAt(blind), `graine ${seed}`).toBeGreaterThan(wonAt(careful) + 5);
    }
  }, CAREER_TIMEOUT_MS);

  it('le premier contrat est honoré en moins de 2 minutes', () => {
    for (const seed of SEEDS) {
      expect(playBot(seed, COMPETENT, 3 * 60).firstDeliveryAt, `graine ${seed}`).toBeLessThan(120);
    }
  }, QUICK_TIMEOUT_MS);
});
