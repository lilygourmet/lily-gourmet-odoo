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

/** Grammes et pièces en entier, les kilos en grammes sous le kilo. */
export const qte = (v, u) => {
  const n = Number(v) || 0
  if (!/^kg$/i.test(String(u || '').trim())) return `${nb(Math.round(n))} ${u || ''}`.trim()
  return n < 1 ? `${nb(Math.round(n * 1000))} g` : `${nb(Math.round(n * 100) / 100)} kg`
}

/**
 * Le nom débarrassé de ce qui ne se lit pas : « SM- Tiramisu 15cm » devient
 * « Tiramisu 15cm ». Les préfixes d'Odoo ne veulent rien dire à l'atelier.
 */
export const propre = nom => String(nom || '')
  .replace(/^\s*(\[[^\]]*\]\s*)?(SM|MP|MI|GS|RA|GM|CD|E|F|V)\s*[-./]?\s*/i, '')
  .replace(/\s{2,}/g, ' ').trim()
