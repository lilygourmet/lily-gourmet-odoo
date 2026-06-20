// Dédoublonnage par RESSEMBLANCE visuelle (aHash 8x8 + dHash 8x8) sur les images locales (_cloud).
// Garde 1 exemplaire par image quasi-identique (même si re-encodée/redimensionnée).
//   node scripts/ps-perceptual-dedupe.mjs            (aperçu)
//   node scripts/ps-perceptual-dedupe.mjs --apply
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { createCanvas, loadImage } from '@napi-rs/canvas'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const generic = n => !n || /^([Ll]ayer|[Gg]roup|[Cc]alque|[Ee]lement)/.test(n)

const A = createCanvas(8, 8), ax = A.getContext('2d')
const D = createCanvas(9, 8), dx = D.getContext('2d')
function hashes(img) {
  ax.fillStyle = '#fff'; ax.fillRect(0, 0, 8, 8); ax.drawImage(img, 0, 0, 8, 8)   // fond blanc → l'empreinte suit le contenu
  const a = ax.getImageData(0, 0, 8, 8).data; const g = []; let sum = 0
  for (let i = 0; i < 64; i++) { const v = a[i * 4] * .3 + a[i * 4 + 1] * .59 + a[i * 4 + 2] * .11; g.push(v); sum += v }
  const m = sum / 64; const aH = g.map(v => v > m ? 1 : 0).join('')
  dx.fillStyle = '#fff'; dx.fillRect(0, 0, 9, 8); dx.drawImage(img, 0, 0, 9, 8)
  const d = dx.getImageData(0, 0, 9, 8).data; let dH = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (y * 9 + x) * 4, j = (y * 9 + x + 1) * 4; const l = a => d[a] * .3 + d[a + 1] * .59 + d[a + 2] * .11; dH += l(i) > l(j) ? '1' : '0' }
  return aH + '|' + dH
}

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('id, nom, theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const jobs = rows.filter(r => existsSync(`cake-photos/_cloud/${r.id}.png`))
console.log(`${jobs.length} images locales à empreindre…`)

let done = 0
const CC = 8
for (let i = 0; i < jobs.length; i += CC) {
  await Promise.all(jobs.slice(i, i + CC).map(async r => {
    try { const img = await loadImage(`cake-photos/_cloud/${r.id}.png`); r.key = hashes(img) } catch (e) { /* skip */ }
  }))
  done += Math.min(CC, jobs.length - i); if ((i / CC) % 50 === 0) console.log(`  ${done}/${jobs.length}`)
}

const THRESH = parseInt((process.argv.find(a => /^--t=/.test(a)) || '').split('=')[1]) || 6   // distance max (sur 128 bits)
const score = r => (generic(r.nom) ? 1000 : 0) + (r.theme === 'Divers' ? 100 : 0) + (r.nom ? r.nom.length : 99)
const ham = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { n++; if (n > THRESH) return n } } return n }
// on NE dédoublonne PAS les formes/chiffres/lettres (souvent proches mais distincts)
const isSimple = n => /(chiffre|ellipse|\bforme|cercle|carr|rectangle|triangle|losange|polygon|lettre|etoile|étoile|ovale|\brond\b|trait|ligne|\bpoint|number|\bshape|alphabet|motif|texture|fond )/i.test(n || '')
const valid = jobs.filter(r => r.key && !isSimple(r.nom) && r.theme !== 'Texte & Messages')
const used = new Uint8Array(valid.length)
const toDel = []; let gcount = 0; const examples = []
for (let i = 0; i < valid.length; i++) {
  if (used[i]) continue
  const cl = [valid[i]]
  for (let j = i + 1; j < valid.length; j++) { if (used[j]) continue; if (ham(valid[i].key, valid[j].key) <= THRESH) { used[j] = 1; cl.push(valid[j]) } }
  if (cl.length > 1) { gcount++; cl.sort((a, b) => score(a) - score(b)); toDel.push(...cl.slice(1)); examples.push({ n: cl.length, nom: cl[0].nom || '?' }) }
}
console.log(`\nSeuil ${THRESH} · groupes de ressemblance: ${gcount} · à supprimer: ${toDel.length}`)

if (!APPLY) { console.log('\n(aperçu) Plus gros groupes:'); examples.sort((a, b) => b.n - a.n).slice(0, 20).forEach(e => console.log('  ' + e.n + '× ' + e.nom)); process.exit(0) }
// récupère les paths pour suppression storage
const ids = toDel.map(r => r.id)
const pathById = {}
for (let i = 0; i < ids.length; i += 300) { const { data } = await sb.from('ps_photos').select('id, path').in('id', ids.slice(i, i + 300)); (data || []).forEach(r => pathById[r.id] = r.path) }
let del = 0
for (let i = 0; i < toDel.length; i += 100) {
  const chunk = toDel.slice(i, i + 100)
  await sb.storage.from('photoshop').remove(chunk.map(r => pathById[r.id]).filter(Boolean))
  await sb.from('ps_photos').delete().in('id', chunk.map(r => r.id))
  chunk.forEach(r => { try { if (existsSync(`cake-photos/_cloud/${r.id}.png`)) unlinkSync(`cake-photos/_cloud/${r.id}.png`) } catch {} })
  del += chunk.length
}
const { count } = await sb.from('ps_photos').select('*', { count: 'exact', head: true })
console.log(`Terminé : ${del} doublons visuels supprimés. Reste ${count} images.`)
