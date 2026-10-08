import {
  AISLE,
  ALERTS,
  COMMERCIAL,
  CDU,
  CRAC,
  DEMOLISH_REFUND,
  ECONOMY,
  FAILURE,
  GENERATOR,
  GPU,
  HEAT,
  HEAT_REUSE,
  HEATWAVE,
  JOBS,
  MAINTENANCE,
  NETWORK,
  OPTICAL,
  OUTAGE,
  PDU,
  RACK,
  RACKS_PER_CRAC,
  REPAIR,
  REPUTATION,
  RESEARCH_RATE,
  RETROFIT,
  SLA,
  SPECIALTY,
  START_MONEY,
  TECH,
  TRAINING,
  UPS,
  WEAR,
  WEATHER,
} from '../../sim/balance';
import type { Gen } from '../../sim/entities';
import { TIERS } from '../../sim/progression';
import { BRANCHES, RESEARCH, researchById } from '../../sim/research';
import { failureRiskPerMinute } from '../../sim/systems/failures';
import { OVERLAY_MODES } from '../../render/overlay-colors';
import { actionKey } from '../../input/keymap';
import { buildingName, shortName, SPECIALTY_LABEL } from '../catalog';
import { OVERLAY_INFO } from '../components/overlay-legend';
import { decimal, duration, integer, money, percent, percentFine, points, riskPerMinute } from '../format';
import { STEPS } from '../tutorial/steps';
import type { GuideChapter } from './model';

/*
 * Contenu du guide. Aucun chiffre n'est écrit en dur dans les textes : tout vient des
 * réglages (balance.ts, paliers, recherche), pour que le guide reste juste après un
 * rééquilibrage. tests/guide.test.ts le vérifie.
 */

const CAREER = 'Carrière';
const tier = (i: number) => TIERS[i].name;
const node = (id: string) => researchById(id)!;
/** Nom d'un nœud de recherche entre guillemets, pour renvoyer au chapitre Recherche. */
const research = (id: string) => `« ${node(id).name} »`;
const span = (r: readonly [number, number], unit = '') => `${r[0]} à ${r[1]}${unit}`;
const rack = (gen: Gen) => shortName('rack', gen);
const gens = [1, 2, 3] as const satisfies readonly Gen[];
const key = actionKey;

function start(): GuideChapter {
  const first = JOBS.firstJob;
  return {
    id: 'demarrer',
    title: 'Bien démarrer',
    icon: 'play',
    blocks: [
      { kind: 'p', text: 'Vous dirigez un data center d’IA : des clients vous confient du calcul, vos racks de GPU le produisent, et vous êtes payé à la livraison. Tout l’art est de garder la salle alimentée, au frais et en état de marche.' },
      { kind: 'h', text: 'La boucle de jeu' },
      {
        kind: 'list',
        items: [
          'Acceptez un contrat dans le panneau Contrats : il demande un débit de calcul (en CU/s) pendant une durée, avant une échéance.',
          `Posez des racks (${key('buildCompute')}) : chacun produit du calcul, mais consomme de l’électricité et chauffe.`,
          `Alimentez-les avec des PDU (${key('buildPower')}) et refroidissez-les avec des CRAC (${key('buildCooling')}).`,
          'Vos techniciens construisent, puis réparent les racks qui tombent en panne quand ils ont trop chaud.',
          'Livrez à l’heure, encaissez, et réinvestissez dans un parc plus grand.',
        ],
      },
      { kind: 'h', text: 'Au départ' },
      {
        kind: 'facts',
        rows: [
          ['Trésorerie', money(START_MONEY)],
          ['Équipements en place', `un ${buildingName('pdu')} et un ${buildingName('crac')}`],
          ['Techniciens', `${TECH.start}`],
          ['Premier contrat', `${first.units} racks pendant ${duration(first.durationS)}, payé ${money(first.payment)}`],
        ],
      },
      { kind: 'h', text: 'Deux modes' },
      { kind: 'p', text: `Carrière : livrez à l’heure pour gagner de la réputation et gravir ${TIERS.length} paliers, de ${tier(0)} à ${tier(TIERS.length - 1)}. Chaque palier apporte de plus gros clients, de nouvelles contraintes et de nouvelles recherches. Atteindre le dernier palier gagne la carrière.` },
      { kind: 'p', text: `Partie rapide : atteignez ${money(ECONOMY.goalMoney)} de trésorerie, avec seulement les racks, les CRAC et les PDU. Pas de paliers, pas de recherche.` },
      { kind: 'p', text: `Dans les deux modes, une trésorerie négative pendant ${duration(ECONOMY.bankruptcySeconds)} signifie la faillite. Après une victoire, la partie continue en mode libre.` },
      {
        kind: 'tips',
        items: [
          `Le tutoriel (écran titre) montre toute la boucle en ${STEPS.length} étapes.`,
          `La pause (${key('pause')}) laisse le temps de réfléchir : on peut construire et donner des ordres pendant qu’elle est active.`,
          'Le calque Chaleur montre tout de suite où il manque du froid.',
        ],
      },
    ],
  };
}

