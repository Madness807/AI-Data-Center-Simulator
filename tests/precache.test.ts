import { describe, expect, it } from 'vitest';
import { precacheList } from '../src/pwa/precache';

describe('fichiers gardés hors ligne', () => {
  const build = [
    'index.html',
    'sw.js',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'assets/index-D6sR9L22.js',
    'assets/index-D56ziVF2.css',
    'assets/LICENSES.md',
    'assets/models/.gitkeep',
    'assets/inter-latin-wght-normal-Dx4kXJAl.woff2',
    'assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2',
    'assets/inter-cyrillic-ext-wght-normal-BOeWTOD4.woff2',
    'assets/jetbrains-mono-greek-400-normal-C190GLew.woff2',
    'assets/inter-vietnamese-wght-normal-CBcvBZtf.woff2',
    'assets/jetbrains-mono-latin-400-normal-6-qcROiO.woff',
    'assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2',
  ];

  it('garde le jeu, la page sous « ./ », sans le service worker ni le superflu', () => {
    expect(precacheList(build)).toEqual([
      './',
      'assets/LICENSES.md',
      'assets/index-D56ziVF2.css',
      'assets/index-D6sR9L22.js',
      'assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2',
      'assets/inter-latin-wght-normal-Dx4kXJAl.woff2',
      'assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2',
      'icons/icon-192.png',
      'manifest.webmanifest',
    ]);
  });
});
