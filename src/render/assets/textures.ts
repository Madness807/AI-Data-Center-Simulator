import * as THREE from 'three';
import { ENTRANCE } from '../../sim/balance';
import { once, onceBy } from './cache';
import { PALETTE, toRgb as rgb, type Rgb } from './palette';

/**
 * Textures générées en pur JS (DataTexture) : rien à charger, et testables sans navigateur.
 * Les fonctions *Pixels renvoient les pixels bruts (RGBA, ligne 0 = bas de l'image).
 */

/** Pixels par case dans la texture du sol. */
export const FLOOR_TEXELS = 64;

export interface Pixels {
  data: Uint8Array;
  width: number;
  height: number;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const shade = (c: Rgb, k: number): Rgb => [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k)];

function put(p: Pixels, x: number, y: number, c: Rgb): void {
  const o = (y * p.width + x) * 4;
  p.data[o] = c[0];
  p.data[o + 1] = c[1];
  p.data[o + 2] = c[2];
  p.data[o + 3] = 255;
}

function blank(width: number, height: number): Pixels {
  return { data: new Uint8Array(width * height * 4), width, height };
}

/** Hachage déterministe d'une case : mêmes variations de dalles à chaque partie. */
export function cellHash(x: number, y: number): number {
  let h = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Environ une dalle sur huit est perforée (soufflage de l'air froid sous le plancher). */
export function isPerforatedTile(x: number, y: number): boolean {
  return cellHash(x + 101, y + 37) > 0.875;
}

/** Rayures de sécurité diagonales, de période `period` pixels. */
function hazardAt(x: number, y: number, period: number): Rgb {
  return Math.floor((x + y) / (period / 2)) % 2 === 0 ? rgb(PALETTE.hazardA) : rgb(PALETTE.hazardB);
}

/**
 * Faux plancher de toute la salle : une dalle par case avec joints et biseau, légères
 * variations de teinte, dalles perforées, et l'entrée hachurée.
 * La texture est plaquée sur un plan couché : la ligne 0 correspond à la dernière rangée (z max).
 */
export function floorPixels(w: number, h: number): Pixels {
  const T = FLOOR_TEXELS;
  const p = blank(w * T, h * T);
  const face = rgb(PALETTE.floorTile);
  const seam = rgb(PALETTE.floorSeam);
  const hole = rgb(PALETTE.floorHole);
  const entrance = new Set(ENTRANCE.map(([x, y]) => y * w + x));

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const isEntrance = entrance.has(cy * w + cx);
      const perforated = !isEntrance && isPerforatedTile(cx, cy);
      const tile = shade(face, 0.93 + cellHash(cx, cy) * 0.14);
      const light = shade(tile, 1.14);
      const dark = shade(tile, 0.82);
      for (let v = 0; v < T; v++) {
        // v = 0 au bord nord de la case (z min) ; la texture est retournée verticalement.
        const py = (h - 1 - cy) * T + (T - 1 - v);
        for (let u = 0; u < T; u++) {
          const px = cx * T + u;
          const edge = Math.min(u, v, T - 1 - u, T - 1 - v);
          let c: Rgb;
          if (edge < 2) c = seam;
          else if (isEntrance) c = hazardAt(px, py, 16);
          else if (edge < 5) c = u < 5 || v < 5 ? light : dark; // biseau éclairé au nord-ouest
          else if (perforated && edge >= 9 && (u - 9) % 7 < 3 && (v - 9) % 7 < 3) c = hole;
          else c = tile;
          put(p, px, py, c);
        }
      }
    }
  }
  return p;
}

/** Motif de rayures de sécurité, à répéter. */
export function hazardPixels(size = 32): Pixels {
  const p = blank(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(p, x, y, hazardAt(x, y, size / 2));
  return p;
}

/** Panneau mural d'une case de large : joints verticaux et léger dégradé (plus clair en haut). */
export function wallPanelPixels(width = 32, height = 64): Pixels {
  const p = blank(width, height);
  const panel = rgb(PALETTE.wallPanel);
  const seam = rgb(PALETTE.wallSeam);
  for (let y = 0; y < height; y++) {
    const c = shade(panel, 0.86 + (y / height) * 0.2);
    for (let x = 0; x < width; x++) put(p, x, y, x < 2 || x >= width - 1 || y === Math.floor(height * 0.55) ? seam : c);
  }
  return p;
}

function toTexture({ data, width, height }: Pixels, repeat: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8; // la vue iso regarde le sol en biais
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const floorCache = onceBy((key: string) => {
  const [w, h] = key.split('x').map(Number);
  return toTexture(floorPixels(w, h), false);
});

export const TEXTURES = {
  floor: (w: number, h: number) => floorCache(`${w}x${h}`),
  hazard: once(() => toTexture(hazardPixels(), true)),
  wallPanel: once(() => toTexture(wallPanelPixels(), true)),
};
