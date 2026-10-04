import { describe, expect, it } from 'vitest';
import { emptyLedger } from '../src/sim/ledger';
import { BALANCE_WINDOW, LedgerHistory, TEMP_HISTORY, TemperatureHistory, balanceBetween } from '../src/ui/metrics';

describe('bilan glissant', () => {
  it('sépare l’exploitation des investissements', () => {
    const a = emptyLedger();
    const b = { ...a, revenue: 1200, electricity: 300, salaries: 60, repairs: 400, construction: 3000, hiring: 2000 };
    const bal = balanceBetween(a, b, 60)!;
    expect(bal.netPerSecond).toBeCloseTo((1200 - 300 - 60 - 400) / 60, 9);
    expect(bal.investment).toBe(5000);
    expect(bal.operating.repairs).toBe(400);
  });

  it('ne garde que la dernière minute et repart à zéro sur une nouvelle partie', () => {
    const h = new LedgerHistory();
    const l = emptyLedger();
    expect(h.balance()).toBeNull();
    for (let t = 0; t <= 150; t++) {
      l.revenue = t * 10; // 10 $/s de recettes constantes
      h.record(t, l);
    }
    const bal = h.balance()!;
    expect(bal.seconds).toBeGreaterThanOrEqual(BALANCE_WINDOW - 1);
    expect(bal.seconds).toBeLessThanOrEqual(BALANCE_WINDOW + 1);
    expect(bal.netPerSecond).toBeCloseTo(10, 6);

    h.record(0, emptyLedger());
    expect(h.balance()).toBeNull();
  });
});

describe('historique des températures', () => {
  it('garde une mesure par seconde sur la dernière minute', () => {
    const h = new TemperatureHistory();
    for (let t = 0; t < 100; t += 0.1) h.record(t, [20 + t, 30]);
    const series = h.series(0);
    expect(series).toHaveLength(TEMP_HISTORY);
    expect(series[series.length - 1]).toBeCloseTo(119, 0);
    expect(series[0]).toBeLessThan(series[series.length - 1]);
    expect(h.series(1).every((v) => v === 30)).toBe(true);
  });

  it('repart à zéro sur une nouvelle partie', () => {
    const h = new TemperatureHistory();
    for (let t = 0; t < 10; t++) h.record(t, [25]);
    h.record(0, [22]);
    expect(h.series(0)).toEqual([22]);
  });
});
