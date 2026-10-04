# Assets 3D

Tous les modèles du jeu sont générés par le code (aucun fichier à charger) et rangés dans `src/render/assets/`. Le reste du jeu n'importe que `src/render/assets/index.ts`.

## Arborescence

```
src/render/assets/
├─ index.ts            point d'entrée unique + registre des modèles (PROP_MODELS)
├─ types.ts            contrats AssetModel, TechnicianModel, ModelState
├─ palette.ts          toutes les couleurs
├─ materials.ts        tous les matériaux, partagés
├─ geometry.ts         outils de géométrie (fusion, comptage de triangles…)
├─ cache.ts            once / onceBy : créer une fois, partager ensuite
├─ dimensions.ts       BUILDING_SIZE, l'encombrement de chaque bâtiment
├─ props/              équipements : rack (instancié), crac, pdu
├─ characters/         technicien et ses animations
├─ environment/        sol, murs, éclairage
└─ fx/                 chantier, marqueurs d'état, anneaux, fantôme de construction
public/assets/
├─ models/             réservé aux futurs .glb
└─ textures/           réservé aux futures images
```

## Conventions

| Sujet | Règle |
|---|---|
| Unités | 1 unité = 1 case de la grille. Y vers le haut. |
| Origine | Centre de la base du modèle, posé au sol (y = 0). La scène place le modèle au centre de sa case. |
| Orientation | Façade tournée vers +Z. |
| Encombrement | Égal à `BUILDING_SIZE`, sans déborder de la case (±0,5). |
| Couleurs | Uniquement dans `palette.ts`. Aucune couleur en dur ailleurs. |
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

interface ModelState { time; dt; speed; powered; progress }

interface TechnicianModel {
  readonly root: THREE.Group;
  setSelected(selected: boolean): void;
  animate(pose: 'idle' | 'walk' | 'work', time: number): void;
}
```

Les racks ne suivent pas `AssetModel` : ils sont instanciés (`createRackInstances`), avec un seul appel de dessin pour tous. La couleur de leurs LEDs, portée par chaque instance, indique leur état.

## Ajouter un équipement

1. Ajouter son type à `BuildingKind` et à l'équilibrage (`src/sim/balance.ts`).
2. Ajouter son encombrement à `dimensions.ts`, ses couleurs à `palette.ts` et ses matériaux à `materials.ts`.
3. Créer `props/<nom>.ts`, qui exporte une fabrique `createXxx(): AssetModel`.
4. L'inscrire dans `PROP_MODELS` (`index.ts`).
5. Lancer `npx vitest run tests/assets.test.ts` : le test vérifie l'encombrement, la pose au sol, le budget et le partage.

## Remplacer un modèle par un fichier .glb

1. Déposer le fichier dans `public/assets/models/<nom>.glb` : origine au centre de la base, façade vers +Z, 1 unité = 1 case.
2. Écrire une fabrique qui clone le modèle chargé (GLTFLoader, chargé une seule fois au démarrage) et qui respecte `AssetModel`.
3. Remplacer l'entrée correspondante de `PROP_MODELS`. La scène, le picking et le fantôme ne changent pas.
4. Noter la source et la licence du fichier dans `public/assets/LICENSES.md`.

## Vérifier

- `npx vitest run tests/assets.test.ts` vérifie les conventions ci-dessus.
- `window.__game` (en mode dev) permet de mettre la partie dans un état donné pour regarder un modèle.
