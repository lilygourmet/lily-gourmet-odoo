// ============================================================
// CE QU'ON A DÉCIDÉ DE FAIRE — et qui ne doit plus bouger tout seul.
//
// « On peut mettre que ce soit 25, et ça reste toujours 25. Si on décide de
// changer d'avis, il y a un bouton Réinitialiser » (Layla, 2026-09-11).
//
// POURQUOI c'est important : ce chiffre commande la RECETTE — donc la crème
// qu'on prépare. Le chiffre de la fin, lui, dit seulement ce qui est sorti.
// Une pâtissière ne pense qu'à un seul nombre, celui qu'elle a sorti : elle
// remettait 23 au début aussi, la crème se recalculait pour 23, et Odoo
// croyait qu'il restait de la crème au frigo alors qu'elle avait tout mis.
//
// Le prévu vit donc dans la TABLETTE, pour la journée : on part faire son
// travail, on revient, il est toujours là. Il change de jour tout seul.
// ============================================================

const CLE = 'lg:annexe2-prevu'

const lire = () => {
  try { return JSON.parse(localStorage.getItem(CLE) || '{}') } catch { return {} }
}
const ecrire = d => {
  try { localStorage.setItem(CLE, JSON.stringify(d)) } catch { /* navigation privée */ }
}

/** Les prévus du jour : { produit: { q, fige } }. Vide si on a changé de jour. */
export function prevusDuJour(jour) {
  const d = lire()
  return d.jour === jour ? (d.par || {}) : {}
}

/** Poser (ou corriger) le prévu d'un article. Il n'est pas figé tant qu'on
 *  est encore sur sa fiche — on le règle, on peut se reprendre. */
export function poserPrevu(jour, produit, q) {
  const par = { ...prevusDuJour(jour) }
  par[produit] = { q, fige: par[produit]?.fige || false }
  ecrire({ jour, par })
  return par
}

/** Figer le prévu : on quitte la fiche, le travail commence. */
export function figerPrevu(jour, produit) {
  const par = { ...prevusDuJour(jour) }
  if (!par[produit]) return par
  par[produit] = { ...par[produit], fige: true }
  ecrire({ jour, par })
  return par
}

/** « Réinitialiser » : on change d'avis, le chiffre redevient libre. */
export function oublierPrevu(jour, produit) {
  const par = { ...prevusDuJour(jour) }
  delete par[produit]
  ecrire({ jour, par })
  return par
}
