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

export async function savePointeuseUser(sn, pin, employe_odoo_id, employe_nom) {
  const { error } = await supabase.from('pointeuse_users')
    .upsert({ sn, pin: String(pin).trim(), employe_odoo_id, employe_nom }, { onConflict: 'sn,pin' })
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

// Liste des employés Odoo (id + nom) pour le menu déroulant.
export async function loadOdooEmployees() {
  const resp = await fetch('/api/pointage-api?action=list-employees')
  if (!resp.ok) throw new Error('HTTP ' + resp.status)
  const j = await resp.json()
  return (j.employees || []).map(e => ({ id: e.id, name: e.name })).sort((a, b) => a.name.localeCompare(b.name))
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
