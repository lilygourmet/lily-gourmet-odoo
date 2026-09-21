// ============================================================
// LES PHOTOS DE L'ÉCONOMAT, REBRANCHÉES.
//
// « On ne voit plus les photos dans économat, pourquoi ? Quelque chose a
// changé ? » (Layla, 2026-09-21). Oui : 212 photos déposées à la main ont été
// effacées de la table.
//
// LA CAUSE, dans `economat.js` : la synchro Odoo écrit
// `photo_url: p.image_url || null` — donc quand Odoo n'a PAS d'image (c'est le
// cas de 365 articles sur 483), elle remplace la photo maison par du vide. Un
// seul appui sur « synchroniser » a suffi.
//
// Les fichiers, eux, sont toujours là : le stockage garde 313 images, dont 212
// que plus personne ne réclame. Leur nom porte le nom de l'article
// (« 111-f-citron-fruit.jpg ») : c'est par là qu'on les retrouve.
//
//   node scripts/economat-photos-perdues.mjs              → essai à blanc
//   node scripts/economat-photos-perdues.mjs --appliquer  → rebranche
// ============================================================
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim()
}
const { VITE_SUPABASE_URL: URL_SB, SUPABASE_SERVICE_ROLE_KEY: CLE } = env
const h = { apikey: CLE, Authorization: 'Bearer ' + CLE }
const APPLIQUER = process.argv.includes('--appliquer')

/** Le nom, réduit à ce qui compte : sans accents, sans préfixe, sans ponctuation. */
const slug = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/^(mp|cd|c|p|f|sm)\s*-\s*/, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const arts = await (await fetch(
  `${URL_SB}/rest/v1/economat_articles?select=id,name,photo_url,active&limit=2000`, { headers: h })).json()
const st = await (await fetch(`${URL_SB}/storage/v1/object/list/economat-photos`, {
  method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '', limit: 2000, sortBy: { column: 'name', order: 'asc' } }),
})).json()

const fichiers = (Array.isArray(st) ? st : []).map(f => f.name).filter(n => /\.(jpg|jpeg|png|webp)$/i.test(n))
const utilises = new Set(arts.filter(a => a.photo_url).map(a => String(a.photo_url).split('/').pop()))

// Un fichier « 111-f-citron-fruit.jpg » → « citron-fruit » (le numéro et le
// préfixe d'article sautent, comme dans le nom).
const parSlug = new Map()
for (const f of fichiers) {
  const s = slug(f.replace(/\.[a-z]+$/i, '').replace(/^\d+-/, ''))
  if (!parSlug.has(s)) parSlug.set(s, [])
  parSlug.get(s).push(f)
}

// ⚠️ UN FICHIER NE SERT QU'UNE FOIS. Sans cette marque, deux articles au nom
// voisin se partageaient la même photo — et l'essai à blanc annonçait 334
// retrouvailles pour 206 fichiers libres. Une photo attribuée est retirée du
// lot tout de suite.
const pris = new Set(utilises)
const aRebrancher = []
for (const a of arts) {
  if (a.photo_url || a.active === false) continue
  const cands = parSlug.get(slug(a.name)) || []
  const libre = cands.find(f => !pris.has(f))
  if (libre) { pris.add(libre); aRebrancher.push({ a, fichier: libre }) }
}

console.log(`${fichiers.length} fichiers dans le stockage · ${utilises.size} déjà reliés`)
console.log(`${aRebrancher.length} article(s) retrouvent leur photo par le nom\n`)
for (const { a, fichier } of aRebrancher.slice(0, 15)) {
  console.log(`   ${a.name.slice(0, 36).padEnd(38)} ← ${fichier}`)
}
if (aRebrancher.length > 15) console.log(`   … et ${aRebrancher.length - 15} autres`)

const restants = fichiers.filter(f => !pris.has(f))
console.log(`\n${restants.length} fichier(s) sans article correspondant :`)
restants.slice(0, 10).forEach(f => console.log('   ', f))

if (!APPLIQUER) { console.log('\nESSAI À BLANC — rien n’a été écrit. Relancer avec --appliquer.'); process.exit(0) }

let n = 0
for (const { a, fichier } of aRebrancher) {
  const url = `${URL_SB}/storage/v1/object/public/economat-photos/${encodeURIComponent(fichier)}`
  const r = await fetch(`${URL_SB}/rest/v1/economat_articles?id=eq.${a.id}`, {
    method: 'PATCH', headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_url: url }),
  })
  if (r.ok) n++
  else console.log('   ⚠️ refusé :', a.name, await r.text())
}
console.log(`\n✅ ${n} photo(s) rebranchée(s).`)
