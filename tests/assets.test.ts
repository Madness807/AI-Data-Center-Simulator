import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BUILD_COST, ENTRANCE, GRID_H, GRID_W } from '../src/sim/balance';
import type { BuildingKind } from '../src/sim/entities';
import {
  BUILDING_SIZE,
  countTriangles,
  createBuildingModel,
  createRackInstances,
  createTechnician,
  PALETTE,
  PROP_MODELS,
  type AssetModel,
} from '../src/render/assets';
import { FLOOR_TEXELS, floorPixels, isPerforatedTile } from '../src/render/assets/textures';
import { rackBodyGeometry, rackLedGeometry } from '../src/render/assets/props/rack';

/** Tous les types de bâtiment du jeu, lus depuis l'équilibrage (source de vérité). */
const KINDS = Object.keys(BUILD_COST) as BuildingKind[];
const PROP_KINDS = KINDS.filter((k): k is Exclude<BuildingKind, 'rack'> => k !== 'rack');
const BUDGET = { rack: 1200, prop: 3000, technician: 2000 };
const TOLERANCE = 0.1;
const EPS = 1e-6;

const FULL = { time: 0, dt: 0, speed: 1, powered: true, progress: 1 };

function boxOf(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function meshesOf(object: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) out.push(o);
  });
  return out;
}

/** Posé au sol, centré sur sa case, sans en déborder, et pas plus haut que prévu. */
function expectGroundedInCell(box: THREE.Box3, kind: BuildingKind): void {
  expect(box.min.y).toBeGreaterThanOrEqual(-EPS);
  expect(box.min.y).toBeLessThan(0.05);
  expect(box.max.y).toBeLessThanOrEqual(BUILDING_SIZE[kind][1] + TOLERANCE);
  for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) expect(Math.abs(v)).toBeLessThanOrEqual(0.5 + EPS);
}

describe('assets', () => {
  it('le registre couvre chaque type de bâtiment', () => {
    for (const kind of KINDS) {
      expect(BUILDING_SIZE[kind]).toHaveLength(3);
      if (kind === 'rack') expect(createRackInstances(4).body.count).toBe(0);
      else expect(PROP_MODELS[kind]().root).toBeInstanceOf(THREE.Group);
    }
    expect(() => createBuildingModel('rack', false)).toThrow();
  });

  it('chaque équipement tient dans son encombrement, posé au sol au centre de sa case', () => {
    for (const kind of PROP_KINDS) {
      const model = createBuildingModel(kind, false);
      model.update(FULL);
      const box = boxOf(model.root);
      expectGroundedInCell(box, kind);
      const [w, , d] = BUILDING_SIZE[kind];
      expect(box.max.x - box.min.x).toBeLessThanOrEqual(w + TOLERANCE);
      expect(box.max.z - box.min.z).toBeLessThanOrEqual(d + TOLERANCE);
    }
    rackBodyGeometry().computeBoundingBox();
    const rack = rackBodyGeometry().boundingBox!;
    expectGroundedInCell(rack, 'rack');
    expect(rack.max.x - rack.min.x).toBeLessThanOrEqual(BUILDING_SIZE.rack[0] + TOLERANCE);
  });

  it('chaque chantier tient dans sa case, du début à la fin', () => {
    for (const kind of KINDS) {
      const site = createBuildingModel(kind, true);
      for (const progress of [0, 0.5, 1]) {
        site.update({ ...FULL, progress });
        expectGroundedInCell(boxOf(site.root), kind);
      }
    }
  });

  it('respecte les budgets de triangles', () => {
    const rack = countTriangles(new THREE.Mesh(rackBodyGeometry())) + countTriangles(new THREE.Mesh(rackLedGeometry()));
    expect(rack).toBeLessThanOrEqual(BUDGET.rack);
    for (const kind of PROP_KINDS) expect(countTriangles(createBuildingModel(kind, false).root)).toBeLessThanOrEqual(BUDGET.prop);
    for (const kind of KINDS) expect(countTriangles(createBuildingModel(kind, true).root)).toBeLessThanOrEqual(BUDGET.prop);
    expect(countTriangles(createTechnician().root)).toBeLessThanOrEqual(BUDGET.technician);
  });

  it('deux modèles du même type partagent géométries et matériaux', () => {
    const pairs: [THREE.Object3D, THREE.Object3D][] = [
      ...PROP_KINDS.map((k): [THREE.Object3D, THREE.Object3D] => [PROP_MODELS[k]().root, PROP_MODELS[k]().root]),
      ...KINDS.map((k): [THREE.Object3D, THREE.Object3D] => {
        const [a, b]: AssetModel[] = [createBuildingModel(k, true), createBuildingModel(k, true)];
        return [a.root, b.root];
      }),
      [createTechnician().root, createTechnician().root],
    ];
    for (const [a, b] of pairs) {
      const ma = meshesOf(a);
      const mb = meshesOf(b);
      expect(ma.length).toBe(mb.length);
      ma.forEach((m, i) => {
        expect(m.geometry).toBe(mb[i].geometry);
        expect(m.material).toBe(mb[i].material);
      });
    }
  });
});

describe('textures générées', () => {
  it('le sol a une dalle par case, des joints plus sombres et quelques dalles perforées', () => {
    const w = 6;
    const h = 4;
    const T = FLOOR_TEXELS;
    const p = floorPixels(w, h);
    expect([p.width, p.height]).toEqual([w * T, h * T]);
    const lum = (x: number, y: number) => {
      const o = (y * p.width + x) * 4;
      return p.data[o] + p.data[o + 1] + p.data[o + 2];
    };
    // Case (2, 1) : au centre de la dalle vs sur son joint.
    const row = (h - 1 - 1) * T;
    expect(lum(2 * T, row + T / 2)).toBeLessThan(lum(2 * T + T / 2, row + T / 2));
    let perforated = 0;
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (isPerforatedTile(x, y)) perforated++;
    expect(perforated).toBeGreaterThan(30);
    expect(perforated).toBeLessThan(250);
  });

  it('l’entrée est hachurée aux deux couleurs de sécurité', () => {
    const [ex, ey] = ENTRANCE[0];
    const p = floorPixels(GRID_W, GRID_H);
    const T = FLOOR_TEXELS;
    const seen = new Set<string>();
    for (let v = 8; v < T - 8; v++) {
      const o = (((GRID_H - 1 - ey) * T + v) * p.width + ex * T + T / 2) * 4;
      seen.add(`${p.data[o]},${p.data[o + 1]},${p.data[o + 2]}`);
    }
    const hex = (c: number) => `${(c >> 16) & 255},${(c >> 8) & 255},${c & 255}`;
    expect(seen).toEqual(new Set([hex(PALETTE.hazardA), hex(PALETTE.hazardB)]));
  });
});

describe('mode daltonien', () => {
  it('bascule la palette d’état et signale le changement', async () => {
    const { setColorblind, statusColor, statusVersion, PALETTE } = await import('../src/render/assets');
    const v = statusVersion();
    expect(statusColor('busy')).toBe(PALETTE.status.busy);
    setColorblind(true);
    expect(statusVersion()).toBe(v + 1);
    expect(statusColor('busy')).not.toBe(PALETTE.status.busy);
    // Plus d'opposition rouge / vert : « en calcul » n'est plus un vert dominant.
    const busy = statusColor('busy');
    const [r, g, b] = [(busy >> 16) & 255, (busy >> 8) & 255, busy & 255];
    expect(g > r && g > b && g - Math.max(r, b) > 60).toBe(false);
    setColorblind(false);
    expect(statusColor('busy')).toBe(PALETTE.status.busy);
  });
});
