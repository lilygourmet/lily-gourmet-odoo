// COMBIEN D'INDIVIDUELS SORT UNE FOURNÉE DE MOUSSE MERINGUE CITRON ?
//
// Layla a corrigé elle-même la recette de la MOUSSE dans Odoo le 2026-09-14 :
//     Masse Gélatine 140 g · Sucre 230 g · Eau 270 g · Citron 250 g → 880 g
// et elle dit : « j'ai fait cette recette de mousse pour me sortir 105 unité ».
//
// Mais le RENDEMENT n'a pas suivi. « SM. Mousse Meringue Citron Indiv » dit
// encore « 100 individuels prennent 1,2 kg de mousse » — un chiffre qui datait
// d'avant. Du coup, demander 105 individuels réclamait 1 260 g de mousse, soit
// 1,43 fournée, et l'écran affichait des poids qui ne ressemblaient à rien de
// ce qu'elle avait pesé. D'où « j'ai pas compris comment cette fiche
// fonctionne ».
//
// CE QUI CHANGE, et rien d'autre — la recette de l'INDIVIDUEL :
//     100 u  ←  1,2 kg de mousse        devient
//     105 u  ←  880 g  (une fournée entière, celle qu'elle fait vraiment)
//
// La recette de la mousse n'est PAS touchée : elle est déjà juste.
//
//     node scripts/mousse-meringue-indiv-rendement.mjs             → montre
//     node scripts/mousse-meringue-indiv-rendement.mjs --appliquer → écrit

import fs from 'fs'

const MOUSSE = 'SM. Mousse Meringue Citron (kg)'
const INDIV = 'SM. Mousse Meringue Citron Indiv'
const PIECES = 105
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

const enG = (q, u) => (/^kg$/i.test(u) ? q * 1000 : q)
const mousse = await recetteDe(MOUSSE)
const indiv = await recetteDe(INDIV)
fs.writeFileSync('mousse-meringue-indiv-avant.json',
  JSON.stringify({ date: new Date().toISOString(), mousse, indiv }, null, 1))

const fournee = enG(mousse.bom.product_qty, mousse.bom.product_uom_id[1])
console.log(`LA FOURNÉE DE MOUSSE (recette #${mousse.bom.id}, pas touchée) : ${fournee} g`)
let somme = 0
for (const l of mousse.lignes) {
  const g = enG(l.product_qty, l.product_uom_id[1])
  somme += g
  console.log(`   ${String(l.product_id[1]).slice(0, 24).padEnd(26)} ${String(g).padStart(6)} g`)
}
console.log(`   total pesé : ${somme} g`)

const ligne = indiv.lignes.find(l => l.product_id[0] === mousse.p.id)
if (!ligne) { console.log('✗ l\'individuel ne prend pas cette mousse — je ne touche à rien.'); process.exit(1) }
console.log(`\nLE RENDEMENT (recette #${indiv.bom.id})`)
console.log(`   avant : ${indiv.bom.product_qty} ${indiv.bom.product_uom_id[1]} pour `
  + `${enG(ligne.product_qty, ligne.product_uom_id[1])} g de mousse`)
console.log(`   après : ${PIECES} ${indiv.bom.product_uom_id[1]} pour ${fournee} g de mousse`)
console.log(`   soit ${Math.round(fournee / PIECES * 100) / 100} g par individuel`)

if (!appliquer) {
  console.log()
  console.log('APERÇU — rien n’est écrit. Relance avec --appliquer.')
  process.exit(0)
}

await ex('mrp.bom', 'write', [[indiv.bom.id], { product_qty: PIECES }])
await ex('mrp.bom.line', 'write', [[ligne.id], { product_qty: fournee, product_uom_id: UOM_G }])
const relu = await recetteDe(INDIV)
const lr = relu.lignes.find(l => l.product_id[0] === mousse.p.id)
console.log()
console.log(`✅ ${relu.bom.product_qty} ${relu.bom.product_uom_id[1]} pour ${lr.product_qty} ${lr.product_uom_id[1]} de mousse`)
