# Assets 3D

Tous les modèles du jeu sont générés par le code (aucun fichier à charger) et rangés dans `src/render/assets/`. Le reste du jeu passe par `src/render/assets/index.ts`, sauf quelques imports directs et assumés : la palette et sa conversion `toRgb` (calques, vignettes), le fantôme de construction (`FACING_ANGLE`).

## Arborescence

```
src/render/assets/
├─ index.ts            point d'entrée unique + registre des modèles (PROP_MODELS)
├─ types.ts            contrats AssetModel, TechnicianModel, ModelState
├─ palette.ts          toutes les couleurs, y compris celles des calques (groupe overlay), et toRgb()
├─ status-colors.ts    couleurs d'état (LEDs, mini-carte, HUD), variante daltonienne Okabe-Ito
├─ materials.ts        tous les matériaux, partagés
├─ geometry.ts         outils de géométrie (pavés, fusion, cuisson des couleurs, triangles)
├─ textures.ts         textures générées en pur JS (DataTexture) : dalles, rayures, panneaux
├─ cache.ts            once / onceBy : créer une fois, partager ensuite
├─ dimensions.ts       BUILDING_SIZE, l'encombrement de chaque bâtiment
├─ props/              équipements : rack (instancié), crac, pdu, ups (onduleur), generator, cdu, switch
├─ characters/         technicien et ses animations
├─ environment/        sol, murs, éclairage
└─ fx/                 chantier, marqueurs d'état, anneaux, fantôme de construction, chemins de câbles
public/assets/
├─ models/             réservé aux futurs .glb
└─ textures/           réservé aux futures images
```

## Style

Low-poly stylisé, lisible en vue isométrique :
- **Modèles « cuits »** : chaque modèle fixe est une liste de pièces (`box(...)` + couleur de la palette) fusionnées par `bake()` en une seule géométrie à couleurs de sommets. Tous ces modèles partagent un seul matériau, `MATERIALS.vertexColored`.
- **Pièces à part** : seules les pièces animées (ventilateur, membres du technicien) ou à matériau particulier (écran, voyant, bande de danger) sont des maillages séparés.
- **Couleurs lumineuses** : LEDs, anneaux, panneaux d'alerte et heatmap échappent au tone mapping (`toneMapped: false`) pour garder des couleurs d'état franches.
- **Textures** : générées par le code (`textures.ts`) en `DataTexture`, sans aucun fichier image, donc testables sans navigateur.
- **Murs en coupe** : les murs côté caméra s'abaissent, ceux du fond montent et portent les détails (chemin de câbles, appliques).

## Conventions

| Sujet | Règle |
|---|---|
| Unités | 1 unité = 1 case de la grille. Y vers le haut. |
| Origine | Centre de la base du modèle, posé au sol (y = 0). La scène place le modèle au centre de sa case. |
| Orientation | Façade tournée vers +Z. |
| Encombrement | Égal à `BUILDING_SIZE`, sans déborder de la case (±0,5). |
| Couleurs | Uniquement dans `palette.ts` (et sa variante daltonienne dans `status-colors.ts`). Aucune couleur en dur ailleurs. |
| Matériaux | Uniquement dans `materials.ts`, créés une fois et partagés. Ne jamais modifier un matériau partagé pour une seule instance. |
| Géométries | Créées une fois au niveau du module (`once`, `onceBy`) et partagées. |
| Animations | Portées par le modèle (`update`, `animate`) ; la scène se contente de lui passer l'état. |
| Nommage | Fichiers en kebab-case, fabriques `createXxx`. |

Les deux exceptions au partage :
- le ping d'ordre clone son matériau pour animer son opacité, et le libère en fin d'animation ;
- le fantôme de construction est un objet unique dont le matériau change de couleur.

### Budgets de triangles

| Asset | Budget | Pourquoi |
|---|---|---|
| Rack (corps + LEDs) | ≤ 1 200 | jusqu'à 1 024 instances à l'écran |
| Autre équipement, chantier | ≤ 3 000 | quelques dizaines à l'écran |
| Technicien | ≤ 2 000 | jusqu'à 10 à l'écran |

## Contrats

