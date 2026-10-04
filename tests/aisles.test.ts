import { describe, expect, it } from 'vitest';
import { AISLE, CDU, CRAC, HEAT, HEATWAVE, RACK, WEATHER } from '../src/sim/balance';
import { breathesExhaust, cracPowerKW, cracWeatherFactor, liquidCapture, outsideTemp, rackTemp } from '../src/sim/climate';
import { processCommands } from '../src/sim/commands';
import type { Building, Facing } from '../src/sim/entities';
import { addBuilding, createEmptyState, idx, type GameState } from '../src/sim/state';
import { updateEconomy } from '../src/sim/systems/economy';
import { updateHeat } from '../src/sim/systems/heat';
import { updateIncidents } from '../src/sim/systems/incidents';
import { updatePower } from '../src/sim/systems/power';
import { runSeconds } from './helpers';

/** Salle de carrière vide, alimentée largement, sans offres. */
function hall(mode: 'career' | 'quick' = 'career'): GameState {
  const s = createEmptyState(21, 24, 16, mode);
  s.nextOfferAt = Number.MAX_SAFE_INTEGER;
  for (let x = 0; x < 5; x++) addBuilding(s, 'pdu', x, 0);
  return s;
}

function rack(s: GameState, x: number, y: number, facing: Facing): Building {
  const b = addBuilding(s, 'rack', x, y);
  b.facing = facing;
  return b;
}

/** Deux rangées de 4 racks en y = 6 et y = 8 et un CRAC en bout d'allée (4, 7). */
function rows(s: GameState, top: Facing, bottom: Facing): Building[] {
  const out = [];
  for (let x = 8; x < 12; x++) out.push(rack(s, x, 6, top), rack(s, x, 8, bottom));
  addBuilding(s, 'crac', 6, 7);
  updatePower(s);
  return out;
}

describe('allées chaude et froide', () => {
  it('en carrière, un rack souffle l’essentiel de sa chaleur par l’arrière', () => {
    const s = hall();
    rack(s, 10, 8, 0); // avant vers +y : aspire en (10, 9), souffle en (10, 7)
    updatePower(s);
    updateHeat(s, 0.1);
    const rise = (x: number, y: number) => s.temp[idx(s, x, y)] - HEAT.ambient;
    const heat = (RACK.heatKW * 0.1) / HEAT.cellCapacity;
    // Après une diffusion d'un tick, l'arrière a pris bien plus que la case du rack.
    expect(rise(10, 7)).toBeGreaterThan(rise(10, 8));
    expect(rise(10, 7) + rise(10, 8)).toBeLessThanOrEqual(heat + 1e-9);
    expect(rise(10, 7)).toBeGreaterThan(heat * AISLE.exhaustShare * 0.6);
  });

  it('dos au mur ou à un équipement, un rack garde sa chaleur ; la partie rapide ne change rien', () => {
    const s = hall();
    rack(s, 10, 15, 2); // avant vers −y, arrière contre le mur du bas (y = 16 hors salle)
    updatePower(s);
    updateHeat(s, 0.1);
    expect(s.temp[idx(s, 10, 14)] - HEAT.ambient).toBeLessThan(s.temp[idx(s, 10, 15)] - HEAT.ambient);

    const q = hall('quick');
    const b = rack(q, 10, 8, 0);
    updatePower(q);
    updateHeat(q, 0.1);
    expect(q.temp[idx(q, 10, 7)]).toBeCloseTo(q.temp[idx(q, 10, 9)]);
    expect(rackTemp(q, b)).toBe(q.temp[idx(q, 10, 8)]);
  });

  it('dos à dos (allée chaude partagée) reste plus frais que des rangées qui se soufflent dessus', () => {
    const good = hall();
    const goodRacks = rows(good, 2, 0); // la rangée du haut regarde vers −y, celle du bas vers +y : allée chaude en y = 7
    const bad = hall();
    const badRacks = rows(bad, 0, 0); // la rangée du haut aspire en y = 7, là où souffle celle du bas
    // Avant de chauffer (une panne arrêterait le soufflage d'un rack) : la rangée du haut est mal placée.
    expect(badRacks.filter((b) => breathesExhaust(bad, b)).length).toBe(4);
    expect(goodRacks.some((b) => breathesExhaust(good, b))).toBe(false);
    runSeconds(good, 240);
    runSeconds(bad, 240);
    const worst = (s: GameState, rs: Building[]) => Math.max(...rs.map((b) => rackTemp(s, b)));
    expect(worst(bad, badRacks)).toBeGreaterThan(worst(good, goodRacks) + 3);
  });

  it('la rotation fait pivoter un rack d’un quart de tour, en carrière seulement', () => {
    const s = hall();
    const b = rack(s, 10, 8, 3);
    s.commands.push({ type: 'rotate', id: b.id });
    processCommands(s);
    expect(b.facing).toBe(0);
    const q = hall('quick');
    const c = addBuilding(q, 'rack', 10, 8);
    q.commands.push({ type: 'rotate', id: c.id });
    processCommands(q);
    expect(c.facing).toBeUndefined();
  });
});

