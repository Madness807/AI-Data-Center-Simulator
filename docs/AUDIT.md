# Audit de propreté du code — v1.0.0

Audit mené dans la nuit du 5 au 6 octobre 2026 sur `d46d473` (v1.0.0). Il porte sur deux choses :
- la factorisation ;
- les valeurs codées en dur un peu partout au lieu d'une source unique.

Les corrections sûres ont été appliquées dans la foulée, un commit par lot.

**Légende des statuts** :
- ✅ corrigé (avec le lot) ;
- ⏸ reporté (avec la raison) ;
- 🐞 bug de jeu, noté sans être corrigé (une correction changerait le jeu).

## Méthode

1. **Trois explorations en lecture seule** :
   - la simulation (`src/sim`, `src/save.ts`, `src/settings.ts`) ;
   - la présentation (`src/ui`, `src/render`, `src/audio`, `src/input`, `src/main.ts`, le CSS) ;
   - les tests, l'outillage et la documentation.

   Chaque constat est localisé (`fichier:ligne`) et noté selon sa gravité, son effort et son risque.
2. **Règles de correction** :
   - **simulation** : identique au bit près ;
   - **affichage** : identique, sauf pour corriger une incohérence (une même grandeur montrée de deux façons) ou un texte qui contredit le jeu ; chaque cas est listé plus bas ;
   - **bugs de jeu** : notés, pas corrigés ;
   - **pas de refonte profonde** : ni découpage de gros fichiers, ni réorganisation des dossiers.
3. **Filet de sécurité** : un test d'empreinte temporaire (`tests/fingerprint.test.ts`, retiré à la fin).
   - Il rejoue 8 parties (le scénario du plan, 3 parties rapides et 4 carrières du bot).
   - Il compare un hash de l'état final sérialisé, clés triées, aux valeurs relevées sur `d46d473`.
   - Sa sensibilité a été vérifiée : 0,0001 kW de froid en plus sur un CRAC suffit à le faire échouer.
   - Chaque lot l'a passé tel quel.

   Pour le recréer : reprendre le fichier depuis l'historique git et relever de nouvelles valeurs de référence.

## Mesures

| Mesure | Avant (`d46d473`) | Après |
|---|---|---|
| Nombres hors 0 et 1 dans le code de `src/sim` (hors `balance.ts`) | 160 | — |
| Nombres recopiés dans des textes de `src/sim` | 44 | — |
| Couleurs littérales dans le CSS (hors `tokens.css`) | 11 hexadécimales, 57 `rgb()`/`rgba()` | — |
| Recherches d'un bâtiment par id réécrites | 15 | — |
| Arrondis à 10 $ recopiés | 8 | — |
| Plus gros fichiers (lignes) | `hud.ts` 580, `scene.ts` 524, `components.css` 501, `inspector.ts` 494, `main.ts` 419, `bot.ts` 374 | — |
| Durée des tests (dont équilibrage) | 24 s (24 s) | — |
| Linter | aucun | oxlint, 0 avertissement |

## Constats

### Simulation

- **S1 · Valeurs de réglage hors de `balance.ts`** (haute)
  - **Où** :
    - `systems/jobs.ts:136-141,195-200,218` : taille des offres, bonus d'échéance, variation de prix, entraînements ;
    - `state.ts:228-249` : premier contrat et salle de départ ;
    - `progression.ts:21-62` : nombres des paliers, retard, réputation d'une livraison ;
    - `career.ts:46,58` : part de recherche ;
    - `research.ts:59` : rythme de recherche ;
    - `systems/alerts.ts:11-29` : seuils d'alerte.
  - **Constat** : environ 83 valeurs, dont une cinquantaine dans les tables des paliers et des nœuds.
  - **Remède** : les ranger dans `balance.ts` en gardant la même arithmétique ; les noms et textes restent dans leur module.
  - **Statut** : ✅ lot 2. Désormais dans `balance.ts` :
    - offres : taille minimale et part par rack, bonus d'échéance, variation de prix ;
    - entraînements : délais, variation de prix, génération minimale ;
    - `START_LAYOUT`, et premier contrat dans `JOBS.firstJob` ;
    - `TIER_LEVELS` (les nombres des paliers ; noms et nouveautés restent dans `progression.ts`) ;
    - `REPUTATION`, `RESEARCH_RATE` (rythme, part par défaut et maximale) ;
    - `ALERTS`, avec la cadence tirée de `TICK_HZ` et le réarmement prédictif `PREDICTIVE.resetPerMin` ;
    - `MAX_GEN`, `OPTICAL.reach`, `WEATHER.freeCoolingPowerMult`.

    Les coûts et effets des 22 nœuds restent dans la table de `research.ts`, qui est un contenu à part entière.