```ts
interface AssetModel {
  readonly root: THREE.Group;          // à ajouter à la scène
  update(state: ModelState): void;     // appelé à chaque frame
}

interface ModelState { time; dt; speed; powered; progress; charge?; discharging?; starting?; … }  // champs propres à l'onduleur et au groupe

interface TechnicianModel {
  readonly root: THREE.Group;
  setSelected(selected: boolean): void;
  animate(pose: 'idle' | 'walk' | 'work', time: number): void;
}
```

Les racks ne suivent pas `AssetModel` : ils sont instanciés (`createRackInstances`), avec un seul appel de dessin pour tous. La couleur de leurs LEDs, portée par chaque instance, indique leur état.

## Ajouter un équipement

1. Ajouter son type à `BUILDING_KINDS` (`src/sim/entities.ts` : la sauvegarde le reconnaît d'office), son nom à `KIND_INFO` (`src/ui/catalog.ts`) et ses réglages à `src/sim/balance.ts`. Le `switch` exhaustif de `updatePower` signale l'oubli de son alimentation.
2. Ajouter son encombrement à `dimensions.ts`, ses couleurs à `palette.ts` et ses matériaux à `materials.ts`.
3. Créer `props/<nom>.ts`, qui exporte une fabrique `createXxx(): AssetModel`.
4. L'inscrire dans `PROP_MODELS` (`index.ts`).
5. Lancer `docker compose exec app npx vitest run tests/assets.test.ts` : le test vérifie l'encombrement, la pose au sol, le budget et le partage.

Le compilateur réclame aussi ses entrées dans `BUILD_COST` et `BUILD_TIME`, `DOMAIN` et les libellés des techniciens, le fantôme de construction (`fx/build-ghost.ts`), `TOOL_INFO` et l'infobulle de la barre de construction. Il ne voit pas, en revanche :
- **simulation** : `loadKW` et `serviceOrder` s'il consomme (sinon il n'est jamais alimenté), sa chaleur (`systems/heat.ts`), le PUE (`stats.ts`), le nœud de recherche qui le débloque (`effect.unlocks`) et l'ordre de recherche du bot ;
- **rendu** : sa vignette (`thumbnails.ts`), les champs de `ModelState` qu'il lit (remplis par `scene.ts`), sa couleur sur la mini-carte et sur le calque énergie ;
- **interface** : sa famille dans la barre (`BUILD_FAMILIES`, `KEYS`, `FAMILY_KEYS`), la ligne d'aide, la pastille d'état et la section de l'inspecteur, l'infobulle de case.

Exemple complet : le switch réseau (`props/switch.ts`). Ses voyants (un par port occupé) sont deux maillages dont la géométrie change selon le nombre de ports, plutôt qu'un maillage par voyant.

## Chemins de câbles

Les câbles du réseau courent au plafond (y = 1,86, au-dessus des racks, du confinement et des murs abaissés). `src/render/cable-paths.ts` calcule en données pures un tronçon par paire de cases empruntée, avec le nombre de câbles qu'il porte, et une descente vers chaque équipement ; `fx/cable-trays.ts` les dessine en trois maillages instanciés (chemins, faisceaux, descentes) ; `cable-view.ts` ne les reconstruit que lorsque le câblage change. Ils ne projettent pas d'ombre (elle tomberait loin d'eux et ressemblerait à un câble au sol) et se masquent quand le calque Réseau montre les câbles à leur vraie case.

## Remplacer un modèle par un fichier .glb

1. Déposer le fichier dans `public/assets/models/<nom>.glb` : origine au centre de la base, façade vers +Z, 1 unité = 1 case.
2. Écrire une fabrique qui clone le modèle chargé (GLTFLoader, chargé une seule fois au démarrage) et qui respecte `AssetModel`.
3. Remplacer l'entrée correspondante de `PROP_MODELS`. La scène, le picking et le fantôme ne changent pas.
4. Noter la source et la licence du fichier dans `public/assets/LICENSES.md`.

## Vérifier

- `docker compose exec app npx vitest run tests/assets.test.ts` vérifie les conventions ci-dessus (les dépendances n'existent que dans le conteneur).
- `window.__game` (en mode dev) permet de mettre la partie dans un état donné pour regarder un modèle.
