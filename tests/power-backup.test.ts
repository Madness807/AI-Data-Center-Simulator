import { describe, expect, it } from 'vitest';
import { GENERATOR, OUTAGE, UPS } from '../src/sim/balance';
import { canBuild } from '../src/sim/commands';
import { step } from '../src/sim/sim';
import { addBuilding, createEmptyState, createInitialState, type GameState } from '../src/sim/state';
import { redundancy } from '../src/sim/stats';
import { updateIncidents } from '../src/sim/systems/incidents';
import { updatePower } from '../src/sim/systems/power';
import { runSeconds } from './helpers';

/** Carrière avec 3 racks et un CRAC (34 kW), deux PDU, offres coupées. */
function room(backup: { ups?: number; generators?: number } = {}): GameState {
  const s = createEmptyState(11, 24, 16, 'career');
  s.nextOfferAt = Number.MAX_SAFE_INTEGER;
  s.research.done.push('ups', 'generators');
  addBuilding(s, 'pdu', 0, 0);
  addBuilding(s, 'pdu', 1, 0);
  addBuilding(s, 'crac', 8, 8);
  for (const x of [7, 8, 9]) addBuilding(s, 'rack', x, 10);
  for (let i = 0; i < (backup.ups ?? 0); i++) addBuilding(s, 'ups', 3 + i, 3).charge = UPS.storeKJ;
  for (let i = 0; i < (backup.generators ?? 0); i++) addBuilding(s, 'generator', 12 + i * 2, 14);
  updatePower(s);
  return s;
}

const outage = (s: GameState, seconds: number) => (s.incidents.outageEndsAt = s.time + seconds);
const racksPowered = (s: GameState) => s.buildings.filter((b) => b.kind === 'rack' && b.powered).length;

describe('énergie de secours', () => {
  it('sans secours, une coupure arrête toute la salle', () => {
    const s = room();
    outage(s, 60);
    step(s);
    expect(s.power.grid).toBe(false);
    expect(racksPowered(s)).toBe(0);
    expect(s.power.loadKW).toBe(0);
    expect(s.power.shedCount).toBe(4);
  });

  it('un onduleur seul tient environ une minute, puis la salle s’arrête', () => {
    const s = room({ ups: 1 });
    outage(s, 300);
    runSeconds(s, 60);
    expect(racksPowered(s)).toBe(3);
    expect(s.power.upsKW).toBe(34);
    runSeconds(s, 15); // 2 400 kJ / 34 kW ≈ 70 s
    expect(racksPowered(s)).toBe(0);
  });

  it('les groupes démarrent en 15 s ; l’onduleur ne comble que ce délai', () => {
    const s = room({ ups: 1, generators: 1 });
    outage(s, 300);
    runSeconds(s, GENERATOR.startS - 1);
    expect(s.power.generatorKW).toBe(0);
    expect(racksPowered(s)).toBe(3);
    runSeconds(s, 3);
    expect(s.power.generatorKW).toBe(34);
    expect(s.power.upsKW).toBe(0);
    const ups = s.buildings.find((b) => b.kind === 'ups')!;
    const left = ups.charge!;
    expect(left).toBeGreaterThan(UPS.storeKJ - 34 * (GENERATOR.startS + 1));
    runSeconds(s, 60);
    expect(ups.charge).toBeCloseTo(left);
    // Le carburant est payé au kW·s produit.
    expect(s.economy.ledger.fuel).toBeGreaterThan(34 * GENERATOR.fuelPerKWs * 60);
    expect(s.economy.ledger.electricity).toBe(0);
  });

  it('au retour du réseau, les groupes s’arrêtent et les onduleurs se rechargent (facturé)', () => {
    const s = room({ ups: 1, generators: 1 });
    outage(s, 30);
    runSeconds(s, 31);
    expect(s.power.grid).toBe(true);
    const ups = s.buildings.find((b) => b.kind === 'ups')!;
    const gen = s.buildings.find((b) => b.kind === 'generator')!;
    expect(gen.warmup).toBeUndefined();
    const before = ups.charge!;
    runSeconds(s, 10);
    expect(ups.charge!).toBeCloseTo(before + UPS.rechargeKW * 10);
    expect(s.power.chargeKW).toBe(UPS.rechargeKW);
    expect(s.economy.electricityPerS).toBeGreaterThan(34 * 0.09);
  });

  it('coupures en carrière seulement, à partir du palier Scale-up, rejouables avec la graine', () => {
    const s = room();
    for (let i = 0; i < 20; i++) updateIncidents(s);
    expect(s.incidents.nextOutageAt).toBeNull(); // Start-up : rien
    s.career.tier = OUTAGE.minTier;
    updateIncidents(s);
    expect(s.incidents.nextOutageAt).toBe(s.time + OUTAGE.firstDelayS);
    s.time = s.incidents.nextOutageAt!;
    updateIncidents(s);
    expect(s.incidents.outageEndsAt).toBeGreaterThan(s.time);
    expect(s.events.at(-1)?.code).toBe('outage');

    const twin = room();
    twin.career.tier = OUTAGE.minTier;
    updateIncidents(twin);
    twin.time = twin.incidents.nextOutageAt!;
    updateIncidents(twin);
    expect(twin.incidents.outageEndsAt).toBe(s.incidents.outageEndsAt);

    const quick = createInitialState(11);
    quick.career.tier = 3;
    for (let t = 0; t < 2000; t++) {
      quick.time = t;
      updateIncidents(quick);
    }
    expect(quick.incidents.outageEndsAt).toBeNull();
  });

  it('onduleurs et groupes se débloquent par la recherche, en carrière seulement', () => {
    const s = createEmptyState(3, 24, 16, 'career');
    expect(canBuild(s, 'ups', 5, 5)).toMatch(/Onduleurs/);
    s.research.done.push('ups');
    expect(canBuild(s, 'ups', 5, 5)).toBeNull();
    expect(canBuild(s, 'generator', 5, 5)).toMatch(/Groupes électrogènes/);
    const quick = createEmptyState(3);
    expect(canBuild(quick, 'ups', 5, 5)).toMatch(/Recherche requise/);
  });

  it('redondance N+1 : la perte du plus gros PDU ou groupe ne délesterait rien', () => {
    const s = room({ generators: 1 }); // 2 PDU = 80 kW pour 34 kW ; 1 groupe
    expect(redundancy(s)).toEqual({ pdu: true, backup: false });
    addBuilding(s, 'generator', 16, 14);
    for (const x of [10, 11]) addBuilding(s, 'rack', x, 10);
    updatePower(s); // 54 kW : un seul PDU (40) ne suffirait plus
    expect(redundancy(s)).toEqual({ pdu: false, backup: true });
  });

  it('bascule 2N : groupes plus rapides, batteries plus grandes', () => {
    const s = room({ ups: 1, generators: 1 });
    s.research.done.push('switchover-2n');
    outage(s, 300);
    runSeconds(s, 4);
    expect(s.power.generatorKW).toBe(34);
  });
});
