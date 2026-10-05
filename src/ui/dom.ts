import { createElement } from 'lucide';
import { ICONS, type IconName } from './icons';

type Child = Node | string | null | undefined | false;

/** Crée un élément avec ses classes et ses enfants. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const c of children) if (c) node.append(c);
  return node;
}

/** Icône Lucide en SVG, qui prend la couleur du texte. */
export function icon(name: IconName, size = 16): SVGElement {
  return createElement(ICONS[name], { width: size, height: size, 'stroke-width': 2, class: 'icon' });
}

/** N'écrit dans le DOM que si le texte change : le HUD est mis à jour à chaque image. */
export function setText(node: Element, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setStyle(node: HTMLElement, prop: 'width' | 'left' | 'top' | 'background', value: string): void {
  if (node.style[prop] !== value) node.style[prop] = value;
}

export function setHidden(node: HTMLElement, hidden: boolean): void {
  if (node.hidden !== hidden) node.hidden = hidden;
}

/** Relance une animation CSS portée par une classe (retirée, recalcul, remise). */
export function restartAnimation(node: HTMLElement, cls: string): void {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}