- **S2 · `SLA.minTier` n'est jamais lu** (haute)
  - **Où** : `balance.ts:67`, `systems/jobs.ts:128`.
  - **Constat** : les offres SLA dépendent de `TRAINING.minTier`.
  - **Remède** : lire les deux en gardant un seul tirage.
  - **Statut** : ✅ lot 2. Un seul tirage dès que l'une des deux est ouverte, puis chacune suit son propre palier (même suite de hasard).
- **S3 · Des textes recopient des nombres, et ont déjà dérivé** (haute)
  - **Où** : `research.ts` (19 descriptions), `progression.ts:29-54` (nouveautés des paliers).
  - **Constat** : Scale-up oublie Modernisation, Maintenance planifiée et Stock de pièces ; Labo d'IA oublie Spécialités.
  - **Remède** : générer ces textes depuis les constantes.
  - **Statut** : ✅ lot 5.
    - Les 22 descriptions de recherche lisent leurs nombres dans `balance.ts`, ou dans l'effet du nœud lui-même : une description peut être une fonction de l'effet, évaluée au chargement.
    - Les nouveautés des paliers sont générées par `perksFor()` : taille et prix des offres, offres spéciales, liste réelle des nœuds du niveau ouvert, mécaniques qui s'allument selon leur `minTier`.
- **S4 · La survie à une coupure est calculée de 3 façons** (haute)
  - **Où** : `systems/incidents.ts:76-94`, `systems/power.ts:19-70`, `render/overlay-colors.ts:224-238`.
  - **Constat** :
    - `crashUnprotected` ignore le free cooling, utilise la puissance nominale des onduleurs et compte des refroidisseurs délestés ;
    - le calque oublie les CDU.
  - **Statut** : 🐞 une correction change les tirages de la carrière.
- **S5 · Listes de valeurs de `save.ts` recopiées des types** (haute)
  - **Où** : `save.ts:63-169` (10 listes).
  - **Constat** : un nouveau type d'équipement compile, mais rend toute sauvegarde qui le contient illisible.
  - **Statut** : ✅ lot 4. Les valeurs sont déclarées une fois en `as const` (`BUILDING_KINDS`, `BUILDING_STATUSES`, `FACINGS`, `GENS`, `SPECIALTIES`, `JOB_STATUSES`, `JOB_KINDS`, `SPEEDS`, `OUTCOMES`, `GAME_MODES`), et les types en sont déduits. `save.ts` vérifie avec ces listes : un nouveau type d'équipement est accepté d'office.
- **S6 · Le bloc « un rack tombe en panne » est copié 3 fois** (moyenne)
  - **Où** : `systems/failures.ts:68-71`, `systems/incidents.ts:88-91`, `commands.ts:100-103`.
  - **Statut** : ✅ lot 3. `failRack()` dans `systems/failures.ts`, utilisé par les pannes, les coupures et l'exercice du tutoriel.
- **S7 · Les contrats sont construits 4 fois à la main** (moyenne)
  - **Où** : `state.ts:233-248`, `systems/jobs.ts:145-219`.
  - **Constat** : 4 objets de 15 champs, la formule de pénalité 3 fois, l'arrondi à 10 $ 8 fois.
  - **Statut** : ✅ lot 3. `makeOffer()` et `roundTo10()` pour les 3 offres de `jobs.ts`, avec le même ordre des tirages et des champs. Le premier contrat de `state.ts` reste écrit à la main : sa pénalité est fixe, et importer `jobs.ts` créerait un cycle.
