import { describe, expect, it } from 'vitest';
import { canBuild } from '../src/sim/commands';
import { RESEARCH } from '../src/sim/research';
import { createInitialState } from '../src/sim/state';
import { BACKUP_SPOTS, CAREER_CRACS, CAREER_RACKS, LAYOUT, PDU_SPOTS, RESEARCH_ORDER } from './bot';

/** Le bot d'équilibrage ne doit pas échouer en silence : un plan ou un nœud faux ne donnerait qu'un « pas de victoire ». */
describe('cohérence du bot', () => {
  it('son ordre de recherche reprend exactement les nœuds du jeu', () => {
    expect([...RESEARCH_ORDER].sort()).toEqual(RESEARCH.map((n) => n.id).sort());
  });

  it('chaque case de ses plans est constructible sur une partie neuve', () => {
    const quick = createInitialState(1, 'quick');
    for (const c of LAYOUT) expect(canBuild(quick, c.kind, c.x, c.y), `rapide ${c.kind} ${c.x},${c.y}`).toBeNull();
    const career = createInitialState(1, 'career');
    for (const c of [...CAREER_RACKS, ...CAREER_CRACS, ...PDU_SPOTS]) expect(canBuild(career, c.kind, c.x, c.y), `carrière ${c.kind} ${c.x},${c.y}`).toBeNull();
    // Onduleurs et groupes demandent une recherche : on vérifie la case avec un PDU, de même taille.
    for (const c of BACKUP_SPOTS) expect(canBuild(career, 'pdu', c.x, c.y), `secours ${c.x},${c.y}`).toBeNull();
  });
});
