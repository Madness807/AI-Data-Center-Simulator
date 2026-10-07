/**
 * Fichiers du build que le service worker garde dès l'installation : tout le jeu, sauf ce
 * qu'un navigateur récent ne demande jamais (polices .woff de secours, alphabets non latins),
 * les fichiers vides qui gardent les dossiers et le service worker lui-même. La page est
 * gardée sous « ./ », l'adresse que l'on ouvre. Renvoie des URL relatives, triées.
 */
export function precacheList(files: readonly string[]): string[] {
  return files
    .filter((f) => f !== 'sw.js' && !f.endsWith('.gitkeep') && !f.endsWith('.woff') && !/-(cyrillic|greek|vietnamese)(-ext)?-/.test(f))
    .map((f) => (f === 'index.html' ? './' : f))
    .sort();
}
