import { describe, expect, it } from 'vitest';
import { AMBIENCE, ambienceOf, SoundDirector, soundForEvent, type SoundId } from '../src/audio/director';
import { HEAT } from '../src/sim/balance';
import { addBuilding, createEmptyState, createInitialState } from '../src/sim/state';
import { updatePower } from '../src/sim/systems/power';

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

  it('ambiance : l’activité suit les racks en service, quelle que soit leur génération', () => {
    const s = createEmptyState();
    expect(ambienceOf(s)).toEqual({ load: 0, heat: 0 });
    for (let x = 0; x < 3; x++) addBuilding(s, 'pdu', x, 0);
    const racks = [2, 3, 4, 5].map((x) => addBuilding(s, 'rack', x, 4));
    racks[0].gen = 3; // 60 CU/s, mais un seul rack
    racks[1].status = 'failed';
    updatePower(s);
    expect(ambienceOf(s).load).toBe(3 / AMBIENCE.fullRacks);
    s.temp[0] = HEAT.ambient + AMBIENCE.heatRangeC / 2;
    expect(ambienceOf(s).heat).toBeCloseTo(0.5);
    s.temp[0] = HEAT.ambient + 2 * AMBIENCE.heatRangeC;
    expect(ambienceOf(s).heat).toBe(1);
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
