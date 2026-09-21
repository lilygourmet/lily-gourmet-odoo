// ============================================================
// Comment l'écran de Fabrication Annexe 2 écrit les nombres et les noms :
// gros chiffres, grammes partout, noms débarrassés des préfixes d'Odoo. Pensé
// pour des gens qui lisent peu — c'est l'atelier qui s'en sert, pas le bureau.
// (Layla, 2026-09-10.)
// ============================================================

import { aplatir } from './recherche'

/** Un nombre comme on l'écrit en français : 2 800, 1,5. */
export const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })

/**
 * L'atelier lit et tape des GRAMMES, toujours — même quand Odoo compte en
 * kilos. « Attention à la conversion » (Layla, 2026-09-11) : ces trois-là sont
 * le seul endroit où l'on passe d'une unité à l'autre, et elles sont testées.
 *
 * ⚠️ Ce qui part chez Odoo reste dans l'unité de l'ARTICLE : on affiche
 * 5 550 g, on déclare 5,55 kg. Se tromper ici, c'est un facteur mille.
 */
export const estKg = u => /^kg$/i.test(String(u || '').trim())

/** De l'unité d'Odoo vers l'écran : 5,55 kg → 5 550. */
export const enGrammes = (v, u) => (Number(v) || 0) * (estKg(u) ? 1000 : 1)

/** De l'écran vers Odoo : 5 550 g → 5,55 (kg). */
export const enUnite = (v, u) => (Number(v) || 0) / (estKg(u) ? 1000 : 1)

/** Le mot d'unité affiché : un kilo se dit en grammes. */
export const uniteAffichee = u => (estKg(u) ? 'g' : String(u || ''))

/**
 * Une quantité comme l'atelier la lit : en GRAMMES, toujours.
 *
 * « 2,1 kg » oblige à convertir de tête au-dessus de la balance, et c'est là
 * qu'on se trompe d'un facteur mille. Toutes les recettes d'Annexe 2 s'écrivent
 * en grammes, quelle que soit l'unité d'Odoo (Layla, 2026-09-10) — même règle
 * que l'ancien écran.
 */
export const qte = (v, u) => {
  const kg = /^kg$/i.test(String(u || '').trim())
  const n = (Number(v) || 0) * (kg ? 1000 : 1)
  const mot = kg ? 'g' : (u || '')
  // ⚠️ JAMAIS « 0 g » pour quelque chose qui existe. 0,4 g de colorant n'est
  // pas rien, mais arrondi à l'entier l'écran écrit « 0 » — et on croit qu'il
  // a oublié la ligne. Layla, le 2026-09-14, en regardant des lignes en kilos
  // affichées à zéro : « quand le sucre est au kg, tu ne le prends pas ».
  // Sous le demi-gramme, on garde donc la précision, comme `dose`.
  if (n !== 0 && Math.abs(n) < 0.5) return `${nb(Number(n.toPrecision(2)))} ${mot}`.trim()
  return `${nb(Math.round(n))} ${mot}`.trim()
}

/**
 * La dose POUR UNE PIÈCE : « 38 g » de glaçage sur un gâteau.
 *
 * Contrairement à `qte`, on garde ici la précision : sous le gramme, arrondir
 * à l'entier écrirait « 0 g » de gélatine là où il en faut 0,4. Au-dessus, un
 * chiffre après la virgule suffit à la balance.
 */
export const dose = (v, u) => {
  const kg = /^kg$/i.test(String(u || '').trim())
  const n = (Number(v) || 0) * (kg ? 1000 : 1)
  const mot = kg ? 'g' : (u || '')
  if (n === 0) return `0 ${mot}`.trim()
  if (Math.abs(n) < 1) return `${nb(Number(n.toPrecision(2)))} ${mot}`.trim()
  return `${nb(Math.round(n * 10) / 10)} ${mot}`.trim()
}

/**
 * Le nom débarrassé de ce qui ne se lit pas : « SM- Tiramisu 15cm » devient
 * « Tiramisu 15cm ». Les préfixes d'Odoo ne veulent rien dire à l'atelier.
 */
