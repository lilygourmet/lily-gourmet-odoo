// Télécharge toutes les images du cloud, dédoublonne par CONTENU exact (md5),
// et garde une copie locale (cake-photos/_cloud/<id>.png) pour le nommage IA ensuite.
//   node scripts/ps-cloud-dedupe.mjs            (aperçu : compte les doublons)
//   node scripts/ps-cloud-dedupe.mjs --apply    (télécharge + supprime les doublons)
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const URL = env.VITE_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(URL, KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const pub = p => `${URL}/storage/v1/object/public/photoshop/${p.split('/').map(encodeURIComponent).join('/')}`
const generic = n => !n || /^([Ll]ayer|[Gg]roup|[Cc]alque|[Ee]lement|[0-9]+)(\b|_| |$)/.test(n) || /perso/i.test(n)

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, path, nom, theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
console.log(`${rows.length} images en base. Téléchargement + empreinte…`)
mkdirSync('cake-photos/_cloud', { recursive: true })

let done = 0, failed = 0
const CC = 14
for (let i = 0; i < rows.length; i += CC) {
  await Promise.all(rows.slice(i, i + CC).map(async r => {
    const f = `cake-photos/_cloud/${r.id}.png`
    try {
      let buf
      if (existsSync(f)) buf = readFileSync(f)                       // déjà téléchargé (reprise)
      else { const res = await fetch(pub(r.path)); if (!res.ok) throw new Error('HTTP ' + res.status); buf = Buffer.from(await res.arrayBuffer()); if (APPLY) writeFileSync(f, buf) }
      r.md5 = createHash('md5').update(buf).digest('hex')
    } catch (e) { failed++ }
  }))
  done += Math.min(CC, rows.length - i)
  if ((i / CC) % 20 === 0) console.log(`  ${done}/${rows.length} (échecs ${failed})`)
}

const groups = {}; rows.forEach(r => { if (r.md5) (groups[r.md5] ||= []).push(r) })
const keepScore = r => (generic(r.nom) ? 1000 : 0) + (r.nom ? r.nom.length : 99) + (r.theme === 'test' ? 0.5 : 0)
const toDel = []
for (const k of Object.keys(groups)) { const g = groups[k]; if (g.length < 2) continue; g.sort((a, b) => keepScore(a) - keepScore(b)); toDel.push(...g.slice(1)) }
console.log(`\nGroupes de doublons: ${Object.values(groups).filter(g => g.length > 1).length} · à supprimer: ${toDel.length} · uniques restants: ${rows.length - toDel.length - failed}`)

if (!APPLY) { console.log('\n(aperçu) --apply pour télécharger + supprimer.'); process.exit(0) }
let del = 0
for (let i = 0; i < toDel.length; i += 100) {
  const chunk = toDel.slice(i, i + 100)
  await sb.storage.from('photoshop').remove(chunk.map(r => r.path))
  await sb.from('ps_photos').delete().in('id', chunk.map(r => r.id))
  chunk.forEach(r => { try { if (existsSync(`cake-photos/_cloud/${r.id}.png`)) unlinkSync(`cake-photos/_cloud/${r.id}.png`) } catch {} })
  del += chunk.length
}
const { count } = await sb.from('ps_photos').select('*', { count: 'exact', head: true })
console.log(`Terminé : ${del} doublons supprimés. Reste ${count} images.`)
