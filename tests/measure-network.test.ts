import { describe, it } from 'vitest';
import { COMPETENT, playBot, type BotProfile, type BotRun } from './bot';

/**
 * Mesure temporaire du jalon Réseau (à retirer au dernier lot) : les temps de carrière du bot,
 * pour régler l'équilibrage. Ne tourne qu'à la demande :
 * docker compose exec -T -e MEASURE=1 app npx vitest run tests/measure-network.test.ts
 */
const m = (s: number | null | undefined) => (s === null || s === undefined ? '—' : (s / 60).toFixed(1));
const failures = (r: BotRun) => r.state.buildings.reduce((n, b) => n + b.failures, 0);

function line(label: string, r: BotRun): string {
  const e = r.state.economy;
  const research = ['switches', 'fabric'].map((id) => `${id} ${m(r.researchAt[id])}`).join(' ');
  return [
    label,
    `paliers ${r.tierAt.map(m).join(' / ')}`,
    `victoire ${m(r.wonAt)}`,
    `livrés ${e.jobsDone} retards ${e.jobsFailed}`,
    `entraînements ${r.trainingsDone} (+${r.trainingsLate} en retard)`,
    `pannes ${failures(r)}`,
    `aspiration max ${r.maxIntake.toFixed(1)} °C`,
    research,
  ].join(' · ');
}

/** Variable d'environnement MEASURE (les types de Node ne sont pas chargés dans ce projet). */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

describe.runIf(env.MEASURE === '1')('mesure de la carrière', () => {
  it('imprime les parties du bot', () => {
    const profiles: [string, BotProfile, number[]][] = [
      ['soigné', { ...COMPETENT, career: true }, [1, 2, 3, 4]],
      ['sans secours', { ...COMPETENT, career: true, noBackup: true }, [1, 2, 3]],
    ];
    const lines: string[] = [];
    for (const [label, profile, seeds] of profiles) for (const seed of seeds) lines.push(line(`${label} g${seed}`, playBot(seed, profile, 130 * 60)));
    // oxlint-disable-next-line no-console -- cette mesure n'a pas d'autre sortie que la console
    console.log('\n' + lines.join('\n'));
  }, 600_000);
});
