/** Formats d'affichage du HUD (français, chiffres tabulaires). */

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const money = (n: number) => `${nf.format(Math.round(n))} $`;

/** Montant signé, avec un vrai signe moins : « +6 000 $ », « −1 500 $ ». */
export const signedMoney = (n: number) =>
  Math.round(n) === 0 ? '0 $' : `${n < 0 ? '−' : '+'}${nf.format(Math.abs(Math.round(n)))} $`;

/** Débit d'argent signé : « +18,4 $/s ». */
export const moneyRate = (n: number) => `${n < 0 ? '−' : '+'}${nf1.format(Math.abs(n))} $/s`;

/** Temps de jeu en m:ss. */
export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Secondes restantes, arrondies au-dessus, jamais négatives. */
export const seconds = (n: number) => `${Math.max(0, Math.ceil(n))} s`;

export const percent = (ratio: number) => `${Math.round(ratio * 100)} %`;

export const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);
