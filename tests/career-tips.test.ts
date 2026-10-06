import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../src/settings';
import { addBuilding, createInitialState } from '../src/sim/state';
import { CAREER_TIPS, dueTip } from '../src/ui/career-tips';

describe('conseils de carrière', () => {
  it('jamais en partie rapide', () => {
    const s = createInitialState(1);
    s.time = 600;
    s.incidents.outageEndsAt = s.time + 30;
    expect(dueTip(s, [])).toBeNull();
  });

  it('un conseil à la fois, chacun une seule fois, l’urgence d’abord', () => {
    const s = createInitialState(1, 'career');
    expect(dueTip(s, [])).toBeNull(); // premières secondes : on laisse le joueur regarder
    s.time = 10;
    expect(dueTip(s, [])?.id).toBe('career');
    expect(dueTip(s, ['career'])).toBeNull();

    // Une coupure passe devant le conseil de bienvenue.
    s.incidents.outageEndsAt = s.time + 30;
    expect(dueTip(s, [])?.id).toBe('outage');
    expect(dueTip(s, ['outage'])?.id).toBe('career');
    s.incidents.outageEndsAt = null;

    // L'usure ne compte qu'à partir de son palier.
    const rack = addBuilding(s, 'rack', 10, 10);
    rack.wear = 80;
    expect(dueTip(s, ['career'])).toBeNull();
    s.career.tier = 1;
    expect(dueTip(s, ['career'])?.id).toBe('wear');

    s.research.done.push('gpu-g2', 'liquid-cooling', 'gpu-g3');
    expect(dueTip(s, ['career', 'wear'])?.id).toBe('g3');
    expect(dueTip(s, CAREER_TIPS.map((t) => t.id))).toBeNull();
  });

  it('réseau : dès la recherche des switchs, après le conseil d’entraînement', () => {
    const s = createInitialState(1, 'career');
    s.time = 10;
    expect(dueTip(s, ['career'])).toBeNull();
    s.research.done.push('switches');
    expect(dueTip(s, ['career'])?.id).toBe('network');
    s.jobs[0].kind = 'training';
    expect(dueTip(s, ['career'])?.id).toBe('training');
    expect(dueTip(s, ['career', 'training'])?.id).toBe('network');
  });

  it('les conseils vus sont gardés dans les options, sans doublon ni valeur étrangère', () => {
    expect(sanitizeSettings({}).tipsSeen).toEqual([]);
    expect(sanitizeSettings({ tipsSeen: ['outage', 3, 'outage', null, 'g3'] }).tipsSeen).toEqual(['outage', 'g3']);
    expect(sanitizeSettings({ tipsSeen: 'outage' }).tipsSeen).toEqual([]);
  });
});
