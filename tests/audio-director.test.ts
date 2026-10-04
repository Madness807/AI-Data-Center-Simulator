import { describe, expect, it } from 'vitest';
import { SoundDirector, soundForEvent, type SoundId } from '../src/audio/director';
import { addBuilding, createInitialState } from '../src/sim/state';

function director() {
  const played: SoundId[] = [];
  let clock = 0;
  const d = new SoundDirector((id) => played.push(id), () => clock);
  return { d, played, advance: (ms: number) => (clock += ms) };
}

describe('sons', () => {
  it('associe chaque événement important à un son', () => {
    expect(soundForEvent('failure')).toBe('failure');
    expect(soundForEvent('delivered')).toBe('delivered');
    expect(soundForEvent('won')).toBe('victory');
    expect(soundForEvent('bankrupt')).toBe('defeat');
    expect(soundForEvent(undefined)).toBeNull();
  });

  it('une seule alarme quand plusieurs racks tombent en panne ensemble', () => {
    const { d, played, advance } = director();
    const fail = { type: 'warning' as const, message: 'x', time: 0, code: 'failure' as const };
    d.onEvents([fail, fail, fail, fail, fail]);
    expect(played).toEqual(['failure']);
    advance(500);
    d.onEvents([fail]);
    expect(played).toEqual(['failure']);
    advance(1500);
    d.onEvents([fail]);
    expect(played).toEqual(['failure', 'failure']);
  });

  it('réagit aux transitions : chantier posé, délestage, contrat accepté, compte à rebours', () => {
    const { d, played, advance } = director();
    const s = createInitialState(1);
    d.sync(s);
    d.onFrame(s);
    expect(played).toEqual([]);

    addBuilding(s, 'rack', 5, 5, true);
    d.onFrame(s);
    s.power.shedCount = 2;
    d.onFrame(s);
    s.jobs[0].status = 'active';
    d.onFrame(s);
    expect(played).toEqual(['place', 'shed', 'accept']);

    played.length = 0;
    s.economy.bankruptTimer = 0.5;
    d.onFrame(s);
    advance(1000);
    s.economy.bankruptTimer = 1.5;
    d.onFrame(s);
    s.economy.bankruptTimer = 1.7; // même seconde : pas de second bip
    d.onFrame(s);
    expect(played).toEqual(['bankruptTick', 'bankruptTick']);
  });

  it('ne rejoue rien après un chargement', () => {
    const { d, played } = director();
    const s = createInitialState(1);
    addBuilding(s, 'rack', 5, 5, true);
    s.power.shedCount = 3;
    d.sync(s);
    d.onFrame(s);
    expect(played).toEqual([]);
  });
});
