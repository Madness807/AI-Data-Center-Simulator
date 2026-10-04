# Plan — RTS de micro-gestion d'un data center IA (Three.js)

## Contexte

Prototype web d'un RTS où le joueur construit et exploite un data center IA en temps réel. On commence par Three.js (et pas Unreal) pour itérer vite. Tout tourne dans Docker. Le dossier `/Users/jonathan/Desktop/jeux_data_center_ai` est vide : on part de zéro.

Choix validés : caméra isométrique 3D, pas d'IA ennemie en v1 (la pression vient des pannes, des deadlines et de la chaleur). La v0.1 (boucle complète) est découpée en trois tranches jouables. Recherche, énergie avancée, réseau et extension arrivent dans les jalons suivants.

## Stack

- TypeScript + Vite + Three.js (le seul gros paquet à installer)
- UI : HTML/CSS par-dessus le canvas, sans framework
- Docker :
  - `Dockerfile` (node:22-alpine) qui fait le `npm install` **dans l'image**
  - `docker-compose.yml` qui lance `vite --host` sur le port 5173, avec le dossier monté en volume pour le rechargement automatique
  - volume anonyme `- /app/node_modules` pour que les binaires natifs Linux musl (esbuild, rollup) ne soient pas écrasés par ceux de macOS
  - si le rechargement ne se déclenche pas sur macOS : `server.watch.usePolling: true` dans `vite.config.ts` (Vite ignore `CHOKIDAR_USEPOLLING`)
  - depuis la bêta, l'étape `beta` du `Dockerfile` produit une image nginx qui sert `dist/` (service `beta`, profil compose `beta`, port 8080) ; elle n'est construite que si `npm run check` passe
- Tests : Vitest sur la simulation pure (sans rendu), plus des bots d'équilibrage qui jouent des parties complètes

## Architecture

On sépare la simulation du rendu :

- **Simulation** : logique pure, pas à pas fixe de 10 ticks/s, testable sans navigateur.
- **Rendu** : Three.js, qui lit l'état sans le modifier.

Principes :

- **State sérialisable** : uniquement des données simples (objets, tableaux, nombres), pas de classes. La sauvegarde et les replays deviennent faciles plus tard.
- **File de commandes** : l'input ne modifie jamais le state. Il produit des commandes (`build`, `move`, `repair`, `acceptJob`, `rejectJob`, `setSpeed`…) que la simulation applique au tick suivant.
- **RNG à graine** stockée dans le state : simulation déterministe, donc tests reproductibles.
- **Constantes d'équilibrage centralisées** dans `sim/balance.ts`.
- **Contrôle du temps** : pause, x1, x2, x4. Un multiplicateur règle le nombre de ticks exécutés par frame ; le `dt` de la simulation ne change pas.

```
src/
  main.ts              boot, boucle (ticks sim fixes × vitesse + rendu rAF)
  sim/
    state.ts           GameState : grille, entités, argent, temps, rng, file de commandes
    balance.ts         toutes les constantes (coûts, kW, °C, taux de panne…)
    commands.ts        types de commandes + application au state
    rng.ts             PRNG à graine (mulberry32)
    pathfinding.ts     A* sur 4 voisins, accessibilité depuis l'entrée
    entities.ts        types : Rack, Cooler, PowerUnit, Technician, Construction
    sim.ts             step(state, dt) : enchaîne les systèmes dans un ordre fixe
    systems/
      power.ts         capacité vs charge → délestage par priorité
      heat.ts          diffusion de chaleur sur la grille, refroidissement borné
      jobs.ts          contrats : génération, acceptation, progression, deadline
      failures.ts      pannes (taux/s × dt, ↑ avec la température)
      technicians.ts   A* sur grille, tâches (move/repair/build), accessibilité
      economy.ts       revenus, électricité, salaires, faillite
  render/
    scene.ts           scène, lumières, caméra iso (pan/zoom/rotation 90°)
    meshes.ts          modèles low-poly procéduraux, InstancedMesh pour les racks
    overlays.ts        heatmap (DataTexture sur un plan), indicateurs de panne
    interpolate.ts     lissage des positions des techniciens entre deux ticks
  input/
    picking.ts         raycast sur le plan du sol → case ; les bâtiments sont visés par leur volume 3D
    selection.ts       clic / sélection par rectangle, clic droit = commande
    build.ts           mode construction : fantôme, validation, accessibilité
  ui/
    hud.ts             ressources, vitesse, barre de construction, contrats, alertes
tests/
  power.test.ts  heat.test.ts  jobs.test.ts  failures.test.ts
  technicians.test.ts  economy.test.ts  scenario.test.ts
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

- La capacité est **globale** : c'est la somme des PDU construits. L'énergie locale par rayon de PDU arrive en v0.3.
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
- H : heatmap. B ou barre UI : mode construction. Échap : annuler.

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

### Suite

- **v0.3 Recherche** : arbre technologique (générations de GPU, refroidissement liquide, techniciens plus rapides).
- **v0.4 Énergie** :
  - marché avec prix variable (réseau, solaire, gaz) ;
  - contrats d'approvisionnement ;
  - PDU à rayon local ;
  - événements canicule.
- **v0.5 Réseau** : switches et câblage ; un cluster mal relié voit ses performances baisser. Prévoir dès la v0.1 des allées libres entre les rangées de racks, pour que le câblage ne force pas à tout reconstruire.
- **v0.6 Extension** : achat de nouvelles salles, carte qui s'agrandit (la sauvegarde existe depuis la bêta).

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
  - `balance` : bots d'équilibrage (joueur compétent, sans refroidissement, sans contrats, premier contrat).
- `tests/scenario.test.ts` : le scénario du test manuel ci-dessous, rejoué sans rendu avec une graine fixe pour vérifier la même séquence (garde-fou contre les régressions d'équilibrage).
- Scénario manuel :
  1. Poser 4 racks sans refroidissement : surchauffe, puis pannes.
  2. Envoyer un technicien réparer.
  3. Ajouter un CRAC : la température redescend.