function contracts(): GuideChapter {
  return {
    id: 'contrats',
    title: 'Contrats',
    icon: 'trophy',
    blocks: [
      { kind: 'p', text: `Les offres arrivent toutes les ${span(JOBS.offerInterval, ' s')}, jusqu’à ${JOBS.maxOffers} à la fois, et disparaissent au bout de ${duration(JOBS.offerExpiry)} si vous ne les acceptez pas. Une offre demande un débit de calcul (CU/s) pendant une durée ; l’échéance tombe après la durée multipliée par une marge de ${span(JOBS.slack)}.` },
      {
        kind: 'facts',
        rows: [
          ['Paiement', `environ ${money(JOBS.pricePerCU)} par CU livré`],
          ['Échéance serrée', 'payée davantage'],
          ['Retard', `pénalité de ${percent(JOBS.penaltyRatio)} du paiement`],
          ['Taille', `au moins ${JOBS.minUnits} racks, et selon votre parc`],
        ],
      },
      { kind: 'p', text: 'Le calcul est partagé entre les contrats en cours : celui dont l’échéance est la plus proche passe d’abord. Un contrat en retard est perdu : vous payez la pénalité et il disparaît.' },
      { kind: 'h', text: 'Réputation', badge: CAREER },
      { kind: 'p', text: `Chaque livraison à l’heure rapporte ${REPUTATION.delivery} points de réputation, plus un point par tranche de ${REPUTATION.cuPerPoint} CU/s du contrat ; un retard en coûte ${-REPUTATION.late}. La réputation fait monter de palier, et chaque palier propose des contrats plus gros et mieux payés.` },
      { kind: 'h', text: 'Contrats d’entraînement', badge: tier(TRAINING.minTier) },
      { kind: 'p', text: `Ils demandent un bloc de racks contigus, réservé au contrat (${span(TRAINING.cluster[TRAINING.minTier])} racks au palier ${tier(TRAINING.minTier)}), durent ${span(TRAINING.duration, ' s')} et paient ${percent(TRAINING.priceMult - 1)} de plus. Chaque rack du bloc doit être câblé à un switch (voir Réseau). Si un rack du bloc tombe en panne, le bloc est rompu et l’entraînement perd ${percent(TRAINING.rollback)} de sa progression (${percent(TRAINING.rollbackCheckpoints)} avec ${research('checkpoints')}).` },
      { kind: 'h', text: 'Contrats avec SLA', badge: tier(SLA.minTier) },
      { kind: 'p', text: `Payés ${percent(SLA.priceMult - 1)} de plus, ils exigent un débit continu : si le contrat reçoit moins que son débit plus de ${percentFine(SLA.tolerance)} du temps, la pénalité est retenue sur le paiement et la livraison ne rapporte pas de réputation.` },
      { kind: 'h', text: 'Commercial', badge: CAREER },
      { kind: 'p', text: `La branche de recherche Commercial améliore vos ventes : ${research('negotiation')} (${node('negotiation').description.toLowerCase().replace(/\.$/, '')}), ${research('loyalty')}, puis ${research('key-accounts')} pour des offres plus grosses et plus nombreuses.` },
      { kind: 'p', text: `${research('auto-commercial')} accepte seul les offres que la salle peut tenir : jamais plus que le calcul en service (hors recherche) moins une marge de ${percent(COMMERCIAL.margin)} par défaut, plus large pour un SLA, et un entraînement seulement si un bloc libre existe ; rien pendant une coupure. Chaque contrat pris est annoncé. Dans le panneau Contrats, vous choisissez les types pris, un prix minimum par CU et la marge, ou vous l’éteignez.` },
      {
        kind: 'tips',
        items: [
          'N’acceptez que ce que vos racks peuvent assurer en plus des contrats en cours : un retard coûte la pénalité.',
          'Une panne pendant un contrat le ralentit ; gardez un peu de marge de calcul.',
          'Le tableau de bord montre le calcul disponible et ce qui est promis.',
        ],
      },
    ],
  };
}

