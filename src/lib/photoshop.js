import { supabase } from './supabase'

// Bibliothèque d'images du Studio photos.
// Fichiers dans le bucket 'photoshop' (public), métadonnées dans la table ps_photos.
const BUCKET = 'photoshop'

const clean = s => String(s || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60)
const slug = s => String(s || '_divers').replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || '_divers'

/** URL publique d'une image du bucket. */
export function photoUrl(path) {
  if (!path) return ''
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Liste des thèmes (dossiers) avec leur nombre d'images. */
export async function listThemes() {
  const { data, error } = await supabase.from('ps_photos').select('theme')
  if (error) return []
  const counts = {}
  for (const r of (data || [])) { const t = r.theme || '_divers'; counts[t] = (counts[t] || 0) + 1 }
  return Object.entries(counts).map(([theme, n]) => ({ theme, n })).sort((a, b) => a.theme.localeCompare(b.theme))
}

/** Liste les images (filtre thème + recherche nom). Renvoie {id, theme, nom, path, url}. */
export async function listPhotos({ theme = null, search = '', limit = 600 } = {}) {
  const build = (cols) => {
    let q = supabase.from('ps_photos').select(cols).order('created_at', { ascending: false }).limit(limit)
    if (theme) q = q.eq('theme', theme)
    if (search) { const s = search.replace(/[,()%]/g, ' ').trim(); if (s) q = q.or(`nom.ilike.%${s}%,theme.ilike.%${s}%`) }
    return q
  }
  let { data, error } = await build('id, theme, nom, path, width, height, last_w, last_h')
  if (error && /last_w|last_h/.test(error.message || '')) ({ data, error } = await build('id, theme, nom, path, width, height'))   // repli si SQL pas encore lancé
  if (error) return []
  return (data || []).map(r => ({ ...r, url: photoUrl(r.path) }))
}

/** Upload une image (File ou Blob) + crée la ligne. Renvoie {id, theme, nom, path, url}. */
export async function uploadPhoto(fileOrBlob, { theme = null, nom = null, createdBy = null } = {}) {
  if (!fileOrBlob) throw new Error('Aucun fichier')
  const baseName = nom || (fileOrBlob.name ? fileOrBlob.name.replace(/\.[^.]+$/, '') : 'photo')
  const ts = Date.now()
  const path = `${slug(theme || '_imports')}/${ts}_${clean(baseName)}.png`
  const { error: upErr } = await supabase.storage.from(BUCKET)
    .upload(path, fileOrBlob, { contentType: fileOrBlob.type || 'image/png', upsert: false })
  if (upErr) throw upErr
  const { data, error } = await supabase.from('ps_photos')
    .insert({ theme: theme || '_imports', nom: baseName, path, created_by: createdBy || null })
    .select('id, theme, nom, path').single()
  if (error) throw error
  return { ...data, url: photoUrl(data.path) }
}

/** Mémorise la dernière taille (cm) utilisée pour cette image. Silencieux si la colonne n'existe pas. */
export async function setPhotoSize(id, w, h) {
  const { error } = await supabase.from('ps_photos').update({ last_w: w, last_h: h }).eq('id', id)
  if (error && !/last_w|last_h/.test(error.message || '')) throw error
}

/** Renomme une image. */
export async function renamePhoto(id, nom) {
  const { error } = await supabase.from('ps_photos').update({ nom: String(nom || '').trim().slice(0, 80) }).eq('id', id)
  if (error) throw error
}

/** Supprime une image (fichier + ligne). */
export async function deletePhoto(id, path) {
  if (path) await supabase.storage.from(BUCKET).remove([path])
  const { error } = await supabase.from('ps_photos').delete().eq('id', id)
  if (error) throw error
}
