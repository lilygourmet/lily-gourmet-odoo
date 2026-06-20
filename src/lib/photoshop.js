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

/** Liste TOUTES les images (pagination par 1000). Renvoie {id, theme, nom, path, url}. */
export async function listPhotos({ theme = null, search = '' } = {}) {
  let cols = 'id, theme, nom, path, width, height, last_w, last_h'
  const all = []
  for (let from = 0; from < 30000;) {
    let q = supabase.from('ps_photos').select(cols).order('created_at', { ascending: false }).range(from, from + 999)
    if (theme) q = q.eq('theme', theme)
    if (search) { const s = search.replace(/[,()%]/g, ' ').trim(); if (s) q = q.or(`nom.ilike.%${s}%,theme.ilike.%${s}%`) }
    const { data, error } = await q
    if (error) {
      if (cols.includes('last_w') && /last_w|last_h/.test(error.message || '')) { cols = 'id, theme, nom, path, width, height'; continue }   // repli si colonnes absentes
      break
    }
    all.push(...(data || [])); if (!data || data.length < 1000) break; from += 1000
  }
  return all.map(r => ({ ...r, url: photoUrl(r.path) }))
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

/** Remplace l'image stockée par une nouvelle (retouche gardée). Renvoie {path, url}. */
export async function replacePhotoImage(id, blob, theme) {
  const path = `${slug(theme || '_retouches')}/${id}_${Date.now()}.png`
  const { error: up } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/png', upsert: true })
  if (up) throw up
  const { error } = await supabase.from('ps_photos').update({ path }).eq('id', id)
  if (error) throw error
  return { path, url: photoUrl(path) }
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

const TRASH = '🗑️ Poubelle'
/** Met une image à la corbeille (« Poubelle »), garde la catégorie d'origine, ne garde que les 5 dernières. */
export async function trashPhoto(id) {
  const { data: row } = await supabase.from('ps_photos').select('path, nom, theme').eq('id', id).maybeSingle()
  if (!row) return
  await supabase.from('ps_photos').delete().eq('id', id)
  let { error } = await supabase.from('ps_photos').insert({ theme: TRASH, nom: row.nom, path: row.path, prev_theme: row.theme })
  if (error && /prev_theme/.test(error.message || '')) await supabase.from('ps_photos').insert({ theme: TRASH, nom: row.nom, path: row.path })   // repli si colonne absente
  const { data: trash } = await supabase.from('ps_photos').select('id, path').eq('theme', TRASH).order('created_at', { ascending: false })
  const old = (trash || []).slice(5)
  if (old.length) { await supabase.storage.from('photoshop').remove(old.map(r => r.path)); await supabase.from('ps_photos').delete().in('id', old.map(r => r.id)) }
}
/** Restaure une image de la corbeille vers sa catégorie d'origine. Renvoie la catégorie. */
export async function restorePhoto(id) {
  let prev = 'Divers'
  const r = await supabase.from('ps_photos').select('prev_theme').eq('id', id).maybeSingle()
  if (!r.error && r.data && r.data.prev_theme) prev = r.data.prev_theme
  const { error } = await supabase.from('ps_photos').update({ theme: prev }).eq('id', id)
  if (error) throw error
  return prev
}

/** Supprime une image (fichier + ligne). */
export async function deletePhoto(id, path) {
  if (path) await supabase.storage.from(BUCKET).remove([path])
  const { error } = await supabase.from('ps_photos').delete().eq('id', id)
  if (error) throw error
}