function racks(): GuideChapter {
  return {
    id: 'racks',
    title: 'Racks et calcul',
    icon: 'rack',
    blocks: [
      { kind: 'p', text: 'Un rack en service produit du calcul (CU/s), consomme de l’électricité et dégage autant de chaleur. Il ne tourne que s’il est alimenté et en état de marche.' },
      {
        kind: 'facts',
        rows: gens.map((g) => [rack(g), `${money(GPU[g].cost)} · ${GPU[g].computeCU} CU/s · ${GPU[g].powerKW} kW · ${GPU[g].heatKW} kW de chaleur`] as [string, string]),
      },
      { kind: 'h', text: 'Générations de GPU', badge: CAREER },
      { kind: 'p', text: `${rack(2)} et ${rack(3)} se débloquent par la recherche (${research('gpu-g2')}, ${research('gpu-g3')}). Plus de calcul par kW, mais beaucoup plus de chaleur par case : un ${rack(3)} demande en pratique un CDU. Avec ${research('retrofit')}, un rack existant passe à la génération suivante pour la différence de prix, majorée de ${percent(RETROFIT.surcharge - 1)}.` },
      { kind: 'h', text: 'Orientation et allées', badge: CAREER },
      { kind: 'p', text: `En carrière, un rack aspire l’air par l’avant et souffle ${percent(AISLE.exhaustShare)} de sa chaleur par l’arrière (${key('rotateBuilding')} pour le pivoter, avant de le poser ou dans l’inspecteur). C’est l’air aspiré qui compte pour les pannes : placez les racks dos à dos pour former des allées chaudes, et face à face autour d’allées froides. ${research('containment')} renforce ce rangement.` },
      {
        kind: 'tips',
        items: [
          'Laissez une case libre devant chaque rack : les techniciens doivent pouvoir l’atteindre.',
          'Le calque Activité montre les racks qui travaillent, attendent ou sont à l’arrêt.',
        ],
      },
    ],
  };
}

