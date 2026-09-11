// ============================================================
// CE QU'ON A DÉCIDÉ DE FAIRE — et qui ne bouge plus tout seul.
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
// ⚠️ Il ne CHANGE PAS DE JOUR. « Si c'est le lendemain ou une semaine après,
// ça restera toujours le 25 » (Layla, 2026-09-11) : une recette commencée le
// soir se finit le lendemain, et le chiffre doit traverser la nuit. Il ne part
// que de deux façons : « Réinitialiser », ou l'article déclaré jusqu'au bout.
// ============================================================

const CLE = 'lg:annexe2-prevu'

const lire = () => {
  try { return JSON.parse(localStorage.getItem(CLE) || '{}') } catch { return {} }
}
const ecrire = par => {
  try { localStorage.setItem(CLE, JSON.stringify({ par })) } catch { /* navigation privée */ }
}

/** Tous les chiffres retenus : { produit: { q, fige } }. */
export function prevusGardes() {
  // ⚠️ L'ancien format rangeait les prévus sous une date (`{ jour, par }`).
  // On les relit tels quels : un chiffre décidé hier vaut toujours aujourd'hui.
  const d = lire()
  return d.par || {}
}

/** Poser (ou corriger) le chiffre d'un article. Il n'est pas encore figé :
 *  on est sur sa fiche, on peut se reprendre. */
export function poserPrevu(produit, q) {
  const par = { ...prevusGardes() }
  par[produit] = { q, fige: par[produit]?.fige || false }
  ecrire(par)
  return par
}

/** Figer : on quitte la fiche, le travail commence. */
export function figerPrevu(produit) {
  const par = { ...prevusGardes() }
  if (!par[produit]) return par      // rien n'a été décidé : rien à figer
  par[produit] = { ...par[produit], fige: true }
  ecrire(par)
  return par
}

/** « Réinitialiser », ou l'article déclaré : le chiffre redevient libre. */
export function oublierPrevu(produit) {
  const par = { ...prevusGardes() }
  delete par[produit]
  ecrire(par)
  return par
}
