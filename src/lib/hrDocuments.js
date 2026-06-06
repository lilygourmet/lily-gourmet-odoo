import { supabase } from './supabase'

// Documents d'un employé (CIN, contrat, diplôme…). Fichiers dans le bucket
// 'justificatifs' (déjà existant), métadonnées dans la table employe_documents.
const BUCKET = 'justificatifs'
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

/** Liste les documents d'un employé. Résilient : [] si la table n'existe pas encore. */
export async function listEmployeeDocuments(employeId) {
  if (!employeId) return []
  const { data, error } = await supabase
    .from('employe_documents')
    .select('id, employe_id, type, storage_path, original_filename, file_size, created_at')
    .eq('employe_id', employeId)
    .order('created_at', { ascending: false })
  if (error) return []
  return data || []
}

/** Upload un document + crée la ligne en base. Retourne la ligne créée. */
export async function uploadEmployeeDocument(file, employeId, type, userId) {
  if (!file) throw new Error('Aucun fichier')
  if (file.size > MAX_SIZE) throw new Error('Fichier trop volumineux (max 10 MB)')
  const ts = Date.now()
  const clean = (file.name || 'document').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `employe-${employeId}/${ts}_${clean}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
  if (upErr) throw upErr
  const { data, error } = await supabase
    .from('employe_documents')
    .insert({
      employe_id: employeId,
      type: type || 'Autre',
      storage_path: path,
      original_filename: file.name || clean,
      file_size: file.size,
      uploaded_by: userId || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/** Supprime un document (ligne + fichier). */
export async function deleteEmployeeDocument(id, storagePath) {
  if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath])
  const { error } = await supabase.from('employe_documents').delete().eq('id', id)
  if (error) throw error
}

/** URL signée (1h) pour ouvrir/télécharger un document. */
export async function getEmployeeDocumentUrl(storagePath) {
  if (!storagePath) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600)
  if (error) return null
  return data?.signedUrl || null
}
