import { describe, expect, it } from 'vitest';
import { CRAC, ECONOMY, FAILURE, NETWORK, PDU } from '../src/sim/balance';
import { TIERS } from '../src/sim/progression';
import { RESEARCH } from '../src/sim/research';
import { contentChapters } from '../src/ui/guide/content';
import { fold, matchChapters, type GuideChapter } from '../src/ui/guide/model';
import { money } from '../src/ui/format';
// Source brute du contenu (import ?raw de Vite), pour le garde-fou anti-chiffre en dur.
// oxlint-disable-next-line import/default
import source from '../src/ui/guide/content.ts?raw';

const chapters = contentChapters();
const text = (c: GuideChapter) =>
  c.blocks
    .map((b) =>
      b.kind === 'p' || b.kind === 'h' ? b.text : b.kind === 'facts' ? b.rows.flat().join(' ') : b.kind === 'keys' ? b.title : b.kind === 'cards' ? b.items.map((i) => `${i.title} ${i.meta} ${i.text}`).join(' ') : b.items.join(' '),
    )
    .join(' ');
const all = chapters.map(text).join(' ');
const chapter = (id: string) => chapters.find((c) => c.id === id)!;

describe('guide du jeu', () => {
  it('a des chapitres complets, aux identifiants uniques', () => {
    expect(chapters.length).toBeGreaterThan(10);
    expect(new Set(chapters.map((c) => c.id)).size).toBe(chapters.length);
    for (const c of chapters) {
      expect(c.title, c.id).not.toBe('');
      expect(c.blocks.length, c.id).toBeGreaterThan(1);
    }
  });

  it('ne marque les chapitres et intertitres que du mode carrière ou d’un palier existant', () => {
    const allowed = new Set(['Carrière', ...TIERS.map((t) => t.name)]);
    for (const c of chapters) {
      if (c.badge) expect(allowed, c.id).toContain(c.badge);
      for (const b of c.blocks) if (b.kind === 'h' && b.badge) expect(allowed, `${c.id} : ${b.text}`).toContain(b.badge);
    }
  });

  it('reprend les chiffres clés de l’équilibrage', () => {
    expect(text(chapter('chaleur'))).toContain(`${CRAC.radius} cases`);
    expect(text(chapter('chaleur'))).toContain(`${CRAC.coolingKW} kW`);
    expect(text(chapter('energie'))).toContain(`${PDU.capacityKW} kW`);
    expect(text(chapter('pannes'))).toContain(`${FAILURE.thresholdC} °C`);
    expect(text(chapter('demarrer'))).toContain(money(ECONOMY.goalMoney));
    expect(text(chapter('demarrer'))).toContain(`${ECONOMY.bankruptcySeconds} s`);
    expect(text(chapter('reseau'))).toContain(`${NETWORK.ports} racks`);
    expect(text(chapter('reseau'))).toContain(`${NETWORK.reach} cases`);
    expect(text(chapter('recherche'))).toContain(`${RESEARCH.length} recherches`);
    for (const t of TIERS) expect(text(chapter('carriere'))).toContain(t.name);
    for (const n of RESEARCH) expect(text(chapter('recherche'))).toContain(n.name);
    expect(all).not.toMatch(/undefined|NaN/);
  });

  // Garde-fou : un chiffre écrit en dur dans un texte ne suivrait pas un rééquilibrage.
  it('n’écrit aucun chiffre en dur dans ses textes', () => {
    const literals = [...source.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((m) => (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, ''));
    const withDigits = literals.filter((l) => /\d/.test(l) && !/^\.\.\/|^\.\//.test(l));
    expect(withDigits).toEqual([]);
  });

  it('trouve les chapitres sans tenir compte des accents', () => {
    expect(matchChapters(chapters, 'crac').map((c) => c.id)).toContain('chaleur');
    expect(matchChapters(chapters, 'electricite').map((c) => c.id)).toContain('energie');
    expect(matchChapters(chapters, 'switch onduleur').length).toBeGreaterThan(0);
    expect(matchChapters(chapters, 'zzz')).toEqual([]);
    expect(matchChapters(chapters, '  ').length).toBe(chapters.length);
    expect(fold('Électricité')).toBe('electricite');
  });
});
