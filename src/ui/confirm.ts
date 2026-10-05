/** Délai pour confirmer une action risquée par un second clic (démolir, quitter, écraser). */
export const CONFIRM_MS = 3000;

/** Confirmation par second clic : le premier arme, le second (dans le délai) confirme. */
export class ConfirmGate {
  private until = 0;

  get armed(): boolean {
    return performance.now() < this.until;
  }

  arm(): void {
    this.until = performance.now() + CONFIRM_MS;
  }

  disarm(): void {
    this.until = 0;
  }
}
