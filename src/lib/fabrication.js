import { supabase } from './supabase'
import { estModeTest } from './modeTest'

// Odoo répond en 1 à 2 secondes : on réaffiche d'abord ce qu'on avait la
// dernière fois, puis on remplace dès que la vraie réponse arrive. L'écran
// s'ouvre instantanément au lieu de rester vide.
export function dernierEcran(cle) {
  try { const v = sessionStorage.getItem('ecran:' + cle); return v ? JSON.parse(v) : null } catch { return null }
}
export function garderEcran(cle, data) {
  try { sessionStorage.setItem('ecran:' + cle, JSON.stringify(data)) } catch { /* quota plein : tant pis */ }
}

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

/** Juste les ordres Odoo encore ouverts (rapide : une seule question à Odoo). */
export async function loadOrdres() {
  const r = await fetch('/api/freezer-list?mode=ordres')
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).ordres || []
}

/** Les OF déjà cochés « fait » (clé = nom de l'OF). */
export async function loadFaits() {
  const { data, error } = await supabase.from('prod_of_faits').select('mo_name, produit, qty, ordres, fait_par, fait_le')
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
    ordres: of.ordres || null,               // les ordres Odoo que cette coche couvre
    fait_par: userId || null,
    fait_le: new Date().toISOString(),
  }, { onConflict: 'mo_name' })
  if (error) throw error
}

/**
 * Demande à Odoo de réserver (ou de libérer) les composants de ces ordres.
 * Ça ne valide rien : ça empêche seulement qu'un autre ordre compte sur le
 * même stock. Silencieux : un échec ne doit pas gêner l'équipe.
 */
export async function reserverOrdres(ordres, on) {
  if (!ordres.length) return
  try {
    await fetch('/api/freezer-list?mode=reserver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordres, on: !!on, test: estModeTest() }),
    })
  } catch { /* la réservation est un confort, pas une condition */ }
}

/**
 * Crée dans Odoo l'ordre de fabrication d'une préparation qu'Odoo ne demandait
 * pas (crème au beurre nature…). Renvoie { name } ou { error }.
 */
export async function creerOfPrepa(produit, qty, actorId, parents = []) {
  const r = await fetch('/api/freezer-list?mode=creer-of', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ produit, qty, actorId, parents, test: estModeTest() }),
  })
  return await r.json()
}

/**
 * Annule dans Odoo les ordres d'une coche qu'on retire — y compris ceux venus
 * d'Odoo, tant qu'ils ne sont pas validés. Renvoie les noms annulés.
 */
export async function annulerOfPrepa(ordres) {
  if (!ordres || !ordres.length) return null
  try {
    const r = await fetch('/api/freezer-list?mode=annuler-of', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordres, test: estModeTest() }),
    })
    return await r.json()
  } catch { return null }
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
    body: JSON.stringify({ ordres, forcer: !!forcer, actorId, test: estModeTest() }),
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
    body: JSON.stringify({ tournees, colorants, actorId, test: estModeTest() }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `erreur ${r.status}`)
  return data
}
