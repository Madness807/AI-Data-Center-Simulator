/**
 * Table unique des raccourcis. Les gestionnaires (main.ts, hud.ts, la caméra de scene.ts)
 * lisent leurs codes ici ; l'aide et les pastilles de touches en tirent leurs libellés.
 * Les codes sont physiques (KeyboardEvent.code) : c'est la position de la touche qui compte,
 * pas la lettre imprimée dessus.
 */
export const KEYS = {
  panUp: ['KeyW', 'ArrowUp'],
  panLeft: ['KeyA', 'ArrowLeft'],
  panDown: ['KeyS', 'ArrowDown'],
  panRight: ['KeyD', 'ArrowRight'],
  rotateLeft: ['KeyQ'],
  rotateRight: ['KeyE'],
  edgePan: ['KeyB'],
  buildCompute: ['KeyR'],
  buildCooling: ['KeyC'],
  buildPower: ['KeyP'],
  buildNetwork: ['KeyN'],
  demolish: ['KeyX'],
  rotateBuilding: ['KeyF'],
  hire: ['KeyT'],
  overlay: ['KeyH'],
  pause: ['Space'],
  speed1: ['Digit1'],
  speed2: ['Digit2'],
  speed4: ['Digit3'],
  dashboard: ['Tab'],
  team: ['KeyG'],
  research: ['KeyU'],
  help: ['F1'],
  cancel: ['Escape'],
  confirm: ['Enter'],
} as const satisfies Record<string, readonly string[]>;

export type KeyAction = keyof typeof KEYS;

/** Caractère qui ouvre aussi l'aide, quelle que soit la touche qui le produit. */
export const HELP_CHAR = '?';

/** La touche pressée correspond-elle à l'action ? */
export function matches(action: KeyAction, e: Pick<KeyboardEvent, 'code'>): boolean {
  return (KEYS[action] as readonly string[]).includes(e.code);
}

/** Libellés des touches qui ne sont pas des lettres. */
const NAMED: Record<string, string> = {
  Space: 'Espace',
  Escape: 'Échap',
  Enter: 'Entrée',
  Tab: 'Tab',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

let layout: ReadonlyMap<string, string> | null = null;

/**
 * Demande au navigateur la disposition du clavier (Chrome, Edge) pour afficher les vraies
 * lettres (Z Q S D sur un AZERTY). Ailleurs, les libellés restent ceux d'un QWERTY.
 */
export function loadKeyboardLayout(): void {
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
  keyboard
    ?.getLayoutMap?.()
    .then((map) => (layout = map))
    .catch(() => {});
}

/** Libellé d'un code physique, dans la disposition du joueur. */
export function keyLabel(code: string): string {
  if (code in NAMED) return NAMED[code];
  if (code.startsWith('Digit')) return code.slice(5);
  const printed = layout?.get(code);
  if (printed && /^[a-z]$/i.test(printed)) return printed.toUpperCase();
  return code.startsWith('Key') ? code.slice(3) : code;
}

/** Libellé de la touche principale d'une action (« R », « Tab »…). */
export function actionKey(action: KeyAction): string {
  return keyLabel(KEYS[action][0]);
}
