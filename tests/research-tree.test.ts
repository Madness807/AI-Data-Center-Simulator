import { describe, expect, it } from 'vitest';
import { BRANCH_COLORS, PALETTE } from '../src/render/assets/palette';
import { researchBlocker } from '../src/sim/progression';
import { BRANCHES, RESEARCH, researchById } from '../src/sim/research';
import { createInitialState, type GameState } from '../src/sim/state';
import { BRANCH_ICON, KIND_INFO, RESEARCH_ICON } from '../src/ui/catalog';
import { ICONS } from '../src/ui/icons';
import { gridFrame, linkShape, type Box } from '../src/ui/research-links';
import {
  defaultSelection,
  detailView,
  edgeState,
  liveView,
  neighbour,
  progressOf,
  tileState,
  tileView,
  TREE,
} from '../src/ui/research-model';

/** Carrière neuve au palier donné, avec des nœuds déjà faits. */
function career(tier = 0, done: string[] = []): GameState {
  const s = createInitialState(3, 'career');
  s.career.tier = tier;
  s.research.done.push(...done);
  return s;
}
const cell = (branch: string, level: number) => TREE.cells.find((c) => c.branch === branch && c.level === level)!.ids;

describe('grille de l’arbre', () => {
  it('chaque nœud a sa place, deux au plus par case ; l’arbre tient dans le panneau', () => {
    expect([...TREE.pos.keys()].sort()).toEqual(RESEARCH.map((n) => n.id).sort());
    for (const c of TREE.cells) expect(c.ids.length, `${c.branch} niveau ${c.level}`).toBeLessThanOrEqual(2);
    // Budget de hauteur (640 px) : 7 tuiles empilées au plus, toutes lignes confondues ; et 5 colonnes.
    expect([...TREE.slots.values()].reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(7);
    expect(BRANCHES.length).toBeLessThanOrEqual(5);
    expect(cell('compute', 4)).toEqual([]);
    expect(cell('network', 1)).toEqual([]);
  });

  it('dans une case : le prérequis au-dessus, et le nœud qui a un débouché plus bas en dernier', () => {
    expect(cell('ops', 1)).toEqual(['auto-repair', 'fast-techs']);
    expect(cell('cooling', 3)).toEqual(['free-cooling', 'liquid-cooling']);
    expect(cell('compute', 2)).toEqual(['gpu-g2', 'retrofit']);
    expect(cell('compute', 3)).toEqual(['checkpoints', 'gpu-g3']);
    expect(cell('power', 2)).toEqual(['ups', 'generators']);
    expect(cell('ops', 2)).toEqual(['spare-parts', 'planned-maintenance']);
  });

  it('un lien par prérequis, jamais vers le haut, de la couleur du prérequis ; le lien traversant en dernier', () => {
    const requires = RESEARCH.flatMap((n) => n.requires.map((r) => `${r}>${n.id}`));
    expect(TREE.edges.map((e) => `${e.from}>${e.to}`).sort()).toEqual(requires.sort());
    for (const e of TREE.edges) {
      const [a, b] = [TREE.pos.get(e.from)!, TREE.pos.get(e.to)!];
      expect(b.level > a.level || (b.level === a.level && b.slot > a.slot) || e.kind === 'cross', `${e.from}>${e.to}`).toBe(true);
      expect(e.branch).toBe(researchById(e.from)!.branch);
    }
    const kinds = Object.fromEntries(TREE.edges.map((e) => [`${e.from}>${e.to}`, e.kind]));
    expect(kinds).toMatchObject({
      'gpu-g2>retrofit': 'straight',
      'switches>fabric': 'straight',
      'liquid-cooling>heat-reuse': 'straight',
      'gpu-g2>gpu-g3': 'lane',
      'planned-maintenance>predictive': 'lane',
      'liquid-cooling>gpu-g3': 'cross',
    });
    expect(TREE.edges.at(-1)!.kind).toBe('cross');
  });

  it('le lien traversant suit une ligne libre : même niveau, même rang, aucune tuile entre les deux', () => {
    for (const e of TREE.edges.filter((x) => x.kind === 'cross')) {
      const [a, b] = [TREE.pos.get(e.from)!, TREE.pos.get(e.to)!];
      expect([a.level, a.slot]).toEqual([b.level, b.slot]);
      for (let col = Math.min(a.col, b.col) + 1; col < Math.max(a.col, b.col); col++) {
        expect(TREE.cells.find((c) => c.col === col && c.level === a.level)!.ids.length).toBeLessThanOrEqual(a.slot);
      }
    }
  });
});

describe('tracé des liens', () => {
  const frame = gridFrame();
  /** Un segment (horizontal ou vertical) traverse-t-il l'intérieur d'une boîte (à 1 px près) ? */
  const crosses = ([x1, y1]: readonly [number, number], [x2, y2]: readonly [number, number], b: Box) =>
    Math.max(x1, x2) > b.x + 1 && Math.min(x1, x2) < b.x + b.w - 1 && Math.max(y1, y2) > b.y + 1 && Math.min(y1, y2) < b.y + b.h - 1;

  it('aucun lien ne passe sous une autre tuile ; ses bouts sont sur les bords de ses tuiles', () => {
    for (const e of TREE.edges) {
      const shape = linkShape(e, frame)!;
      const pts = shape.points;
      for (const [id, box] of frame.boxes) {
        if (id === e.from || id === e.to) continue;
        for (let i = 1; i < pts.length; i++) expect(crosses(pts[i - 1], pts[i], box), `${e.from}>${e.to} sous ${id}`).toBe(false);
      }
      const onEdge = ([x, y]: readonly [number, number], b: Box) =>
        (Math.abs(x - b.x) < 0.01 || Math.abs(x - b.x - b.w) < 0.01 || Math.abs(y - b.y) < 0.01 || Math.abs(y - b.y - b.h) < 0.01) &&
        x >= b.x - 0.01 && x <= b.x + b.w + 0.01 && y >= b.y - 0.01 && y <= b.y + b.h + 0.01;
      expect(onEdge(pts[0], frame.boxes.get(e.from)!), `départ de ${e.from}>${e.to}`).toBe(true);
      expect(onEdge(pts.at(-1)!, frame.boxes.get(e.to)!), `arrivée de ${e.from}>${e.to}`).toBe(true);
    }
  });

  it('les couloirs passent dans les gouttières ; le lien traversant est un seul trait horizontal', () => {
    for (const lane of frame.lanes) {
      for (const box of frame.boxes.values()) expect(lane > box.x && lane < box.x + box.w).toBe(false);
    }
    const cross = linkShape(TREE.edges.find((e) => e.kind === 'cross')!, frame)!;
    expect(cross.points).toHaveLength(2);
    expect(cross.points[0][1]).toBe(cross.points[1][1]);
  });

  it('un lien en couloir : angles arrondis, flèche vers la tuile débloquée', () => {
    const shape = linkShape(TREE.edges.find((e) => e.from === 'gpu-g2' && e.to === 'gpu-g3')!, frame)!;
    expect(shape.d).toBe('M88 197 L84 197 Q80 197 80 203 L80 371 Q80 377 82 377 L84 377');
    expect(shape.arrow).toBe('M88 377 L84 380.2 L84 373.8 Z');
  });
});

describe('états et textes du panneau', () => {
  it('carrière neuve : les nœuds de niveau 1 sans prérequis sont ouverts, le reste attend', () => {
    const s = career();
    expect(TREE.order.filter((id) => tileState(s, id) === 'available').sort()).toEqual(['auto-repair', 'crac-he', 'opportunistic', 'pdu-hc']);
    expect(tileState(s, 'fast-techs')).toBe('locked');
    expect(tileState(s, 'gpu-g2')).toBe('tier');
    s.research.done.push('auto-repair');
    expect(tileState(s, 'fast-techs')).toBe('available');
    const lab = career(2, ['gpu-g2']);
    expect(tileState(lab, 'gpu-g3')).toBe('locked'); // il manque le refroidissement liquide
    lab.research.current = 'checkpoints';
    expect(tileState(lab, 'checkpoints')).toBe('current');
  });

  it('les liens : en attente, prêts, terminés', () => {
    const edge = TREE.edges.find((e) => e.from === 'switches')!;
    expect(edgeState(career(2), edge)).toBe('pending');
    expect(edgeState(career(2, ['switches']), edge)).toBe('ready');
    expect(edgeState(career(2, ['switches', 'fabric']), edge)).toBe('done');
  });

  it('sélection à l’ouverture, et parcours au clavier', () => {
    const s = career();
    expect(defaultSelection(s)).toBe('opportunistic');
    s.research.current = 'crac-he';
    expect(defaultSelection(s)).toBe('crac-he');
    expect(neighbour('opportunistic', 'right')).toBe('crac-he'); // la case Réseau du niveau 1 est vide
    expect(neighbour('fast-techs', 'down')).toBe('spare-parts');
    expect(neighbour('retrofit', 'right')).toBe('switches');
    expect(neighbour('switches', 'up')).toBeNull();
    expect(neighbour('opportunistic', 'left')).toBeNull();
  });

  it('temps et avancement : au rythme actuel, jamais 100 % avant la fin', () => {
    const s = career(0);
    s.compute.total = 100; // 100 CU/s × 20 % × 0,1 pt = 2 pt/s
    expect(liveView(s, 'opportunistic').timing).toBe('≈ 3 min au rythme actuel'); // 300 pts en 150 s
    s.research.current = 'opportunistic';
    s.research.ratePerS = 2;
    s.research.progress.opportunistic = 299.9;
    expect(liveView(s, 'opportunistic').timing).toBe('encore 1 s');
    expect(progressOf(s, 'opportunistic')).toBe(0.99);
    expect(tileView(s, 'opportunistic').meta).toBe('99 % · 1 s');
    s.research.share = 0;
    s.research.current = null;
    expect(detailView(s, 'crac-he').note).toBe('Aucun calcul ne va à la R&D : montez la part ci-dessus.');
  });

  it('la fiche : prérequis, palier, bouton et raison du verrou', () => {
    const s = career(2, ['gpu-g2']);
    const g3 = detailView(s, 'gpu-g3');
    expect(g3.requires).toEqual([
      { name: 'GPU génération 2', done: true, branch: null },
      { name: 'Refroidissement liquide', done: false, branch: 'Refroidissement' },
    ]);
    expect(g3.tier).toEqual({ open: true, text: 'Palier Labo d’IA' });
    expect(g3.unlocks).toEqual([{ icon: 'rack', text: 'Rack GPU G3' }]);
    expect(g3.button.label).toBe('Verrouillée');
    expect(g3.note).toBe(researchBlocker(s, 'gpu-g3'));
    s.research.progress['liquid-cooling'] = 300;
    expect(detailView(s, 'liquid-cooling').button).toMatchObject({ label: 'Reprendre la recherche', launches: true });
    s.research.current = 'checkpoints';
    expect(detailView(s, 'checkpoints')).toMatchObject({ canStop: true, button: { label: 'En cours' } });
    expect(detailView(s, 'liquid-cooling').note).toBe('« Points de contrôle » se met en pause, sans rien perdre.');
    const early = career(0);
    expect(detailView(early, 'ups').tier).toEqual({ open: false, text: 'S’ouvre au palier Scale-up' });
    expect(liveView(early, 'ups').tierProgress).toBe('réputation 0 / 150');
    expect(tileView(early, 'crac-he').label).toBe('CRAC haute efficacité (Refroidissement, niveau 1) : disponible, 400 pts');
  });
});

describe('icônes et couleurs des branches', () => {
  it('une icône par nœud et par branche ; un nœud qui débloque un équipement reprend la sienne', () => {
    expect(Object.keys(RESEARCH_ICON).sort()).toEqual(RESEARCH.map((n) => n.id).sort());
    for (const icon of [...Object.values(RESEARCH_ICON), ...Object.values(BRANCH_ICON)]) expect(ICONS).toHaveProperty(icon);
    for (const n of RESEARCH) for (const kind of n.effect.unlocks ?? []) expect(RESEARCH_ICON[n.id]).toBe(KIND_INFO[kind].icon);
    expect(Object.keys(BRANCH_ICON).sort()).toEqual(BRANCHES.map((b) => b.id).sort());
  });

  it('chaque couleur de branche est lisible sur le fond des tuiles ; Réseau porte le mauve des switchs', () => {
    // Luminance relative et contraste au sens des WCAG ; le fond est celui d'une tuile sur le verre.
    const luminance = (color: number) => {
      const [r, g, b] = [16, 8, 0].map((shift) => ((color >> shift) & 255) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const background = luminance(0x13151b);
    for (const b of BRANCHES) expect((luminance(BRANCH_COLORS[b.id]) + 0.05) / (background + 0.05), b.id).toBeGreaterThanOrEqual(4.5);
    expect(BRANCH_COLORS.network).toBe(PALETTE.switchAccent);
    // Cinq teintes distinctes.
    expect(new Set(Object.values(BRANCH_COLORS)).size).toBe(BRANCHES.length);
  });
});
