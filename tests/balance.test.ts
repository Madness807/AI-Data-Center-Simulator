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

/** Une carrière dure jusqu'à deux heures : les parties du joueur soigné servent à plusieurs tests. */
const CAREER_HORIZON_S = 130 * 60;
const careerRuns = new Map<number, BotRun>();
function careerRun(seed: number): BotRun {
  let run = careerRuns.get(seed);
  if (!run) careerRuns.set(seed, (run = playBot(seed, { ...COMPETENT, career: true }, CAREER_HORIZON_S)));
  return run;
}

describe('équilibrage', () => {
  it('un joueur compétent atteint l’objectif en 25 à 40 minutes de jeu, sans frôler la faillite', () => {
    for (const seed of SEEDS) {
      const run = playBot(seed, COMPETENT, 45 * 60);
      expect(run.lostAt, `graine ${seed}`).toBeNull();
      expect(minutes(run.wonAt), `graine ${seed}`).toBeGreaterThanOrEqual(25);
      expect(minutes(run.wonAt), `graine ${seed}`).toBeLessThanOrEqual(40);
      expect(run.state.economy.jobsFailed, `graine ${seed}`).toBe(0);
      expect(run.maxTemp, `graine ${seed}`).toBeLessThan(35);
    }
  });

  it('grandir paie : un petit parc de 6 racks gagne nettement plus tard', () => {
    const competent = median(SEEDS.map((seed) => wonAt(playBot(seed, COMPETENT, 45 * 60))));
    const small = median(SEEDS.map((seed) => wonAt(playBot(seed, { ...COMPETENT, maxRacks: 6 }, 60 * 60))));
    expect(small).toBeGreaterThan(competent + 4);
  });

  it('sans refroidissement, c’est la faillite', () => {
    for (const seed of SEEDS) {
      const run = playBot(seed, { ...COMPETENT, cooling: false }, 40 * 60);
      expect(run.wonAt, `graine ${seed}`).toBeNull();
      expect(minutes(run.lostAt), `graine ${seed}`).toBeLessThan(40);
      expect(run.maxTemp, `graine ${seed}`).toBeGreaterThan(50);
    }
  });

  it('en refusant tous les contrats, la trésorerie s’effondre', () => {
    for (const seed of SEEDS) {
      const run = playBot(seed, { ...COMPETENT, contracts: false }, 40 * 60);
      expect(run.state.economy.ledger.revenue, `graine ${seed}`).toBe(0);
      expect(minutes(run.lostAt), `graine ${seed}`).toBeLessThan(40);
    }
  });

  it('carrière : le palier 2 vers 10-15 minutes, les secours prêts avant le palier 3, victoire en 75 à 120 minutes', () => {
    for (const seed of SEEDS.slice(0, 4)) {
      const run = careerRun(seed);
      expect(run.lostAt, `graine ${seed}`).toBeNull();
      expect(minutes(run.tierAt[1] ?? null), `graine ${seed}`).toBeGreaterThanOrEqual(8);
      expect(minutes(run.tierAt[1] ?? null), `graine ${seed}`).toBeLessThanOrEqual(16);
      expect(run.researchAt.generators, `graine ${seed}`).toBeLessThan(run.tierAt[2] ?? Infinity);
      // Entraînements et SLA sont risqués par nature : des retards, mais peu.
      expect(run.state.economy.jobsFailed, `graine ${seed}`).toBeLessThanOrEqual(12);
      expect(run.maxIntake, `graine ${seed}`).toBeLessThan(30);
      expect(minutes(run.wonAt), `graine ${seed}`).toBeGreaterThanOrEqual(75);
      expect(minutes(run.wonAt), `graine ${seed}`).toBeLessThanOrEqual(120);
    }
  }, 120_000);

  it('carrière : sans recherche, le parc plafonne au palier Labo d’IA', () => {
    for (const seed of SEEDS.slice(0, 3)) {
      const run = playBot(seed, { ...COMPETENT, career: true, noResearch: true }, CAREER_HORIZON_S);
      expect(run.lostAt, `graine ${seed}`).toBeNull();
      expect(run.wonAt, `graine ${seed}`).toBeNull();
      expect(run.state.career.tier, `graine ${seed}`).toBeGreaterThanOrEqual(1);
      expect(run.state.career.tier, `graine ${seed}`).toBeLessThanOrEqual(2);
    }
  }, 120_000);

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
  }, 120_000);

  it('le premier contrat est honoré en moins de 2 minutes', () => {
    for (const seed of SEEDS) {
      expect(playBot(seed, COMPETENT, 3 * 60).firstDeliveryAt, `graine ${seed}`).toBeLessThan(120);
    }
  });
});
