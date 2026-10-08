# Data Center IA — 1.1

Jeu de stratégie en temps réel dans le navigateur : construisez et exploitez un data center d'IA. Il faut honorer les contrats de calcul, garder la salle au frais et réparer les pannes avant que la trésorerie ne passe dans le rouge.

La version 1.0 a ajouté le mode **Carrière** (une heure et demie environ) à la partie rapide de la bêta ; la 1.1 y ajoute le **réseau de calcul** : switchs, câbles qui courent au plafond, blocs d'entraînement reliés. **Vos retours décident de la suite.**

## Installer et lancer

**Prérequis** :
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS, Windows) ou Docker Engine avec Compose v2 (Linux) ;
- un navigateur récent compatible WebGL 2 : Chrome, Edge, Firefox ou Safari 15+ ;
- un ordinateur avec souris et clavier (le jeu n'est pas prévu pour le tactile).

Dans le dossier du jeu :

```sh
docker compose --profile beta up -d --build beta
```

Ouvrez ensuite **http://localhost:8080**. La première construction prend quelques minutes : l'image installe les dépendances, puis vérifie le jeu (lint, typage et tests, dont les parties d'équilibrage) avant de le compiler.

| Pour… | Commande |
|---|---|
| Arrêter le jeu | `docker compose --profile beta down` |
| Installer une nouvelle version | récupérer le nouveau code, puis relancer la commande d'installation |
| Changer de port (8080 déjà pris) | `BETA_PORT=8081 docker compose --profile beta up -d --build beta` |
| Jouer depuis un autre appareil du réseau local | `BETA_HOST=0.0.0.0 docker compose --profile beta up -d --build beta` |

**Application installable et hors ligne** : dans Chrome ou Edge, le bouton « Installer le jeu » de l'écran titre (ou l'icône d'installation de la barre d'adresse) l'ouvre dans sa propre fenêtre ; dans Safari, Fichier › Ajouter au Dock. Après une première visite, le jeu se lance aussi sans connexion ; en ligne, il prend toujours la dernière version. Il faut une adresse en HTTPS ou `localhost` (pas une IP du réseau local), et l'application reste liée à l'adresse depuis laquelle on l'a installée, comme les sauvegardes.

## Jouer

Commencez par le **tutoriel** : en neuf étapes, il montre toute la boucle du jeu (techniciens, racks, contrats, chaleur, refroidissement, réparation). Le **guide du jeu** (lien « Guide » de l'écran titre, Échap › Guide du jeu, ou ?) explique ensuite chaque système en détail, avec les chiffres exacts.

- **Deux modes** :
  - **Carrière**, une heure et demie environ :
    - livrez à l'heure pour gagner de la réputation et gravir 4 paliers, de Start-up à Hyperscaler ; les deux derniers exigent aussi du calcul en service ;
    - chaque palier amène de plus gros clients et de nouveaux défis : coupures de courant et usure des racks (Scale-up), météo, canicules, contrats d'entraînement sur des blocs de racks câblés à un switch, et SLA (Labo d'IA) ;
    - une part de votre calcul finance la recherche (touche U) : 28 nœuds en 6 branches, des onduleurs au refroidissement liquide, aux GPU de 3e génération, à la fabric réseau et au commercial automatique, qui accepte seul les contrats que la salle peut tenir (réglable dans le panneau Contrats) ;
    - un conseil s'affiche la première fois qu'une situation se présente.
  - **Partie rapide** : atteindre 100 000 $ de trésorerie, en une trentaine de minutes.
  - Dans les deux cas, la partie continue en mode libre après la victoire.
- **Défaite** : rester plus de 30 secondes dans le rouge.
- **La boucle** :
  - acceptez des contrats que vos racks peuvent assurer ;
  - un rack chauffe : posez un CRAC à moins de 3 cases (un CRAC refroidit environ 3 racks) ;
  - au-delà de 35 °C, les pannes se multiplient ; envoyez un technicien réparer ;
  - un PDU alimente 40 kW, soit 3 à 4 racks ; s'il en manque, les racks les plus récents sont délestés ;
  - en carrière, un switch relie 8 racks : chacun s'y câble seul par les allées libres (10 cases au plus). Un bloc d'entraînement doit être entièrement relié ; à cheval sur deux switchs, il ralentit.

### Commandes

| Action | Touches |
|---|---|
| Déplacer la caméra / pivoter / zoomer | W A S D (Z Q S D sur un clavier AZERTY) ou flèches · Q E (A E en AZERTY) · molette |
| Sélectionner des techniciens | clic, ou glisser un rectangle (Maj pour ajouter) |
| Ordonner : aller, construire, réparer, entretenir un rack usé (carrière) | clic droit (Maj + clic droit : mettre en file) |
| Construire un rack, un CRAC, un PDU | R, C, P, puis clic (glisser pour enchaîner) ; réappuyer passe à la variante suivante (en carrière : racks G2 et G3, CDU, onduleur, groupe électrogène) |
| Poser un switch réseau (carrière, après la recherche) | N, puis clic |
| Pivoter un rack (carrière : avant = air aspiré, arrière = chaleur soufflée) | F |
| Démolir | X |
| Inspecter un équipement | clic sur l'équipement |
| Embaucher un technicien | T |
| Pause / vitesse ×1, ×2, ×4 | Espace / 1, 2, 3 |
| Calques : chaleur, énergie, froid, occupation, risque, réseau (carrière) | H (Maj+H : précédent) |
| Tableau de bord / équipe / recherche (carrière) | Tab / G / U |
| Défilement par les bords | B |
| Menu (sauvegarde, options, bug) | Échap |
| Guide du jeu, chapitre Commandes | ? ou F1 |

