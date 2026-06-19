// Dédoublonne la bibliothèque par CONTENU EXACT du fichier (md5). Garde 1 copie par image.
//   node scripts/ps-dedupe-content.mjs           (aperçu)
//   node scripts/ps-dedupe-content.mjs --apply   (applique)
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const ROOT = 'cake-photos'
const slug = s => String(s).replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || '_divers'

// map path stockage -> fichier local
const local = {}
for (const folder of readdirSync(ROOT)) {
  if (folder.startsWith('_')) continue
  const dir = join(ROOT, folder); if (!statSync(dir).isDirectory()) continue
  for (const f of readdirSync(dir)) if (/\.(png|jpe?g|webp)$/i.test(f)) local[`${slug(folder)}/${f}`] = resolve(join(dir, f))
}

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, path, nom, theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }

const generic = n => !n || /^([Ll]ayer|[Gg]roup|[Cc]alque|[Ee]lement|[0-9]+)(\b|_| |$)/.test(n) || /perso/i.test(n)
const md5cache = {}
const groups = {}
for (const r of rows) {
  const lf = local[r.path]; if (!lf) continue
  let h = md5cache[lf]; if (!h) { try { h = createHash('md5').update(readFileSync(lf)).digest('hex') } catch { continue } md5cache[lf] = h }
  ;(groups[h] ||= []).push(r)
}
// garde le meilleur (nom non générique > nom court > thème court)
const keepScore = r => (generic(r.nom) ? 1000 : 0) + (r.nom ? r.nom.length : 99) + (r.theme ? r.theme.length / 100 : 0)
let toDel = []
for (const h of Object.keys(groups)) {
  const g = groups[h]; if (g.length < 2) continue
  g.sort((a, b) => keepScore(a) - keepScore(b))
  toDel.push(...g.slice(1))
}
console.log(`${rows.length} en base · ${Object.values(groups).filter(g => g.length > 1).length} groupes de doublons · ${toDel.length} à supprimer`)
console.log('Exemples :', Object.values(groups).filter(g => g.length > 1).slice(0, 8).map(g => `${g.length}× "${g[0].nom}"`))

if (!APPLY) { console.log('\n(aperçu) Relance avec --apply pour supprimer.'); process.exit(0) }
let done = 0
for (let i = 0; i < toDel.length; i += 100) {
  const chunk = toDel.slice(i, i + 100)
  await sb.storage.from('photoshop').remove(chunk.map(r => r.path))
  await sb.from('ps_photos').delete().in('id', chunk.map(r => r.id))
  done += chunk.length
}
const { count } = await sb.from('ps_photos').select('*', { count: 'exact', head: true })
console.log(`Terminé : ${done} doublons supprimés. Lignes restantes : ${count}`)