describe('refroidissement liquide et confinement', () => {
  it('un CDU capte 75 % de la chaleur des racks à portée, jusqu’à sa capacité', () => {
    const s = hall();
    s.research.done.push('liquid-cooling');
    addBuilding(s, 'cdu', 10, 8);
    const near = [rack(s, 9, 8, 0), rack(s, 11, 8, 0)];
    const far = rack(s, 20, 8, 0);
    updatePower(s);
    const cap = liquidCapture(s);
    for (const b of near) expect(cap.get(b.id)).toBeCloseTo(RACK.heatKW * CDU.captured);
    expect(cap.has(far.id)).toBe(false);

    // Dix racks de plus à portée (rayon 2) : 12 × 7,5 kW dépassent les 80 kW du CDU.
    for (const [x, y] of [[8, 8], [12, 8], [9, 7], [10, 7], [11, 7], [9, 9], [10, 9], [11, 9], [10, 6], [10, 10]]) rack(s, x, y, 0);
    updatePower(s);
    const total = [...liquidCapture(s).values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(CDU.capacityKW);
  });

  it('le confinement renforce un CRAC proche d’une allée chaude', () => {
    const run = (done: string[]) => {
      const s = hall();
      s.research.done.push(...done);
      rows(s, 2, 0);
      runSeconds(s, 120);
      return s.temp[idx(s, 9, 7)];
    };
    expect(run(['crac-he', 'containment'])).toBeLessThan(run(['crac-he']));
  });
});

describe('météo et canicules', () => {
  it('la météo n’agit qu’à partir de son palier ; une canicule affaiblit les CRAC', () => {
    const s = hall();
    expect(outsideTemp(s)).toBeNull();
    expect(cracWeatherFactor(s)).toBe(1);
    s.career.tier = WEATHER.minTier;
    s.time = WEATHER.periodS / 2; // sinus nul : température moyenne
    expect(outsideTemp(s)).toBeCloseTo(WEATHER.meanC);
    expect(cracWeatherFactor(s)).toBeCloseTo(1);
    s.incidents.heatwaveEndsAt = s.time + 100;
    expect(outsideTemp(s)).toBeCloseTo(WEATHER.meanC + HEATWAVE.boostC);
    expect(cracWeatherFactor(s)).toBeLessThan(0.85);
  });

  it('les canicules arrivent à partir de leur palier, en carrière seulement', () => {
    const s = hall();
    s.career.tier = WEATHER.minTier - 1;
    updateIncidents(s);
    expect(s.incidents.nextHeatwaveAt).toBeNull();
    s.career.tier = WEATHER.minTier;
    updateIncidents(s);
    expect(s.incidents.nextHeatwaveAt).toBe(s.time + HEATWAVE.firstDelayS);
    s.time = s.incidents.nextHeatwaveAt!;
    updateIncidents(s);
    expect(s.incidents.heatwaveEndsAt).not.toBeNull();
    expect(s.events.at(-1)?.code).toBe('heatwave');
  });

  it('free cooling : les CRAC consomment moitié moins quand il fait frais dehors', () => {
    const s = hall();
    s.career.tier = WEATHER.minTier;
    s.research.done.push('free-cooling');
    s.time = (WEATHER.periodS * 3) / 4; // creux du cycle : 12 °C
    expect(cracPowerKW(s)).toBe(CRAC.powerKW / 2);
    s.time = WEATHER.periodS / 4; // sommet : 28 °C
    expect(cracPowerKW(s)).toBe(CRAC.powerKW);
  });

  it('récupération de chaleur : la chaleur captée par les CDU rapporte', () => {
    const s = hall();
    s.research.done.push('liquid-cooling', 'heat-reuse');
    addBuilding(s, 'cdu', 10, 8);
    rack(s, 9, 8, 0);
    updatePower(s);
    updateHeat(s, 1);
    const before = s.economy.ledger.revenue;
    updateEconomy(s, 1);
    expect(s.economy.ledger.revenue - before).toBeGreaterThan(0);
  });
});
