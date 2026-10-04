import { describe, expect, it } from 'vitest';
import { BUILD_TIME, ENTRANCE, REPAIR, TECH } from '../src/sim/balance';
import { canBuild, processCommands } from '../src/sim/commands';
import { findPath, keepsAccess } from '../src/sim/pathfinding';
import { addBuilding, addTech, buildingAt, createEmptyState, createInitialState } from '../src/sim/state';
import { runSeconds, runUntil } from './helpers';

const noOffers = (s: ReturnType<typeof createEmptyState>) => ((s.nextOfferAt = Infinity), s);

describe('pathfinding', () => {
  it('A* contourne un mur et renvoie le plus court chemin', () => {
    const s = createEmptyState(1, 7, 5);
    for (let y = 0; y < 4; y++) addBuilding(s, 'rack', 3, y); // mur avec un passage en y = 4
    const path = findPath(s, { x: 0, y: 0 }, (c) => c.x === 6 && c.y === 0, (c) => Math.abs(c.x - 6) + Math.abs(c.y));
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ x: 6, y: 0 });
    expect(path!.length).toBe(6 + 2 * 4);
    expect(path!.some((c) => c.x === 3 && c.y === 4)).toBe(true);
  });

  it('renvoie null si la cible est enfermée', () => {
    const s = createEmptyState(1, 5, 5);
    for (const [x, y] of [[1, 2], [3, 2], [2, 1], [2, 3]]) addBuilding(s, 'rack', x, y);
    expect(findPath(s, { x: 0, y: 0 }, (c) => c.x === 2 && c.y === 2, () => 0)).toBeNull();
  });

  it('refuse une construction qui enfermerait un équipement', () => {
    const s = createEmptyState();
    // Un rack contre le mur du haut, entouré sur deux côtés : la dernière case libre le condamnerait.
    addBuilding(s, 'rack', 10, 0);
    addBuilding(s, 'rack', 9, 0);
    addBuilding(s, 'rack', 11, 0);
    expect(keepsAccess(s, 10, 1)).toBe(false);
    expect(canBuild(s, 'rack', 10, 1)).toBe("Bloquerait l'accès d'un équipement");
    // Deux rangées dos à dos restent accessibles par devant.
    expect(canBuild(s, 'rack', 9, 1)).toBeNull();
  });

  it('refuse une construction qui couperait la salle de l’entrée', () => {
    const s = createEmptyState(1, 6, 4);
    const [ex, ey] = ENTRANCE[0];
    expect(ex).toBe(0);
    // Mur vertical en x = 2 sauf une case : la combler isolerait la droite.
    for (let y = 0; y < 4; y++) if (y !== ey % 4) addBuilding(s, 'pdu', 2, y);
    addBuilding(s, 'rack', 4, 1);
    expect(keepsAccess(s, 2, ey % 4)).toBe(false);
  });

  it('refuse de construire sous un technicien', () => {
    const s = createEmptyState();
    addTech(s, { x: 5, y: 5 });
    expect(canBuild(s, 'rack', 5, 5)).toBe('Un technicien est sur la case');
  });
});

