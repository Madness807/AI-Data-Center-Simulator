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

/** Température à une décimale, virgule française : « 34,8 °C ». */
export const celsius = (t: number) => `${nf1.format(t)} °C`;

/** Pourcentage avec une décimale sous 10 % (« 1,7 % »), entier au-delà. */
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Nombre à virgule : une décimale (pannes par heure) ou deux (PUE). */
export const decimal = (n: number, digits: 1 | 2 = 1) => (digits === 2 ? nf2 : nf1).format(n);
export const percentFine = (ratio: number) => `${(ratio < 0.1 ? nf1 : nf).format(ratio * 100)} %`;

export const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);
