import * as THREE from 'three';
import { BUILDING_SIZE, createTechnician, PALETTE, PROP_MODELS } from './assets';
import { MATERIALS } from './assets/materials';
import { rackBodyGeometry, rackLedGeometry } from './assets/props/rack';

export type ThumbnailKey = 'rack' | 'crac' | 'pdu' | 'technician';

/**
 * Vignettes des vrais modèles 3D pour la barre de construction, rendues une seule fois
 * au démarrage dans un contexte WebGL temporaire, puis converties en images.
 */
export function renderThumbnails(size = 128): Record<ThumbnailKey, string> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(PALETTE.lightSky, PALETTE.lightGround, 1.5));
  const sun = new THREE.DirectionalLight(PALETTE.lightSun, 2.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  const ledMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.status.busy, toneMapped: false });

  const rack = new THREE.Group();
  rack.add(new THREE.Mesh(rackBodyGeometry(), MATERIALS.vertexColored()), new THREE.Mesh(rackLedGeometry(), ledMaterial));
  // CRAC et PDU montrés en service : écran et voyant allumés.
  const crac = PROP_MODELS.crac();
  const pdu = PROP_MODELS.pdu();
  for (const m of [crac, pdu]) m.update({ time: 0, dt: 0, speed: 1, powered: true, progress: 1 });
  const models: Record<ThumbnailKey, THREE.Object3D> = { rack, crac: crac.root, pdu: pdu.root, technician: createTechnician().root };

  const out = {} as Record<ThumbnailKey, string>;
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  for (const [key, object] of Object.entries(models) as [ThumbnailKey, THREE.Object3D][]) {
    scene.add(object);
    box.setFromObject(object);
    box.getCenter(center);
    // Même angle que la caméra du jeu, cadré sur le modèle (marge pour l'ombre portée).
    const height = key === 'technician' ? 1.3 : Math.max(BUILDING_SIZE.rack[1], box.max.y - box.min.y);
    const half = (height * 1.08) / 2;
    camera.left = camera.bottom = -half;
    camera.right = camera.top = half;
    camera.updateProjectionMatrix();
    camera.position.set(center.x + 6, center.y + 4.9, center.z + 6);
    camera.lookAt(center);
    renderer.render(scene, camera);
    out[key] = renderer.domElement.toDataURL('image/png');
    scene.remove(object);
  }
  ledMaterial.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