- **S8 · Des helpers existants sont contournés** (moyenne)
  - **Constat** :
    - `buildingById` est réécrit 6 fois dans la simulation, 7 fois dans l'interface et le rendu ;
    - `isRackActive` est réécrit 2 fois ;
    - `targeted` (privé) est recopié ;
    - `openCell` est identique à `isWalkable` ;
    - `inBounds` est réécrit.
  - **Statut** : ✅ lot 3 dans la simulation :
    - `buildingById` partout (commandes, statistiques, blocs) ;
    - `isRackActive` là où il était réécrit ;
    - `isTaskAssigned` exporté et partagé avec les alertes et l'inspecteur ;
    - `inBounds` dans les blocs.

    Les copies de `buildingById` dans l'interface sont prévues au lot 9.
- **S9 · Une vingtaine de filtres type + statut répétés** (moyenne)
  - **Où** : `power.ts`, `incidents.ts`, `stats.ts`…
  - **Remède** : quelques prédicats nommés.
  - **Statut** : ⏸ Les filtres restants combinent type, statut et alimentation de façons différentes. Aucun ne revient trois fois à l'identique, le seuil retenu pour factoriser ; ils restent lisibles en ligne.
- **S10 · Activation des mécaniques testée en ligne** (moyenne)
  - **Constat** : seule l'usure a son `wearActive` ; météo, coupures et offres spéciales sont testées en ligne, jusque dans l'interface.
  - **Statut** : ✅ lot 3. `weatherActive` (climat), `outagesActive` (incidents) et `specialOffersActive` (offres) s'ajoutent à `wearActive`. Le calque énergie et les conseils de carrière les utilisent.
- **S11 · La prévision de retard réimplémente l'allocation** (moyenne)
  - **Où** : `systems/alerts.ts:118-153` contre `systems/jobs.ts:34-46`.
  - **Statut** : ✅ lot 3. `inferencePool()` partagé par l'allocation et la prévision ; la part de recherche est désormais bornée au même endroit. Seule la prévision voit l'ordre d'une soustraction changer ; l'empreinte reste identique.
- **S12 · Fonctions trop longues** (moyenne)
  - **Où** : `processCommands` (119 lignes), `updateJobs` (60 lignes, qui fait aussi avancer la recherche).
  - **Statut** : ⏸ La table de gestionnaires de `processCommands` n'a pas été faite cette nuit. Le découpage d'`updateJobs` changerait l'ordre des étapes d'un tick.
- **S13 · Noms trompeurs** (moyenne)
  - **Constat** :
    - `WEAR.failureMult: 2` signifie ×3 ;
    - `RESEARCH_POINTS_PER_CU` est par CU·s ;
    - `cracCoolingKW` désigne deux choses ;
    - les suffixes de durée sont mélangés.
  - **Statut** : ⏸ renommages larges (simulation, interface et tests), à faire d'un coup.
- **S14 · Sauvegarde : répétitions et trous de validation** (moyenne)
  - **Constat** :
    - l'exclusion `commands`/`events` est écrite 2 fois ;
    - les règles de mode sont reconstruites 3 fois au lieu de `rulesFor` ;
    - une migration oubliée passerait en silence ;
    - le palier n'est pas borné (au-delà de 3, plantage dans `trainingOffer`) ;
    - `upsLow` et `wornRacks` ne sont pas vérifiés.
  - **Statut** : ✅ lot 4.
    - Le type `PersistedState` est déclaré une seule fois.
    - Les migrations lisent leurs règles dans `rulesFor`.
    - `MIGRATIONS` est exporté, et un test vérifie qu'une migration existe pour chaque ancien format.
    - Nouvelles validations, testées : palier inférieur au nombre de paliers, `upsLow` et `wornRacks`, `minGen`, `sla` et `shortS`. Elles refusent un fichier corrompu au lieu de planter.
    - Les lignes trop longues sont coupées.
- **S15 · Ajouter un effet de recherche demande 5 modifications** (moyenne)
  - **Où** : `research.ts:14-42`, `progression.ts:93-187`.
  - **Statut** : ⏸ refonte du calcul des modificateurs.
