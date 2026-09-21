// ============================================================
// « SM. Base CBS 23 cm » → « SM- Base Tarte CBS 23 cm ».
//
// « Je ne trouve pas l'article base tarte cbs 23 cm » (Layla, 2026-09-21).
// Il existait, mais écrit autrement que ses frères — un point au lieu d'un
// tiret, et sans le mot « Tarte » :
//
//   SM. Base CBS 23 cm          ← l'intrus
//   SM- Base Tarte CBS 18 cm
//   SM- Base Tarte CBS Indiv
//
// La recherche exige TOUS les mots tapés : « tarte » n'étant pas dans son nom,
// elle ne le trouvait pas.
//
// ⚠️ RENOMMER CHEZ ODOO CASSE CE QUI EST RELIÉ PAR LE NOM — c'est arrivé
// plusieurs fois. Vérifié avant : une seule variante (aucune famille à casser),
// la recette qui le consomme le désigne par son identifiant, et seules DEUX
// lignes de notre base le citent par son nom. Elles sont reprises ici, dans la
// même opération.
//
//   node scripts/renommer-base-cbs-23.mjs              → essai à blanc
//   node scripts/renommer-base-cbs-23.mjs --appliquer  → renomme
// ============================================================
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim()
}
const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD,
  VITE_SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: CLE } = env
const h = { apikey: CLE, Authorization: 'Bearer ' + CLE, 'Content-Type': 'application/json' }

const rpc = async (service, method, args) => {
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  const j = await r.json()
  if (j.error) throw new Error(String(j.error.data?.message || j.error.message || '').slice(0, 300))
  return j.result
}
const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}])
const ex = (model, method, args) => rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASSWORD, model, method, args])
const sr = (model, domain, fields, opts = {}) =>
  rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASSWORD, model, 'search_read', [domain, fields], opts])

const AVANT = 'SM. Base CBS 23 cm'
const APRES = 'SM- Base Tarte CBS 23 cm'
const APPLIQUER = process.argv.includes('--appliquer')

// ---------- 1. ON REGARDE ----------
const deja = await sr('product.product', [['name', '=', APRES]], ['id'], { limit: 1 })
if (deja.length) throw new Error(`« ${APRES} » existe déjà chez Odoo : on s'arrête.`)

const prods = await sr('product.product', [['name', '=', AVANT]],
  ['id', 'name', 'display_name', 'product_tmpl_id'], { limit: 10 })
if (prods.length !== 1) throw new Error(`${prods.length} article(s) portent ce nom : on s'arrête.`)
const tmpl = prods[0].product_tmpl_id[0]
const freres = await sr('product.product', [['product_tmpl_id', '=', tmpl]], ['id'], { limit: 20 })
if (freres.length !== 1) throw new Error(`${freres.length} variantes sur ce modèle : renommer les renommerait TOUTES.`)

const lire = async (t, f) => {
  const r = await fetch(`${SB}/rest/v1/${t}?${f}`, { headers: h })
  const j = await r.json()
  return Array.isArray(j) ? j : []
}
const cat = await lire('fab_annexe_articles', 'select=produit,libelle&produit=eq.' + encodeURIComponent(AVANT))
const journal = await lire('prod_fabrications', 'select=id,jour,qty&article=eq.' + encodeURIComponent(AVANT) + '&limit=1000')
const feuilles = await lire('annexe_feuilles', 'select=id&produit=eq.' + encodeURIComponent(AVANT) + '&limit=1000')
const enForme = await lire('annexe_mise_en_forme', 'select=produit&produit=eq.' + encodeURIComponent(AVANT))
const tousFiges = await lire('fab_annexe_articles', 'select=produit,figes&figes=not.is.null&limit=2000')
const citeFige = tousFiges.filter(x => (x.figes || []).includes(AVANT))

fs.writeFileSync('renommage-base-cbs-23-avant.json', JSON.stringify(
  { odoo: { produit_id: prods[0].id, modele_id: tmpl, nom: AVANT }, cat, journal, feuilles, enForme, citeFige }, null, 1))

console.log(`« ${AVANT} »  →  « ${APRES} »\n`)
console.log(`  Odoo   : modèle ${tmpl}, une seule variante (${prods[0].id})`)
console.log(`  catalogue annexe   : ${cat.length} ligne(s)`)
console.log(`  journal des fabs   : ${journal.length} déclaration(s)`)
console.log(`  feuilles imprimées : ${feuilles.length}`)
console.log(`  liste « À finir »  : ${enForme.length}`)
console.log(`  cité comme figé    : ${citeFige.map(x => x.produit).join(', ') || 'aucun'}`)
console.log('\n💾 état d’avant : renommage-base-cbs-23-avant.json')

if (!APPLIQUER) { console.log('\nESSAI À BLANC — rien n’a été écrit. Relancer avec --appliquer.'); process.exit(0) }

// ---------- 2. ON ÉCRIT ----------
// ⚠️ Par le MODÈLE, jamais par la variante : renommer une variante renomme
// toute la famille chez Odoo (piège vécu).
await ex('product.template', 'write', [[tmpl], { name: APRES }])
console.log(`✅ Odoo : modèle ${tmpl} renommé`)

const patch = async (t, filtre, corps) => {
  const r = await fetch(`${SB}/rest/v1/${t}?${filtre}`, { method: 'PATCH', headers: h, body: JSON.stringify(corps) })
  if (!r.ok) console.log(`   ⚠️ ${t} : ${await r.text()}`)
  else console.log(`✅ ${t} mis à jour`)
}
if (cat.length) await patch('fab_annexe_articles', 'produit=eq.' + encodeURIComponent(AVANT), { produit: APRES })
if (journal.length) await patch('prod_fabrications', 'article=eq.' + encodeURIComponent(AVANT), { article: APRES })
if (feuilles.length) await patch('annexe_feuilles', 'produit=eq.' + encodeURIComponent(AVANT), { produit: APRES })
if (enForme.length) await patch('annexe_mise_en_forme', 'produit=eq.' + encodeURIComponent(AVANT), { produit: APRES })
for (const x of citeFige) {
  await patch('fab_annexe_articles', 'produit=eq.' + encodeURIComponent(x.produit),
    { figes: (x.figes || []).map(f => (f === AVANT ? APRES : f)) })
}
console.log('\nTerminé. L’app relit les recettes d’Odoo toutes les 10 minutes.')
