import { supabase } from './supabase'

// Liste de fabrication CD* : lue dans Odoo (ordres de fabrication encore à faire),
// la coche « fait » vit dans l'app (table prod_of_faits).

/**
 * Ce qu'il y a à fabriquer : les ordres CD* encore à faire (retards compris),
 * les recettes des préparations (nomenclatures Odoo) et les stocks disponibles.
 * → { ofs, recettes, stocks, catalogue }
 */
export async function loadFabrication(jours = 60) {
  const r = await fetch(`/api/freezer-list?mode=fabrication&jours=${jours}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const data = await r.json()
  return { ofs: data.ofs || [], recettes: data.recettes || {}, stocks: data.stocks || {}, catalogue: data.catalogue || [] }
}

/** Les OF déjà cochés « fait » (clé = nom de l'OF). */
export async function loadFaits() {
  const { data, error } = await supabase.from('prod_of_faits').select('mo_name, fait_par, fait_le')
  if (error) throw error
  const map = {}
  for (const f of data || []) map[f.mo_name] = f
  return map
}

/** Coche / décoche un OF. `of` = objet renvoyé par loadFabrication. */
export async function setFait(of, on, userId) {
  if (!on) {
    const { error } = await supabase.from('prod_of_faits').delete().eq('mo_name', of.name)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('prod_of_faits').upsert({
    mo_name: of.name,
    mo_id: of.id,
    produit: of.produit,
    qty: of.qty,
    jour: (of.quand || '').slice(0, 10) || null,
    fait_par: userId || null,
    fait_le: new Date().toISOString(),
  }, { onConflict: 'mo_name' })
  if (error) throw error
}
