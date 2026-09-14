// LES DEUX MOUSSES MERINGUE CITRON DOIVENT DIRE LA MÊME CHOSE.
//
// LE PIÈGE. L'article existe en DOUBLE chez Odoo :
//   · « SM. Mousse Meringue Citron »       (compté en g)  — recette #919
//   · « SM. Mousse Meringue Citron (kg) »  (compté en kg) — recette #965
// Seul le second sert vraiment : c'est lui que prend l'individuel. Mais quand
// on cherche « mousse meringue citron » dans Odoo, c'est le PREMIER qui tombe
// sous la main. Layla a donc corrigé #919 le 2026-09-14 à 15h31 — sans effet,
// pendant que #965 gardait ses vieux chiffres.
//
// CE QUE FAIT CE SCRIPT : recopier la recette de #919 sur #965, à l'identique.
// Rien d'autre. Les lignes sont comparées par ARTICLE, pas par position.
//
// ⚠️ LE VRAI REMÈDE serait d'archiver le doublon inutilisé, pour qu'il ne
// puisse plus attirer la main. À décider avec Layla.
//
//     node scripts/mousse-meringue-aligner-doublon.mjs             → montre
//     node scripts/mousse-meringue-aligner-doublon.mjs --appliquer → aligne

import fs from 'fs'

const SOURCE = 'SM. Mousse Meringue Citron'          // celui qu'on modifie à la main
const CIBLE = 'SM. Mousse Meringue Citron (kg)'      // celui qui sert vraiment
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

const enG = (q, u) => (/^kg$/i.test(u) ? q * 1000 : q)

async function recetteDe(nom) {
  const [p] = await sr('product.product', [['name', '=', nom]], ['id', 'product_tmpl_id', 'uom_id'])
  if (!p) throw new Error(`« ${nom} » introuvable`)
  const [bom] = await sr('mrp.bom', [['product_tmpl_id', '=', p.product_tmpl_id[0]]],
    ['id', 'product_qty', 'product_uom_id'])
  if (!bom) throw new Error(`recette de « ${nom} » introuvable`)
  const lignes = await sr('mrp.bom.line', [['bom_id', '=', bom.id]],
    ['id', 'product_id', 'product_qty', 'product_uom_id'], { limit: 60 })
  return { p, bom, lignes }
}

const src = await recetteDe(SOURCE)
const cib = await recetteDe(CIBLE)
fs.writeFileSync('mousse-meringue-doublon-avant.json',
  JSON.stringify({ date: new Date().toISOString(), source: src, cible: cib }, null, 1))

const sortie = enG(src.bom.product_qty, src.bom.product_uom_id[1])
console.log(`SOURCE  #${src.bom.id} « ${SOURCE} »       sort ${sortie} g`)
console.log(`CIBLE   #${cib.bom.id} « ${CIBLE} »  sort ${enG(cib.bom.product_qty, cib.bom.product_uom_id[1])} g  →  ${sortie} g`)

const parArticle = new Map(cib.lignes.map(l => [l.product_id[0], l]))
const aEcrire = []
const enTrop = []
for (const l of src.lignes) {
  const g = enG(l.product_qty, l.product_uom_id[1])
  const dans = parArticle.get(l.product_id[0])
  if (!dans) { enTrop.push(`manque « ${l.product_id[1]} » dans la cible`); continue }
  parArticle.delete(l.product_id[0])
  aEcrire.push({ l: dans, g })
  console.log(`   ${String(l.product_id[1]).slice(0, 30).padEnd(32)} ${String(enG(dans.product_qty, dans.product_uom_id[1])).padStart(6)} g  →  ${g} g`)
}
for (const [, l] of parArticle) enTrop.push(`« ${l.product_id[1]} » est dans la cible mais pas dans la source`)
if (enTrop.length) {
  console.log('\n✗ les deux recettes n’ont pas les mêmes ingrédients — je ne touche à rien :')
  for (const m of enTrop) console.log('   ' + m)
  process.exit(1)
}

if (!appliquer) {
  console.log()
  console.log('APERÇU — rien n’est écrit. Relance avec --appliquer.')
  process.exit(0)
}

await ex('mrp.bom', 'write', [[cib.bom.id], { product_qty: sortie, product_uom_id: UOM_G }])
for (const { l, g } of aEcrire) {
  await ex('mrp.bom.line', 'write', [[l.id], { product_qty: g, product_uom_id: UOM_G }])
}
const relu = await recetteDe(CIBLE)
console.log()
console.log(`✅ « ${CIBLE} » sort ${relu.bom.product_qty} ${relu.bom.product_uom_id[1]} :`)
for (const l of relu.lignes) console.log(`   ${String(l.product_id[1]).slice(0, 30).padEnd(32)} ${l.product_qty} ${l.product_uom_id[1]}`)
