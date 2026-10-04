# Historique des versions

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numéros de version selon [SemVer](https://semver.org/lang/fr/).

## [Non publié]

Lots suivants de la feuille de route v1.0, en cours.

### Ajouté

- **Mode Carrière** (bouton principal de l'écran titre), à côté de la **Partie rapide** (les règles de la bêta, objectif 100 000 $) et du **Tutoriel**.
- **Réputation et paliers** :
  - livrer à l'heure rapporte de la réputation (plus pour un gros contrat), un retard en coûte ;
  - 4 paliers (Start-up, Scale-up, Labo d'IA, Hyperscaler) : chaque palier ouvre des contrats plus gros et mieux payés ;
  - une fenêtre présente les nouveautés à chaque palier ; le dernier donne la victoire.
- **Recherche** (U, ou bouton « R&D » de la barre) : une part réglable du calcul (0 à 50 %) produit des points de recherche, prélevés avant les contrats. Premiers nœuds :
  - ordonnanceur opportuniste ;
  - CRAC haute efficacité ;
  - PDU haute capacité ;
  - réparations automatiques (réglables dans le panneau Équipe) ;
  - techniciens aguerris.
- Sons de passage de palier et de fin de recherche ; mode et progression dans le rapport de bug.

### Modifié

- Sauvegarde au format 3. Les parties d'avant se rechargent en partie rapide.

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
