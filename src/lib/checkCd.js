import { supabase } from './supabase'

/** L'état de chaque gâteau sorti : son étage « N cm CD* » est-il en stock ? */
export async function loadEtatsCheckCd(moIds) {
  if (!moIds.length) return {}
  const r = await fetch(`/api/freezer-list?mode=check-cd&mos=${moIds.join(',')}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const { etats } = await r.json()
  const parId = {}
  for (const e of etats || []) parId[e.mo_id] = e
  return parId
}

/** Envoie les gâteaux sélectionnés en validation dans Odoo. */
export async function envoyerEnValidation(moIds, actorId) {
  const r = await fetch('/api/freezer-list?mode=check-cd-valider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mos: moIds, actorId }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `erreur ${r.status}`)
  const resultats = data.resultats || []
  // On garde la trace de l'envoi, réussi ou non : c'est ce qui permet de
  // retrouver le lendemain ce qu'Odoo a refusé.
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

/** Ce qui a déjà été envoyé (pour ne pas le reproposer). */
export async function loadDejaEnvoyes() {
  const { data, error } = await supabase.from('check_cd_done').select('odoo_mo_id, odoo_ok, odoo_msg, checked_at')
  if (error) throw error
  const parId = {}
  for (const x of data || []) parId[x.odoo_mo_id] = x
  return parId
}
