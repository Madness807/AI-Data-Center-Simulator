import type { Settings } from './settings';
import type { GameEvent, GameState } from './sim/state';

export interface ReportContext {
  state?: GameState;
  settings?: Readonly<Settings>;
  /** Derniers événements de la partie, du plus ancien au plus récent. */
  events?: readonly GameEvent[];
  error?: unknown;
  /** Navigateur et écran (fournis par l'appelant, pour garder la fonction pure). */
  environment?: { userAgent: string; screen: string };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * Rapport de bug en texte, prêt à coller dans un message : version, environnement, résumé
 * de la partie (dont la graine, pour la rejouer), options, derniers événements, erreur.
 */
export function buildReport(ctx: ReportContext, version: string, now = new Date()): string {
  const lines = [`Data Center IA ${version} — rapport du ${now.toISOString()}`];
  if (ctx.environment) lines.push(`Navigateur : ${ctx.environment.userAgent}`, `Écran : ${ctx.environment.screen}`);
  const s = ctx.state;
  if (s) {
    const count = (kind: string) => s.buildings.filter((b) => b.kind === kind).length;
    lines.push(
      '',
      '— Partie',
      `Graine : ${s.seed} · temps ${clock(s.time)} (tick ${s.tick}) · issue : ${s.outcome}`,
      s.mode === 'career'
        ? `Mode : carrière · palier ${s.career.tier} · réputation ${s.career.reputation} · recherche ${s.research.done.join(', ') || 'aucune'}${s.research.current ? ` (en cours : ${s.research.current}, part ${Math.round(s.research.share * 100)} %)` : ''}`
        : 'Mode : partie rapide',
      `Trésorerie : ${Math.round(s.money)} $ · vitesse ×${s.speed}`,
      `Équipements : ${count('rack')} racks, ${count('crac')} CRAC, ${count('pdu')} PDU · ${s.techs.length} techniciens`,
      `Énergie : ${s.power.loadKW}/${s.power.capacityKW} kW (${s.power.shedCount} délestés) · calcul ${s.compute.used}/${s.compute.total} CU/s`,
      s.power.grid ? 'Réseau électrique : présent' : `Réseau électrique : COUPÉ (groupes ${s.power.generatorKW} kW, onduleurs ${Math.round(s.power.upsKW)} kW)`,
      `Contrats : ${s.jobs.filter((j) => j.status === 'active').length} en cours, ${s.economy.jobsDone} livrés, ${s.economy.jobsFailed} en retard`,
    );
  }
  if (ctx.settings) lines.push('', '— Options', JSON.stringify(ctx.settings));
  if (ctx.events?.length) {
    lines.push('', '— Derniers événements');
    for (const e of ctx.events) lines.push(`[${clock(e.time)}] ${e.type} : ${e.message}`);
  }
  if (ctx.error !== undefined) {
    const err = ctx.error instanceof Error ? ctx.error : new Error(String(ctx.error));
    lines.push('', '— Erreur', `${err.name} : ${err.message}`, err.stack ?? '(pas de pile)');
  }
  return lines.join('\n');
}
