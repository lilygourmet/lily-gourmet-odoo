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
  let cols = 'id, theme, nom, path, width, height, last_w, last_h, created_at'
  const all = []
  for (let from = 0; from < 30000;) {
    let q = supabase.from('ps_photos').select(cols).order('created_at', { ascending: false }).range(from, from + 999)
    if (theme) q = q.eq('theme', theme)
    if (search) { const s = search.replace(/[,()%]/g, ' ').trim(); if (s) q = q.or(`nom.ilike.%${s}%,theme.ilike.%${s}%`) }
    const { data, error } = await q
    if (error) {
      if (cols.includes('last_w') && /last_w|last_h/.test(error.message || '')) { cols = 'id, theme, nom, path, width, height, created_at'; continue }   // repli si colonnes absentes
      break
    }
    all.push(...(data || [])); if (!data || data.length < 1000) break; from += 1000
  }
  return all.map(r => ({ ...r, url: photoUrl(r.path) }))
}

/** Photos ajoutées APRÈS sinceIso (chargement incrémental « que les nouvelles »). */
export async function listNewPhotos(sinceIso) {
  if (!sinceIso) return []
  let cols = 'id, theme, nom, path, width, height, last_w, last_h, created_at'
  const all = []
  for (let from = 0; from < 30000;) {
    const q = supabase.from('ps_photos').select(cols).gt('created_at', sinceIso).order('created_at', { ascending: false }).range(from, from + 999)
    const { data, error } = await q
    if (error) {
      if (cols.includes('last_w') && /last_w|last_h/.test(error.message || '')) { cols = 'id, theme, nom, path, width, height, created_at'; continue }
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

/** Remet le chemin d'image (pour annuler une retouche). */
export async function setPhotoPath(id, path) {
  const { error } = await supabase.from('ps_photos').update({ path }).eq('id', id)
  if (error) throw error
}

/** Mémorise la dernière taille (cm) utilisée pour cette image. Silencieux si la colonne n'existe pas. */
export async function setPhotoSize(id, w, h) {
  const { error } = await supabase.from('ps_photos').update({ last_w: w, last_h: h }).eq('id', id)
  if (error && !/last_w|last_h/.test(error.message || '')) throw error
}

/** Duplique une image de la bibliothèque (copie le fichier + crée une nouvelle ligne « (copie) »). Renvoie {id, theme, nom, path, url}. */
export async function duplicatePhoto(id) {
  const { data: row } = await supabase.from('ps_photos').select('path, nom, theme').eq('id', id).maybeSingle()
  if (!row) return null
  const ext = (row.path.match(/\.[^.]+$/) || ['.png'])[0]
  const newPath = `${slug(row.theme)}/${Date.now()}_copie${ext}`
  const { error: cp } = await supabase.storage.from(BUCKET).copy(row.path, newPath)
  if (cp) throw cp
  const { data, error } = await supabase.from('ps_photos')
    .insert({ theme: row.theme, nom: (row.nom || 'photo') + ' (copie)', path: newPath })
    .select('id, theme, nom, path').single()
  if (error) throw error
  return { ...data, url: photoUrl(data.path) }
}

/** Renomme une image. */
export async function renamePhoto(id, nom) {
  const { error } = await supabase.from('ps_photos').update({ nom: String(nom || '').trim().slice(0, 80) }).eq('id', id)
  if (error) throw error
}

const TRASH = '🗑️ Poubelle'
/** Met une image à la corbeille (« Poubelle ») en gardant sa catégorie d'origine. Conservée 30 jours (filet anti-erreur). */
export async function trashPhoto(id) {
  const { data: row } = await supabase.from('ps_photos').select('path, nom, theme').eq('id', id).maybeSingle()
  if (!row) return
  await supabase.from('ps_photos').delete().eq('id', id)
  let { error } = await supabase.from('ps_photos').insert({ theme: TRASH, nom: row.nom, path: row.path, prev_theme: row.theme })
  if (error && /prev_theme/.test(error.message || '')) await supabase.from('ps_photos').insert({ theme: TRASH, nom: row.nom, path: row.path })   // repli si colonne absente
}
/** Vide les éléments de la corbeille de plus de N jours (par défaut 30). Renvoie le nombre purgé. */
export async function purgeOldTrash(days = 30) {
  const cutoff = new Date(Date.now() - days * 864e5).toISOString()
  const { data, error } = await supabase.from('ps_photos').select('id, path').eq('theme', TRASH).lt('created_at', cutoff)
  if (error || !data || !data.length) return 0
  await supabase.storage.from('photoshop').remove(data.map(r => r.path))
  await supabase.from('ps_photos').delete().in('id', data.map(r => r.id))
  return data.length
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

/** Supprime les images « Temporaire » de plus de N jours (par défaut 7). Renvoie le nombre supprimé. */
export async function purgeOldTemp(days = 7) {
  const cutoff = new Date(Date.now() - days * 864e5).toISOString()
  const { data, error } = await supabase.from('ps_photos').select('id, path').eq('theme', 'Temporaire').lt('created_at', cutoff)
  if (error || !data || !data.length) return 0
  await supabase.storage.from(BUCKET).remove(data.map(r => r.path))
  await supabase.from('ps_photos').delete().in('id', data.map(r => r.id))
  return data.length
}

/** Liste les polices ajoutées (fichiers dans fonts/ du bucket). Renvoie [{name, url}]. */
export async function listFonts() {
  const { data, error } = await supabase.storage.from(BUCKET).list('fonts', { limit: 300 })
  if (error || !data) return []
  return data.filter(f => /\.(ttf|otf|woff2?)$/i.test(f.name)).map(f => ({ name: f.name.replace(/\.[^.]+$/, ''), url: photoUrl('fonts/' + f.name) }))
}

/** Téléverse une police (fichier .ttf/.otf/.woff). Renvoie {name, url}. */
export async function uploadFont(file) {
  const ext = (file.name.match(/\.[^.]+$/) || ['.ttf'])[0]
  const base = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || 'police'
  const path = `fonts/${base}${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || 'font/ttf' })
  if (error) throw error
  return { name: base, url: photoUrl(path) }
}

/** Supprime une image (fichier + ligne). */
export async function deletePhoto(id, path) {
  if (path) await supabase.storage.from(BUCKET).remove([path])
  const { error } = await supabase.from('ps_photos').delete().eq('id', id)
  if (error) throw error
}
