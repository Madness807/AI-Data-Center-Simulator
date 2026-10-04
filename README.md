# Data Center IA — bêta 0.10

Jeu de stratégie en temps réel dans le navigateur : construisez et exploitez un data center d'IA. Il faut honorer les contrats de calcul, garder la salle au frais et réparer les pannes avant que la trésorerie ne passe dans le rouge.

Cette bêta est complète : il reste à l'équilibrer et à la corriger. **Vos retours décident de la suite.**

## Installer et lancer

**Prérequis** :
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (macOS, Windows) ou Docker Engine avec Compose v2 (Linux) ;
- un navigateur récent compatible WebGL 2 : Chrome, Edge, Firefox ou Safari 15+ ;
- un ordinateur avec souris et clavier (le jeu n'est pas prévu pour le tactile).

Dans le dossier du jeu :

```sh
docker compose --profile beta up -d --build beta
```

Ouvrez ensuite **http://localhost:8080**. La première construction prend une à deux minutes : l'image installe les dépendances, puis vérifie le jeu (typage et tests) avant de le compiler.

| Pour… | Commande |
|---|---|
| Arrêter le jeu | `docker compose --profile beta down` |
| Installer une nouvelle version | récupérer le nouveau code, puis relancer la commande d'installation |
| Changer de port (8080 déjà pris) | `BETA_PORT=8081 docker compose --profile beta up -d --build beta` |
| Jouer depuis un autre appareil du réseau local | `BETA_HOST=0.0.0.0 docker compose --profile beta up -d --build beta` |

## Jouer

Commencez par la **partie guidée** : en neuf étapes, elle montre toute la boucle du jeu (techniciens, racks, contrats, chaleur, refroidissement, réparation).

- **Objectif** : atteindre 100 000 $ de trésorerie. La partie continue ensuite en mode libre.
- **Défaite** : rester plus de 30 secondes dans le rouge.
- **La boucle** :
  - acceptez des contrats que vos racks peuvent assurer ;
  - un rack chauffe : posez un CRAC à moins de 3 cases (un CRAC refroidit environ 3 racks) ;
  - au-delà de 35 °C, les pannes se multiplient ; envoyez un technicien réparer ;
  - un PDU alimente 40 kW, soit 3 à 4 racks ; s'il en manque, les racks les plus récents sont délestés.

### Commandes

| Action | Touches |
|---|---|
| Déplacer la caméra / pivoter / zoomer | W A S D · Q E · molette |
| Sélectionner des techniciens | clic, ou glisser un rectangle (Maj pour ajouter) |
| Ordonner : aller, construire, réparer | clic droit (Maj + clic droit : mettre en file) |
| Construire un rack, un CRAC, un PDU | R, C, P, puis clic (glisser pour enchaîner) |
| Démolir | X |
| Inspecter un équipement | clic sur l'équipement |
| Embaucher un technicien | T |
| Pause / vitesse ×1, ×2, ×4 | Espace / 1, 2, 3 |
| Calques : chaleur, énergie, froid, occupation, risque | H (Maj+H : précédent) |
| Tableau de bord / équipe | Tab / G |
| Défilement par les bords | B |
| Menu (sauvegarde, options, bug) | Échap |
| Aide des commandes | ? ou F1 |

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
  - **mode daltonien** : couleurs adaptées et symbole propre aux racks délestés.

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
- [ ] La partie guidée va de l'étape 1 à l'étape 9.
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
docker compose exec app npm run check       # typage, tests, build
docker compose up -d --build --renew-anon-volumes   # après un changement de dépendances
docker compose stop beta                    # arrête la bêta sans toucher au serveur de développement
```

Attention : `docker compose --profile beta down` arrête **aussi** le serveur de développement (un service sans profil est toujours inclus).

- **Organisation du code** :
  - `src/sim/` : simulation déterministe, sans rendu ;
  - `src/render/` : Three.js et assets procéduraux ;
  - `src/ui/` : HUD et tutoriel ;
  - `src/audio/` : sons synthétisés.
- **Équilibrage** : `tests/balance.test.ts` fait jouer un bot sans rendu (`tests/bot.ts`). Si un réglage de `src/sim/balance.ts` fait échouer ces tests, c'est l'expérience de jeu qui a changé.
- **Feuille de route** : [PLAN.md](PLAN.md). **Historique** : [CHANGELOG.md](CHANGELOG.md). **Licences tierces** : [public/assets/LICENSES.md](public/assets/LICENSES.md).
