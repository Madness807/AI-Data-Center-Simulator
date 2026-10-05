import { describe, expect, it } from 'vitest';
import { actionKey, KEYS, keyLabel, matches } from '../src/input/keymap';

describe('table des raccourcis', () => {
  it('une touche ne sert qu’à une action', () => {
    const codes = Object.values(KEYS).flat();
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('reconnaît les touches par leur position physique', () => {
    expect(matches('panUp', { code: 'KeyW' })).toBe(true);
    expect(matches('panUp', { code: 'ArrowUp' })).toBe(true);
    expect(matches('panUp', { code: 'KeyZ' })).toBe(false);
  });

  it('sans disposition connue, les libellés sont ceux d’un QWERTY (comme avant)', () => {
    expect(['panUp', 'panLeft', 'panDown', 'panRight'].map((a) => actionKey(a as keyof typeof KEYS))).toEqual(['W', 'A', 'S', 'D']);
    expect([actionKey('rotateLeft'), actionKey('rotateRight')]).toEqual(['Q', 'E']);
    expect([keyLabel('Space'), keyLabel('Escape'), keyLabel('Digit3'), actionKey('dashboard'), actionKey('buildCompute')]).toEqual(['Espace', 'Échap', '3', 'Tab', 'R']);
  });
});
