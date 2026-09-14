// « SM. Mousse Meringue Citron (kg) » produit 445 kg. Ça doit être 445 g.
//
// CE QUI S'EST PASSÉ. L'article existe en double : un compté en GRAMMES
// (recette #919, « sort 445 g ») et sa copie comptée en KILOS (recette #965).
// À la copie, le nombre n'a pas été converti : 445 est resté 445, mais en kilos.
//
// CE QUE ÇA FAISAIT À L'ÉCRAN. Fabrication Annexe 2 demandait 1,2 kg de mousse
// pour 100 individuels, soit 0,27 % d'une recette de 445 kg : tous les
// ingrédients tombaient à « 0 g ». (Layla, 2026-09-14.)
//
// CE QUI CHANGE, et rien d'autre : la sortie de la recette #965 devient
// « 445 g », comme sa jumelle #919.
//
// ⚠️ POURQUOI EN GRAMMES ET PAS « 0,445 kg ». L'unité « kg » d'Odoo n'accepte
// que deux décimales (arrondi 0,01) : 0,445 y devient 0,45, soit 450 g au lieu
// de 445. Essayé le 2026-09-14, et corrigé aussitôt. En grammes, le chiffre
// tombe juste. L'article, lui, reste compté en kilos — l'app sait convertir
// (`versUnite`), c'est le même cas que les recettes en « Tournée (3 kg) ».
//
// ⚠️ La recette elle-même reste douteuse (870 g d'ingrédients pour 445 g de
// mousse, pas de blancs d'œufs, 16 % de gélatine). Ce script ne corrige QUE
// l'unité — les vrais poids attendent les chiffres de l'atelier.
//
//     node scripts/mousse-meringue-citron-kg.mjs             → montre, n'écrit rien
//     node scripts/mousse-meringue-citron-kg.mjs --appliquer → corrige

import fs from 'fs'

const ARTICLE = 'SM. Mousse Meringue Citron (kg)'
// L'état de départ, dans l'un ou l'autre des deux états déjà vus.
const DEPART = [{ qty: 445, uom: 'kg' }, { qty: 0.45, uom: 'kg' }]
const APRES = 445
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

const [p] = await sr('product.product', [['name', '=', ARTICLE]], ['id', 'product_tmpl_id', 'uom_id'])
if (!p) { console.log(`« ${ARTICLE} » introuvable`); process.exit(1) }
const [bom] = await sr('mrp.bom', [['product_tmpl_id', '=', p.product_tmpl_id[0]]],
  ['id', 'product_qty', 'product_uom_id'])
if (!bom) { console.log('recette introuvable'); process.exit(1) }
const lignes = await sr('mrp.bom.line', [['bom_id', '=', bom.id]],
  ['product_id', 'product_qty', 'product_uom_id'], { limit: 50 })

fs.writeFileSync('mousse-meringue-citron-avant.json',
  JSON.stringify({ date: new Date().toISOString(), bom, lignes }, null, 1))

const uomBom = bom.product_uom_id[1]
if (!DEPART.some(d => Math.abs(bom.product_qty - d.qty) < 1e-9 && d.uom === uomBom)) {
  console.log(`⚠️ la recette sort ${bom.product_qty} ${uomBom} — pas un état attendu, je ne touche à rien.`)
  process.exit(1)
}

const enG = (q, u) => (/^kg$/i.test(u) ? q * 1000 : q)
const total = lignes.reduce((s, l) => s + enG(l.product_qty, l.product_uom_id[1]), 0)
console.log(`recette #${bom.id} de « ${ARTICLE} »`)
console.log(`   sortie : ${bom.product_qty} ${uomBom}  →  ${APRES} g`)
for (const l of lignes) {
  console.log(`      ${String(l.product_id[1]).slice(0, 36).padEnd(38)} ${String(l.product_qty).padStart(8)} ${l.product_uom_id[1]}  (inchangé)`)
}
console.log(`   total des ingrédients : ${total} g   ⚠️ pour ${APRES} g de mousse`)

if (!appliquer) {
  console.log()
  console.log('APERÇU — rien n’est écrit. Relance avec --appliquer.')
  process.exit(0)
}

await ex('mrp.bom', 'write', [[bom.id], { product_qty: APRES, product_uom_id: UOM_G }])
const [relu] = await ex('mrp.bom', 'read', [[bom.id], ['product_qty', 'product_uom_id']])
console.log()
console.log(`✅ la recette sort maintenant ${relu.product_qty} ${relu.product_uom_id[1]}`)