// ⚠️ Le préfixe doit être SUIVI d'un séparateur — tiret, point, slash ou
// espace. Sans cette exigence, le « F » de « Framboisier » et le « V » de
// « Vitrine citron » étaient pris pour des préfixes : l'écran affichait
// « ramboisier » et « itrine citron ». (Layla, 2026-09-11.)
// Les préfixes longs passent AVANT les courts, sinon « SMPr- » perdrait son
// « SM » et rien d'autre.
export const propre = nom => String(nom || '')
  .replace(/^\s*(\[[^\]]*\]\s*)?(SMPr|SMT|SM|MP|MI|GS|RA|GM|CD|E|F|V)(?:\s*[-./]+\s*|\s+)/i, '')
  .replace(/\s{2,}/g, ' ').trim()

/**
 * LES RÈGLES D'ATELIER : ce que le pâtissier pèse n'est pas toujours ce
 * qu'Odoo compte.
 *
 * `MP- Gelatine en poudre` se pèse en MASSE — 1 part de poudre pour 6 d'eau,
 * donc ×7. Odoo ne connaît que la poudre et ne déduira que la poudre ; sur la
 * balance, c'est la masse qu'on fait. Vaut pour TOUTES les recettes, présentes
 * et futures (règle de Layla). Un autre ingrédient de ce genre = une ligne à
 * ajouter ici.
 */
const REGLES_ATELIER = [
  { quand: /gelatine en poudre/i, nom: 'Masse gélatine', facteur: 7 },
]

const aplati = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * ⚠️ LA RÈGLE NE S'APPLIQUE PAS À CE QU'ON EST EN TRAIN DE FAIRE.
 *
 * « Est-ce que la masse gélatine a été demandée pour bloquer ? » (Layla,
 * 2026-09-21) — elle regardait la fiche de « SM. Masse Gélatine », qui
 * réclamait parmi ses ingrédients… 1 000 g de masse gélatine. C'est la règle
 * du ×7 qui se mordait la queue : la poudre y devient « masse gélatine », or
 * ici la masse, c'est justement ce qu'on fabrique. Sur SA fiche, on pèse donc
 * la poudre, comme Odoo la compte.
 */
const regleAtelier = (nom, dans) => {
  const r = REGLES_ATELIER.find(x => x.quand.test(String(nom || '')))
  if (!r) return null
  return dans && aplati(dans).includes(aplati(r.nom)) ? null : r
}

/** Le nom sous lequel l'atelier connaît l'ingrédient. */
export const nomAtelier = (nom, dans) => regleAtelier(nom, dans)?.nom || propre(nom)

/** Par combien multiplier ce qu'Odoo compte pour obtenir ce qu'on pèse. */
export const facteurAtelier = (nom, dans) => regleAtelier(nom, dans)?.facteur || 1

/**
 * LES MÉLANGES : ce que le pâtissier fait en UN seul geste avant de monter.
 *
 * « Enlever les ingrédients et noter le total de l'appareil à flan » (Layla,
 * 2026-09-12). Dans le rappel « Pour 1 … », lire sept lignes de matières
 * premières n'apprend rien : ce qu'on veut savoir, c'est combien d'appareil
 * va dans un flan. C'est la même idée que « La mousse, 800 g » du royal.
 *
 * ⚠️ Ce n'est PAS une cuve (le réglage « figés » de Mini / maxi Annexe). Une
 * cuve se fait EN ENTIER quoi qu'il arrive ; un mélange SUIT le nombre de
 * gâteaux. Le flan est lancé tantôt par 1, tantôt par 2, parfois par 3 (60
 * ordres relevés le 2026-09-12) : une cuve fixe se tromperait une fois sur
 * deux. Ce regroupement ne touche donc QUE l'affichage — Odoo continue de
 * consommer au prorata.
 *
 * La liste du haut, elle, garde le détail : c'est là qu'on pèse.
 */
const MELANGES = [{
  gateau: /flan vanille/i,
  nom: "L'appareil à flan",
  dedans: ['MP- Crème whipping', 'MP- Lait UHT', 'MP- Vanille Gousse Bourbon',
    'MP- Sucre Granule', 'MP- Oeufs entier', 'MP- Maizena', 'MP- Beurre entremets'],
}]

// ⚠️ Comparaison APLATIE, jamais brute : Odoo écrit « MP- Lait UHT » avec une
// espace insécable, et deux noms qui se lisent pareil ne sont pas égaux.
const memeNom = (a, b) => aplatir(a) === aplatir(b)

/** Le mélange auquel appartient cet ingrédient, pour ce gâteau — sinon rien. */
export function melangeDe(gateau, ingredient) {
  const m = MELANGES.find(x => x.gateau.test(String(gateau || ''))
    && x.dedans.some(n => memeNom(n, ingredient)))
  return m ? m.nom : null
}