function power(): GuideChapter {
  const upsSeconds = UPS.storeKJ / UPS.powerKW;
  return {
    id: 'energie',
    title: 'Énergie',
    icon: 'power',
    blocks: [
      { kind: 'p', text: `La capacité électrique est la somme de vos PDU (${PDU.capacityKW} kW chacun, plus avec ${research('pdu-hc')}). Si la demande la dépasse, le refroidissement et le réseau sont servis d’abord, puis les racks du plus ancien au plus récent : les plus récents sont délestés et s’arrêtent.` },
      {
        kind: 'facts',
        rows: [
          [buildingName('pdu'), `${money(PDU.cost)} · +${PDU.capacityKW} kW`],
          ['Électricité', `${decimal(ECONOMY.electricityPerKWs, 2)} $ par kW et par seconde`],
          [`${rack(1)} occupé`, `rapporte environ ${decimal(RACK.computeCU * JOBS.pricePerCU)} $/s, coûte ${decimal(RACK.powerKW * ECONOMY.electricityPerKWs)} $/s`],
          [buildingName('crac'), `${CRAC.powerKW} kW`],
        ],
      },
      { kind: 'h', text: 'Coupures du réseau', badge: tier(OUTAGE.minTier) },
      { kind: 'p', text: `À partir du palier ${tier(OUTAGE.minTier)}, le réseau électrique peut être coupé : une première coupure courte après ${duration(OUTAGE.firstDelayS)}, puis une toutes les ${span([OUTAGE.interval[0] / 60, OUTAGE.interval[1] / 60], ' min')}, pendant ${span(OUTAGE.duration, ' s')}. Un rack qui perd brutalement le courant a ${percent(OUTAGE.crashChance)} de risque de tomber en panne.` },
      {
        kind: 'facts',
        rows: [
          [buildingName('ups'), `${money(UPS.cost)} · ${UPS.powerKW} kW pendant ${duration(upsSeconds)}, dès la première seconde`],
          ['Recharge de l’onduleur', `${UPS.rechargeKW} kW pris sur le secteur`],
          [buildingName('generator'), `${money(GENERATOR.cost)} · ${GENERATOR.powerKW} kW toute la coupure`],
          ['Démarrage du groupe', `${duration(GENERATOR.startS)}, carburant ${decimal(GENERATOR.fuelPerKWs, 2)} $ par kW·s`],
        ],
      },
      { kind: 'p', text: `Les onduleurs et les groupes se débloquent par la recherche (${research('ups')}, ${research('generators')}). L’onduleur couvre le démarrage du groupe, qui tient ensuite toute la coupure.` },
      {
        kind: 'tips',
        items: [
          'Une alerte prévient quand la demande approche de la capacité : posez un PDU avant d’ajouter des racks.',
          'Le calque Énergie montre ce qui est alimenté, délesté ou secouru.',
          'Prévoyez assez d’onduleurs pour vos racks : ce sont eux qui évitent les pannes au moment de la coupure.',
        ],
      },
    ],
  };
}

function heat(): GuideChapter {
  return {
    id: 'chaleur',
    title: 'Chaleur et refroidissement',
    icon: 'temperature',
    blocks: [
      { kind: 'p', text: `Chaque rack chauffe sa case ; la chaleur se diffuse aux cases voisines et ne s’échappe que lentement de la salle, dont l’air neuf est à ${HEAT.ambient} °C. Au-delà de ${FAILURE.thresholdC} °C, les racks tombent beaucoup plus souvent en panne (voir Pannes).` },
      { kind: 'h', text: buildingName('crac') },
      { kind: 'p', text: `Un CRAC retire jusqu’à ${CRAC.coolingKW} kW de chaleur dans un rayon de ${CRAC.radius} cases, sans descendre sous ${HEAT.ambient} °C : de quoi refroidir environ ${RACKS_PER_CRAC} racks ${rack(1)}. ${research('crac-he')} augmente sa puissance.` },
      {
        kind: 'facts',
        rows: [
          [buildingName('crac'), `${money(CRAC.cost)} · ${CRAC.coolingKW} kW de froid`],
          ['Portée', `${CRAC.radius} cases`],
          ['Consommation', `${CRAC.powerKW} kW`],
        ],
      },
      { kind: 'h', text: buildingName('cdu'), badge: CAREER },
      { kind: 'p', text: `Débloqué par ${research('liquid-cooling')}, le CDU capte ${percent(CDU.captured)} de la chaleur des racks à ${CDU.radius} cases (jusqu’à ${CDU.capacityKW} kW) et la rejette dehors, pas dans la salle. Il consomme ${CDU.powerKW} kW et devient indispensable aux racks les plus denses.` },
      { kind: 'h', text: 'Météo et canicules', badge: tier(WEATHER.minTier) },
      { kind: 'p', text: `La température extérieure oscille autour de ${WEATHER.meanC} °C (± ${WEATHER.swingC} °C) sur un cycle de ${duration(WEATHER.periodS)}. Les CRAC perdent ${percentFine(WEATHER.cracPerC)} d’efficacité par degré au-dessus de ${WEATHER.meanC} °C et en gagnent autant en dessous (de ${percent(WEATHER.cracMin)} à ${percent(WEATHER.cracMax)}). Des canicules ajoutent jusqu’à ${HEATWAVE.boostC} °C pendant ${span([HEATWAVE.duration[0] / 60, HEATWAVE.duration[1] / 60], ' min')}.` },
      { kind: 'p', text: `Avec ${research('free-cooling')}, les CRAC consomment ${percent(1 - WEATHER.freeCoolingPowerMult)} de moins quand il fait moins de ${WEATHER.freeCoolingBelowC} °C dehors. Avec ${research('heat-reuse')}, la chaleur captée par les CDU se revend ${decimal(HEAT_REUSE.pricePerKWs, 2)} $ par kW·s.` },
      {
        kind: 'tips',
        items: [
          'Le calque Couverture des CRAC montre les cases refroidies et celles qui ne le sont pas.',
          'Un rack isolé loin d’un CRAC finit toujours par chauffer : regroupez-les autour du froid.',
          'Avant une canicule, gardez de la marge de froid : les CRAC faiblissent tous en même temps.',
        ],
      },
    ],
  };
}

