// LA MASSE GÉLATINE SE FABRIQUAIT AVEC ELLE-MÊME.
//
// MA FAUTE, le 2026-09-11. La migration `masse-gelatine.mjs` a remplacé
// « MP- Gelatine en poudre » par « SM. Masse Gélatine » (×7) dans TOUTES les
// nomenclatures — y compris dans celle de la masse gélatine elle-même. Sa
// recette, qui disait « 70 g de masse = 10 g de poudre + 60 g d'eau », dit
// depuis « 70 g de masse = 70 g de masse + 60 g d'eau ». Une boucle.
//
// Conséquence : Odoo ne sait plus fabriquer la masse gélatine, et tout ce qui
// en descend demande une masse qui se demande elle-même.
//
// CE QUI CHANGE, et rien d'autre : dans la recette #1340, la ligne revient à
// « MP- Gelatine en poudre 10 g » — exactement ce qu'elle disait avant, d'après
// la sauvegarde gelatine-avant.json (ligne 9217).
//
//     node scripts/masse-gelatine-boucle.mjs             → montre
//     node scripts/masse-gelatine-boucle.mjs --appliquer → répare

import fs from 'fs'

const MASSE = 'SM. Masse Gélatine'
const POUDRE = 'MP- Gelatine en poudre'
const POIDS = 10          // g de poudre, valeur d'origine
const UOM_G = 13

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim()
}
const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD } = env

const rpc = async (service, method, args) => {
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  const j = await r.json()
  if (j.error) throw new Error(String(j.error.data?.message || j.error.message || '').slice(0, 400))
  return j.result
}

const appliquer = process.argv.includes('--appliquer')
const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}])
const ex = (model, method, args, kw = {}) =>
  rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kw])
const sr = (model, domain, fields, opts = {}) => ex(model, 'search_read', [domain, fields], opts)

const net = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase()
const [masse] = await sr('product.product', [['name', '=', MASSE]], ['id', 'product_tmpl_id'])
if (!masse) { console.log(`« ${MASSE} » introuvable`); process.exit(1) }
// ⚠️ Les noms d'articles portent parfois une espace insécable : on cherche large.
const poudres = await sr('product.product', [['name', 'ilike', 'Gelatine en poudre']], ['id', 'name'])
const poudre = poudres.find(x => net(x.name) === net(POUDRE)) || poudres[0]
if (!poudre) { console.log(`« ${POUDRE} » introuvable`); process.exit(1) }

const [bom] = await sr('mrp.bom', [['product_tmpl_id', '=', masse.product_tmpl_id[0]]],
  ['id', 'product_qty', 'product_uom_id'])
const lignes = await sr('mrp.bom.line', [['bom_id', '=', bom.id]],
  ['id', 'product_id', 'product_qty', 'product_uom_id'], { limit: 20})
fs.writeFileSync('masse-gelatine-boucle-avant.json',
  JSON.stringify({ date: new Date().toISOString(), bom, lignes }, null, 1))

const boucle = lignes.find(l => l.product_id[0] === masse.id)
console.log(`recette #${bom.id} de « ${MASSE} » : sort ${bom.product_qty} ${bom.product_uom_id[1]}`)
for (const l of lignes) {
  console.log(`   ${String(l.product_id[1]).slice(0, 32).padEnd(34)} ${l.product_qty} ${l.product_uom_id[1]}`
    + (l === boucle ? `   ⚠️ ELLE-MÊME → ${POUDRE} ${POIDS} g` : ''))
}
if (!boucle) { console.log('\n✅ pas de boucle : rien à faire.'); process.exit(0) }

if (!appliquer) {
  console.log()
  console.log('APERÇU — rien n’est écrit. Relance avec --appliquer.')
  process.exit(0)
}

await ex('mrp.bom.line', 'write', [[boucle.id],
  { product_id: poudre.id, product_qty: POIDS, product_uom_id: UOM_G }])
const relu = await sr('mrp.bom.line', [['bom_id', '=', bom.id]],
  ['product_id', 'product_qty', 'product_uom_id'], { limit: 20 })
console.log()
console.log('✅ réparé :')
for (const l of relu) console.log(`   ${String(l.product_id[1]).slice(0, 32).padEnd(34)} ${l.product_qty} ${l.product_uom_id[1]}`)
