import { supabase } from './supabase'

// Liste de fabrication CD* : lue dans Odoo (ordres de fabrication encore à faire),
// la coche « fait » vit dans l'app (table prod_of_faits).

/**
 * Ce qu'il y a à fabriquer : les ordres CD* encore à faire (retards compris),
 * les recettes des préparations (nomenclatures Odoo) et les stocks disponibles.
 * → { ofs, ordres, recettes, stocks, catalogue }
 */
export async function loadFabrication(jours = 60) {
  const r = await fetch(`/api/freezer-list?mode=fabrication&jours=${jours}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const data = await r.json()
  return { ofs: data.ofs || [], ordres: data.ordres || [], recettes: data.recettes || {}, stocks: data.stocks || {}, catalogue: data.catalogue || [] }
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

/** Ce qui manque pour fabriquer ces ordres Odoo (lecture seule, génoise ignorée). */
export async function loadManques(ordres) {
  if (!ordres.length) return []
  const r = await fetch(`/api/freezer-list?mode=manques&ordres=${encodeURIComponent(ordres.join(','))}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).ordres || []
}

/**
 * Valide des ordres de fabrication DANS ODOO (irréversible).
 * `forcer` = passer outre les confirmations d'Odoo (stock insuffisant).
 * Renvoie [{ name, ok, message }].
 */
export async function validerDansOdoo(ordres, forcer, actorId) {
  const r = await fetch('/api/freezer-list?mode=valider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordres, forcer: !!forcer, actorId }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `erreur ${r.status}`)
  return data.resultats || []
}

/** Recette d'une préparation (glaçage, pâte à sucre) + stock des ingrédients, en grammes. */
export async function loadPrepa(quoi) {
  const r = await fetch(`/api/freezer-list?mode=prepa&quoi=${encodeURIComponent(quoi)}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return await r.json()
}

/**
 * Crée et confirme l'ordre de fabrication de la préparation dans Odoo.
 * `colorants` = { identifiant de l'article : grammes } — seuls ceux-là entrent
 * dans l'ordre, les autres couleurs n'y figurent pas du tout.
 */
export async function lancerPrepa(quoi, tournees, colorants, actorId) {
  const r = await fetch(`/api/freezer-list?mode=prepa&quoi=${encodeURIComponent(quoi)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tournees, colorants, actorId }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `erreur ${r.status}`)
  return data
}
