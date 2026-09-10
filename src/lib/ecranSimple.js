// ============================================================
// Comment l'écran de Fabrication Annexe 2 écrit les nombres et les noms :
// gros chiffres, grammes partout, noms débarrassés des préfixes d'Odoo. Pensé
// pour des gens qui lisent peu — c'est l'atelier qui s'en sert, pas le bureau.
// (Layla, 2026-09-10.)
// ============================================================

/** Un nombre comme on l'écrit en français : 2 800, 1,5. */
export const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })

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
  return `${nb(Math.round(n))} ${kg ? 'g' : (u || '')}`.trim()
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
export const propre = nom => String(nom || '')
  .replace(/^\s*(\[[^\]]*\]\s*)?(SM|MP|MI|GS|RA|GM|CD|E|F|V)\s*[-./]?\s*/i, '')
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

const regleAtelier = nom => REGLES_ATELIER.find(r => r.quand.test(String(nom || '')))

/** Le nom sous lequel l'atelier connaît l'ingrédient. */
export const nomAtelier = nom => regleAtelier(nom)?.nom || propre(nom)

/** Par combien multiplier ce qu'Odoo compte pour obtenir ce qu'on pèse. */
export const facteurAtelier = nom => regleAtelier(nom)?.facteur || 1
