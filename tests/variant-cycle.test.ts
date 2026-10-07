import { describe, expect, it } from 'vitest';
import { nextVariant } from '../src/ui/variant-cycle';

/** Appuis successifs sur la touche d'une famille, en partant de « aucun outil ». */
function presses(open: string[], shown: string | undefined, n: number): (string | null)[] {
  const out: (string | null)[] = [];
  let current: string | null = null;
  let start: string | undefined;
  for (let i = 0; i < n; i++) {
    const next: string | null = current === null ? nextVariant(open, null, shown) : nextVariant(open, current, start);
    if (current === null) start = next ?? undefined;
    if (next) shown = next;
    out.push((current = next));
  }
  return out;
}

describe('tour des variantes de la barre', () => {
  it('une seule variante : prendre puis rendre la main', () => {
    expect(presses(['switch'], undefined, 4)).toEqual(['switch', null, 'switch', null]);
  });

  it('part de la première variante sans souvenir', () => {
    expect(presses(['rack', 'rack2', 'rack3'], undefined, 4)).toEqual(['rack', 'rack2', 'rack3', null]);
  });

  // Le bug : une fois la nouvelle génération prise, l'ancienne n'était plus jamais proposée.
  it('après une nouvelle génération, le tour repasse par les anciennes', () => {
    expect(presses(['rack', 'rack2'], 'rack2', 3)).toEqual(['rack2', 'rack', null]);
    expect(presses(['crac', 'cdu'], 'cdu', 6)).toEqual(['cdu', 'crac', null, 'crac', 'cdu', null]);
    expect(presses(['pdu', 'ups', 'generator'], 'ups', 4)).toEqual(['ups', 'generator', 'pdu', null]);
  });

  it('chaque variante débloquée apparaît une fois par tour', () => {
    const open = ['pdu', 'ups', 'generator'];
    for (const shown of open) {
      const tour = presses(open, shown, open.length + 1);
      expect(tour.at(-1)).toBeNull();
      expect(new Set(tour.slice(0, -1))).toEqual(new Set(open));
    }
  });

  it('un souvenir verrouillé (ou absent de la liste) repart de la première variante', () => {
    expect(nextVariant(['rack', 'rack2'], null, 'rack3')).toBe('rack');
    expect(nextVariant([], null, 'rack')).toBeNull();
  });
});
