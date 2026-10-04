/**
 * Écran d'erreur fatale, volontairement indépendant du HUD (qui peut être la cause du
 * problème) : DOM minimal, styles en ligne, une seule fois par session.
 */

let shown = false;

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // Repli sans API presse-papiers (contexte non sécurisé).
  const area = document.createElement('textarea');
  area.value = text;
  document.body.append(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}

function render(title: string, message: string, report?: string): void {
  if (shown) return;
  shown = true;
  const root = document.createElement('div');
  root.setAttribute('role', 'alertdialog');
  root.style.cssText =
    'position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:rgba(5,8,12,.86);font:14px system-ui,sans-serif;color:#e4ecf6';
  const card = document.createElement('div');
  card.style.cssText =
    'width:min(560px,calc(100% - 32px));padding:24px 26px;border-radius:14px;background:#0d121a;border:1px solid rgba(255,90,79,.5);box-shadow:0 10px 40px rgba(0,0,0,.5)';
  const h = document.createElement('h1');
  h.textContent = title;
  h.style.cssText = 'margin:0 0 8px;font-size:22px;color:#ff5a4f';
  const p = document.createElement('p');
  p.textContent = message;
  p.style.cssText = 'margin:0 0 14px;color:#93a0b2;line-height:1.5';
  card.append(h, p);
  if (report) {
    const pre = document.createElement('pre');
    pre.textContent = report;
    pre.style.cssText =
      'max-height:180px;overflow:auto;margin:0 0 16px;padding:10px;border-radius:8px;background:#070a0f;color:#93a0b2;font:11px ui-monospace,monospace;white-space:pre-wrap';
    card.append(pre);
  }
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
  const button = (label: string, primary: boolean, onClick: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `padding:9px 16px;border-radius:8px;font:600 13px system-ui,sans-serif;cursor:pointer;border:1px solid ${
      primary ? 'rgba(61,255,160,.5)' : 'rgba(255,255,255,.12)'
    };background:${primary ? 'rgba(61,255,160,.15)' : 'transparent'};color:${primary ? '#c8ffe3' : '#e4ecf6'}`;
    b.onclick = () => onClick(b);
    actions.append(b);
  };
  if (report) {
    button('Copier le rapport', false, (b) => {
      copyText(report).then(
        () => (b.textContent = 'Rapport copié ✓'),
        () => (b.textContent = 'Copie impossible : sélectionnez le texte'),
      );
    });
  }
  button('Recharger le jeu', true, () => location.reload());
  card.append(actions);
  root.append(card);
  document.body.append(root);
}

/** Affiche un message bloquant (ex. WebGL indisponible), sans rapport technique. */
export function showFatal(title: string, message: string): void {
  render(title, message);
}

/**
 * Intercepte les erreurs non gérées : sauvegarde de secours (si possible), puis écran
 * d'erreur avec un rapport copiable.
 */
export function installCrashHandler(opts: { buildReport: (error: unknown) => string; onCrash?: () => void }): void {
  const crash = (error: unknown) => {
    if (shown) return;
    try {
      opts.onCrash?.();
    } catch {
      // La sauvegarde de secours est un bonus : l'écran d'erreur doit s'afficher quoi qu'il arrive.
    }
    let report: string;
    try {
      report = opts.buildReport(error);
    } catch {
      report = String(error instanceof Error ? (error.stack ?? error.message) : error);
    }
    render(
      'Le jeu a rencontré un problème',
      'Désolé ! Copiez le rapport ci-dessous et envoyez-le-nous : il contient de quoi reproduire le bug. Votre partie a été sauvegardée si c’était possible.',
      report,
    );
  };
  window.addEventListener('error', (e) => crash(e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => crash(e.reason));
}

export { copyText };
