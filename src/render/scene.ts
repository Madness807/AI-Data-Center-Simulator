import * as THREE from 'three';
import { BUILD_TIME, RACK } from '../sim/balance';
import { isRackActive } from '../sim/entities';
import type { GameState } from '../sim/state';
import {
  cellCenter,
  createCracMesh,
  createFloor,
  createPduMesh,
  createRackMeshes,
  createSiteMesh,
  createStatusMarkers,
  createTechMesh,
  type RackMeshes,
} from './meshes';
import { Heatmap } from './overlays';
import type { Cell } from '../input/picking';

const ELEVATION = Math.atan(1 / Math.SQRT2); // isométrie vraie
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

  constructor(dom: HTMLElement, private readonly w: number, private readonly h: number) {
    this.target = new THREE.Vector3(w / 2, 0, h / 2);
    window.addEventListener('keydown', (e) => {
      if (e.repeat && (e.code === 'KeyQ' || e.code === 'KeyE')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyQ') this.azimuthGoal -= Math.PI / 2;
      if (e.code === 'KeyE') this.azimuthGoal += Math.PI / 2;
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

  resize(width: number, height: number): void {
    this.aspect = width / height;
    this.applyProjection();
  }

  update(dt: number): void {
    let right = 0;
    let fwd = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) fwd += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fwd -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) right += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) right -= 1;
    if (this.edgePan && this.mouse) {
      if (this.mouse.x < EDGE_MARGIN) right -= 1;
      if (this.mouse.x > window.innerWidth - EDGE_MARGIN) right += 1;
      if (this.mouse.y < EDGE_MARGIN) fwd += 1;
      if (this.mouse.y > window.innerHeight - EDGE_MARGIN) fwd -= 1;
    }
    if (right || fwd) {
      // Le pan suit la rotation : « avant » est la direction de visée projetée au sol.
      const sin = Math.sin(this.azimuth);
      const cos = Math.cos(this.azimuth);
      const speed = this.viewSize * 0.9 * dt;
      this.target.x += (right * cos - fwd * sin) * speed;
      this.target.z += (-right * sin - fwd * cos) * speed;
      this.target.x = THREE.MathUtils.clamp(this.target.x, 0, this.w);
      this.target.z = THREE.MathUtils.clamp(this.target.z, 0, this.h);
    }

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

const LED_BUSY = new THREE.Color(0x3dffa0);
const LED_IDLE = new THREE.Color(0x2a7fa8);
const LED_SHED = new THREE.Color(0xff3b3b);
const LED_OFF = new THREE.Color(0x3a1414);
const LED_DEAD = new THREE.Color(0x15181d);
const MARK_FAILED = new THREE.Color(0xff3b3b);
const MARK_REPAIR = new THREE.Color(0xffa23b);

/** Lit le GameState et met la scène à jour ; ne modifie jamais l'état. */
export class SceneView {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly rts: RtsCamera;
  readonly heatmap: Heatmap;
  private readonly racks: RackMeshes;
  private readonly markers = createStatusMarkers();
  private readonly others = new Map<number, THREE.Group>();
  /** Case du bâtiment de chaque instance de rack, pour le picking. */
  private rackCells: Cell[] = [];
  private readonly techs = new Map<number, THREE.Group>();
  private readonly pings: { mesh: THREE.Mesh; age: number }[] = [];
  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpVec = new THREE.Vector3();

  constructor(container: HTMLElement, w: number, h: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0d1015);
    this.rts = new RtsCamera(this.renderer.domElement, w, h);

    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1d24, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(w / 2 + 12, 25, h / 2 + 8);
    sun.target.position.set(w / 2, 0, h / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -Math.max(w, h);
    sc.right = sc.top = Math.max(w, h);
    sc.near = 1;
    sc.far = 80;
    this.scene.add(sun, sun.target);

    this.scene.add(createFloor(w, h));
    this.heatmap = new Heatmap(w, h);
    this.scene.add(this.heatmap.mesh);
    this.racks = createRackMeshes();
    this.scene.add(this.racks.body, this.racks.led, this.markers);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Case du bâtiment visé par le rayon (le volume 3D, pas le sol derrière), ou null. */
  pickBuilding(ray: THREE.Raycaster): Cell | null {
    const hit = ray.intersectObjects([this.racks.body, ...this.others.values()], true)[0];
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
  render(s: GameState, realTime: number, realDt: number, alpha: number, selected: ReadonlySet<number>): void {
    this.syncRacks(s, realTime);
    this.syncOthers(s, realDt);
    this.syncTechs(s, realTime, alpha, selected);
    this.updatePings(realDt);
    this.heatmap.update(s);
    this.rts.update(realDt);
    this.renderer.render(this.scene, this.rts.camera);
  }

  /** Position écran (px, repère client) de chaque technicien, telle que dessinée à la dernière frame. */
  techScreenPositions(): { id: number; x: number; y: number }[] {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const out: { id: number; x: number; y: number }[] = [];
    for (const [id, obj] of this.techs) {
      this.tmpVec.copy(obj.position).setY(0.5).project(this.rts.camera);
      out.push({
        id,
        x: rect.left + ((this.tmpVec.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - this.tmpVec.y) / 2) * rect.height,
      });
    }
    return out;
  }

  /** Cercle bref au sol pour confirmer un ordre. */
  ping(cell: Cell, color: number): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    cellCenter(cell.x, cell.y, mesh.position).setY(0.04);
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    this.pings.push({ mesh, age: 0 });
  }

  private updatePings(realDt: number): void {
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.age += realDt;
      const k = p.age / 0.6;
      if (k >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.pings.splice(i, 1);
        continue;
      }
      p.mesh.scale.setScalar(1.4 - 0.6 * k);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    }
  }

  private syncTechs(s: GameState, realTime: number, alpha: number, selected: ReadonlySet<number>): void {
    const seen = new Set<number>();
    for (const t of s.techs) {
      seen.add(t.id);
      let obj = this.techs.get(t.id);
      if (!obj) {
        obj = createTechMesh();
        this.techs.set(t.id, obj);
        this.scene.add(obj);
      }
      const x = t.prevX + (t.x - t.prevX) * alpha;
      const y = t.prevY + (t.y - t.prevY) * alpha;
      obj.position.set(x + 0.5, 0, y + 0.5);
      const dx = t.x - t.prevX;
      const dy = t.y - t.prevY;
      if (dx || dy) obj.rotation.y = Math.atan2(dx, dy);
      const figure = obj.userData.figure as THREE.Object3D;
      // Au travail : il s'agite ; en marche : petit rebond.
      figure.position.y = t.working ? Math.abs(Math.sin(realTime * 12)) * 0.06 : dx || dy ? Math.abs(Math.sin(realTime * 9)) * 0.04 : 0;
      (obj.userData.ring as THREE.Object3D).visible = selected.has(t.id);
    }
    for (const [id, obj] of this.techs) {
      if (seen.has(id)) continue;
      this.scene.remove(obj);
      this.techs.delete(id);
    }
  }

  private syncRacks(s: GameState, realTime: number): void {
    const { body, led } = this.racks;
    const markers = this.markers;
    const blink = Math.sin(realTime * 8) > 0;
    // Le pool n'attribue pas de racks : on allume en « occupé » les plus anciens, à hauteur du calcul utilisé.
    let busyLeft = Math.ceil(s.compute.used / RACK.computeCU);
    let n = 0;
    let m = 0;
    this.rackCells.length = 0;
    for (const b of s.buildings) {
      if (b.kind !== 'rack' || b.status === 'construction' || n >= body.instanceMatrix.count) continue;
      this.rackCells.push({ x: b.x, y: b.y });
      this.tmpMatrix.makeTranslation(cellCenter(b.x, b.y, this.tmpVec));
      body.setMatrixAt(n, this.tmpMatrix);
      led.setMatrixAt(n, this.tmpMatrix);
      let color: THREE.Color;
      if (b.status !== 'ok') color = LED_DEAD;
      else if (!b.powered) color = blink ? LED_SHED : LED_OFF;
      else if (isRackActive(b) && busyLeft-- > 0) color = LED_BUSY;
      else color = LED_IDLE;
      led.setColorAt(n, color);
      n++;

      if (b.status !== 'ok') {
        const failed = b.status === 'failed';
        this.tmpVec.y = 2.05 + Math.sin(realTime * 3 + b.id) * 0.08;
        this.tmpMatrix.makeRotationY(failed ? 0 : realTime * 4).setPosition(this.tmpVec);
        markers.setMatrixAt(m, this.tmpMatrix);
        markers.setColorAt(m, failed ? MARK_FAILED : MARK_REPAIR);
        m++;
      }
    }
    body.count = led.count = n;
    markers.count = m;
    body.instanceMatrix.needsUpdate = led.instanceMatrix.needsUpdate = markers.instanceMatrix.needsUpdate = true;
    if (led.instanceColor) led.instanceColor.needsUpdate = true;
    if (markers.instanceColor) markers.instanceColor.needsUpdate = true;
    // Le raycast d'un InstancedMesh teste d'abord sa sphère englobante, mise en cache : sans
    // recalcul, les racks posés après le premier raycast sont invisibles au picking.
    body.computeBoundingSphere();
  }

  /** CRAC, PDU et tous les chantiers (les racks terminés sont instanciés à part). */
  private syncOthers(s: GameState, realDt: number): void {
    const seen = new Set<number>();
    for (const b of s.buildings) {
      const site = b.status === 'construction';
      if (b.kind === 'rack' && !site) continue;
      seen.add(b.id);
      const key = site ? `site:${b.kind}` : b.kind;
      let obj = this.others.get(b.id);
      // Un chantier terminé change de modèle ; et les id repartent de 1 après « Recommencer ».
      const cell = obj?.userData.cell as Cell | undefined;
      if (obj && (obj.userData.key !== key || cell?.x !== b.x || cell?.y !== b.y)) {
        this.scene.remove(obj);
        obj = undefined;
      }
      if (!obj) {
        obj = site ? createSiteMesh(b.kind) : b.kind === 'crac' ? createCracMesh() : createPduMesh();
        cellCenter(b.x, b.y, obj.position);
        obj.userData.cell = { x: b.x, y: b.y };
        obj.userData.key = key;
        this.others.set(b.id, obj);
        this.scene.add(obj);
      }
      if (site) (obj.userData.setProgress as (p: number) => void)(1 - b.workLeft / BUILD_TIME[b.kind]);
      const fan = obj.userData.fan as THREE.Object3D | undefined;
      if (fan && b.powered) fan.rotation.y += realDt * 10 * Math.max(s.speed, 0.15);
    }
    for (const [id, obj] of this.others) {
      if (seen.has(id)) continue;
      this.scene.remove(obj);
      this.others.delete(id);
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.rts.resize(w, h);
  }
}