function failures(): GuideChapter {
  const temps = [FAILURE.thresholdC, FAILURE.thresholdC + 5, FAILURE.thresholdC + 10, FAILURE.thresholdC + 15];
  return {
    id: 'pannes',
    title: 'Pannes et entretien',
    icon: 'alert',
    blocks: [
      { kind: 'p', text: `Seuls les racks tombent en panne. Le risque reste faible jusqu’à ${FAILURE.thresholdC} °C, puis grimpe avec le carré de l’écart. Un rack en panne ne calcule plus jusqu’à sa réparation.` },
      { kind: 'facts', rows: temps.map((t) => [`Risque à ${t} °C`, riskPerMinute(failureRiskPerMinute(t))] as [string, string]) },
      { kind: 'h', text: 'Réparer' },
      { kind: 'p', text: `Un technicien se rend au rack, paie les pièces à son arrivée (${money(REPAIR.cost)}) et répare en ${duration(REPAIR.seconds)}. ${research('auto-repair')} envoie les techniciens libres réparer d’eux-mêmes ; ${research('spare-parts')} rend les réparations moins chères et plus courtes.` },
      { kind: 'h', text: 'Usure et âge', badge: tier(WEAR.minTier) },
      { kind: 'p', text: `À partir du palier ${tier(WEAR.minTier)}, un rack en service s’use, deux fois plus vite au-dessus de ${WEAR.hotC} °C. Plus il est usé, plus il tombe en panne ; l’âge augmente aussi le risque (+${percent(WEAR.agePerHour)} par heure de service).` },
      { kind: 'p', text: `Un entretien remet l’usure à zéro : clic droit d’un technicien sur le rack, ${money(MAINTENANCE.cost)} et ${duration(MAINTENANCE.seconds)}. ${research('planned-maintenance')} entretient seul les racks usés à plus de ${MAINTENANCE.autoAbove} %. ${research('predictive')} réduit les pannes et prévient avant qu’un rack ne lâche.` },
      {
        kind: 'tips',
        items: [
          'Le calque Risque de panne montre les racks en danger.',
          'Une alerte prévient quand une panne attend un technicien depuis trop longtemps.',
        ],
      },
    ],
  };
}

function technicians(): GuideChapter {
  return {
    id: 'techniciens',
    title: 'Techniciens',
    icon: 'hire',
    blocks: [
      { kind: 'p', text: 'Les techniciens construisent tout ce que vous posez, réparent et entretiennent les racks. Ils se déplacent dans les allées libres.' },
      {
        kind: 'facts',
        rows: [
          ['Embauche', `${money(TECH.hireCost)} (${key('hire')})`],
          ['Salaire', `${decimal(TECH.salaryPerS)} $ par seconde`],
          ['Équipe', `${TECH.max} au plus`],
          ['Vitesse', `${TECH.speed} cases par seconde`],
        ],
      },
      { kind: 'h', text: 'Donner des ordres' },
      {
        kind: 'list',
        items: [
          'Sélectionnez un technicien d’un clic, ou plusieurs en traçant un rectangle (Maj pour ajouter).',
          'Clic droit : aller, construire, réparer ou entretenir ce qui est sous la souris.',
          'Maj + clic droit : ajouter l’ordre à la file du technicien.',
          'Sans ordre, les techniciens libres prennent d’eux-mêmes les chantiers en attente.',
        ],
      },
      { kind: 'h', text: 'Spécialités', badge: CAREER },
      { kind: 'p', text: `Avec ${research('specialties')}, vous pouvez embaucher un ${SPECIALTY_LABEL.electrician}, un ${SPECIALTY_LABEL.hvac} ou un ${SPECIALTY_LABEL.it} : il travaille ${SPECIALTY.speed} fois plus vite dans son domaine (énergie, froid, racks et réseau). ${research('fast-techs')} rend toute l’équipe plus rapide. Le panneau Équipe (${key('team')}) règle les réparations et l’entretien automatiques.` },
      {
        kind: 'tips',
        items: [
          'Un technicien de plus coûte peu face à un contrat perdu sur une panne non réparée.',
          'Gardez au moins un technicien libre près des racks les plus chauds.',
        ],
      },
    ],
  };
}

