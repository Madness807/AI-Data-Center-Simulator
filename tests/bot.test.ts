import { describe, expect, it } from 'vitest';
import { canBuild } from '../src/sim/commands';
import { updateNetwork } from '../src/sim/network';
import { RESEARCH } from '../src/sim/research';
import { addBuilding, createInitialState } from '../src/sim/state';
import { BACKUP_SPOTS, BOT, CAREER_CRACS, CAREER_RACKS, LAYOUT, NETWORK_SPOTS, PDU_SPOTS, RESEARCH_ORDER } from './bot';

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
    for (const c of NETWORK_SPOTS) expect(canBuild(career, 'pdu', c.x, c.y), `switch ${c.x},${c.y}`).toBeNull();
  });

  it('ses switchs relient tout le plan de carrière, un groupe d’un seul switch par bout de rangée', () => {
    const s = createInitialState(1, 'career');
    for (const c of CAREER_RACKS.slice(0, BOT.careerRacks)) addBuilding(s, 'rack', c.x, c.y);
    for (const c of CAREER_CRACS) addBuilding(s, 'crac', c.x, c.y);
    const switches = NETWORK_SPOTS.map((p) => addBuilding(s, 'switch', p.x, p.y));
    updateNetwork(s);
    const racks = s.buildings.filter((b) => b.kind === 'rack');
    expect(racks.every((r) => r.link !== undefined)).toBe(true);
    expect(switches.map((w) => racks.filter((r) => r.link === w.id).length)).toEqual([8, 8, 6]);
  });
});
