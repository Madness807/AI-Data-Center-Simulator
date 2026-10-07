/** Invite d'installation de Chrome et Edge (pas de type standard dans le DOM). */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

/**
 * Jeu installable (PWA) : enregistre le service worker qui le garde pour le hors-ligne, et
 * signale quand le navigateur propose l'installation (Chrome, Edge ; Safari passe par son
 * menu) : `onInstall` reçoit de quoi ouvrir l'invite, ou null quand elle n'est plus possible.
 * Build seulement : en dev, Vite sert les sources et un cache gênerait le rechargement à chaud.
 */
export function setupPwa(onInstall: (install: (() => void) | null) => void): void {
  if (!import.meta.env.PROD) return;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Sans service worker (navigation privée, refus), le jeu marche en ligne comme avant.
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // pas de bandeau du navigateur : le bouton de l'écran titre suffit
    const event = e as InstallPromptEvent;
    onInstall(() => {
      onInstall(null); // une invite ne sert qu'une fois ; le navigateur en reproposera une
      void event.prompt();
    });
  });
  window.addEventListener('appinstalled', () => onInstall(null));
}
