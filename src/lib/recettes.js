// ============================================================
// LES ESSAIS DU CHEF.
//
// « Le chef veut vérifier les recettes si elles sont bonnes avant de les
// faire […] juste il va changer un ingrédient ou une quantité pour lui sortir
// la recette » (Layla, 2026-09-23).
//
// ⚠️ RIEN N'EST ENREGISTRÉ. Ces changements ne vivent que dans son écran, le
// temps qu'il regarde : Odoo garde sa recette, l'atelier fabrique avec elle.
// C'est la règle que Layla a choisie, et c'est ce qui rend l'écran sans danger.
//
// Un essai se range sous le nom D'ORIGINE de l'ingrédient — c'est lui la clé,
// même quand l'essai le remplace par un autre nom. Sinon, renommer une fois
// ferait perdre la trace de ce qu'on avait changé.
// ============================================================

const nombre = v => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * La recette telle que le chef la regarde : la vraie, plus ses essais.
 *
 * `essais` : { [nom d'origine]: { nom?: string, qty?: number } }
 *
 * Une ligne touchée porte `essai: { produit, besoin }` — ce qu'elle valait
 * AVANT. L'écran s'en sert pour montrer la vraie valeur à côté : sans ça, le
 * chef ne saurait plus ce qu'il a changé, et c'est précisément la question
 * qu'il vient se poser.
 */
export function recetteEssai(lignes, essais = {}) {
  return (lignes || []).map(l => {
    const e = essais[l.produit]
    if (!e) return l
    const nom = String(e.nom ?? '').trim() || l.produit
    const q = nombre(e.qty)
    const besoin = q === null ? l.besoin : q
    if (nom === l.produit && besoin === l.besoin) return l
    return { ...l, produit: nom, besoin, essai: { produit: l.produit, besoin: l.besoin } }
  })
}

/** Combien de lignes ne sont plus celles d'Odoo. Zéro = on lit la vraie recette. */
export function nbEssais(lignes, essais = {}) {
  return recetteEssai(lignes, essais).filter(l => l.essai).length
}
