import type { Settings, SettingsStore } from '../../settings';
import { el, icon } from '../dom';
import type { IconName } from '../icons';

function section(name: IconName, title: string, ...rows: HTMLElement[]): HTMLElement {
  return el('div', 'opt-section', el('h3', undefined, icon(name, 13), title), ...rows);
}

function row(label: string, control: HTMLElement, note?: string): HTMLElement {
  return el('label', 'opt-row', el('span', 'opt-label', label, note ? el('small', undefined, note) : null), control);
}

/** Panneau d'options : chaque contrôle écrit directement dans les options (persistées). */
export class OptionsPanel {
  readonly root: HTMLElement;
  private readonly sync: ((s: Settings) => void)[] = [];

  constructor(private readonly store: SettingsStore, onBack: () => void) {
    const back = el('button', 'btn btn-ghost', icon('collapse', 14), 'Retour');
    back.onclick = onBack;
    this.root = el(
      'div',
      'options',
      el('div', 'menu-head', el('span', 'panel-title', icon('settings', 14), 'Options'), back),
      section('volume', 'Son', this.slider('Volume général', 'volumeMaster'), this.slider('Effets', 'volumeSfx'), this.slider('Ambiance de la salle', 'volumeAmbience')),
      section(
        'display',
        'Affichage',
        this.toggle('Ombres', 'shadows', 'à couper sur une machine modeste'),
        this.choice('Netteté', 'pixelRatio', [
          [1, 'Normale'],
          [2, 'Haute'],
        ]),
        this.toggle('Anticrénelage', 'antialias', 'au prochain lancement'),
        this.choice('Taille de l’interface', 'uiScale', [
          [0.9, '90 %'],
          [1, '100 %'],
          [1.15, '115 %'],
        ], 'limitée si la fenêtre est petite'),
      ),
      section(
        'accessibility',
        'Commandes et accessibilité',
        this.toggle('Mode daltonien', 'colorblind', 'couleurs adaptées et symboles de délestage'),
        this.toggle('Défilement par les bords de l’écran', 'edgePan'),
      ),
    );
    store.subscribe((s) => this.sync.forEach((fn) => fn(s)));
  }

  private slider(label: string, key: 'volumeMaster' | 'volumeSfx' | 'volumeAmbience'): HTMLElement {
    const input = el('input', 'opt-slider');
    Object.assign(input, { type: 'range', min: '0', max: '100', step: '5' });
    const value = el('span', 'opt-value mono');
    input.oninput = () => this.store.update({ [key]: Number(input.value) / 100 });
    this.sync.push((s) => {
      input.value = String(Math.round(s[key] * 100));
      value.textContent = `${Math.round(s[key] * 100)} %`;
    });
    return row(label, el('span', 'opt-control', input, value));
  }

  private toggle(label: string, key: 'shadows' | 'antialias' | 'edgePan' | 'colorblind', note?: string): HTMLElement {
    const input = el('input', 'opt-switch');
    input.type = 'checkbox';
    input.onchange = () => this.store.update({ [key]: input.checked });
    this.sync.push((s) => (input.checked = s[key]));
    return row(label, input, note);
  }

  private choice<K extends 'pixelRatio' | 'uiScale'>(label: string, key: K, options: [Settings[K], string][], note?: string): HTMLElement {
    const group = el('span', 'opt-choice');
    const buttons = options.map(([value, text]) => {
      const b = el('button', 'btn', text);
      b.type = 'button';
      b.onclick = () => this.store.update({ [key]: value } as Partial<Settings>);
      group.append(b);
      return [value, b] as const;
    });
    this.sync.push((s) => buttons.forEach(([value, b]) => b.classList.toggle('active', s[key] === value)));
    return row(label, group, note);
  }
}
