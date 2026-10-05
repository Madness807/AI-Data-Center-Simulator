import * as THREE from 'three';
import { KEYS, matches, type KeyAction } from '../input/keymap';
import { BUILD_TIME, CRAC } from '../sim/balance';
import type { Building } from '../sim/entities';
import { busyRackIds } from '../sim/stats';
import type { GameState } from '../sim/state';
import type { Cell } from '../input/picking';
import {
  createBuildingModel,
  createFloor,
  createLighting,
  createPing,
  createRackInstances,
  createRangeRing,
  createSelectionBrackets,
  createContainmentPanels,
  createRackCrowns,
  createShedMarkers,
  createStatusMarkers,
  createTechnician,
  createWalls,
  PALETTE,
  RACK_CAPACITY,
  type AssetModel,
  type Ping,
  type PingKind,
  type RackInstances,
  type TechnicianModel,
  type WallsModel,
  isColorblind,
  statusColor,
  statusVersion,
  type StatusName,
} from './assets';
import { cellCenter } from './grid';
import { FloorOverlay } from './overlays';
import { hotAisleCells } from '../sim/climate';
import { FACING_ANGLE } from './assets/fx/build-ghost';

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
import { modifiers } from '../sim/progression';

const ELEVATION = Math.atan(1 / Math.SQRT2); // isométrie vraie
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const FOOTPRINT_RAY = new THREE.Raycaster();
const FOOTPRINT_NDC = new THREE.Vector2();
const FOOTPRINT_HIT = new THREE.Vector3();
const DISTANCE = 60;
const EDGE_MARGIN = 16;

