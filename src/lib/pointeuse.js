// Correspondance « machine + numéro ↔ employé Odoo » + noms de machines + journal des pointages.
import { supabase } from './supabase'

// Machines détectées = machines nommées + machines vues dans les pointages reçus.
export async function loadMachines() {
  const [{ data: devs }, { data: punches }] = await Promise.all([
    supabase.from('pointeuse_devices').select('*'),
    supabase.from('pointeuse_punches').select('sn').limit(2000),
  ])
  const names = new Map((devs || []).map(d => [d.sn, d.nom]))
  const sns = new Set([
    ...(devs || []).map(d => d.sn),
    ...(punches || []).map(p => p.sn).filter(Boolean),
  ])
  return [...sns].sort().map(sn => ({ sn, nom: names.get(sn) || '' }))
}

export async function saveMachineName(sn, nom) {
  const { error } = await supabase.from('pointeuse_devices').upsert({ sn, nom }, { onConflict: 'sn' })
  if (error) throw error
}

export async function loadPointeuseMapping() {
  const { data, error } = await supabase.from('pointeuse_users').select('*').order('sn').order('pin')
  if (error) throw error
  return data || []
}

// ⚠️ `employe_odoo_id` porte mal son nom : depuis que la liste vient de l'app,
// on y range l'id de l'employé de l'APP (la colonne est NOT NULL, on doit la
// remplir). Le rattachement d'un badge à une personne se fait sur `employe_nom`.
export async function savePointeuseUser(sn, pin, employe_id, employe_nom) {
  const { error } = await supabase.from('pointeuse_users')
    .upsert({ sn, pin: String(pin).trim(), employe_odoo_id: employe_id, employe_nom }, { onConflict: 'sn,pin' })
  if (error) throw error
}

export async function deletePointeuseUser(sn, pin) {
  const { error } = await supabase.from('pointeuse_users').delete().eq('sn', sn).eq('pin', String(pin))
  if (error) throw error
}

export async function loadRecentPunches(limit = 50) {
  const { data, error } = await supabase.from('pointeuse_punches')
    .select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data || []
}

// Liste des employés de l'APP pour le menu déroulant des correspondances.
//
// Avant, cette liste venait d'Odoo : une personne créée dans l'app mais pas dans
// Odoo était introuvable, donc impossible à relier à son numéro de pointeuse —
// ses badges s'empilaient en « non attribués » (vécu avec deux embauches d'août
// 2026). Or le pointage n'écrit plus dans Odoo : il rattache les badges aux
// employés de l'APP, en comparant les NOMS. La liste doit donc venir de l'app.
export async function loadEmployesApp() {
  const { data, error } = await supabase.from('employes')
    .select('id, nom').eq('actif', true).eq('fantome', false).order('nom')
  if (error) throw error
  return (data || []).map(e => ({ id: e.id, name: e.nom }))
}

// Relance l'envoi vers Odoo des pointages en attente / non reliés / en erreur
// (utile après avoir rempli la correspondance).
export async function flushPointeuseToOdoo() {
  const resp = await fetch('/api/pointage-api?action=push-pointeuse', { method: 'POST' })
  if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || 'HTTP ' + resp.status) }
  return resp.json()
}

// Nom court d'une machine pour l'affichage : son nom, sinon les 4 derniers chiffres du SN.
export function machineLabel(sn, machines) {
  const m = (machines || []).find(x => x.sn === sn)
  if (m?.nom) return m.nom
  return sn ? '…' + String(sn).slice(-4) : '?'
}