### Sauvegardes et options

- **Sauvegardes** :
  - la partie est sauvegardée automatiquement toutes les minutes de jeu, et quand vous changez d'onglet ou fermez la page ;
  - Échap › Sauvegarder offre aussi 3 emplacements manuels ;
  - « Continuer », sur l'écran titre, reprend la dernière sauvegarde.
- **Où elles sont stockées** : dans le navigateur, pour cette adresse seulement.
  - Une navigation privée ou un effacement des données du site les supprime.
  - Pour les garder ou les déplacer : Sauvegarder › **Exporter la partie** (fichier `.json`), puis Charger › **Importer un fichier**.
- **Options** (Échap › Options) :
  - volumes ;
  - ombres, netteté et anticrénelage (à baisser si le jeu saccade) ;
  - taille de l'interface ;
  - défilement par les bords ;
  - **mode daltonien** : couleurs adaptées et symbole propre aux racks délestés ;
  - conseils de carrière : « Revoir » réaffiche ceux déjà vus.

## Signaler un bug

1. **Échap › Signaler un bug** copie un rapport : version, navigateur, taille d'écran, état de la partie et derniers événements.
2. Collez-le dans votre message, avec ce que vous faisiez et ce que vous attendiez.
3. Joignez si possible la partie : **Échap › Sauvegarder › Exporter la partie**. Elle permet de rejouer exactement la situation (même graine).

Si le jeu plante, un écran d'erreur propose **Copier le rapport**. Une sauvegarde de secours est tentée avant cet écran : après **Recharger**, « Continuer » reprend la partie.

## Problèmes connus et limites

- Français seulement, ordinateur seulement (souris et clavier).
- Le son ne démarre qu'après le premier clic : c'est une règle des navigateurs.
- Sur une puce graphique modeste, coupez les ombres ou passez la netteté à « Normale » dans les options.

## Liste de contrôle Firefox et Safari

Le jeu a été vérifié sous Chrome. Sur Firefox et sur Safari, une partie rapide suffit :

- [ ] L'écran titre s'affiche, avec la salle en 3D qui tourne lentement.
- [ ] Le tutoriel va de l'étape 1 à l'étape 9.
- [ ] En carrière, un conseil s'affiche après quelques secondes et « Compris » le range ; une recherche se lance (U, puis double-clic ou « Lancer la recherche ») et avance, et les liens de l'arbre restent posés sur les tuiles ; le passage d'un palier ouvre sa fenêtre.
- [ ] Le son se lance après le premier clic, et les curseurs de volume agissent.
- [ ] Sauvegarde dans l'emplacement 1, rechargement de la page, puis « Continuer » : on retrouve la même partie.
- [ ] Un export suivi d'un import redonne la partie.
- [ ] Options : ombres coupées, interface à 115 %, mode daltonien.
- [ ] Carte de chaleur (H), rotation (Q/E), zoom, clic et glisser sur la mini-carte.
- [ ] En fenêtre réduite (environ 1280 × 720), le HUD reste lisible et rien ne se chevauche.
- [ ] Après 10 minutes de jeu, la console (F12) ne montre aucune erreur.

## Pour les développeurs

```sh
APP_PORT=5174 docker compose up -d          # serveur de développement (rechargement à chaud)
docker compose exec app npm run check       # lint (oxlint), typage, tests, build
docker compose exec app npm run test:fast   # les tests sans les parties d'équilibrage (quelques secondes)
docker compose up -d --build --renew-anon-volumes   # après un changement de dépendances
docker compose stop beta                    # arrête la bêta sans toucher au serveur de développement
```

Attention : `docker compose --profile beta down` arrête **aussi** le serveur de développement (un service sans profil est toujours inclus).

- **Organisation du code** :
  - `src/sim/` : simulation déterministe, sans rendu ;
  - `src/render/` : Three.js et assets procéduraux ;
  - `src/ui/` : HUD et tutoriel ;
  - `src/input/` : souris et clavier ;
  - `src/audio/` : sons synthétisés.
- **Où changer quoi** :
  - un réglage de jeu : `src/sim/balance.ts` ;
  - le câblage du réseau : `src/sim/network.ts` ;
  - un nom affiché : `src/ui/catalog.ts` ;
  - une touche : `src/input/keymap.ts` ;
  - une couleur : `src/ui/styles/tokens.css` ou `src/render/assets/palette.ts` ;
  - un seuil de couleur du HUD : `src/ui/tones.ts`.
- **Équilibrage** : `tests/balance.test.ts` fait jouer un bot sans rendu (`tests/bot.ts`). Si un réglage de `src/sim/balance.ts` fait échouer ces tests, c'est l'expérience de jeu qui a changé.
- **Feuille de route** : [PLAN.md](PLAN.md). **Historique** : [CHANGELOG.md](CHANGELOG.md). **Audit de propreté** : [docs/AUDIT.md](docs/AUDIT.md). **Licences tierces** : [public/assets/LICENSES.md](public/assets/LICENSES.md).
