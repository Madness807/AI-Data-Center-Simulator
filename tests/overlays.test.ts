import { afterEach, describe, expect, it } from 'vitest';
import { setColorblind, statusColor, type StatusName } from '../src/render/assets/status-colors';
import { cracHeadroom, paintOverlay, riskToRgb, type OverlayMode } from '../src/render/overlay-colors';
import { addBuilding, createEmptyState, idx, type GameState } from '../src/sim/state';
import { updateJobs } from '../src/sim/systems/jobs';
import { updatePower } from '../src/sim/systems/power';
import { GameHistory } from '../src/ui/metrics';

const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Couleur RGBA d'une case après peinture du calque. */
function paint(mode: OverlayMode, s: GameState) {
  const out = new Uint8Array(s.w * s.h * 4);
  paintOverlay(mode, s, out);
  return (x: number, y: number) => Array.from(out.slice(idx(s, x, y) * 4, idx(s, x, y) * 4 + 4));
}
const colorOf = (cell: number[]) => cell.slice(0, 3);
const status = (name: StatusName) => rgb(statusColor(name));

afterEach(() => setColorblind(false));

describe('calques', () => {
  it('chaleur : discret à l’ambiant, opaque quand ça chauffe', () => {
    const s = createEmptyState(1);
    s.temp[idx(s, 3, 3)] = 40;
    const at = paint('heat', s);
    expect(at(0, 0)[3]).toBe(90);
    expect(at(3, 3)[3]).toBe(255);
  });

  it('énergie : alimenté, délesté et en panne se distinguent, avec la palette daltonienne', () => {
    const s = createEmptyState(1);
    addBuilding(s, 'pdu', 0, 0); // 40 kW : 4 racks sur 5
    const racks = [2, 3, 4, 5, 6].map((x) => addBuilding(s, 'rack', x, 2));
    racks[1].status = 'failed';
    updatePower(s);
    let at = paint('power', s);
    expect(colorOf(at(2, 2))).toEqual(status('busy'));
    expect(colorOf(at(3, 2))).toEqual(status('failed'));
    // 4 racks en service pour 40 kW : tous alimentés ; un 6e serait délesté.
    addBuilding(s, 'rack', 7, 2);
    updatePower(s);
    at = paint('power', s);
    expect(colorOf(at(7, 2))).toEqual(status('shed'));
    expect(at(10, 10)[3]).toBeLessThan(200); // sol assombri, pas coloré

    setColorblind(true);
    at = paint('power', s);
    expect(colorOf(at(7, 2))).toEqual(status('shed'));
    expect(status('shed')).toEqual(rgb(0xe69f00));
  });

  it('occupation : racks qui calculent et racks inactifs', () => {
    const s = createEmptyState(1);
    addBuilding(s, 'pdu', 0, 0);
    const [a, b] = [2, 3].map((x) => addBuilding(s, 'rack', x, 2));
    updatePower(s);
    s.jobs.push({ id: 1, name: 'x', status: 'active', rateCU: 10, durationS: 60, work: 600, progress: 0, deadlineInS: 100, payment: 1, penalty: 1, offeredAt: 0, expiresAt: 0, deadline: 100, allocated: 0 });
    updateJobs(s, 0.1);
    const at = paint('occupancy', s);
    expect(colorOf(at(a.x, a.y))).toEqual(status('busy'));
    expect(colorOf(at(b.x, b.y))).toEqual(status('idle'));
  });

  it('refroidissement : marge, CRAC débordé et rack sans froid', () => {
    const s = createEmptyState(1);
    addBuilding(s, 'pdu', 0, 0);
    addBuilding(s, 'pdu', 1, 0);
    const crac = addBuilding(s, 'crac', 8, 8);
    addBuilding(s, 'rack', 8, 6);
    addBuilding(s, 'rack', 20, 3); // hors de portée
    updatePower(s);
    expect(cracHeadroom(s, crac)).toBeCloseTo(2 / 3);
    let at = paint('cooling', s);
    expect(colorOf(at(8, 6))).toEqual([79, 209, 255]);
    expect(colorOf(at(20, 3))).toEqual(status('failed'));

    // Quatre racks de plus autour du même CRAC : 50 kW pour 30 kW de froid.
    for (const [x, y] of [[7, 6], [9, 6], [7, 10], [9, 10]]) addBuilding(s, 'rack', x, y);
    updatePower(s);
    expect(cracHeadroom(s, crac)).toBeLessThan(0);
    at = paint('cooling', s);
    expect(colorOf(at(8, 8))).toEqual(status('failed'));
  });

  it('risque : un rack chaud vire au rouge, un rack au frais reste au vert', () => {
    expect(riskToRgb(0)).toEqual(status('busy'));
    expect(riskToRgb(1)).toEqual(status('failed'));
    const s = createEmptyState(1);
    addBuilding(s, 'pdu', 0, 0);
    addBuilding(s, 'rack', 2, 2);
    addBuilding(s, 'rack', 4, 2);
    updatePower(s);
    s.temp[idx(s, 4, 2)] = 55;
    const at = paint('risk', s);
    const dist = (c: number[], ref: number[]) => Math.hypot(c[0] - ref[0], c[1] - ref[1], c[2] - ref[2]);
    const [green, red] = [status('busy'), status('failed')];
    const cool = colorOf(at(2, 2));
    const hot = colorOf(at(4, 2));
    expect(dist(cool, green)).toBeLessThan(dist(cool, red));
    expect(dist(hot, red)).toBeLessThan(dist(hot, green));
  });
});

describe('historique du tableau de bord', () => {
  it('une mesure toutes les 5 s, et recettes / dépenses ramenées à la minute', () => {
    const s = createEmptyState(1);
    const h = new GameHistory();
    for (let t = 0; t <= 120; t++) {
      s.time = t;
      s.economy.ledger.revenue = 10 * t; // 600 $/min
      s.economy.ledger.electricity = 2 * t; // 120 $/min
      h.record(s);
    }
    expect(h.samples.length).toBe(25);
    const last = h.flows().at(-1)!;
    expect(last.revenue).toBeCloseTo(600);
    expect(last.operating).toBeCloseTo(120);

    // Une nouvelle partie (le temps recule) repart de zéro.
    s.time = 0;
    h.record(s);
    expect(h.samples.length).toBe(1);
  });
});
