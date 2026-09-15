// ============================================================
// LES GÂTEAUX À GANACHER.
//
// « CD- Ganache cakedesign » est une ligne de commande à part, avec son propre
// ordre chez Odoo, et aucun écran ne la montrait : la commande S47031, livrée
// le 5 septembre, avait encore sa ganache « confirmée » dix jours après.
//
// Les règles viennent de Layla (2026-09-15) :
//   • c'est CELUI QUI MONTE le gâteau qui ganache — donc l'écran est
//     Fabrication CD, entre « stock » et « commande » ;
//   • la ligne apparaît DÈS QUE LA COMMANDE EST DÉCLARÉE : tant que le gâteau
//     reste à faire, la ganache n'a rien à dire ;
//   • « c'est fait » valide l'ordre chez Odoo, comme partout ailleurs.
// ============================================================

/**
 * Faut-il montrer cette ganache maintenant ?
 *
 * Non tant qu'un gâteau de la même commande attend encore d'être fait : on
 * ganache après avoir monté. Dès qu'ils sont tous déclarés — ou qu'aucun n'est
 * à l'écran, parce qu'ils ont été faits les jours d'avant — la ganache passe.
 */
export function ganacheAFaire(g, gateaux, faits) {
  const dela = (gateaux || []).filter(o => o.scode && o.scode === g.commande)
  return !dela.some(o => !faits[o.name])
}

/**
 * Les ganaches à afficher, rangées par jour de livraison.
 *
 * Rend `[[jour, [ganaches]]]`, du plus proche au plus lointain — même forme que
 * l'historique de l'annexe, pour que les deux écrans se lisent pareil.
 */
export function ganachesParJour(ganaches, gateaux, faits) {
  const jours = new Map()
  for (const g of (ganaches || []).filter(x => ganacheAFaire(x, gateaux, faits))) {
    const j = String(g.quand || '').slice(0, 10)
    if (!jours.has(j)) jours.set(j, [])
    jours.get(j).push(g)
  }
  return [...jours.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}

/**
 * Le gâteau, en une ligne lisible : « 15 cm · Praliné amandes caramélisées ».
 *
 * Vide quand aucun gâteau de la commande ne porte ce nombre de personnes —
 * l'écran le dit alors en rouge, au lieu de taire la ganache.
 */
export function ditLeGateau(g) {
  const bouts = [g?.taille, g?.parfum].filter(Boolean)
  return bouts.join(' · ')
}

/** « 480 g », ou « 8 × 480 g » quand la commande en porte plusieurs. */
export function ditLePoids(g) {
  const gr = Math.round(Number(g?.grammes) || 0)
  if (!(gr > 0)) return ''
  const n = Math.round(Number(g?.qty) || 1)
  const un = gr % n === 0 ? gr / n : gr
  return n > 1 && gr % n === 0
    ? `${n} × ${un.toLocaleString('fr-FR')} g`
    : `${gr.toLocaleString('fr-FR')} g`
}
