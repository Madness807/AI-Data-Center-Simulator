# Plan — RTS de micro-gestion d'un data center IA (Three.js)

## Contexte

Prototype web d'un RTS où le joueur construit et exploite un data center IA en temps réel. On a commencé par Three.js (et pas Unreal) pour itérer vite. Tout tourne dans Docker. Le projet est parti de zéro (v0.1a) ; la v1.0 « Carrière » est sortie le 5 octobre 2026.

Choix validés : caméra isométrique 3D, pas d'IA ennemie en v1 (la pression vient des pannes, des deadlines et de la chaleur). La v0.1 (boucle complète) est découpée en trois tranches jouables. Recherche, énergie avancée, réseau et extension arrivent dans les jalons suivants.

## Stack

- TypeScript + Vite + Three.js (le seul gros paquet à installer)
- UI : HTML/CSS par-dessus le canvas, sans framework
- Docker :
  - `Dockerfile` (node:22-alpine) qui fait le `npm ci` **dans l'image**
  - `docker-compose.yml` qui lance `vite --host` sur le port 5173, avec le dossier monté en volume pour le rechargement automatique
  - volume anonyme `- /app/node_modules` pour que les binaires natifs Linux musl (rolldown, lightningcss, TypeScript, oxlint) ne soient pas écrasés par ceux de macOS
  - si le rechargement ne se déclenche pas sur macOS : `VITE_USE_POLLING=true docker compose up` (lu par `vite.config.ts`)
  - depuis la bêta, l'étape `beta` du `Dockerfile` produit une image nginx qui sert `dist/` (service `beta`, profil compose `beta`, port 8080) ; elle n'est construite que si `npm run check` passe
- Tests : Vitest sur la simulation pure (sans rendu), plus des bots d'équilibrage qui jouent des parties complètes

## Architecture

On sépare la simulation du rendu :

- **Simulation** : logique pure, pas à pas fixe de 10 ticks/s, testable sans navigateur.
- **Rendu** : Three.js, qui lit l'état sans le modifier.

Principes :

- **State sérialisable** : uniquement des données simples (objets, tableaux, nombres), pas de classes. La sauvegarde et les replays deviennent faciles plus tard.
- **File de commandes** : l'input ne modifie jamais le state. Il produit des commandes (`build`, `order`, `acceptJob`, `rejectJob`, `setSpeed`…) que la simulation applique au tick suivant ; se déplacer, construire ou réparer sont des tâches confiées aux techniciens par `order`.
- **RNG à graine** stockée dans le state : simulation déterministe, donc tests reproductibles.
- **Constantes d'équilibrage centralisées** dans `sim/balance.ts`.
- **Contrôle du temps** : pause, x1, x2, x4. Un multiplicateur règle le nombre de ticks exécutés par frame ; le `dt` de la simulation ne change pas.

