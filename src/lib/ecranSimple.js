// ============================================================
// L'écran simplifié de Fabrication Annexe 2 : gros chiffres, pas de mot
// « tournée », le strict nécessaire à l'écran. Pensé pour des gens qui lisent
// peu — c'est l'atelier qui s'en sert, pas le bureau. (Layla, 2026-09-10.)
//
// Le choix vit dans la TABLETTE, pas dans le compte : une tablette peut
// essayer pendant qu'une autre garde l'ancien écran, et revenir en arrière
// tient en un appui. Rien n'est remplacé tant que Layla n'a pas tranché.
// ============================================================

const CLE = 'lg:annexe2-simple'

/** Cette tablette est-elle passée à l'écran simplifié ? */
export function ecranSimple() {
  try { return localStorage.getItem(CLE) === '1' } catch { return false }
}

/** Bascule d'un écran à l'autre, et rend le nouvel état. */
export function basculerEcran() {
  const neuf = !ecranSimple()
  try { localStorage.setItem(CLE, neuf ? '1' : '0') } catch { /* navigation privée */ }
  return neuf
}

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
 * Le nom débarrassé de ce qui ne se lit pas : « SM- Tiramisu 15cm » devient
 * « Tiramisu 15cm ». Les préfixes d'Odoo ne veulent rien dire à l'atelier.
 */
export const propre = nom => String(nom || '')
  .replace(/^\s*(\[[^\]]*\]\s*)?(SM|MP|MI|GS|RA|GM|CD|E|F|V)\s*[-./]?\s*/i, '')
  .replace(/\s{2,}/g, ' ').trim()