/** Caméra RTS orthographique : pan clavier/bords, zoom molette, rotation par pas de 90°. */
export class RtsCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  readonly target: THREE.Vector3;
  edgePan = false;
  private viewSize = 20;
  private azimuth = Math.PI / 4;
  private azimuthGoal = Math.PI / 4;
  private aspect = 1;
  private readonly keys = new Set<string>();
  private mouse: { x: number; y: number } | null = null;
  /** Point vers lequel la caméra glisse (alerte cliquée) ; annulé dès que le joueur bouge. */
  private focusGoal: THREE.Vector3 | null = null;
  /** Rotation lente continue (écran titre). */
  autoOrbit = false;

  constructor(dom: HTMLElement, private readonly w: number, private readonly h: number) {
    this.target = new THREE.Vector3(w / 2, 0, h / 2);
    window.addEventListener('keydown', (e) => {
      const rotation = matches('rotateLeft', e) ? -1 : matches('rotateRight', e) ? 1 : 0;
      if (e.repeat && rotation) return;
      this.keys.add(e.code);
      this.azimuthGoal += (rotation * Math.PI) / 2;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.viewSize = THREE.MathUtils.clamp(this.viewSize * (e.deltaY > 0 ? 1.1 : 1 / 1.1), 6, 40);
        this.applyProjection();
      },
      { passive: false },
    );
    dom.addEventListener('mousemove', (e) => (this.mouse = { x: e.clientX, y: e.clientY }));
    dom.addEventListener('mouseleave', () => (this.mouse = null));
  }

  /** Glisse en douceur jusqu'au point (x, z) du sol. */
  focusOn(x: number, z: number): void {
    this.focusGoal = new THREE.Vector3(THREE.MathUtils.clamp(x, 0, this.w), 0, THREE.MathUtils.clamp(z, 0, this.h));
  }

  /**
   * Recentre la salle sur l'angle de départ (entrée à gauche), quel que soit l'angle laissé
   * par la rotation de l'écran titre : on rejoint le tour équivalent le plus proche.
   */
  settle(): void {
    this.autoOrbit = false;
    const turn = Math.PI * 2;
    this.azimuthGoal = Math.PI / 4 + Math.round((this.azimuth - Math.PI / 4) / turn) * turn;
    this.focusOn(this.w / 2, this.h / 2);
  }

  /** Place immédiatement la caméra au-dessus de (x, z) : glisser sur la mini-carte. */
  setTarget(x: number, z: number): void {
    this.focusGoal = null;
    this.target.set(THREE.MathUtils.clamp(x, 0, this.w), 0, THREE.MathUtils.clamp(z, 0, this.h));
  }

  /** Emprise de la vue au sol : les 4 coins de l'écran projetés sur le plancher (x, z). */
  footprint(): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      FOOTPRINT_RAY.setFromCamera(FOOTPRINT_NDC.set(nx, ny), this.camera);
      if (FOOTPRINT_RAY.ray.intersectPlane(GROUND, FOOTPRINT_HIT)) out.push({ x: FOOTPRINT_HIT.x, z: FOOTPRINT_HIT.z });
    }
    return out;
  }

  /** Angle courant de la caméra autour de la salle (radians), animé pendant les rotations. */
  get yaw(): number {
    return this.azimuth;
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.applyProjection();
  }

  update(dt: number): void {
    let right = 0;
    let fwd = 0;
    const held = (action: KeyAction) => KEYS[action].some((code) => this.keys.has(code));
    if (held('panUp')) fwd += 1;
    if (held('panDown')) fwd -= 1;
    if (held('panRight')) right += 1;
    if (held('panLeft')) right -= 1;
    if (this.edgePan && this.mouse) {
      if (this.mouse.x < EDGE_MARGIN) right -= 1;
      if (this.mouse.x > window.innerWidth - EDGE_MARGIN) right += 1;
      if (this.mouse.y < EDGE_MARGIN) fwd += 1;
      if (this.mouse.y > window.innerHeight - EDGE_MARGIN) fwd -= 1;
    }
    if (right || fwd) {
      this.focusGoal = null;
      // Le pan suit la rotation : « avant » est la direction de visée projetée au sol.
      const sin = Math.sin(this.azimuth);
      const cos = Math.cos(this.azimuth);
      const speed = this.viewSize * 0.9 * dt;
      this.target.x += (right * cos - fwd * sin) * speed;
      this.target.z += (-right * sin - fwd * cos) * speed;
      this.target.x = THREE.MathUtils.clamp(this.target.x, 0, this.w);
      this.target.z = THREE.MathUtils.clamp(this.target.z, 0, this.h);
    }

    if (this.focusGoal) {
      this.target.lerp(this.focusGoal, 1 - Math.exp(-8 * dt));
      if (this.target.distanceTo(this.focusGoal) < 0.01) this.focusGoal = null;
    }
    if (this.autoOrbit) this.azimuthGoal += dt * 0.12;
    this.azimuth += (this.azimuthGoal - this.azimuth) * (1 - Math.exp(-12 * dt));
    const c = Math.cos(ELEVATION) * DISTANCE;
    this.camera.position.set(
      this.target.x + c * Math.sin(this.azimuth),
      this.target.y + Math.sin(ELEVATION) * DISTANCE,
      this.target.z + c * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
  }

  private applyProjection(): void {
    const half = this.viewSize / 2;
    this.camera.left = -half * this.aspect;
    this.camera.right = half * this.aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }
}

/** Couleurs d'état converties pour three.js, recalculées quand le thème change (mode daltonien). */
const STATUS = {
  busy: new THREE.Color(),
  idle: new THREE.Color(),
  shed: new THREE.Color(),
  shedOff: new THREE.Color(),
  dead: new THREE.Color(),
  failed: new THREE.Color(),
  repairing: new THREE.Color(),
};
let statusColorsVersion = -1;
function refreshStatusColors(): void {
  if (statusColorsVersion === statusVersion()) return;
  statusColorsVersion = statusVersion();
  for (const name of Object.keys(STATUS) as StatusName[]) STATUS[name].setHex(statusColor(name));
}
const UP = new THREE.Vector3(0, 1, 0);

/** Modèle d'un bâtiment non instancié, avec ce qui permet de savoir s'il est encore à jour. */
interface PlacedModel {
  model: AssetModel;
  /** 'crac', 'pdu' ou 'site:<type>' : un chantier terminé change de modèle. */
  key: string;
  cell: Cell;
}

