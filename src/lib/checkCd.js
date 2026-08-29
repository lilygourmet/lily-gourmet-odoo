import { supabase } from './supabase'

/** Les gâteaux entiers encore à valider, avec leurs étages et ce qui manque. */
export async function loadParentsAValider(jours = 30) {
  const r = await fetch(`/api/freezer-list?mode=check-cd-parents&jours=${jours}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).parents || []
}

/** Valide dans Odoo les gâteaux cochés. Les étages sont revérifiés avant. */
export async function validerParents(moIds, actorId) {
  const r = await fetch('/api/freezer-list?mode=check-cd-parents-valider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mos: moIds, actorId }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `erreur ${r.status}`)
  const resultats = data.resultats || []
  // On garde la trace de chaque envoi, réussi ou non : c'est ce qui permet de
  // retrouver ensuite ce qu'Odoo a refusé, et qui a validé quoi.
  if (resultats.length) {
    await supabase.from('check_cd_done').upsert(resultats.map(x => ({
      odoo_mo_id: x.mo_id,
      odoo_mo_name: x.mo_name,
      checked_by: actorId || null,
      checked_at: new Date().toISOString(),
      odoo_ok: !!x.ok,
      odoo_msg: x.ok ? null : (x.message || null),
    })), { onConflict: 'odoo_mo_id' })
  }
  return resultats
}

/** Ce qui a déjà été envoyé (pour afficher les refus d'Odoo). */
export async function loadDejaEnvoyes() {
  const { data, error } = await supabase.from('check_cd_done').select('odoo_mo_id, odoo_ok, odoo_msg, checked_at')
  if (error) throw error
  const parId = {}
  for (const x of data || []) parId[x.odoo_mo_id] = x
  return parId
}