function network(): GuideChapter {
  return {
    id: 'reseau',
    title: 'Réseau',
    icon: 'switch',
    badge: tier(NETWORK.minTier),
    blocks: [
      { kind: 'p', text: `À partir du palier ${tier(NETWORK.minTier)}, chaque rack d’un bloc d’entraînement doit être relié à un switch en service. Les switchs se débloquent par ${research('switches')} et se posent avec ${key('buildNetwork')}.` },
      {
        kind: 'facts',
        rows: [
          [buildingName('switch'), `${money(NETWORK.cost)} · ${NETWORK.powerKW} kW`],
          ['Ports', `${NETWORK.ports} racks par switch`],
          ['Câbles', `${NETWORK.reach} cases au plus (${OPTICAL.cableReach} avec ${node('optical').name})`],
          ['Bloc sur plusieurs switchs', `${percent(NETWORK.crossSwitch)} de sa vitesse`],
        ],
      },
      { kind: 'p', text: `Chaque rack se câble seul au switch le plus proche qui a un port libre, en passant par les cases libres. Un bloc réparti sur plusieurs switchs ralentit, sauf avec ${research('fabric')}. Un switch ne tombe jamais en panne.` },
      {
        kind: 'tips',
        items: [
          'Posez un switch au bout de chaque rangée de racks, et laissez les allées libres pour les câbles.',
          'Le calque Réseau montre les racks reliés, ceux qui ne le sont pas, et pourquoi.',
        ],
      },
    ],
  };
}

function career(): GuideChapter {
  return {
    id: 'carriere',
    title: 'Carrière et paliers',
    icon: 'tier',
    badge: CAREER,
    blocks: [
      { kind: 'p', text: `La carrière se joue en ${TIERS.length} paliers. La réputation gagnée en livrant à l’heure fait monter de palier ; les derniers exigent aussi du calcul en service. Atteindre ${tier(TIERS.length - 1)} gagne la carrière.` },
      {
        kind: 'facts',
        rows: TIERS.map((t) => [t.name, `réputation ${integer(t.reputation)}${t.computeCU ? ` et ${t.computeCU} CU/s` : ''} · contrats jusqu’à ${t.maxUnits} racks`] as [string, string]),
      },
      ...TIERS.slice(1).flatMap((t) => [
        { kind: 'h' as const, text: `Au palier ${t.name}` },
        { kind: 'list' as const, items: [...t.perks] },
      ]),
      { kind: 'tips', items: ['Un conseil s’affiche la première fois qu’une situation se présente ; les Options permettent de les revoir.'] },
    ],
  };
}

function researchChapter(): GuideChapter {
  return {
    id: 'recherche',
    title: 'Recherche',
    icon: 'research',
    badge: CAREER,
    blocks: [
      { kind: 'p', text: `Une part de votre calcul finance la recherche (${percent(RESEARCH_RATE.defaultShare)} au départ, jusqu’à ${percent(RESEARCH_RATE.maxShare)}, réglable dans le panneau Recherche, touche ${key('research')}). Elle est prélevée avant les contrats ; chaque CU·s consacré donne ${decimal(RESEARCH_RATE.pointsPerCU)} point. ${research('opportunistic')} y envoie aussi le calcul inutilisé.` },
      { kind: 'p', text: `L’arbre compte ${RESEARCH.length} recherches en ${BRANCHES.length} branches. Le niveau d’une recherche s’ouvre au palier de même rang (le premier niveau au palier ${tier(0)}), et certaines en demandent d’autres avant elles.` },
      ...BRANCHES.flatMap((b) => [
        { kind: 'h' as const, text: b.name },
        {
          kind: 'cards' as const,
          items: RESEARCH.filter((n) => n.branch === b.id).map((n) => ({
            title: n.name,
            meta: `Niveau ${n.level} (${tier(n.level - 1)}) · ${points(n.cost)}${n.requires.length ? ` · après ${n.requires.map((r) => node(r).name).join(', ')}` : ''}`,
            text: n.description,
          })),
        },
      ]),
    ],
  };
}

