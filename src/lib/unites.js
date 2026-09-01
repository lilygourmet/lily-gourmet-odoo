// Une recette est écrite dans l'unité qui arrange le pâtissier (« 201 g de
// crumble ») alors qu'Odoo compte cet article dans la sienne (« kg »). Sans
// conversion, 201 g devenaient 201 kg : mille fois trop. Le 01/09/2026,
// 90 lignes de recette sur 1 028 étaient dans ce cas.
//
// Toute la chaîne passe par ici — recette, sous-recette, sous-sous-recette —
// pour que les quantités restent homogènes quel que soit l'article.

/** Le poids qu'une unité porte dans son nom : « Tournée (3 kg) » → 3000 (g). */
export function poidsUnite(u) {
  const m = String(u || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i)
  if (!m) return null
  const v = Number(m[1].replace(',', '.'))
  return /kg/i.test(m[2]) ? v * 1000 : v
}

/** Une quantité en grammes, ou null si l'unité n'est pas un poids (pièces). */
export function enGrammes(q, u) {
  const n = Number(q) || 0
  const s = String(u || '').trim()
  if (/^kg$/i.test(s)) return n * 1000
  if (/^(g|gr)$/i.test(s)) return n
  const p = poidsUnite(s)
  return p ? n * p : null
}

/**
 * Une quantité écrite dans l'unité d'une LIGNE de recette, exprimée dans
 * l'unité où Odoo compte l'ARTICLE. Renvoie la quantité inchangée quand il
 * n'y a rien à convertir (article ou ligne comptés en pièces).
 */
export function versUnite(qty, uniteLigne, uniteArticle) {
  const q = Number(qty) || 0
  const cible = String(uniteArticle || '').trim()
  if (!cible) return q
  const g = enGrammes(q, uniteLigne)
  if (g === null) return q            // la ligne se compte en pièces
  const p = poidsUnite(cible)         // unité du genre « Tournée (3 kg) »
  if (p) return g / p
  if (/^kg$/i.test(cible)) return g / 1000
  if (/^(g|gr)$/i.test(cible)) return g
  return q                            // l'article se compte en pièces
}
