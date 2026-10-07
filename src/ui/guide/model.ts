import type { IconName } from '../icons';

/**
 * Blocs d'un chapitre du guide : paragraphe, intertitre (avec la pastille du palier qui
 * l'introduit), chiffres clés (libellé, valeur), conseils, liste, et touches du clavier.
 */
export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string; badge?: string }
  | { kind: 'facts'; rows: [string, string][] }
  | { kind: 'tips'; items: string[] }
  | { kind: 'list'; items: string[] }
  /** Fiches (une recherche, par exemple) : titre, ligne de détails, description. */
  | { kind: 'cards'; items: { title: string; meta: string; text: string }[] }
  | { kind: 'keys'; title: string; lines: [string, string[]][] };

export interface GuideChapter {
  id: string;
  title: string;
  icon: IconName;
  /** Mode ou palier où le chapitre entre en jeu (« Carrière », « Labo d’IA »…). */
  badge?: string;
  blocks: GuideBlock[];
}

/** Minuscules sans accents : « Électricité » se trouve en tapant « electricite ». */
export const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Tout le texte d'un chapitre, pour la recherche. */
function chapterText(c: GuideChapter): string {
  const parts = [c.title, c.badge ?? ''];
  for (const b of c.blocks) {
    if (b.kind === 'p' || b.kind === 'h') parts.push(b.text, b.kind === 'h' ? (b.badge ?? '') : '');
    else if (b.kind === 'facts') for (const [k, v] of b.rows) parts.push(k, v);
    else if (b.kind === 'tips' || b.kind === 'list') parts.push(...b.items);
    else if (b.kind === 'cards') for (const i of b.items) parts.push(i.title, i.meta, i.text);
    else parts.push(b.title, ...b.lines.flatMap(([label, keys]) => [label, ...keys]));
  }
  return fold(parts.join(' '));
}

/** Chapitres qui contiennent tous les mots de la recherche (sans tenir compte des accents). */
export function matchChapters(chapters: readonly GuideChapter[], query: string): GuideChapter[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...chapters];
  return chapters.filter((c) => {
    const text = chapterText(c);
    return words.every((w) => text.includes(w));
  });
}
