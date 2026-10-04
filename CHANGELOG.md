# Historique des versions

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), numéros de version selon [SemVer](https://semver.org/lang/fr/).

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
