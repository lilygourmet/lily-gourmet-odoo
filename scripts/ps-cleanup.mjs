// Supprime de la bibliothèque les images à ignorer : photos perso, étiquettes, captures d'écran.
//   node scripts/ps-cleanup.mjs            (aperçu : ne supprime rien, montre le compte)
//   node scripts/ps-cleanup.mjs --apply    (supprime réellement : fichiers + lignes)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const PERSO = /perso\b/
const ETIQ = /etiquette/
const CAPTURE = /capture|screen ?shot|screenshot|capture.?d.?ecran|img[-_ ]?\d{8}|photo[-_ ]?\d{6}/

// récupère tout
const rows = []; let from = 0
for (;;) {
  const { data, error } = await sb.from('ps_photos').select('id, path, nom, theme').range(from, from + 999)
  if (error) { console.log(error.message); break }
  rows.push(...data); if (data.length < 1000) break; from += 1000
}

const reason = r => {
  const n = norm(r.nom), t = norm(r.theme), p = norm(r.path)
  if (PERSO.test(n)) return 'perso'
  if (ETIQ.test(t) || ETIQ.test(n) || ETIQ.test(p)) return 'etiquette'
  if (CAPTURE.test(n) || CAPTURE.test(p)) return 'capture'
  return null
}
const toDel = rows.map(r => ({ ...r, why: reason(r) })).filter(r => r.why)
const byWhy = {}; toDel.forEach(r => { byWhy[r.why] = (byWhy[r.why] || 0) + 1 })
console.log(`${rows.length} images en base · ${toDel.length} à supprimer`, byWhy)

if (!APPLY) { console.log('\n(aperçu) Relance avec --apply pour supprimer réellement.'); console.log('Exemples :', toDel.slice(0, 8).map(r => `${r.why}: ${r.theme}/${r.nom}`)); process.exit(0) }

let done = 0
for (let i = 0; i < toDel.length; i += 100) {
  const chunk = toDel.slice(i, i + 100)
  await sb.storage.from('photoshop').remove(chunk.map(r => r.path))
  await sb.from('ps_photos').delete().in('id', chunk.map(r => r.id))
  done += chunk.length
}
const { count } = await sb.from('ps_photos').select('*', { count: 'exact', head: true })
console.log(`Terminé : ${done} supprimées. Lignes restantes : ${count}`)
