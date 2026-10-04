import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ENTRANCE } from '../sim/balance';
import type { BuildingKind } from '../sim/entities';

export const RACK_CAPACITY = 1024;

/** Centre de la case (x, y) dans le monde : la grille occupe [0, w] × [0, h] sur le sol. */
export function cellCenter(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(x + 0.5, 0, y + 0.5);
}

export function createFloor(w: number, h: number): THREE.Group {
  const g = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(w / 2, 0, h / 2);
  floor.receiveShadow = true;
  g.add(floor);

  // Dalles de faux plancher.
  const pts: number[] = [];
  for (let x = 0; x <= w; x++) pts.push(x, 0.005, 0, x, 0.005, h);
  for (let y = 0; y <= h; y++) pts.push(0, 0.005, y, w, 0.005, y);
  const lines = new THREE.BufferGeometry();
  lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: 0x343b48 })));

  const entranceMat = new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.35 });
  for (const [x, y] of ENTRANCE) {
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), entranceMat);
    tile.rotation.x = -Math.PI / 2;
    tile.position.set(x + 0.5, 0.01, y + 0.5);
    g.add(tile);
  }

  // Murets autour de la salle, ouverts à l'entrée.
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.8 });
  const wallH = 0.35;
  const addWall = (x0: number, z0: number, x1: number, z1: number) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(x1 - x0, 0.15), wallH, Math.max(z1 - z0, 0.15)),
      wallMat,
    );
    m.position.set((x0 + x1) / 2, wallH / 2, (z0 + z1) / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  addWall(0, -0.075, w, -0.075);
  addWall(0, h + 0.075, w, h + 0.075);
  addWall(w + 0.075, 0, w + 0.075, h);
  const doorYs = ENTRANCE.filter(([x]) => x === 0).map(([, y]) => y);
  const doorStart = Math.min(...doorYs);
  const doorEnd = Math.max(...doorYs) + 1;
  addWall(-0.075, 0, -0.075, doorStart);
  addWall(-0.075, doorEnd, -0.075, h);

  return g;
}

export interface RackMeshes {
  body: THREE.InstancedMesh;
  led: THREE.InstancedMesh;
}

export function createRackMeshes(): RackMeshes {
  const body = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.8, 1.6, 0.8).translate(0, 0.8, 0),
    new THREE.MeshStandardMaterial({ color: 0x2b313c, roughness: 0.5, metalness: 0.4 }),
    RACK_CAPACITY,
  );
  // LEDs en façade et en rampe sur le dessus (visible sous les 4 angles), colorées par instance.
  const led = new THREE.InstancedMesh(
    mergeGeometries([
      new THREE.BoxGeometry(0.6, 1.2, 0.02).translate(0, 0.85, 0.41),
      new THREE.BoxGeometry(0.5, 0.03, 0.12).translate(0, 1.615, 0),
    ]),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    RACK_CAPACITY,
  );
  for (const m of [body, led]) {
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
  }
  body.receiveShadow = true;
  // Créés d'emblée pour que le shader soit compilé avec la couleur par instance.
  led.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RACK_CAPACITY * 3), 3);
  return { body, led };
}

export function createCracMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.4, 0.9).translate(0, 0.7, 0),
    new THREE.MeshStandardMaterial({ color: 0xc7d0da, roughness: 0.6 }),
  );
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  const grille = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.36, 0.04, 24),
    new THREE.MeshStandardMaterial({ color: 0x1b1f26 }),
  );
  grille.position.y = 1.42;
  g.add(grille);

  const fan = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x1a5a80 });
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.1), bladeMat);
    blade.rotation.y = (i * Math.PI) / 3;
    fan.add(blade);
  }
  fan.position.y = 1.46;
  g.add(fan);
  g.userData.fan = fan;
  return g;
}

export function createPduMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.0, 0.55).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0xd9a520, roughness: 0.5 }),
  );
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.12, 0.57).translate(0, 0.75, 0),
    new THREE.MeshStandardMaterial({ color: 0x151515 }),
  );
  g.add(stripe);
  const bolt = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.3, 0.02).translate(0, 0.4, 0.28),
    new THREE.MeshBasicMaterial({ color: 0x151515 }),
  );
  bolt.rotation.z = 0.4;
  g.add(bolt);
  return g;
}

/** Losange flottant au-dessus des racks en panne (rouge) ou en réparation (orange). */
export function createStatusMarkers(): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.3),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    RACK_CAPACITY,
  );
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RACK_CAPACITY * 3), 3);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}

/** Encombrement visuel de chaque bâtiment (largeur, hauteur, profondeur). */
export const BUILDING_SIZE: Record<BuildingKind, [number, number, number]> = {
  rack: [0.8, 1.6, 0.8],
  crac: [0.9, 1.4, 0.9],
  pdu: [0.7, 1.0, 0.55],
};

const SITE_FILL: Record<BuildingKind, number> = { rack: 0x55657a, crac: 0xaab6c4, pdu: 0xd9a520 };

/** Chantier : échafaudage jaune et volume qui monte avec l'avancement (userData.setProgress). */
export function createSiteMesh(kind: BuildingKind): THREE.Group {
  const [w, h, d] = BUILDING_SIZE[kind];
  const g = new THREE.Group();
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 0.08, h, d + 0.08)),
    new THREE.LineBasicMaterial({ color: 0xffc83d }),
  );
  frame.position.y = h / 2;
  g.add(frame);
  const fill = new THREE.Mesh(
    new THREE.BoxGeometry(w, 1, d).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ color: SITE_FILL[kind], transparent: true, opacity: 0.75 }),
  );
  fill.castShadow = true;
  g.add(fill);
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(0.96, 0.96),
    new THREE.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.012;
  g.add(base);
  g.userData.setProgress = (p: number) => {
    fill.scale.y = Math.max(0.02, p) * h;
  };
  g.userData.setProgress(0);
  return g;
}

/** Technicien : gilet orange et casque jaune ; userData.ring = cercle de sélection. */
export function createTechMesh(): THREE.Group {
  const g = new THREE.Group();
  const figure = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.16, 0.34, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0xf08a24, roughness: 0.7 }),
  );
  body.position.y = 0.42;
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.165, 0.05, 14),
    new THREE.MeshBasicMaterial({ color: 0xe8f4ff }),
  );
  stripe.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf1c9a5 }));
  head.position.y = 0.82;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4 }),
  );
  helmet.position.y = 0.85;
  for (const m of [body, head, helmet]) m.castShadow = true;
  figure.add(body, stripe, head, helmet);
  g.add(figure);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.36, 32),
    new THREE.MeshBasicMaterial({ color: 0x3dffa0, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.025;
  ring.visible = false;
  g.add(ring);
  g.userData.ring = ring;
  g.userData.figure = figure;
  return g;
}