function economy(): GuideChapter {
  return {
    id: 'economie',
    title: 'Économie',
    icon: 'money',
    blocks: [
      { kind: 'p', text: 'La trésorerie monte avec les livraisons et baisse avec les dépenses courantes : électricité, salaires, réparations, carburant et pénalités. Les constructions et les embauches se paient d’un coup.' },
      {
        kind: 'facts',
        rows: [
          ['Faillite', `${duration(ECONOMY.bankruptcySeconds)} de trésorerie négative`],
          ['Démolition', `remboursée à ${percent(DEMOLISH_REFUND)}, en entier si le chantier n’a pas commencé`],
          ['Électricité', `${decimal(ECONOMY.electricityPerKWs, 2)} $ par kW·s`],
          ['Salaire', `${decimal(TECH.salaryPerS)} $/s par technicien`],
        ],
      },
      { kind: 'p', text: `Le bilan sous la trésorerie donne le gain ou la perte par seconde. Le tableau de bord (${key('dashboard')}) détaille les recettes et chaque poste de dépense, et suit le calcul, la température et la disponibilité.` },
      {
        kind: 'tips',
        items: [
          `Une alerte prévient quand la trésorerie ne couvre plus que ${duration(ALERTS.cashS)} de dépenses courantes.`,
          `Un ${rack(1)} bien occupé se rembourse en une dizaine de minutes : n’en posez pas plus que vos contrats n’en demandent.`,
        ],
      },
    ],
  };
}

function interfaceChapter(): GuideChapter {
  return {
    id: 'interface',
    title: 'Interface',
    icon: 'display',
    blocks: [
      { kind: 'h', text: 'Calques' },
      { kind: 'p', text: `${key('overlay')} fait défiler les calques, qui colorent la salle selon une mesure ; le bouton Calques du coin bas droit ouvre leur liste.` },
      { kind: 'list', items: OVERLAY_MODES.map((m) => OVERLAY_INFO[m].label) },
      { kind: 'h', text: 'Barre de construction' },
      { kind: 'p', text: 'Une carte par famille d’équipements. En carrière, quand une famille est en main, un bandeau au-dessus montre toutes ses variantes, avec leur prix et leurs chiffres clés : un clic en prend une, et la touche de la famille passe à la suivante.' },
      { kind: 'h', text: 'Inspecteur et alertes' },
      { kind: 'p', text: 'Un clic sur un équipement ouvre l’inspecteur : état, température, risque, et les actions possibles (réparer, entretenir, moderniser, pivoter). Les alertes, à gauche, préviennent avant la casse : rack qui chauffe, énergie presque saturée, contrat en retard, trésorerie basse, panne sans technicien.' },
      { kind: 'h', text: 'Mini-carte' },
      { kind: 'p', text: 'Un clic ou un glisser sur la mini-carte déplace la caméra.' },
      { kind: 'h', text: 'Sauvegardes et options' },
      { kind: 'p', text: 'La partie est sauvegardée automatiquement, et quand vous changez d’onglet ou fermez la page. Le menu (Échap) offre aussi des emplacements manuels, l’export et l’import d’un fichier, et les options : volumes, qualité graphique, taille de l’interface, mode daltonien, conseils de carrière.' },
      { kind: 'tips', items: ['Les sauvegardes restent dans ce navigateur : exportez la partie pour la garder ou la changer d’appareil.'] },
    ],
  };
}

/** Chapitres de règles du guide (chiffres tirés de l'équilibrage), dans l'ordre du sommaire. */
export function contentChapters(): GuideChapter[] {
  return [start(), contracts(), racks(), power(), heat(), failures(), technicians(), network(), career(), researchChapter(), economy(), interfaceChapter()];
}