```
src/
  main.ts                 démarrage, boucle de jeu (ticks fixes × vitesse, rendu rAF), actions du HUD
  save.ts  settings.ts  report.ts   sauvegardes (format, migrations, validation), options, rapport de bug
  sim/                    simulation pure, déterministe, sans rendu
    balance.ts            tous les réglages du jeu (coûts, kW, °C, taux, paliers, alertes…)
    state.ts  entities.ts état sérialisable, types d'équipements, de techniciens, de contrats
    sim.ts                step(s) : les systèmes dans un ordre fixe
    commands.ts           commandes du joueur (construire, ordonner, accepter…) appliquées au tick
    systems/              power, heat, jobs, failures, technicians, economy, incidents, alerts
    career.ts  progression.ts  research.ts   modes, paliers, modificateurs, arbre de recherche
    climate.ts  clusters.ts  stats.ts  ledger.ts   allées et météo, blocs d'entraînement, indicateurs, grand livre
    network.ts            réseau de calcul : câblage par les allées, liaisons des racks, aperçus
    pathfinding.ts  rng.ts  math.ts  names.ts  alert-memory.ts   A*, hasard à graine, petits calculs, prénoms
  render/                 Three.js : lit l'état sans le modifier
    scene.ts  overlays.ts  overlay-colors.ts  thumbnails.ts  grid.ts
    cable-paths.ts  cable-view.ts   chemins de câbles au plafond (données pures, puis maillages)
    assets/               modèles low-poly procéduraux, palette, matériaux (voir docs/ASSETS.md)
  input/                  souris et clavier : build.ts, selection.ts, picking.ts, keymap.ts (table des raccourcis)
  audio/                  sons synthétisés (sfx.ts), moteur, chef d'orchestre (director.ts)
  ui/                     HUD en DOM, sans framework
    hud.ts                orchestrateur des composants
    components/           barre du haut, construction, contrats, inspecteur, tableau de bord, panneaux…
    catalog.ts  tones.ts  layout.ts  format.ts  color.ts  confirm.ts   noms, teintes, disposition, formats
    network-text.ts       textes du réseau (raisons d'un rack non relié, câbles)
    research-model.ts  research-links.ts   arbre de recherche : grille, liens, textes (données pures)
    tutorial/  styles/    partie guidée ; jetons de design (tokens.css) et feuilles de style
tests/                    Vitest sur la simulation et les modules purs, plus les bots d'équilibrage (bot.ts)
```

## Règles de jeu (v0.1)

### Unités

| Grandeur | Unité |
|---|---|
| Calcul | CU (compute units) par seconde |
| Énergie | kW |
| Chaleur | °C par case |
| Argent | $ |

Toutes les valeurs sont dans `balance.ts`.

### Énergie

- La capacité est **globale** : c'est la somme des PDU construits. L'énergie locale par rayon de PDU reste une idée pour plus tard (voir « Suite »).
- La charge est la somme des racks actifs et des CRAC actifs. **Les CRAC consomment de l'électricité.**
- Si la charge dépasse la capacité, on coupe les racks les plus récents d'abord. Avec le pool global de calcul, aucun rack n'est attaché à un contrat : l'ordre « sans contrat, puis deadline la plus lointaine » reviendra avec l'assignation manuelle.
- Les CRAC ne sont jamais délestés.

### Chaleur

- Chaque case a une température. La température ambiante (ex. 22 °C) est aussi le plancher.
- Un rack actif injecte de la chaleur (en kW) dans sa case.
- Diffusion explicite sur les 4 voisins, avec un coefficient borné : `k·dt ≤ 0.2`, sous la limite de stabilité de 0.25 (vérifié par une assertion au démarrage).
- Les bords de la grille sont des murs isolants (flux nul).
- Une légère perte vers l'ambiant empêche une dérive infinie.
- Un CRAC absorbe une puissance **limitée** (kW), répartie sur les cases de son rayon proportionnellement à leur écart avec la température cible. Un seul CRAC ne peut pas refroidir une salle entière.
- Heatmap affichée avec la touche H.

### Contrats IA

- Une offre comprend : un débit requis (CU/s), une durée, une deadline, un paiement et une pénalité.
- On l'accepte ou on la refuse. Une offre non traitée expire au bout de quelques secondes.
- **Pool global de calcul** : le calcul des racks actifs est réparti automatiquement entre les contrats acceptés, celui dont la deadline est la plus proche en premier. L'assignation manuelle à des groupes de racks est reportée.
- Contrat terminé à temps : paiement. Deadline dépassée : pénalité et contrat échoué.

### Pannes

- Le taux de panne par seconde est appliqué en `taux × dt` à chaque tick, donc indépendant de la fréquence des ticks.
- Le taux est bas sous un seuil (ex. 35 °C), puis croît vite au-dessus (exponentiel ou quadratique).
- Un rack en panne s'arrête et ne produit plus de calcul ni de chaleur.
- Réparation : un technicien sur une case adjacente, une durée fixe et un coût en pièces.

### Techniciens

