import { CRAC, DT, GENERATOR, RACK, UPS } from '../balance';
import type { Building } from '../entities';
import { modifiers } from '../progression';
import type { GameState } from '../state';

/** Puissance qu'un onduleur peut fournir pendant un tick, selon sa charge. */
function upsAvailableKW(b: Building): number {
  return Math.min(UPS.powerKW, (b.charge ?? 0) / DT);
}

/**
 * Distribution : la capacité des PDU plafonne ce qui est servi ; pendant une coupure, l'offre
 * vient des groupes en marche puis des onduleurs. Les CRAC sont servis en premier, puis
 * les racks par priorité ; ceux qui ne rentrent plus sont délestés. Aucun effet dans le
 * temps ici (appelé aussi après chaque commande) : les batteries et les groupes évoluent
 * dans updateBackup.
 */
export function updatePower(s: GameState): void {
  let capacity = 0;
  const pduKW = modifiers(s).pduCapacityKW;
  const cracs: Building[] = [];
  const racks: Building[] = [];
  let generatorKW = 0;
  let upsKW = 0;
  for (const b of s.buildings) {
    if (b.status !== 'ok') b.powered = false; // chantier, panne, réparation : ne consomme rien
    else if (b.kind === 'pdu') {
      capacity += pduKW;
      b.powered = true;
    } else if (b.kind === 'crac') cracs.push(b);
    else if (b.kind === 'rack') racks.push(b);
    else {
      // Onduleurs et groupes : sources de secours, toujours « en service » quand ils sont construits.
      b.powered = true;
      if (b.kind === 'generator' && b.warmup !== undefined && b.warmup <= 0) generatorKW += GENERATOR.powerKW;
      if (b.kind === 'ups') upsKW += upsAvailableKW(b);
    }
  }

  const grid = s.incidents.outageEndsAt === null;
  const backup = generatorKW + upsKW;
  let remaining = grid ? capacity : Math.min(capacity, backup);
  const supply = remaining;
  let shed = 0;
  const serve = (b: Building, kw: number) => {
    b.powered = remaining >= kw;
    if (b.powered) remaining -= kw;
    else shed++;
  };
  for (const c of cracs) serve(c, CRAC.powerKW);
  for (const r of racks.sort(byRackPriority)) serve(r, RACK.powerKW);

  const load = supply - remaining;
  const fromGenerators = grid ? 0 : Math.min(load, generatorKW);
  s.power = {
    capacityKW: capacity,
    demandKW: cracs.length * CRAC.powerKW + racks.length * RACK.powerKW,
    loadKW: load,
    shedCount: shed,
    grid,
    backupKW: backup,
    generatorKW: fromGenerators,
    upsKW: grid ? 0 : load - fromGenerators,
    chargeKW: s.power.chargeKW,
  };
}

/** Les racks les plus récents sont délestés d'abord : ils sont les derniers servis. */
function byRackPriority(a: Building, b: Building): number {
  return a.id - b.id;
}

/**
 * Évolution des secours pendant dt : démarrage des groupes, décharge des onduleurs pendant
 * une coupure, recharge sur le réseau ensuite (la recharge est facturée par l'économie).
 */
export function updateBackup(s: GameState, dt: number): void {
  const m = modifiers(s);
  const ups = s.buildings.filter((b) => b.kind === 'ups' && b.status === 'ok');
  if (!s.power.grid) {
    for (const g of s.buildings) {
      if (g.kind !== 'generator' || g.status !== 'ok') continue;
      if (g.warmup === undefined) g.warmup = m.generatorStartS;
      else g.warmup = Math.max(0, g.warmup - dt);
    }
    // La décharge se répartit selon ce que chaque onduleur peut fournir.
    const drawn = s.power.upsKW * dt;
    const avail = ups.map((b) => upsAvailableKW(b) * dt);
    const total = avail.reduce((a, b) => a + b, 0);
    if (drawn > 0 && total > 0) ups.forEach((b, i) => (b.charge = Math.max(0, (b.charge ?? 0) - (drawn * avail[i]) / total)));
    s.power.chargeKW = 0;
    return;
  }
  // Réseau présent : les groupes s'arrêtent, les onduleurs se rechargent.
  for (const g of s.buildings) if (g.kind === 'generator') delete g.warmup;
  let charging = 0;
  for (const b of ups) {
    const room = m.upsStoreKJ - (b.charge ?? 0);
    if (room <= 0) continue;
    const kw = Math.min(UPS.rechargeKW, room / dt);
    b.charge = (b.charge ?? 0) + kw * dt;
    charging += kw;
  }
  s.power.chargeKW = charging;
}

/** Autonomie des onduleurs (s) au débit qu'ils fournissent, ou à la demande si on n'est pas en coupure. */
export function upsAutonomy(s: GameState): number | null {
  const stored = s.buildings.reduce((sum, b) => sum + (b.kind === 'ups' && b.status === 'ok' ? (b.charge ?? 0) : 0), 0);
  if (stored <= 0) return null;
  const draw = s.power.grid ? Math.max(0, s.power.demandKW - plannedGeneratorKW(s)) : s.power.upsKW;
  return draw > 0 ? stored / draw : Infinity;
}

/** Puissance des groupes construits (en marche ou non). */
export function plannedGeneratorKW(s: GameState): number {
  return s.buildings.filter((b) => b.kind === 'generator' && b.status === 'ok').length * GENERATOR.powerKW;
}

/** Puissance maximale des onduleurs construits. */
export function plannedUpsKW(s: GameState): number {
  return s.buildings.filter((b) => b.kind === 'ups' && b.status === 'ok' && (b.charge ?? 0) > 0).length * UPS.powerKW;
}