- **S16 · Moderniser puis démolir rembourse 100 % du prix neuf** (moyenne)
  - **Où** : `commands.ts:72-73,139-146`.
  - **Constat** : construire un G1 (3 000 $), le moderniser (4 200 $), puis le démolir rend 6 500 $.
  - **Statut** : 🐞
- **S17 · Une catégorie d'équipement imprévue serait alimentée gratuitement** (moyenne)
  - **Où** : `systems/power.ts:33-38`.
  - **Statut** : ✅ lot 3. `switch` exhaustif sur le type d'équipement, avec `unknownKind()` (`entities.ts`) : un type oublié ne compile plus.
- **S18 · Petits helpers dupliqués** (basse)
  - **Constat** :
    - `lerp` (2 fois) ;
    - `1 - exp(-rate·dt)` (3 fois) ;
    - distance de Manhattan (5 fois) ;
    - 4 directions (2 fois) ;
    - le générateur aléatoire recopié dans `names.ts`.
  - **Statut** : ✅ lot 3. `src/sim/math.ts` regroupe `lerp`, `chance`, `manhattan`, `DIRS4` (même ordre d'exploration) et `roundTo10`. `names.ts` réutilise `rng.ts` sur un état à part ; l'ordre des prénoms a été vérifié identique sur 30 graines.
- **S19 · Indirections inutiles, commentaires périmés, lignes de plus de 160 caractères** (basse)
  - **Constat** : `EXHAUST_SHARE`, `liquidCapture`, `tempOf`, imports en double.
  - **Statut** : ✅ lots 1 et 3.
    - Supprimés : `EXHAUST_SHARE`, `tempOf`, les imports en double.
    - Corrigés : les commentaires périmés (« v0.1 », « v0.1c »), les lignes de plus de 160 caractères dans la simulation.
    - Un commentaire explique pourquoi la première coupure tire un nombre au hasard.
    - `liquidCapture` est gardé : c'est un nom utile, utilisé par la chaleur et les tests.
- **S20 · Cache de `modifiers()`** (basse)
  - **Constat** : la clé `done.join(',')` est recalculée par rack et par tick.
  - **Statut** : ⏸ performance, hors propreté.

### Interface, rendu, son

- **U1 · Pas de table unique des raccourcis** (haute)
  - **Où** : gestionnaires dans `main.ts:341-361`, `hud.ts:314-358`, `scene.ts:68-138` ; libellés écrits à la main dans une quinzaine de fichiers.
  - **Constat** : l'aide affiche W A S D / Q E alors que les touches sont physiques. Sur AZERTY, ce sont Z Q S D / A E.
  - **Statut** : prévu au lot 8.
- **U2 · Une même valeur, des couleurs différentes selon le panneau** (haute)
  - **Constat** :
    - température max : avertissement à 35 / 50 °C dans le bandeau, à 32 / 35 °C dans le tableau de bord ;
    - risque de panne : 2 / 15 %, 2 / 5 % ou 3 / 15 % ;
    - charge électrique : 0,85 contre l'alerte à 0,9 ;
    - batterie : 30 s contre 20 s ;
    - usure : 70 codé deux fois.
  - **Statut** : prévu au lot 6.
- **U3 · Des textes et formules de l'interface recopient des constantes** (haute)
  - **Constat** :
    - « 50 % » et « ×2 » du panneau Équipe ;
    - « 35 °C » et « 3 cases » du tutoriel ;
    - formule d'usure de l'inspecteur ;
    - `thresholdC - 3` ;
    - prix de réparation affiché sans la recherche « Stock de pièces ».
  - **Statut** : ✅ lot 5.
    - Panneau Équipe : `SPECIALTY.speed`, `MAINTENANCE.autoAbove`.
    - Tutoriel et infobulles : `FAILURE.thresholdC`, `CRAC.radius` et le nouveau `RACKS_PER_CRAC`.
    - Inspecteur : `ALERTS.hotC`, `WEAR.failureMult`.
    - Prix et durée de réparation lus dans `modifiers(s)`, dans l'infobulle de la salle comme dans le bouton de l'inspecteur.
- **U4 · Les noms des équipements, outils, calques et panneaux sont écrits à 5 endroits ou plus** (haute)
  - **Constat** : « CDU », « CDU (liquide) » et « CDU (refroidissement liquide) » ; « Groupe » et « Groupe électrogène ».
  - **Statut** : prévu au lot 8.
- **U5 · Teintes de couleur littérales dans le CSS** (haute)
  - **Constat** : 49 teintes, que le mode daltonien ne suit pas (`.chip.ok`, `.btn-primary`…).
  - **Statut** : prévu au lot 6.
- **U6 · Le code de fenêtre est copié 6 fois** (haute)
  - **Où** : tableau de bord, Équipe, Recherche, Aide, Sauvegardes, Pause.
  - **Constat** : les copies divergent déjà (icône de fermeture, titre, clic sur le fond).
  - **Statut** : lot 9 si le temps le permet.
- **U7 · Nombres de mise en page répétés entre TypeScript et CSS** (haute)
  - **Constat** :
    - seuils de disposition, 112, 260, 336, 296 et 632 px ;
    - neuf `calc(100vh …)` ;
    - tailles d'interface en 3 endroits ;
    - zone de 280 px pour un inspecteur de 300 px.
  - **Statut** : prévu au lot 7.
- **U8 · `hud.ts` et `main.ts` mélangent les rôles** (haute)
  - **Constat** : infobulles, enchaînement des écrans, actions, clavier, boucle de jeu.
  - **Statut** : ⏸ découpage de gros fichiers (refonte profonde).
- **U9 · Code mort** (moyenne)
  - **Constat** :
    - `HudActions.setTool`, `Dashboard.toggle`, `onToolChange`, `ChartSeries.dashed`, des métriques jamais lues, l'icône `copy` ;
    - 13 règles `[hidden]` redondantes, `.faint` ;
    - des variables `--status-*` et `--ping-*` inutilisées.
  - **Statut** : prévu aux lots 6 et 9.
- **U10 · La règle « n'écrire dans le DOM que si la valeur change » est inégalement appliquée** (moyenne)
  - **Où** : une vingtaine d'écritures à chaque image.
  - **Statut** : prévu au lot 9.
- **U11 · Des règles de jeu sont recodées dans l'interface** (moyenne)
  - **Constat** :
    - statut d'un équipement (2 versions) ;
    - avancement d'un chantier (3 fois) ;
    - techniciens libres (5 fois) ;
    - « peut embaucher » (3 fois).
  - **Statut** : prévu au lot 9.
- **U12 · Mises en forme hors de `format.ts`** (moyenne)
  - **Constat** : minutes, ordinal, « % / min », `kW` et `CU/s` écrits à la main.
  - **Statut** : prévu au lot 9.
- **U13 · L'affichage des lignes de l'inspecteur dépend de l'ordre des appels** (moyenne)
  - **Où** : `inspector.ts`.
  - **Statut** : ⏸ refonte de l'inspecteur.
- **U14 · `scene.ts` mêle caméra, clavier et rendu ; `components.css` est rangé par lot de livraison** (moyenne)
  - **Statut** : ⏸ découpage de fichiers.
- **U15 · Couleurs des calques hors de la palette, textes et statistiques dans `overlay-colors.ts`** (moyenne)
  - **Statut** : couleurs au lot 6 ; textes et statistiques ⏸ (déplacement de code entre couches).
- **U16 · Minuteries dupliquées** (moyenne)
  - **Constat** :
    - `CONFIRM_MS` défini 3 fois, avec 3 implémentations ;
    - durée du flash recopiée entre le JS et le CSS ;
    - « relancer une animation » copié 2 fois.
  - **Statut** : prévu au lot 6.
- **U17 · Le HUD vide la liste d'événements de la simulation** (moyenne)
  - **Constat** : sons et rapport de bug ne marchent que parce qu'ils passent avant.
  - **Statut** : prévu au lot 9.
- **U18 · Conventions de composants disparates** (moyenne)
  - **Constat** : constructeurs, signatures d'`update`, source de l'heure, deux systèmes d'infobulles.
  - **Statut** : ⏸ alignement général ; petites corrections au lot 9.
- **U19 · Utilitaires de couleur et de SVG dupliqués** (basse)
  - **Statut** : prévu au lot 6.
- **U20 · Rendu : petits manquements aux conventions** (basse)
  - **Constat** :
    - `CylinderGeometry` répété 9 fois ;
    - `InstancedMesh` configuré 5 fois ;
    - imports qui contournent le point d'entrée des assets.
  - **Statut** : ⏸ gain faible, risque visuel.
- **U21 · Échelle typographique** (basse)
  - **Constat** : 16 tailles de police, la recette « micro-libellé » 8 fois, aucune échelle de `z-index`.
  - **Statut** : `z-index` au lot 6 ; typographie ⏸.
- **U22 · Son** (basse)
  - **Constat** :
    - les volumes par défaut sont recopiés d'une source à l'autre ;
    - les coefficients d'ambiance sont écrits en ligne dans `main.ts` ;
    - `/ 10` suppose 10 CU/s par rack.
  - **Statut** : 🐞 pour `/ 10` (l'ambiance changerait en carrière) ; le reste est prévu au lot 9.
- **U23 · Les touches de caméra restent actives sous les fenêtres et l'écran titre** (basse)
  - **Statut** : 🐞

### Tests, outillage, documentation

- **T1 · Fabriques de test dupliquées** (haute)
  - **Constat** :
    - 7 fabriques de salle, 3 `rack()` différents ;
    - `memoryStore` 2 fois ;
    - « sans offres » écrit 14 fois avec deux valeurs ;
    - `addBuilding(s,'pdu',0,0)` 23 fois.
  - **Statut** : prévu au lot 10.
- **T2 · Contrats de test écrits à la main** (haute)
  - **Constat** : 6 objets de 14 champs.
  - **Statut** : prévu au lot 10.
- **T3 · Attentes qui recopient `balance.ts` ou `ALERTS`** (haute)
  - **Où** : `supervision.test.ts`, `power-backup.test.ts`, `progression.test.ts`, `ledger.test.ts`…
  - **Statut** : prévu au lot 10.
- **T4 · Le fichier d'équilibrage est lent et sans durée maximale explicite** (haute)
  - **Constat** : il rejoue les 6 parties rapides.
  - **Statut** : prévu au lot 10.
- **T5 · L'arborescence d'architecture de `PLAN.md` est périmée** (haute)
  - **Constat** : `meshes.ts` et `interpolate.ts` n'existent plus ; la moitié des modules manque.
  - **Statut** : prévu au lot 11.
- **T6 · Structure de `tests/bot.ts`** (moyenne)
  - **Constat** : 374 lignes, réglages sans nom, rythme des ticks codé en dur, aides dupliquées.
  - **Statut** : réglages et aides au lot 10 ; découpage en modules ⏸.
- **T7 · Les échecs du bot passent inaperçus** (moyenne)
  - **Constat** : un nœud de recherche renommé ou une case non constructible ne donnent qu'un « pas de victoire ».
  - **Statut** : prévu au lot 10.
- **T8 · `ledger.test.ts` oublie le carburant dans le total des dépenses** (moyenne)
  - **Statut** : prévu au lot 10.
- **T9 · Ni linter ni formateur** (moyenne)
  - **Constat** : style tenu à la main, environ 160 colonnes.
  - **Statut** : ✅ lot 1, oxlint (`.oxlintrc.json`, `npm run lint`, dans `check`).
    - Catégories correctness et suspicious, plus 8 garde-fous (`eqeqeq`, `no-console`, `no-explicit-any`, imports en double…) ; 0 avertissement.
    - Les règles écartées sont justifiées dans le fichier.
    - ESLint est impossible pour l'instant : typescript-eslint exige TypeScript < 6.1.
    - Formateur ⏸ (un commit de reformatage à part).
- **T10 · Options du compilateur** (moyenne)
  - **Constat** :
    - 3 options sans aucune erreur aujourd'hui ;
    - `exactOptionalPropertyTypes` : 5 erreurs ;
    - `noUncheckedIndexedAccess` : 230 erreurs.
  - **Statut** : ✅ lot 1 pour `noFallthroughCasesInSwitch`, `noImplicitReturns` et `noImplicitOverride` ; le reste ⏸.
- **T11 · `vite.config.ts` n'est jamais typé** (moyenne)
  - **Statut** : ⏸ il faudrait `@types/node`.
- **T12 · `docs/ASSETS.md` est inexact** (moyenne)
  - **Constat** : imports, arborescence, règle des couleurs, `ModelState`, commandes `npx` sur l'hôte.
  - **Statut** : prévu au lot 11.
- **T13 · Fichiers d'exploration jetables** (moyenne)
  - **Constat** : les sessions d'équilibrage recréent des tests à la main.
  - **Statut** : ⏸ un rapport de bot activable serait un ajout de fonctionnalité.
- **T14 · Images Docker non épinglées, pas d'`engines`** (basse)
  - **Statut** : ✅ lot 1 pour `engines` (Node 22.12 ou plus) ; épinglage ⏸.
- **T15 · Détails nginx** (basse)
  - **Constat** : `favicon.ico` en 404, `add_header` sans `always`, `.gitkeep` servis, espace `/assets/` partagé avec Vite.
  - **Statut** : ✅ lot 1 pour le favicon (icône vide dans `index.html`) ; le reste ⏸.
- **T18 · Scripts npm** (basse)
  - **Constat** : `check` relançait `tsc` comme `build`, `dev` répétait `--host` (déjà dans `vite.config.ts`), il n'y avait pas de `lint` ni de `test:fast`.
  - **Statut** : ✅ lot 1. `check` enchaîne lint, typage, tests et build. `test:fast` passe le fichier d'équilibrage. `.editorconfig` ajouté.
- **T16 · Petits écarts dans les tests** (basse)
  - **Constat** : titres trompeurs, tests rangés dans le mauvais fichier, `y*s.w+x` au lieu d'`idx()`.
  - **Statut** : prévu au lot 10.
- **T17 · Écarts de documentation** (basse)
  - **Constat** :
    - `PLAN.md` dit « B = construction » ;
    - il parle d'esbuild et rollup ;
    - le README annonce « une à deux minutes » de première construction.
  - **Statut** : prévu au lot 11.

## Changements visibles

Tous corrigent une incohérence ou un texte faux ; aucun ne change une règle du jeu.

- **Nouveautés des paliers (lot 5)** : la liste de recherche est désormais complète.
  - Scale-up ajoute modernisation, maintenance planifiée et stock de pièces.
  - Labo d'IA ajoute spécialités.
  - Hyperscaler liste ses 4 nœuds au lieu d'un simple « Recherche de niveau 4 ».
- **Descriptions de recherche (lot 5)** : 4 tournures changent parce qu'elles sont maintenant calculées.
  - « moins de deux fois la chaleur » → « ×1,8 de chaleur » (G2) ;
  - « moitié moins » → « 50 % de moins » (free cooling) ;
  - « environ une minute » → « environ 60 s à pleine puissance » (onduleurs) ;
  - « deux fois » → « 2 fois » (spécialités).
- **Prix de réparation (lot 5)** : après la recherche « Stock de pièces », l'infobulle et l'inspecteur affichent 250 $ et 5 s, comme ce qui est facturé ; avant, ils affichaient 400 $ et 8 s.

## Ce qui est sain et n'a pas été touché

- **Simulation** :
  - l'ordre fixe et documenté des systèmes (`sim.ts`) ;
  - tout le hasard passe par `nextRandom` ;
  - l'argent ne bouge que par `earn`, `spend` et `refund`.
- **Structures à garder** :
  - la structure de `balance.ts` ;
  - le format de sauvegarde (version, migrations, validation stricte) ;
  - la forme d'`ALERTS`.
- **Rendu et son** :
  - les données de modélisation 3D (dimensions locales et nommées) ;
  - les alias de rôle de la palette ;
  - les caches de matériaux ;
  - les recettes de sons.
- **Interface et tests** :
  - le calcul de la largeur effective en TypeScript plutôt qu'en media query (il tient compte du zoom) ;
  - les tests déjà dérivés des constantes ;
  - le bot déterministe ;
  - les étapes Docker et le cache nginx.