- 2 techniciens au départ. On peut en embaucher (coût fixe + salaire par seconde).
- Les racks, CRAC et PDU **bloquent le passage**. Les techniciens travaillent depuis une case adjacente.
- **Accessibilité** : une construction est refusée si elle rend une entité ou un chantier inaccessible depuis la zone d'entrée.
- Ordres :
  - clic droit sur un rack en panne → réparer ;
  - clic droit sur un chantier → construire ;
  - clic droit au sol → se déplacer.
- Shift + clic droit ajoute l'ordre à la file du technicien.
- Poser un chantier pendant que des techniciens sont sélectionnés le leur confie (en fin de file).
- Les pièces d'une réparation sont payées à l'arrivée du technicien ; plusieurs techniciens sur un même chantier additionnent leur travail.
- Pathfinding A* sur 4 voisins.

### Construction

- Poser un bâtiment crée un chantier et débite son coût immédiatement.
- Un technicien doit venir le construire (durée fixe).
- Annuler un chantier non commencé rembourse son coût.

### Économie, objectif et défaite

- **Dépenses** : électricité (par kWh, prix fixe en v0.1), salaires, pièces et pénalités.
- **Revenus** : paiements des contrats.
- **Faillite** : argent < 0 pendant **30 s d'affilée** (configurable), avec un compte à rebours visible. Game over à la fin du compte.
- **Objectif** : atteindre un montant cible pour gagner (100 000 $ depuis la bêta, calé par les bots d'équilibrage). La partie continue ensuite en mode libre.

### État de départ

- Une petite salle avec une zone d'entrée.
- Un PDU, un CRAC et 2 techniciens déjà en place, plus un capital de départ.
- Un premier contrat facile proposé d'office, pour apprendre la boucle.

## Caméra et contrôles

- Pan au clavier (WASD) **relatif à la rotation de la caméra**.
- Pan par les bords de l'écran, **désactivable** (gênant dans un onglet).
- Zoom à la molette, borné.
- Q/E : rotation par **pas de 90°** avec une animation courte, pour garder la lecture isométrique.
- Espace : pause. Touches 1, 2, 3 : vitesse x1, x2, x4.
- H : calques (chaleur, énergie…). B : défilement par les bords. Échap : annuler. Les raccourcis sont tous dans `src/input/keymap.ts`.

## Jalons

### v0.1a — Bac à sable thermique ✅

1. Docker et squelette : Vite, TypeScript, Three.js, sol en grille, caméra RTS.
2. State, RNG, file de commandes, boucle à pas fixe, pause et vitesse.
3. Construction **immédiate** (sans technicien) des racks, CRAC et PDU avec un coût.
4. Énergie et délestage.
5. Chaleur et heatmap.

**But** : vérifier que gérer la chaleur et l'énergie est déjà intéressant.

### v0.1b — Pression ✅

1. Contrats : génération, acceptation, pool de calcul, deadlines.
2. Pannes liées à la température, état « en panne » visible.
3. Économie complète et faillite avec compte à rebours.
4. Objectif de victoire.
5. Réparation temporaire par un clic sur le rack (remplacée en v0.1c).

**But** : la boucle risque/récompense fonctionne.

### v0.1c — Micro RTS ✅

1. Techniciens : entités, A*, contrôle d'accessibilité.
2. Sélection au clic et au rectangle, clic droit = ordre, file d'ordres.
3. Chantiers : la construction passe par les techniciens.
4. Réparation par technicien, embauche.
5. Positions interpolées au rendu.

**But** : la v0.1 complète est jouable.

### v0.2 — Équilibrage et lisibilité ✅

- Tooltips sur les entités (température, état, contrat en cours).
- Alertes (surchauffe, panne, deadline proche, énergie saturée).
- Mini-graphes : température moyenne, revenus/dépenses, utilisation du calcul.
- Passe d'équilibrage sur `balance.ts`.

Réalisé avec la refonte du HUD (console d'opérateur, inspecteur) et le lot 5 de la bêta.

### v0.9 — Bêta ✅

Le jeu est complet et confié à des testeurs : on ne fait plus que corriger et équilibrer.

1. Version affichée, options persistantes, menu pause, écran d'erreur avec rapport.
2. Sauvegarde : automatique, 3 emplacements, export/import `.json`.
3. Son synthétisé : effets et ambiance, réglés par un chef d'orchestre testé.
4. Partie guidée en 9 étapes et mode daltonien.
5. Équilibrage par bots (`tests/balance.test.ts`) : un joueur compétent gagne en 25 à 40 minutes de jeu, et grandir est récompensé.
6. Image Docker de production (nginx), README pour les testeurs, CHANGELOG, crédits et licences.

**But** : recueillir les retours des testeurs ; ce sont eux qui décideront de la suite.

### v0.10 — Supervision ✅

Alertes préventives, tableau de bord (PUE, disponibilité), panneau Équipe et calques. Livré aux testeurs en 0.10.0-beta.

### v1.0 — Carrière ✅

Une carrière d'une heure et demie environ, en 4 paliers (réputation, puis calcul en service), avec un arbre de recherche de 22 nœuds financé par une part du calcul. La partie rapide garde exactement les règles de la bêta : chaque système lit `GameState.rules`.

1. Supervision (v0.10).
2. Socle de progression : modes, réputation, paliers, recherche.
3. Énergie de secours : coupures, onduleurs, groupes électrogènes, redondance N+1.
4. Refroidissement avancé : orientation des racks et allées, confinement, CDU, météo et canicules.
5. Générations de GPU (G1 à G3), modernisation, contrats d'entraînement (blocs contigus) et SLA.
6. Personnel et maintenance : usure, entretien, maintenance planifiée et prédictive, stock de pièces, spécialités.
7. Carrière complète : clients par palier, conseils contextuels, équilibrage par bots.

Écarts au plan de départ, décidés à l'équilibrage :

- GPU G3 en recherche de niveau 3, avec le refroidissement liquide qu'ils exigent ; l'interconnexion optique passe au niveau 4 ;
- entraînement et SLA dès le Labo d'IA, pour nourrir la plus longue étape de la carrière ;
- les deux derniers paliers exigent aussi du calcul en service (150 puis 400 CU/s) ;
- seuils de réputation : 150, 500, 2 000.

**But** : une partie longue qui se renouvelle. Un joueur soigné atteint Hyperscaler en 75 à 120 minutes ; sans recherche, il plafonne au Labo d'IA.

### v1.1 — Réseau ✅

Le réseau de calcul de la carrière, en 7 lots (filet de sécurité, switch, câblage, blocs reliés, aperçus et calque, équilibrage, finitions).

- **Switch réseau** (8 ports, 1 kW), débloqué par la nouvelle branche de recherche Réseau : Switchs (niveau 2), Fabric spine-leaf (niveau 3), interconnexion optique (niveau 4).
- **Câblage automatique** par les cases libres, 10 cases au plus : les câbles les plus courts d'abord, un câble posé reste tant que son chemin tient. Chemins de câbles au plafond, calque Réseau, aperçus de construction.
- **Entraînement relié** à partir du Labo d'IA : un bloc ne prend que des racks reliés ; à cheval sur plusieurs switchs, il avance à 70 % sauf avec la Fabric. L'inférence et les SLA n'en dépendent pas.

Choix faits avec le joueur : le réseau ne compte que pour l'entraînement, le câblage est automatique, il s'ajoute à la règle des racks côte à côte, les switchs ne tombent pas en panne.

**But** : donner un sens au plan de la salle (bouts de rangée, allées libres) au moment où les entraînements arrivent. Un joueur soigné gagne toujours en 75 à 120 minutes ; sans réseau, il ne livre aucun entraînement et gagne nettement plus tard.

### v1.3 — Commercial ✅

Une 6e branche de recherche, **Commercial**, en 3 lots (branche et effets, commercial automatique, équilibrage et finitions).

- **Négociation** (niveau 2) : contrats +10 %. **Fidélisation** (niveau 2) : offres deux fois plus longues, échéances +15 %. **Grands comptes** (niveau 4) : plafond de taille +25 %, une offre de plus à la fois.
- **Commercial automatique** (niveau 3, après Fidélisation) : à chaque tick, il prend les offres les mieux payées par CU que le calcul en service (hors recherche) couvre, marge déduite (20 % par défaut, 10 points de plus pour un SLA) ; un entraînement seulement avec un bloc libre (sur un seul switch sans la Fabric), un seul en attente ; rien pendant une coupure. Sans tirage au sort.
- **Réglages** dans le panneau Contrats : interrupteur, types pris, prix minimum par CU, marge. Allumé, tous types, dès la recherche faite. Sauvegarde au format 10.
- Panneau R&D à 6 colonnes (jusqu'à 1 320 px).

Choix faits avec le joueur : une branche à part plutôt qu'un nœud d'Exploitation, le commercial allumé dès sa recherche, tous les types de contrats par défaut mais prudemment.

**But** : alléger la fin de partie sans retirer la décision. Un bot qui délègue au commercial gagne toujours en moins de 120 minutes, sans plus de retards.

### v1.4 — Multi-sites (scale-across) — à faire

Le troisième niveau d'échelle d'un data center d'IA, après le rack (scale-up) et la salle (scale-out) : plusieurs sites reliés par des liens longue distance. Ce que les hyperscalers font vraiment aujourd'hui, c'est surtout répartir l'inférence entre régions et orchestrer ; l'entraînement synchrone entre sites reste lent. Le jeu suit la même idée.

**Principe** : la salle du joueur reste le seul site construit case par case. Les **sites distants** se gèrent à plus haut niveau, comme une colocation : on y loue de la capacité de calcul par modules, sans plan de salle, sans chaleur ni réparations à gérer (une équipe locale est comprise dans le loyer).

- **Régions** (3, aux profils contrastés) : par exemple un site nordique (électricité et climat favorables, mais lien lent et loin des clients), un site proche (cher, rapide) et un site d'énergie verte (bon marché, coupures plus fréquentes). Chacune a un loyer par module, un prix de l'électricité, une latence et un risque d'incident.
- **Modules de capacité** : chaque module ajoute du calcul (CU/s) au site, avec frais d'ouverture et loyer par seconde.
- **Liens inter-sites (WAN)** : chaque site distant est relié à la salle par un lien de débit limité, qu'on peut renforcer. Une coupure de lien isole le site.
- **Contrats régionaux** : une partie des offres d'inférence vient d'une région ; servies depuis un site de cette région, elles paient plus (latence). Les offres **multi-régions** exigent du calcul sur au moins deux sites et résistent à la perte de l'un d'eux.
- **Entraînement réparti** : un bloc d'entraînement peut s'étendre à un site distant, mais il avance alors beaucoup plus lentement (synchronisation par le WAN, bornée par le débit du lien), ce que la recherche améliore.
- **Incidents régionaux** : panne de site ou coupure de lien, quelques minutes. C'est l'intérêt de répartir.
- **Recherche** (branche Réseau, niveaux 4 et 5) : « Liens inter-sites » (ouvre les sites distants), « Orchestration globale » (l'inférence va seule vers le site le moins cher ou le plus proche), « Entraînement asynchrone » (entraînement réparti nettement moins pénalisé).
- **Interface** : un panneau Sites (carte des régions, capacité, loyer, état, débit du lien), la région sur les cartes de contrat, le calcul par site au tableau de bord, un chapitre du guide (généré depuis les réglages, comme les autres).

**Lots** :

1. Socle : modèle `RemoteSite` et liens dans `GameState`, règle `rules.sites` (carrière seulement), réglages `SITES`/`WAN` dans `balance.ts`, sauvegarde (format + 1, anciennes parties sans site), tests.
2. Sites distants : ouverture, modules, loyer et électricité au grand livre, calcul distant ajouté au partage des contrats ; panneau Sites.
3. Contrats régionaux et multi-régions, avec les SLA.
4. Entraînement réparti et débit des liens ; les trois recherches.
5. Incidents régionaux, alertes, conseils de carrière.
6. Fin de carrière et équilibrage (bots) ; chapitre du guide.
7. Finitions et version 1.4.0.

**À décider avant le lot 1** :

- **Place dans la carrière** (proposition) : les sites distants s'ouvrent à Hyperscaler, et la victoire passe à un 5e palier, « Opérateur mondial », qui exige du calcul en service sur au moins deux sites. Le scale-across devient la finale, la carrière s'allonge de 20 à 30 minutes. Autre choix : contenu du mode libre, après la victoire actuelle.
- **Gestion des sites** : abstraite (proposition ci-dessus) ou vraie seconde salle construite case par case, beaucoup plus lourde (tout l'état de la partie est aujourd'hui celui d'une seule salle), qui rejoindrait alors l'**Extension** ci-dessous.

**But** : donner au joueur arrivé au sommet un nouveau problème d'échelle, qui ne se résout plus en posant des racks mais en répartissant (coût, latence, résilience), et lui faire sentir pourquoi l'entraînement reste groupé alors que l'inférence se répartit.

### Suite

- **Multi-sites (scale-across)** : plan détaillé ci-dessus (v1.4).
- **Extension** : achat de nouvelles salles, carte qui s'agrandit.
- **Énergie** : prix variable de l'électricité (réseau, solaire, gaz), contrats d'approvisionnement, PDU à rayon local.
- **Sécurité** : incendie, détection et extinction.
- **Personnel** : fatigue et équipes de nuit, compétences individuelles des techniciens.
- **Interface** : historique des contrats.

## Vérification

- `docker compose exec app npm run check` : typage, tests et build ; la même vérification conditionne la construction de l'image bêta.
- `docker compose --profile beta up -d --build beta`, puis http://localhost:8080 : le jeu servi par nginx, tel que le reçoivent les testeurs.
- `docker compose up`, puis ouvrir http://localhost:5173 dans le navigateur pour vérifier (si le port est pris : `APP_PORT=5174 docker compose up`) :
  - la construction ;
  - la heatmap ;
  - les ordres aux techniciens ;
  - la pause et la vitesse.
- `docker compose run --rm app npx vitest run` lance les tests unitaires :
  - `power` : délestage dans l'ordre de priorité ;
  - `heat` : stabilité (pas d'oscillation ni de NaN), bords isolants, CRAC borné, retour à l'ambiant ;
  - `jobs` : pool de calcul, paiement, pénalité ;
  - `failures` : indépendance au `dt`, croissance du taux avec la température, déterminisme avec la graine ;
  - `technicians` : A*, refus des constructions qui bloquent l'accès ;
  - `economy` : compte à rebours de faillite, victoire ;
  - `save`, `settings` : aller-retour fidèle, sauvegardes corrompues refusées, options assainies ;
  - `audio-director`, `tutorial` : sons déclenchés au bon moment, partie guidée jouée de bout en bout ;
  - `supervision` : alertes préventives (hystérésis), PUE, disponibilité ;
  - `progression`, `power-backup`, `aisles`, `generations`, `maintenance` : paliers, recherche et systèmes de la carrière ;
  - `career-tips` : conseils de carrière, une fois chacun ;
  - `balance` : bots d'équilibrage (joueur compétent, sans refroidissement, sans contrats, premier contrat ; en carrière : joueur soigné, sans recherche, sans énergie de secours).
- `tests/scenario.test.ts` : le scénario du test manuel ci-dessous, rejoué sans rendu avec une graine fixe pour vérifier la même séquence (garde-fou contre les régressions d'équilibrage).
- Scénario manuel :
  1. Poser 3 racks sans refroidissement : surchauffe, puis pannes.
  2. Envoyer un technicien réparer.
  3. Ajouter un CRAC : la température redescend.
