import { supabase } from './supabase'

// ============================================================
// BULLETINS DE PAIE
// 1 page = 1 employé. Stockage : bucket privé 'bulletins', 1 PDF/page.
// Le nom est mémorisé par matricule → on n'étiquette qu'une fois.
// ============================================================

const BUCKET = 'bulletins'

export async function loadBulletins() {
  const { data, error } = await supabase
    .from('bulletins_paie')
    .select('*')
    .order('period', { ascending: false })
    .order('label')
  if (error) throw error
  return data || []
}

// Ajoute une page (1 employé). Réutilise le nom déjà connu pour ce matricule.
export async function addBulletinPage(period, { label: suggestedLabel, matricule, cnss, net }, bytes) {
  let label = suggestedLabel
  if (matricule) {
    const { data: prev } = await supabase
      .from('bulletins_paie')
      .select('label')
      .eq('matricule', matricule)
      .neq('label', '')
      .limit(1)
    if (prev && prev[0]?.label) label = prev[0].label
  }
  label = (label && label.trim()) || matricule || 'À identifier'

  const safe = (matricule || 'page').replace(/[^a-zA-Z0-9_-]/g, '_')
  const path = `${period}/${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.pdf`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: false })
  if (upErr) throw upErr

  const { error } = await supabase
    .from('bulletins_paie')
    .insert({ period, label, matricule: matricule || null, cnss: cnss || null, net_amount: net ?? null, storage_path: path })
  if (error) throw error
}

// Bulletins d'une période donnée (pour alimenter l'onglet Salaires).
export async function loadBulletinsForPeriod(period) {
  const { data, error } = await supabase
    .from('bulletins_paie')
    .select('label, matricule, cnss, net_amount')
    .eq('period', period)
  if (error) throw error
  return data || []
}

// Renomme : par matricule (toutes les pages de l'employé) sinon par id.
export async function relabelBulletin({ matricule, id, label }) {
  const value = label.trim()
  if (!value) return
  if (matricule) {
    const { error } = await supabase.from('bulletins_paie').update({ label: value }).eq('matricule', matricule)
    if (error) throw error
  } else {
    const { error } = await supabase.from('bulletins_paie').update({ label: value }).eq('id', id)
    if (error) throw error
  }
}

export async function getBulletinSignedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) throw error
  return data?.signedUrl || null
}

export async function downloadBulletinBytes(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error) throw error
  return new Uint8Array(await data.arrayBuffer())
}

// Garde seulement les `keep` périodes les plus récentes (supprime fichiers + lignes).
export async function prunePeriods(keep = 3) {
  const { data } = await supabase.from('bulletins_paie').select('period')
  const periods = [...new Set((data || []).map(r => r.period))].sort().reverse()
  for (const p of periods.slice(keep)) {
    await deletePeriod(p)
  }
}

export async function deletePeriod(period) {
  const { data: rows } = await supabase.from('bulletins_paie').select('storage_path').eq('period', period)
  const paths = (rows || []).map(r => r.storage_path)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  await supabase.from('bulletins_paie').delete().eq('period', period)
}
