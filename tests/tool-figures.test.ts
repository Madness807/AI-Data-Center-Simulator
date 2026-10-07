import { describe, expect, it } from 'vitest';
import { CRAC, GPU } from '../src/sim/balance';
import { modifiers } from '../src/sim/progression';
import { createInitialState } from '../src/sim/state';
import { stripLeft, toolFigures } from '../src/ui/tool-figures';

describe('chiffres clés du bandeau de variantes', () => {
  it('donne au moins un chiffre pour chaque équipement', () => {
    for (const tool of ['rack', 'rack2', 'rack3', 'crac', 'cdu', 'pdu', 'ups', 'generator', 'switch'] as const) {
      expect(toolFigures(null, tool).length, tool).toBeGreaterThan(0);
    }
  });

  it('montre le calcul et la consommation de chaque génération de rack', () => {
    expect(toolFigures(null, 'rack2')).toEqual([`${GPU[2].computeCU} CU/s`, `${GPU[2].powerKW} kW`]);
  });

  it('tient compte de la recherche', () => {
    const s = createInitialState(1, 'career');
    expect(toolFigures(s, 'crac')[0]).toBe(`${CRAC.coolingKW} kW de froid`);
    s.research.done.push('crac-he');
    const boosted = Math.round(modifiers(s).cracCoolingKW);
    expect(boosted).toBeGreaterThan(CRAC.coolingKW);
    expect(toolFigures(s, 'crac')[0]).toBe(`${boosted} kW de froid`);
  });
});

describe('placement du bandeau', () => {
  it('centré sur la carte quand il tient dans la barre', () => {
    expect(stripLeft(300, 200, 600)).toBe(200);
  });

  it('bloqué aux bords de la barre', () => {
    expect(stripLeft(40, 200, 600)).toBe(0);
    expect(stripLeft(580, 200, 600)).toBe(400);
  });

  it('aligné à gauche s’il est plus large que la barre', () => {
    expect(stripLeft(300, 700, 600)).toBe(0);
  });
});
