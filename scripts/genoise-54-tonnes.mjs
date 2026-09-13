// Répare les deux ordres de génoise créés en TOURNÉES au lieu de KILOS.
//
// CE QUI S'EST PASSÉ, le 2026-09-13
//   06h26  WHLVP/MO/202912  SM. Genoise Chocolat KG CD   18 000 Tournée (3 kg)
//          → validé. 54 tonnes de génoise, 36 tonnes d'œufs, 15,8 t de farine.
//   18h07  WHLVP/MO/203046  SM Genoise Vanille KG CD      6 000 Tournée (3 kg)
//          → validé. 18 tonnes, qui ont mangé 18 000 000 g de Vanille Commun.
//
// L'atelier avait déclaré 6 tournées (18 kg) et 2 tournées (6 kg). L'app a écrit
// le nombre de KILOS dans une case qui comptait des TOURNÉES. Corrigé dans
// api/freezer-list.js (quantiteOrdre) le même jour.
//
// CE QUE FAIT CE SCRIPT
//   1. défait les deux ordres (mrp.unbuild) : tout revient en place ;
//   2. recrée les deux ordres à la bonne quantité, et les valide.
//
// Rien n'est inventé : les mêmes recettes, les mêmes emplacements, le nombre de
// tournées que l'atelier a vraiment faites.
//
//     node scripts/genoise-54-tonnes.mjs             → montre, n'écrit rien
//     node scripts/genoise-54-tonnes.mjs --appliquer → répare

import fs from 'fs'

const A_REPARER = [
  { ordre: 'WHLVP/MO/202912', faux: 18000, vrai: 6 },   // 6 tournées = 18 kg
  { ordre: 'WHLVP/MO/203046', faux: 6000, vrai: 2 },    // 2 tournées = 6 kg
]

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

const trace = []
for (const c of A_REPARER) {
  const [mo] = await sr('mrp.production', [['name', '=', c.ordre]],
    ['id', 'product_id', 'product_qty', 'product_uom_id', 'bom_id', 'state', 'origin',
     'picking_type_id', 'location_src_id', 'location_dest_id', 'company_id'])
  if (!mo) { console.log(`✗ ${c.ordre} introuvable`); continue }
  const [prod] = await ex('product.product', 'read', [[mo.product_id[0]], ['display_name', 'uom_id', 'qty_available']])
  console.log(`${c.ordre}  ${prod.display_name}`)
  console.log(`   ${mo.product_qty} ${mo.product_uom_id[1]}  (${mo.state})   →   ${c.vrai} ${mo.product_uom_id[1]}`)
  console.log(`   stock actuel de l'article : ${prod.qty_available} ${prod.uom_id[1]}`)
  if (mo.state !== 'done') { console.log('   ⚠️ cet ordre n\'est pas validé — je ne le touche pas'); continue }
  if (mo.product_qty !== c.faux) { console.log(`   ⚠️ quantité ${mo.product_qty} ≠ ${c.faux} attendue — je ne touche à rien`); continue }
  trace.push({ c, mo, prod })
}
fs.writeFileSync('genoise-54-tonnes-avant.json',
  JSON.stringify({ date: new Date().toISOString(), trace }, null, 1))

if (!appliquer) {
  console.log()
  console.log('APERÇU — rien n’est écrit. Relance avec --appliquer.')
  process.exit(0)
}

for (const { c, mo } of trace) {
  // 1. défaire : Odoo remet les ingrédients et retire le produit fini
  const unbuildId = await ex('mrp.unbuild', 'create', [{
    mo_id: mo.id,
    product_id: mo.product_id[0],
    bom_id: mo.bom_id ? mo.bom_id[0] : false,
    product_qty: mo.product_qty,
    product_uom_id: mo.product_uom_id[0],
    company_id: mo.company_id[0],
  }])
  await ex('mrp.unbuild', 'action_validate', [[unbuildId]])
  console.log(`✅ ${c.ordre} défait (${mo.product_qty} ${mo.product_uom_id[1]} rendus)`)

  // 2. refaire à la bonne quantité
  const neuf = await ex('mrp.production', 'create', [{
    product_id: mo.product_id[0],
    product_qty: c.vrai,
    product_uom_id: mo.product_uom_id[0],
    bom_id: mo.bom_id ? mo.bom_id[0] : false,
    origin: mo.origin,
    picking_type_id: mo.picking_type_id[0],
    location_src_id: mo.location_src_id[0],
    location_dest_id: mo.location_dest_id[0],
    company_id: mo.company_id[0],
  }])
  await ex('mrp.production', 'action_confirm', [[neuf]])
  await ex('mrp.production', 'action_assign', [[neuf]]).catch(() => { })
  await ex('mrp.production', 'write', [[neuf], { qty_producing: c.vrai }])
  await ex('mrp.production', 'button_mark_done', [[neuf]])
  const [fait] = await ex('mrp.production', 'read', [[neuf], ['name', 'product_qty', 'state']])
  console.log(`✅ ${fait.name} créé et validé : ${fait.product_qty} ${mo.product_uom_id[1]} (${fait.state})`)
}

console.log()
for (const { mo } of trace) {
  const [p] = await ex('product.product', 'read', [[mo.product_id[0]], ['display_name', 'uom_id', 'qty_available']])
  console.log(`stock ${p.display_name.padEnd(34)} ${p.qty_available} ${p.uom_id[1]}`)
}