/** Lit le GameState et met la scène à jour ; ne modifie jamais l'état. */
export class SceneView {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly rts: RtsCamera;
  /** Calque au sol (chaleur, énergie, refroidissement, occupation, risque), ou aucun. */
  readonly overlay: FloorOverlay;
  private readonly racks: RackInstances;
  private readonly markers = createStatusMarkers(RACK_CAPACITY);
  private readonly shedMarkers = createShedMarkers(RACK_CAPACITY);
  /** Couronnes des racks G2 et G3. */
  private readonly crowns = createRackCrowns();
  /** Confinement d'allée chaude (recherche) : toit vitré au-dessus de chaque case où soufflent des racks. */
  private readonly containment: THREE.InstancedMesh;
  private readonly walls: WallsModel;
  private readonly others = new Map<number, PlacedModel>();
  /** Case du bâtiment de chaque instance de rack, pour le picking. */
  private rackCells: Cell[] = [];
  private readonly techs = new Map<number, TechnicianModel>();
  private readonly pings: Ping[] = [];
  private readonly inspectBrackets = createSelectionBrackets();
  private readonly inspectRange = createRangeRing(CRAC.radius, 'soft');
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();

  private readonly sun: THREE.DirectionalLight;
  private pixelRatio = 2;

  constructor(container: HTMLElement, w: number, h: number, graphics: { antialias: boolean; shadows: boolean; pixelRatio: 1 | 2 }) {
    this.renderer = new THREE.WebGLRenderer({ antialias: graphics.antialias });
    this.renderer.shadowMap.enabled = true;
    // three.js a retiré PCFSoftShadowMap et le remplaçait déjà par PCFShadowMap (avec un avertissement).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(PALETTE.background);
    this.rts = new RtsCamera(this.renderer.domElement, w, h);

    const lighting = createLighting(w, h);
    this.sun = lighting.sun;
    this.scene.add(lighting.root, createFloor(w, h));
    this.walls = createWalls(w, h);
    this.overlay = new FloorOverlay(w, h);
    this.racks = createRackInstances(RACK_CAPACITY);
    this.containment = createContainmentPanels(w * h);
    this.inspectRange.visible = false;
    this.scene.add(
      this.walls.root,
      this.overlay.mesh,
      this.racks.body,
      this.racks.led,
      this.markers,
      this.shedMarkers,
      this.crowns[2],
      this.crowns[3],
      this.containment,
      this.inspectBrackets,
      this.inspectRange,
    );

    this.applyGraphics(graphics);
    window.addEventListener('resize', () => this.resize());
  }

  /** Applique les options graphiques modifiables en cours de partie. */
  applyGraphics(graphics: { shadows: boolean; pixelRatio: 1 | 2 }): void {
    this.sun.castShadow = graphics.shadows;
    this.pixelRatio = graphics.pixelRatio;
    this.resize();
  }

