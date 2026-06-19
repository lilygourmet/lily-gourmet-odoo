// Envoie les images de cake-photos/ vers le bucket Supabase 'photoshop' + table ps_photos.
// Nécessite SUPABASE_SERVICE_ROLE_KEY (clé service_role) dans .env.local.
//   node scripts/upload-cake-photos.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// --- lecture .env.local ---
const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim()
}
const URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Manque VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.local'); process.exit(1) }

const sb = createClient(URL, KEY, { auth: { persistSession: false } })
const ROOT = 'cake-photos'
const slug = s => String(s).replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || '_divers'
const nomOf = f => f.replace(/^\d+\s/, '').replace(/\.[^.]+$/, '')
// nom de fichier valide pour le stockage (enlève accents + caractères spéciaux)
const cleanFile = f => f.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9 ._-]/g, '_')

// déjà présentes en base → on saute (pas de doublon, ni de ré-upload inutile)
const existing = new Set()
{
  let from = 0
  for (;;) {
    const { data, error } = await sb.from('ps_photos').select('path').range(from, from + 999)
    if (error) { console.error('Lecture ps_photos:', error.message); break }
    data.forEach(r => existing.add(r.path)); if (data.length < 1000) break; from += 1000
  }
}

// liste { theme, file, path } — path nettoyé ; on saute si la version brute est déjà en base
const jobs = []
for (const theme of readdirSync(ROOT)) {
  if (theme.startsWith('_')) continue
  const dir = join(ROOT, theme)
  if (!statSync(dir).isDirectory()) continue
  for (const f of readdirSync(dir)) {
    if (!/\.(png|jpe?g|webp)$/i.test(f)) continue
    const rawPath = `${slug(theme)}/${f}`
    if (existing.has(rawPath)) continue
    jobs.push({ theme, file: f, local: join(dir, f), path: `${slug(theme)}/${cleanFile(f)}` })
  }
}
console.log(`${existing.size} déjà en base · ${jobs.length} à (ré)envoyer…`)

let ok = 0, fail = 0, lastErr = ''
const CC = 8
for (let i = 0; i < jobs.length; i += CC) {
  await Promise.all(jobs.slice(i, i + CC).map(async j => {
    try {
      const buf = readFileSync(j.local)
      const { error: upErr } = await sb.storage.from('photoshop').upload(j.path, buf, { contentType: 'image/png', upsert: true })
      if (upErr) throw upErr
      const { error: dbErr } = await sb.from('ps_photos').upsert({ theme: j.theme, nom: nomOf(j.file), path: j.path }, { onConflict: 'path' })
      if (dbErr) throw dbErr
      ok++
    } catch (e) { fail++; lastErr = e?.message || String(e) }
  }))
  if ((i / CC) % 10 === 0) console.log(`  ${ok + fail}/${jobs.length} (ok ${ok}, échec ${fail})`)
}
console.log(`\nTerminé : ${ok} envoyées, ${fail} échec(s).` + (fail ? ` Dernière erreur : ${lastErr}` : ''))
