/*
 * Service worker de Data Center IA. Modèle : vite.config.ts le recopie au build en sw.js, avec
 * la liste des fichiers du jeu et une version tirée de leur contenu.
 *
 * Le jeu tourne entièrement dans le navigateur : on garde une copie de tous ses fichiers pour
 * qu'il se lance hors ligne. La page passe d'abord par le réseau (la dernière version tout de
 * suite), les autres fichiers viennent du cache (noms hachés : leur contenu ne change pas).
 * Une nouvelle version du jeu donne un nouveau sw.js, qui remplace l'ancien cache.
 */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const PREFIX = 'datacenter-ia-';
const CACHE = PREFIX + VERSION;
/** Au-delà, une page qui ne répond pas est servie depuis le cache (Wi-Fi captif, réseau mort). */
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? page(request) : file(request));
});

/** La page : le réseau d'abord, gardée pour la suite ; hors ligne, la dernière gardée. */
async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), PAGE_TIMEOUT_MS);
    if (response.ok) await cache.put('./', response.clone());
    return response;
  } catch {
    return (await cache.match('./')) ?? Response.error();
  }
}

/** Les autres fichiers : le cache d'abord, sinon le réseau (gardé à son tour). */
async function file(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('délai dépassé')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
