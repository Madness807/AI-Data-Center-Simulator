import { describe, expect, it } from 'vitest';
import { emptyLedger } from '../src/sim/ledger';
import { BALANCE_WINDOW, LedgerHistory, balanceBetween } from '../src/ui/metrics';

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