  /** Case du bâtiment visé par le rayon (le volume 3D, pas le sol derrière), ou null. */
  pickBuilding(ray: THREE.Raycaster): Cell | null {
    const roots = [...this.others.values()].map((p) => p.model.root);
    const hit = ray.intersectObjects([this.racks.body, ...roots], true)[0];
    if (!hit) return null;
    if (hit.object === this.racks.body) return hit.instanceId === undefined ? null : this.rackCells[hit.instanceId];
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      if (o.userData.cell) return o.userData.cell as Cell;
    }
    return null;
  }

  get domElement(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /**
   * `alpha` (0..1) : fraction du tick suivant déjà écoulée, pour interpoler les techniciens
   * entre leur position au tick précédent et l'actuelle.
   */
  render(
    s: GameState,
    realTime: number,
    realDt: number,
    alpha: number,
    selected: ReadonlySet<number>,
    inspected: Building | null = null,
  ): void {
    this.syncInspected(inspected, realTime);
    this.syncRacks(s, realTime);
    this.syncContainment(s);
    this.syncOthers(s, realTime, realDt);
    this.syncTechs(s, realTime, alpha, selected);
    this.updatePings(realDt);
    this.overlay.update(s);
    this.rts.update(realDt);
    this.walls.update(this.rts.yaw, realDt);
    this.renderer.render(this.scene, this.rts.camera);
  }

  /** Position écran (px, repère client) de chaque technicien, telle que dessinée à la dernière frame. */
  techScreenPositions(): { id: number; x: number; y: number }[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const out: { id: number; x: number; y: number }[] = [];
    for (const [id, tech] of this.techs) {
      this.tmpVec.copy(tech.root.position).setY(0.5).project(this.rts.camera);
      out.push({
        id,
        x: rect.left + ((this.tmpVec.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - this.tmpVec.y) / 2) * rect.height,
      });
    }
    return out;
  }

  /** Cercle bref au sol pour confirmer un ordre. */
  ping(cell: Cell, kind: PingKind): void {
    const ping = createPing(kind);
    const y = ping.mesh.position.y; // hauteur fixée par l'asset, que cellCenter remettrait à 0
    cellCenter(cell.x, cell.y, ping.mesh.position).setY(y);
    this.scene.add(ping.mesh);
    this.pings.push(ping);
  }

  private updatePings(realDt: number): void {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const ping = this.pings[i];
      if (ping.update(realDt)) continue;
      this.scene.remove(ping.mesh);
      ping.dispose();
      this.pings.splice(i, 1);
    }
  }

  /** Crochets pulsants autour de l'équipement inspecté ; portée en plus pour un CRAC. */
  private syncContainment(s: GameState): void {
    let n = 0;
    if (s.rules.aisles && modifiers(s).containment) {
      for (const i of hotAisleCells(s)) {
        if (n >= this.containment.instanceMatrix.count) break;
        this.tmpMatrix.makeTranslation(cellCenter(i % s.w, Math.floor(i / s.w), this.tmpVec));
        this.containment.setMatrixAt(n++, this.tmpMatrix);
      }
    }
    this.containment.count = n;
    this.containment.instanceMatrix.needsUpdate = true;
  }

  private syncInspected(b: Building | null, realTime: number): void {
    this.inspectBrackets.visible = b !== null;
    this.inspectRange.visible = b?.kind === 'crac';
    if (!b) return;
    cellCenter(b.x, b.y, this.inspectBrackets.position).setY(0.012);
    this.inspectBrackets.scale.setScalar(1.04 + Math.sin(realTime * 5) * 0.04);
    cellCenter(b.x, b.y, this.inspectRange.position).setY(0.03);
  }

  private syncTechs(s: GameState, realTime: number, alpha: number, selected: ReadonlySet<number>): void {
    const seen = new Set<number>();
    for (const t of s.techs) {
      seen.add(t.id);
      let tech = this.techs.get(t.id);
      if (!tech) {
        tech = createTechnician();
        this.techs.set(t.id, tech);
        this.scene.add(tech.root);
      }
      const x = t.prevX + (t.x - t.prevX) * alpha;
      const y = t.prevY + (t.y - t.prevY) * alpha;
      tech.root.position.set(x + 0.5, 0, y + 0.5);
      const dx = t.x - t.prevX;
      const dy = t.y - t.prevY;
      if (dx || dy) tech.root.rotation.y = Math.atan2(dx, dy);
      tech.animate(t.working ? 'work' : dx || dy ? 'walk' : 'idle', realTime);
      tech.setSelected(selected.has(t.id));
    }
    for (const [id, tech] of this.techs) {
      if (seen.has(id)) continue;
      this.scene.remove(tech.root);
      this.techs.delete(id);
    }
  }

  private syncRacks(s: GameState, realTime: number): void {
    const { body, led } = this.racks;
    const markers = this.markers;
    const shedMarkers = this.shedMarkers;
    refreshStatusColors();
    // En mode daltonien, un rack délesté a son propre symbole : l'état ne tient plus à la couleur.
    const symbols = isColorblind();
    const blink = Math.sin(realTime * 8) > 0;
    const busy = busyRackIds(s);
    let n = 0;
    let m = 0;
    let k = 0;
    const crownCount = { 2: 0, 3: 0 };
    this.rackCells.length = 0;
    for (const b of s.buildings) {
      if (b.kind !== 'rack' || b.status === 'construction' || n >= body.instanceMatrix.count) continue;
      this.rackCells.push({ x: b.x, y: b.y });
      this.tmpQuat.setFromAxisAngle(UP, FACING_ANGLE[b.facing ?? 0]);
      this.tmpMatrix.compose(cellCenter(b.x, b.y, this.tmpVec), this.tmpQuat, UNIT_SCALE);
      body.setMatrixAt(n, this.tmpMatrix);
      led.setMatrixAt(n, this.tmpMatrix);
      if (b.gen === 2 || b.gen === 3) this.crowns[b.gen].setMatrixAt(crownCount[b.gen]++, this.tmpMatrix);
      let color: THREE.Color;
      if (b.status !== 'ok') color = STATUS.dead;
      else if (!b.powered) color = blink ? STATUS.shed : STATUS.shedOff;
      else if (busy.has(b.id)) {
        // Un rack qui calcule scintille légèrement, chacun à son rythme.
        color = this.tmpColor.copy(STATUS.busy).multiplyScalar(0.78 + 0.22 * Math.sin(realTime * 7 + b.id * 1.7));
      } else color = STATUS.idle;
      led.setColorAt(n, color);
      n++;

      if (symbols && b.status === 'ok' && !b.powered) {
        this.tmpVec.y = 2.0 + Math.sin(realTime * 2 + b.id) * 0.04;
        this.tmpQuat.setFromAxisAngle(UP, this.rts.yaw);
        this.tmpScale.setScalar(1);
        this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        shedMarkers.setMatrixAt(k, this.tmpMatrix);
        shedMarkers.setColorAt(k, STATUS.shed);
        k++;
      }

      if (b.status !== 'ok') {
        // Panneau tourné vers la caméra ; il palpite tant que le rack est en panne.
        const failed = b.status === 'failed';
        this.tmpVec.y = 2.05 + Math.sin(realTime * 3 + b.id) * 0.06;
        this.tmpQuat.setFromAxisAngle(UP, this.rts.yaw);
        this.tmpScale.setScalar(failed ? 1 + 0.1 * Math.sin(realTime * 6 + b.id) : 1);
        this.tmpMatrix.compose(this.tmpVec, this.tmpQuat, this.tmpScale);
        markers.setMatrixAt(m, this.tmpMatrix);
        markers.setColorAt(m, failed ? STATUS.failed : STATUS.repairing);
        m++;
      }
    }
    body.count = led.count = n;
    for (const g of [2, 3] as const) {
      this.crowns[g].count = crownCount[g];
      this.crowns[g].instanceMatrix.needsUpdate = true;
    }
    markers.count = m;
    shedMarkers.count = k;
    for (const mesh of [body, led, markers, shedMarkers]) mesh.instanceMatrix.needsUpdate = true;
    for (const mesh of [led, markers, shedMarkers]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Le raycast d'un InstancedMesh teste d'abord sa sphère englobante, mise en cache : sans
    // recalcul, les racks posés après le premier raycast sont invisibles au picking.
    body.computeBoundingSphere();
  }

  /** CRAC, PDU et tous les chantiers (les racks terminés sont instanciés à part). */
  private syncOthers(s: GameState, realTime: number, realDt: number): void {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      const site = b.status === 'construction';
      if (b.kind === 'rack' && !site) continue;
      seen.add(b.id);
      const key = site ? `site:${b.kind}` : b.kind;
      let placed = this.others.get(b.id);
      // Un chantier terminé change de modèle ; et les id repartent de 1 après « Recommencer ».
      if (placed && (placed.key !== key || placed.cell.x !== b.x || placed.cell.y !== b.y)) {
        this.scene.remove(placed.model.root);
        placed = undefined;
      }
      if (!placed) {
        const model = createBuildingModel(b.kind, site);
        const cell = { x: b.x, y: b.y };
        cellCenter(b.x, b.y, model.root.position);
        model.root.userData.cell = cell; // retrouvé par pickBuilding en remontant les parents
        placed = { model, key, cell };
        this.others.set(b.id, placed);
        this.scene.add(model.root);
      }
      placed.model.update({
        time: realTime,
        dt: realDt,
        speed: s.speed,
        powered: b.powered,
        progress: site ? 1 - b.workLeft / BUILD_TIME[b.kind] : 1,
        charge: b.kind === 'ups' ? (b.charge ?? 0) / modifiers(s).upsStoreKJ : undefined,
        discharging: b.kind === 'ups' && !s.power.grid && s.power.upsKW > 0,
        starting: b.kind === 'generator' && b.warmup !== undefined && b.warmup > 0,
        running: b.kind === 'generator' && b.warmup !== undefined && b.warmup <= 0,
      });
    }
    for (const [id, placed] of this.others) {
      if (seen.has(id)) continue;
      this.scene.remove(placed.model.root);
      this.others.delete(id);
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatio));
    this.renderer.setSize(w, h);
    this.rts.resize(w, h);
  }
}
