import { supabase } from './supabase'

// ============================================================
// BULLETINS DE PAIE
// 1 page = 1 employé. Stockage : bucket privé 'bulletins', 1 PDF/page.
// Le nom est mémorisé par matricule → on n'étiquette qu'une fois.
// ============================================================

const BUCKET = 'bulletins'

// Les deux employeurs. Le comptable envoie un PDF par société ; les codes sont
// ceux de la table `societes`.
export const SOCIETES = [
  { value: 'LN', label: 'L&N Gourmet' },
  { value: 'LG', label: 'LG Traiteur' },
]
export const nomSociete = code => SOCIETES.find(s => s.value === code)?.label || null

export async function loadBulletins() {
  const { data, error } = await supabase
    .from('bulletins_paie')
    .select('*')
    .order('period', { ascending: false })
    .order('label')
  if (error) throw error
  return data || []
}

// Un employé = un matricule DANS SA SOCIÉTÉ : les deux sociétés peuvent utiliser
// les mêmes numéros, il ne faut jamais confondre leurs bulletins.
const parEmploye = (q, matricule, societe) => {
  const r = q.eq('matricule', matricule)
  return societe ? r.eq('societe', societe) : r.is('societe', null)
}

// Ajoute une page (1 employé). Réutilise le nom déjà connu pour ce matricule.
export async function addBulletinPage(period, { label: suggestedLabel, matricule, cnss, net, societe }, bytes) {
  let label = suggestedLabel
  if (matricule) {
    const { data: prev } = await parEmploye(
      supabase.from('bulletins_paie').select('label'), matricule, societe)
      .neq('label', '')
      .limit(1)
    if (prev && prev[0]?.label) label = prev[0].label
  }
  label = (label && label.trim()) || matricule || 'À identifier'

  // Anti-doublon : si ce mois existe déjà pour cet employé (ré-import du même PDF),
  // on supprime l'ancien (fichier + ligne) avant d'ajouter — sinon le mois apparaît en double.
  if (matricule) {
    const { data: dups } = await parEmploye(
      supabase.from('bulletins_paie').select('storage_path').eq('period', period), matricule, societe)
    const paths = (dups || []).map(d => d.storage_path).filter(Boolean)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
    if (dups && dups.length) {
      await parEmploye(
        supabase.from('bulletins_paie').delete().eq('period', period), matricule, societe)
    }
  }

  const safe = (matricule || 'page').replace(/[^a-zA-Z0-9_-]/g, '_')
  const path = `${period}/${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.pdf`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: false })
  if (upErr) throw upErr

  const { error } = await supabase
    .from('bulletins_paie')
    .insert({ period, label, matricule: matricule || null, cnss: cnss || null, net_amount: net ?? null, storage_path: path, societe: societe || null })
  if (error) throw error
}

// Bulletins d'une période donnée (pour alimenter l'onglet Salaires).
export async function loadBulletinsForPeriod(period) {
  const { data, error } = await supabase
    .from('bulletins_paie')
    .select('label, matricule, cnss, net_amount, societe')
    .eq('period', period)
  if (error) throw error
  return data || []
}

// Renomme : par matricule (toutes les pages de l'employé) sinon par id.
export async function relabelBulletin({ matricule, societe, id, label }) {
  const value = label.trim()
  if (!value) return
  if (matricule) {
    const { error } = await parEmploye(
      supabase.from('bulletins_paie').update({ label: value }), matricule, societe)
    if (error) throw error
  } else {
    const { error } = await supabase.from('bulletins_paie').update({ label: value }).eq('id', id)
    if (error) throw error
  }
}

// La société n'a pas été reconnue dans le PDF : Layla la corrige à la main.
export async function setBulletinSociete(ids, societe) {
  const { error } = await supabase.from('bulletins_paie').update({ societe }).in('id', ids)
  if (error) throw error
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