describe('technicians', () => {
  it('un chantier attend un technicien, qui vient le construire', () => {
    const s = noOffers(createEmptyState());
    s.commands.push({ type: 'build', kind: 'rack', x: 10, y: 8 });
    runSeconds(s, BUILD_TIME.rack + 5);
    expect(buildingAt(s, 10, 8)?.status).toBe('construction');

    const t = addTech(s, { x: 2, y: 8 });
    s.commands.push({ type: 'order', techs: [t.id], task: { type: 'build', target: buildingAt(s, 10, 8)!.id }, append: false });
    expect(runUntil(s, () => buildingAt(s, 10, 8)?.status === 'ok', 30)).toBe(true);
    // Il s'est arrêté à côté du chantier, pas dessus.
    expect(Math.abs(t.x - 10) + Math.abs(t.y - 8)).toBe(1);
    expect(t.tasks).toHaveLength(0);
    // Trajet de 7 cases à TECH.speed, puis le temps de construction.
    expect(s.time).toBeGreaterThanOrEqual(7 / TECH.speed + BUILD_TIME.rack - 0.2);
  });

  it('construire en ayant des techniciens sélectionnés leur confie le chantier', () => {
    const s = noOffers(createEmptyState());
    const t = addTech(s, { x: 5, y: 5 });
    s.commands.push({ type: 'build', kind: 'pdu', x: 7, y: 5, assign: [t.id] });
    processCommands(s);
    expect(t.tasks).toEqual([{ type: 'build', target: buildingAt(s, 7, 5)!.id }]);
    runSeconds(s, BUILD_TIME.pdu + 2);
    expect(buildingAt(s, 7, 5)?.status).toBe('ok');
    expect(s.power.capacityKW).toBeGreaterThan(0);
  });

  it('réparer : pièces payées à l’arrivée, puis le rack repart', () => {
    const s = noOffers(createEmptyState());
    addBuilding(s, 'pdu', 0, 0);
    const r = addBuilding(s, 'rack', 8, 5);
    r.status = 'failed';
    const t = addTech(s, { x: 2, y: 5 });
    const money = s.money;
    s.commands.push({ type: 'order', techs: [t.id], task: { type: 'repair', target: r.id }, append: false });
    runSeconds(s, 1);
    expect(r.status).toBe('failed'); // encore en route
    expect(runUntil(s, () => r.status === 'repairing', 5)).toBe(true);
    expect(money - s.money).toBeGreaterThanOrEqual(REPAIR.cost);
    expect(runUntil(s, () => r.status === 'ok', REPAIR.seconds + 1)).toBe(true);
  });

  it('Maj : les ordres s’enchaînent dans la file', () => {
    const s = noOffers(createEmptyState());
    const t = addTech(s, { x: 0, y: 0 });
    s.commands.push(
      { type: 'order', techs: [t.id], task: { type: 'move', x: 4, y: 0 }, append: false },
      { type: 'order', techs: [t.id], task: { type: 'move', x: 4, y: 4 }, append: true },
    );
    // Il passe par (4, 0), puis enchaîne sans attendre vers (4, 4).
    expect(runUntil(s, () => t.x === 4 && t.y === 0, 4 / TECH.speed + 0.3)).toBe(true);
    expect(t.tasks).toHaveLength(2);
    expect(runUntil(s, () => t.tasks.length === 0, 4 / TECH.speed + 0.3)).toBe(true);
    expect([t.x, t.y]).toEqual([4, 4]);

    // Sans Maj, un nouvel ordre remplace la file.
    s.commands.push(
      { type: 'order', techs: [t.id], task: { type: 'move', x: 0, y: 4 }, append: false },
      { type: 'order', techs: [t.id], task: { type: 'move', x: 9, y: 9 }, append: false },
    );
    processCommands(s);
    expect(t.tasks).toEqual([{ type: 'move', x: 9, y: 9 }]);
  });

  it('se déplacer vers un équipement s’arrête à côté', () => {
    const s = noOffers(createEmptyState());
    addBuilding(s, 'crac', 6, 6);
    const t = addTech(s, { x: 1, y: 6 });
    s.commands.push({ type: 'order', techs: [t.id], task: { type: 'move', x: 6, y: 6 }, append: false });
    runSeconds(s, 3);
    expect([t.x, t.y]).toEqual([5, 6]);
  });

  it('une tâche devenue inutile est abandonnée', () => {
    const s = noOffers(createEmptyState());
    const t = addTech(s, { x: 1, y: 1 });
    s.commands.push({ type: 'build', kind: 'rack', x: 10, y: 10, assign: [t.id] });
    runSeconds(s, 1);
    s.commands.push({ type: 'demolish', x: 10, y: 10 });
    runSeconds(s, 0.2);
    expect(t.tasks).toHaveLength(0);
  });

  it('les positions précédentes servent à l’interpolation', () => {
    const s = noOffers(createEmptyState());
    const t = addTech(s, { x: 0, y: 0 });
    s.commands.push({ type: 'order', techs: [t.id], task: { type: 'move', x: 5, y: 0 }, append: false });
    runSeconds(s, 0.5);
    expect(t.x - t.prevX).toBeCloseTo(TECH.speed * 0.1, 9);
  });

  it('embaucher coûte, plafonne et ajoute des salaires', () => {
    const s = noOffers(createInitialState());
    expect(s.techs).toHaveLength(TECH.start);
    const money = s.money;
    s.commands.push({ type: 'hire' });
    processCommands(s);
    expect(s.techs).toHaveLength(TECH.start + 1);
    expect(s.money).toBe(money - TECH.hireCost);
    runSeconds(s, 1);
    expect(s.economy.salariesPerS).toBeCloseTo((TECH.start + 1) * TECH.salaryPerS, 9);

    s.money = 1e9;
    for (let i = 0; i < TECH.max + 3; i++) s.commands.push({ type: 'hire' });
    processCommands(s);
    expect(s.techs).toHaveLength(TECH.max);
  });
});
