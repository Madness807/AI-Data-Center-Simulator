import { describe, expect, it } from 'vitest';
import { processCommands, type Command } from '../src/sim/commands';
import { createInitialState } from '../src/sim/state';
import { STEPS, advance, createMemo, type TutorialContext } from '../src/ui/tutorial/steps';
import { runSeconds, runUntil } from './helpers';

describe('tutoriel', () => {
  it('se termine en jouant normalement chaque étape', () => {
    const s = createInitialState(5);
    s.nextOfferAt = Infinity;
    const selected = new Set<number>();
    const ctx: TutorialContext = { s, selected, inspected: null, heatmap: false };
    const memo = createMemo(s);
    const enqueue = (c: Command) => s.commands.push(c);
    const id = () => STEPS[step].id;
    let step = advance(0, ctx, memo, enqueue);
    expect(id()).toBe('select');

    selected.add(s.techs[0].id);
    step = advance(step, ctx, memo, enqueue);
    expect(id()).toBe('racks');

    s.commands.push(
      { type: 'build', kind: 'rack', x: 16, y: 6, assign: [s.techs[0].id] },
      { type: 'build', kind: 'rack', x: 17, y: 6, assign: [s.techs[0].id] },
    );
    processCommands(s);
    step = advance(step, ctx, memo, enqueue);
    expect(id()).toBe('contract');

    s.commands.push({ type: 'acceptJob', id: s.jobs[0].id });
    processCommands(s);
    step = advance(step, ctx, memo, enqueue);
    expect(id()).toBe('built');

    expect(runUntil(s, () => advance(step, ctx, memo, enqueue) > step, 60)).toBe(true);
    step = advance(step, ctx, memo, enqueue);
    expect(id()).toBe('heatmap');

    ctx.heatmap = true;
    step = advance(step, ctx, memo, enqueue);
    expect(id()).toBe('crac');

    s.commands.push({ type: 'build', kind: 'crac', x: 16, y: 8 });
    processCommands(s);
    step = advance(step, ctx, memo, enqueue);
    expect(id()).toBe('inspect');

    ctx.inspected = s.buildings.find((b) => b.kind === 'rack')!.id;
    step = advance(step, ctx, memo, enqueue);
    expect(id()).toBe('repair');
    // L'entrée de l'étape a provoqué la panne d'exercice.
    processCommands(s);
    const failed = s.buildings.find((b) => b.id === memo.failedRackId)!;
    expect(failed.status).toBe('failed');

    s.commands.push({ type: 'order', techs: [s.techs[0].id], task: { type: 'repair', target: failed.id }, append: false });
    expect(runUntil(s, () => failed.status === 'ok', 40)).toBe(true);
    step = advance(step, ctx, memo, enqueue);
    expect(id()).toBe('goal');
    runSeconds(s, 1);
    expect(advance(step, ctx, memo, enqueue)).toBe(step); // la dernière étape attend le joueur
  });

  it('chaque étape a un titre et une consigne', () => {
    for (const st of STEPS) {
      expect(st.title.length).toBeGreaterThan(3);
      expect(st.text.length).toBeGreaterThan(30);
    }
  });
});
