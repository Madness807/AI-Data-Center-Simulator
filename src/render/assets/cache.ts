/**
 * Crée la valeur au premier appel puis renvoie toujours la même instance.
 * C'est ainsi que géométries et matériaux sont partagés entre tous les modèles.
 */
export function once<T>(make: () => T): () => T {
  let made = false;
  let value: T;
  return () => {
    if (!made) {
      value = make();
      made = true;
    }
    return value;
  };
}

/** Variante indexée par une clé : une instance partagée par rayon, par type de bâtiment… */
export function onceBy<K, T>(make: (key: K) => T): (key: K) => T {
  const cache = new Map<K, T>();
  return (key) => {
    let value = cache.get(key);
    if (value === undefined) {
      value = make(key);
      cache.set(key, value);
    }
    return value;
  };
}
