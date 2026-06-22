// Analyse de doublons EN PROFONDEUR (aperçu) : aHash+dHash 8x8 + variante MIROIR, à plusieurs seuils.
// Ne supprime rien. Montre, pour chaque seuil, combien de doublons et des exemples.
//   node scripts/ps-dedupe-analyze.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { createCanvas, loadImage } from '@napi-rs/canvas'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const A = createCanvas(8, 8), ax = A.getContext('2d')
const D = createCanvas(9, 8), dx = D.getContext('2d')
function hashOne(img, flip) {
  ax.save(); ax.fillStyle = '#fff'; ax.fillRect(0, 0, 8, 8)
  if (flip) { ax.translate(8, 0); ax.scale(-1, 1) }
  ax.drawImage(img, 0, 0, 8, 8); ax.restore()
  const a = ax.getImageData(0, 0, 8, 8).data; const g = []; let sum = 0
  for (let i = 0; i < 64; i++) { const v = a[i * 4] * .3 + a[i * 4 + 1] * .59 + a[i * 4 + 2] * .11; g.push(v); sum += v }
  const m = sum / 64; const aH = g.map(v => v > m ? 1 : 0).join('')
  dx.save(); dx.fillStyle = '#fff'; dx.fillRect(0, 0, 9, 8)
  if (flip) { dx.translate(9, 0); dx.scale(-1, 1) }
  dx.drawImage(img, 0, 0, 9, 8); dx.restore()
  const d = dx.getImageData(0, 0, 9, 8).data; let dH = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (y * 9 + x) * 4, j = (y * 9 + x + 1) * 4; const l = q => d[q] * .3 + d[q + 1] * .59 + d[q + 2] * .11; dH += l(i) > l(j) ? '1' : '0' }
  return aH + dH
}

const rows = []; let from = 0
for (;;) { const { data } = await sb.from('ps_photos').select('id, nom, theme').range(from, from + 999); rows.push(...data); if (data.length < 1000) break; from += 1000 }
const jobs = rows.filter(r => existsSync(`cake-photos/_cloud/${r.id}.png`))
console.log(`${jobs.length} images à empreindre (normal + miroir)…`)
let done = 0
const CC = 8
for (let i = 0; i < jobs.length; i += CC) {
  await Promise.all(jobs.slice(i, i + CC).map(async r => {
    try { const img = await loadImage(`cake-photos/_cloud/${r.id}.png`); r.k = hashOne(img, false); r.kf = hashOne(img, true) } catch (e) {}
  }))
  done += Math.min(CC, jobs.length - i); if ((i / CC) % 80 === 0) console.log(`  ${done}/${jobs.length}`)
}

const isSimple = n => /(chiffre|ellipse|\bforme|cercle|carr|rectangle|triangle|losange|polygon|lettre|etoile|étoile|ovale|\brond\b|trait|ligne|\bpoint|number|\bshape|alphabet|motif|texture|fond )/i.test(n || '')
const valid = jobs.filter(r => r.k && !isSimple(r.nom) && r.theme !== 'Texte & Messages')
const ham = (a, b, max) => { let n = 0; for (let i = 0; i < a.length; i++) { if (a[i] !== b[i]) { n++; if (n > max) return n } } return n }
const dist = (a, b) => Math.min(ham(a.k, b.k, 128), ham(a.k, b.kf, 128))   // tient compte du miroir

for (const TH of [6, 8, 10, 12]) {
  const used = new Uint8Array(valid.length); let groups = 0, del = 0; const ex = []
  for (let i = 0; i < valid.length; i++) {
    if (used[i]) continue
    const cl = [valid[i]]
    for (let j = i + 1; j < valid.length; j++) { if (used[j]) continue; if (dist(valid[i], valid[j]) <= TH) { used[j] = 1; cl.push(valid[j]) } }
    if (cl.length > 1) { groups++; del += cl.length - 1; ex.push({ n: cl.length, nom: cl[0].nom || '?' }) }
  }
  ex.sort((a, b) => b.n - a.n)
  console.log(`\n=== seuil ${TH} (miroir inclus) === groupes: ${groups} · doublons à retirer: ${del}`)
  console.log('  top:', ex.slice(0, 12).map(e => `${e.n}× ${e.nom}`).join(' | '))
}
