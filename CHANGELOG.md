# Historique des versions

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numéros de version selon [SemVer](https://semver.org/lang/fr/).

## [1.1.0] — 2026-10-06

Le réseau de calcul : en carrière, les blocs d'entraînement doivent être câblés à des switchs. Les câbles se posent seuls, par les allées libres, et courent au plafond.

### Ajouté

- **Switch réseau** (carrière, touche N) : 2 000 $, 8 ports, 1 kW. La recherche « Switchs réseau » le débloque (niveau 2, nouvelle branche Réseau).
- **Câblage automatique** :
  - chaque rack se relie seul au switch libre le plus proche, par les cases libres, à 10 cases de câble au plus ;
  - les câbles les plus courts passent d'abord ;
  - un câble posé reste tant que son chemin tient ;
  - construire sur le seul chemin d'un câble le coupe ; s'il existe un détour, le câble le prend.
- **Entraînement relié**, à partir du Labo d'IA :
  - un bloc ne prend que des racks reliés, toujours côte à côte ;
  - le jeu préfère un bloc sur un seul switch ; à cheval sur plusieurs, il avance à 70 %, sauf avec la recherche « Fabric spine-leaf » (niveau 3) ;
  - un câble coupé rompt le bloc, qui recule comme après une panne.
- **Chemins de câbles au plafond**, avec des faisceaux qui grossissent selon le nombre de câbles, et des voyants de ports sur les switchs.
- **Calque Réseau** (H) : racks reliés ou non, câbles, switchs libres avec leur portée, switchs pleins.
- **Aperçus** :
  - avec l'outil switch, la portée en mauve et les câbles que le switch recevrait ;
  - une construction qui couperait des câbles passe à l'ambre ;
  - l'inspection surligne les câbles d'un switch ou d'un rack.
- **Inspecteur, infobulles et contrats** : état réseau d'un rack, ports d'un switch, plus grand bloc relié, vitesse réseau d'un bloc.
- Conseil de carrière « Réseau de calcul ». La salle de l'écran titre est câblée.

### Modifié

- L'interconnexion optique rejoint la branche Réseau, après la Fabric, et porte aussi un câble à 16 cases.
- Recherche : 24 nœuds sur 5 colonnes.
- Le mot « réseau » désigne désormais le réseau de calcul. Côté électrique, l'interface dit « charge électrique », « distribution », « sur le secteur » et « coupure de courant ».
- Sauvegarde au format 9. Les carrières en cours passent au réseau ; au Labo d'IA et au-delà, leurs entraînements en cours attendent un bloc relié, sans perdre leur progression.

### Corrigé

- Les prévisions de retard comptaient le calcul produit par les blocs d'entraînement au lieu de celui qu'ils réservent.
- F pivote aussi le fantôme d'un rack G2 ou G3 pendant la pose.

### Interne

- **`src/sim/network.ts`** : le câblage, avec un seul écrivain des liaisons, une passe par tick, et des fonctions pures pour les aperçus et le rendu.
- **`paintOverlay`** : un `switch` exhaustif, un calque oublié ne compile plus.
- **Bot** : switchs aux bouts de rangée, Fabric, entraînements acceptés seulement à pleine vitesse, nouveau profil « sans réseau ».
- **Équilibrage** : le joueur soigné gagne en 82 à 87 min (32 à 40 entraînements livrés). Sans réseau, il gagne en 96 à 106 min sans aucun entraînement.
- **Partie rapide** : identique au bit près, ce qu'une empreinte temporaire a vérifié à chaque lot.
- **Tests** : 210.

## [1.0.1] — 2026-10-05

Correctif : les 4 bugs de jeu relevés par l'audit de propreté du code, et l'audit lui-même (interne). L'équilibrage ne bouge pas : les parties de référence du bot (carrière, avec et sans secours) se jouent à l'identique.

### Corrigé

- **Moderniser puis démolir** : un rack en cours de modernisation rend ce que la modernisation a coûté, en entier si les travaux n'ont pas commencé, la moitié sinon, plus la moitié de l'ancien rack. Avant, il rendait le prix d'un rack neuf de la nouvelle génération : 6 500 $ au lieu de 5 700 $ pour un G1 modernisé en G2 tout juste commandé.
- **Coupures** : au premier instant d'une coupure, les racks à l'abri d'un arrêt brutal sont exactement ceux que les onduleurs alimentent. Le calcul suit enfin la distribution :
  - charge réelle des batteries ;
  - free cooling des CRAC ;
  - CDU ;
  - capacité des PDU.

  Un refroidisseur délesté ne réduit plus la protection. Le calque énergie suit la même règle : avec des CDU, la salle n'y paraît plus mieux secourue qu'elle ne l'est.
- **Caméra** : les touches de déplacement et le défilement par les bords ne bougent plus la vue sous :
  - l'écran titre ;
  - le menu pause, l'aide et les sauvegardes ;
  - les fenêtres de palier, de victoire ou de défaite ;
  - les panneaux (tableau de bord, équipe, recherche).

  Une touche tenue à l'ouverture d'une fenêtre est relâchée.
- **Ambiance sonore** : le souffle de la salle suit le nombre de racks en service. Il ne grimpe plus trop vite avec les GPU G2 et G3, qui comptaient pour 2,5 et 6 racks.
- **Sauvegarde au format 8** : une modernisation en cours est enregistrée. Les parties d'avant se rechargent telles quelles.

### Interne

- **Audit de propreté du code** (rapport complet : `docs/AUDIT.md`). La simulation est restée identique au bit près ; une empreinte de huit parties l'a vérifié à chaque étape.
- **Une seule source par donnée** :
  - réglages dans `src/sim/balance.ts` : offres, premier contrat, paliers, réputation, recherche, alertes ;
  - noms dans `src/ui/catalog.ts` ;
  - touches dans `src/input/keymap.ts` ;
  - teintes et seuils de couleur dans `tokens.css` et `src/ui/tones.ts` ;
  - disposition dans `src/ui/layout.ts`.
- **Code factorisé** :
  - simulation : `failRack`, `makeOffer`, `math.ts`, helpers d'activation ;
  - sauvegarde : listes de valeurs partagées avec les types ;
  - interface : confirmation, couleurs, SVG, formats.
- **Nettoyage** : code et CSS morts retirés.
- **Outillage** :
  - oxlint dans `npm run check` (ESLint attendra que typescript-eslint prenne en charge TypeScript 7) ;
  - trois options strictes de plus pour le compilateur ;
  - un script `test:fast`.
- **Tests** : fabriques communes, attentes tirées des constantes, test de cohérence du bot ; 8 tests de plus pour les corrections de cette version (175 au total).

### Modifié

- Les nouveautés des paliers listent tous les nœuds de recherche qu'ils ouvrent ; les descriptions des nœuds sont calculées depuis les réglages.
- Le prix et la durée de réparation affichés tiennent compte du « Stock de pièces ».
- **Mode daltonien** : les fonds et contours teintés suivent enfin la palette adaptée.
- **Une même valeur a la même couleur dans tous les panneaux** (température, risque, autonomie des onduleurs).
- **Aide** : avec Chrome ou Edge, les touches de caméra suivent le clavier du joueur (Z Q S D sur un AZERTY) ; une ligne pour les flèches.
- **Noms** :
  - « Rack GPU G2 » dans les infobulles et les tâches ;
  - « CDU (liquide) » partout.

## [1.0.0] — 2026-10-05

La v1.0 « Carrière » : une partie d'une heure et demie environ, de la start-up à l'hyperscaler, dans un data center bien plus proche du réel (énergie de secours, allées chaudes, refroidissement liquide, générations de GPU, usure et maintenance). La partie rapide garde exactement les règles de la bêta.

### Ajouté

- **Mode Carrière** (bouton principal de l'écran titre), à côté de la **Partie rapide** (les règles de la bêta, objectif 100 000 $) et du **Tutoriel**.
- **Réputation et paliers** :
  - livrer à l'heure rapporte de la réputation (plus pour un gros contrat), un retard en coûte ;
  - 4 paliers (Start-up, Scale-up, Labo d'IA, Hyperscaler) : chaque palier ouvre des contrats plus gros et mieux payés ;
  - une fenêtre présente les nouveautés à chaque palier ; le dernier donne la victoire.
- **Recherche** (U, ou bouton « R&D » de la barre) : une part réglable du calcul (0 à 50 %) produit des points de recherche, prélevés avant les contrats. 22 nœuds en 4 branches (calcul, refroidissement, énergie, exploitation), ouverts niveau par niveau avec les paliers. Premiers nœuds :
  - ordonnanceur opportuniste ;
  - CRAC haute efficacité ;
  - PDU haute capacité ;
  - réparations automatiques (réglables dans le panneau Équipe) ;
  - techniciens aguerris.
- Sons de passage de palier et de fin de recherche ; mode et progression dans le rapport de bug.
- **Énergie de secours** (carrière) :
  - à partir du palier Scale-up, le réseau électrique peut être coupé de 30 s à 2 min (la première coupure, plus tardive, ne dure que 30 s) ;
  - **onduleur** : une batterie qui prend le relais dès la première seconde, environ une minute, puis se recharge sur le réseau ;
  - **groupe électrogène** : démarre en 15 s et tient toute la coupure, au prix d'un carburant cher (nouveau poste du grand livre) ;
  - recherche : onduleurs, groupes électrogènes, énergie verte (facture −15 %, réputation +10 %), bascule 2N ;
  - bannière de coupure, alerte de batterie basse, indicateur de redondance N+1, calque énergie qui montre les racks sans secours ;
  - la barre regroupe les équipements par famille : P passe du PDU à l'onduleur puis au groupe ;
  - un rack non secouru qui perd brutalement le courant risque la panne (20 %).
- **Refroidissement avancé** (carrière) :
  - **orientation des racks** : un rack aspire par l'avant et souffle 70 % de sa chaleur par l'arrière ; son risque de panne se lit sur l'air aspiré. F fait pivoter le rack à poser (fantôme avec repères bleu et orange) ou le rack inspecté. Deux rangées dos à dos forment une allée chaude ; des rangées qui se soufflent dessus surchauffent (l'inspecteur le signale) ;
  - **confinement d'allée chaude** (recherche) : toit vitré, CRAC 25 % plus efficaces près d'une allée chaude ;
  - **CDU** (refroidissement liquide, recherche) : capte 75 % de la chaleur des racks à 2 cases (80 kW au plus) et la rejette dehors ;
  - **météo** à partir du palier Labo d'IA : la température extérieure module les CRAC (de −30 % à +15 %), des **canicules** les affaiblissent ; le **free cooling** halve leur consommation quand il fait frais ; la **récupération de chaleur** revend la chaleur des CDU ;
  - calque froid : allées chaudes et racks refroidis par liquide ; bandeau : température extérieure, bannière de canicule.
- **Générations de GPU et contrats d'entraînement** (carrière) :
  - **racks G2** (25 CU/s pour 18 kW) et **G3** (60 CU/s pour 36 kW, à poser près d'un CDU), débloqués par la recherche ; R passe d'une génération à l'autre ; couronne cyan ou violette sur le toit ;
  - **modernisation** (recherche) : un technicien remplace les GPU d'un rack sur place, pour la différence de prix plus 20 % ;
  - **contrats d'entraînement** à partir du Labo d'IA : un bloc de 3 à 8 racks **côte à côte**, dédié au contrat ; une panne dans le bloc fait reculer la progression de 25 % (5 % avec les **points de contrôle**) ; l'**interconnexion optique** laisse un bloc enjamber une allée ;
  - **contrats avec SLA** : mieux payés, pénalisés si le débit promis manque plus de 1 % du temps ;
  - cartes de contrat : bloc demandé et plus grand bloc libre ; calque activité : racks en entraînement.
- **Personnel et maintenance** (carrière, à partir de Scale-up) :
  - **usure** : un rack en service s'use (deux fois plus vite à chaud) ; à 100 %, son risque de panne est triplé ; l'âge l'augmente aussi lentement ;
  - **entretien** : clic droit sur un rack usé (ou bouton de l'inspecteur), 100 $ et 4 s, le rack continue de tourner ;
  - recherche : **maintenance planifiée** (entretien automatique au-delà de 50 % d'usure, réglable), **stock de pièces** (réparation à 250 $ en 5 s), **spécialités** (électricien, frigoriste, informaticien : deux fois plus rapides dans leur domaine), **maintenance prédictive** (pannes −30 %, alerte avant la casse) ;
  - panneau Équipe : spécialité de chacun, embauche par métier, réglages automatiques ; calque risque et tableau de bord tiennent compte de l'usure.

- **Carrière complète** :
  - les paliers Labo d'IA et Hyperscaler exigent aussi du **calcul en service** (150 puis 400 CU/s) : la réputation ne suffit plus, il faut grandir. Le bandeau affiche ce qui manque ;
  - chaque palier amène **ses clients** : cliniques et fintechs, puis instituts et consortiums, puis géants du cloud ;
  - **conseils de carrière** : une carte, sans pause, au début de la carrière puis à la première coupure, la première canicule, le premier rack usé, le premier contrat d'entraînement et les premiers GPU G3. Chacun ne s'affiche qu'une fois (Options › Conseils de carrière › Revoir).
- **Bots de carrière** dans `tests/balance.test.ts` : un joueur soigné gagne en 75 à 120 minutes de jeu sans surchauffe ; sans recherche, il plafonne au Labo d'IA ; sans énergie de secours, il cumule pannes et retards et gagne plus tard.

### Modifié

- **Paliers** : Scale-up à 150 de réputation, Labo d'IA à 500 (et 150 CU/s), Hyperscaler à 2 000 (et 400 CU/s).
- Sur un écran étroit, les bannières (coupure, canicule), le tutoriel et les conseils restent dans l'allée centrale, entre les colonnes de gauche et de droite.
- Sauvegarde au format 7. Les parties d'avant se rechargent (en partie rapide pour celles d'avant la carrière).

### Corrigé

- La bannière de canicule n'avait pas de fond.
- Sur un écran étroit, la bannière de coupure pouvait chevaucher le panneau des contrats.

## [0.10.0-beta] — 2026-10-04

Premier lot de la feuille de route v1.0 : des outils de supervision pour voir venir les problèmes.

### Ajouté

- **Alertes préventives** dans le fil d'alertes, avec un son discret. Chacune ne part qu'une fois par épisode :
  - rack à 32 °C ou plus ;
  - énergie à 90 % de la capacité ;
  - contrat en retard probable au débit actuel ;
  - trésorerie couvrant moins d'une minute de dépenses ;
  - rack en panne depuis 20 s sans technicien.
- **Tableau de bord** (Tab, ou bouton du bandeau), en trois onglets :
  - Finances : recettes et dépenses par minute, détail par poste ;
  - Exploitation : PUE, disponibilité, calcul utilisé, pannes, contrats ;
  - Thermique : températures et risque de panne.
- **Panneau Équipe** (G, ou clic sur « Équipe » dans le bandeau) : chaque technicien (désormais avec un prénom), sa tâche, sa file et sa case. Un clic le sélectionne et centre la vue.
- **Calques** (H pour avancer, Maj+H pour reculer, ou menu « Calques » de la barre) : chaleur, énergie, couverture des CRAC, occupation des racks, risque de panne. La légende suit le calque, y compris en mode daltonien.

### Modifié

- Sauvegarde au format 2. Les parties de la bêta 0.9 se rechargent sans perte.

## [0.9.0-beta] — 2026-10-04

Première bêta. Le jeu est complet : il reste à l'équilibrer et à le corriger avec les retours des testeurs.

### Ajouté

- **Partie guidée** : un tutoriel en 9 étapes couvre les techniciens, les racks, les contrats, la chaleur, le CRAC, l'inspection et la réparation. Le contrôle concerné est mis en évidence et la case conseillée est signalée dans la salle.
- **Sauvegarde** :
  - automatique : chaque minute de jeu, au changement d'onglet et à la fermeture ;
  - 3 emplacements manuels, et « Continuer » sur l'écran titre ;
  - export et import en fichier `.json` ;
  - sauvegarde de secours en cas de plantage.
- **Son** synthétisé, sans aucun fichier :
  - effets pour la construction, les contrats, les pannes, le délestage, la faillite et la victoire ;
  - ambiance de salle qui suit la charge et la chaleur.
- **Menu pause** (Échap) : reprendre, sauvegarder, charger, options, commandes, signaler un bug, menu principal.
- **Options** persistantes : volumes, ombres, netteté, anticrénelage, taille de l'interface, défilement par les bords, mode daltonien.
- **Mode daltonien** : palette Okabe-Ito pour les LEDs, la mini-carte et les pastilles, et symbole propre aux racks délestés.
- **Signaler un bug** :
  - le menu pause copie un rapport prêt à coller : version, navigateur, écran, graine, état de la partie, derniers événements ;
  - un écran d'erreur propose le rapport et un rechargement.
- **Écran titre** : partie guidée ou libre, numéro de version et crédits. Les licences tierces sont dans `public/assets/LICENSES.md`.
- **Image Docker de production** (nginx) : `docker compose --profile beta up -d --build beta`, puis http://localhost:8080.
- **Outillage** : bots d'équilibrage sans rendu (`tests/balance.test.ts`) et script `npm run check` (typage, tests, build).

### Modifié

- **Équilibrage** : un rack se rembourse en une dizaine de minutes au lieu d'environ 26, et agrandir son data center est désormais récompensé.

  | Réglage | Avant | Après |
  |---|---|---|
  | Prix du calcul | 0,4 $ par CU | 0,8 $ par CU |
  | Débit maximal d'une offre | 8 racks | 12 racks |
  | Objectif | 50 000 $ | 100 000 $ |
  | Pannes d'un rack au frais | 1,7 % par minute | 0,8 % par minute |

  La chaleur reste la vraie cause de pannes.
- La caméra revient toujours à l'angle par défaut en début de partie.
- **HUD** : les alertes se replient quand l'inspecteur est ouvert, et le panneau du tutoriel s'adapte aux petits écrans.

### Corrigé

- L'avertissement de three.js au lancement (type d'ombres retiré de la bibliothèque) n'apparaît plus.

## [0.1.0] — 2026-10-04 (alpha)

- **v0.1a, bac à sable thermique** : grille, racks, CRAC et PDU ; énergie avec délestage ; diffusion de la chaleur ; heatmap.
- **v0.1b, pression** : contrats de calcul, pannes liées à la température, économie, faillite, objectif.
- **v0.1c, micro RTS** : techniciens (A*, accessibilité), sélection, ordres et files, chantiers, réparations, embauche.
- **Présentation** :
  - assets 3D low-poly procéduraux ;
  - HUD « console d'opérateur » : alertes cliquables, vignettes 3D, mini-carte, écrans titre, victoire et faillite ;
  - inspecteur d'équipement.
