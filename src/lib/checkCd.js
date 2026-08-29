import { supabase } from './supabase'

/** Les étages dont le gâteau entier attend encore d'être marqué fait. */
export async function loadEtagesEnAttente(jours = 30) {
  const r = await fetch(`/api/freezer-list?mode=check-cd-liste&jours=${jours}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).etages || []
}

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

/** Les gâteaux déjà récupérés par le client mais pas encore marqués faits dans
 *  Odoo. C'est ce qui reste en plan : soit un étage manque, soit le contrôle
 *  n'a pas été fait. `jours` remonte au plus loin autorisé par le serveur. */
export async function loadEnAttente(jours = 7) {
  const r = await fetch(`/api/freezer-list?mode=parents-pos&jours=${jours}&dry=1`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const d = await r.json()
  return { gateaux: d.parents || [], chaineStricte: d.chaine_stricte === 'active' }
}

/** Le chiffre du badge : les gâteaux déjà partis chez le client et toujours pas
 *  marqués faits dans Odoo. C'est ce qui appelle une action — le travail courant
 *  de contrôle, lui, n'a pas besoin d'un compteur qui clignote. */
export async function compterCheckCd() {
  try {
    const { gateaux } = await loadEnAttente(7)
    return gateaux.length
  } catch { return 0 }
}
