/**
 * Variante suivante d'une famille de la barre (touche ou clic sur la carte). Un tour part de
 * `start` (la variante montrée par la carte, sinon la première débloquée), passe par toutes les
 * variantes débloquées dans l'ordre, en revenant au début de la liste, puis rend la main (null)
 * juste avant de retomber sur son départ : les anciennes générations restent accessibles.
 */
export function nextVariant<T>(open: readonly T[], current: T | null, start: T | undefined): T | null {
  if (!open.length) return null;
  const from = start !== undefined && open.includes(start) ? start : open[0];
  if (current === null || !open.includes(current)) return from;
  const next = open[(open.indexOf(current) + 1) % open.length];
  return next === from ? null : next;
}
