// LE GIANDUJA, D'APRÈS DEUX VRAIES FOURNÉES.
//
// Layla, le 2026-09-15 : « change la nomenclature en te basant sur 692 ».
//
// CE QU'ON SAIT, et d'où ça vient. Deux fournées entières, mousse comprise :
//
//     cuve de 2 754 g  →  3 grands + 14 petits      (15/09)
//     cuve de 6 120 g  →  1 grand  + 112 petits     (13/09)
//
// Deux équations, deux inconnues, une seule solution :
//
//     3G + 14P = 2 754        G = 692 g   la mousse d'un 10 pers
//      G + 112P = 6 120       P = 48,5 g  la mousse d'un individuel
//
// La recette réclamait 918 g pour un grand qui n'en prend que 692 : 680 g de
// trop par fournée de trois, d'où les 14 petits « en rab » à chaque fois.
//
// CE QUI CHANGE :
//   · 10 pers — chaque ligne de MOUSSE ramenée au facteur 692/918 = 0,7538.
//     Les trois morceaux (crémeux, crémeux vanille, biscuit) ne bougent pas :
//     un gâteau reste un gâteau.
//   · Indiv — la cuve ne change pas (6 120 g), mais elle donne 126 pièces et
//     non 133 (6 120 ÷ 48,5). Les trois morceaux suivent : 133 → 126.
//
// ⚠️ Ça repose sur DEUX fournées, et sur le fait que la cuve ait été vidée les
// deux fois. Si l'une avait laissé un fond, les chiffres bougent.
//
// L'état d'avant est sauvegardé dans gianduja-692-avant.json.
//
//     node scripts/gianduja-692.mjs             → montre, n'écrit rien
//     node scripts/gianduja-692.mjs --appliquer → écrit

import fs from 'fs'

const GRAND = 'SM- Gianduja 10 pers'
const INDIV = 'SM- Gianduja Indiv'
const MOUSSE_GRAND = 692        // g, mesurés
const PIECES_CUVE = 126         // individuels dans une cuve de 6 120 g
const A_LA_PIECE = /cremeux|crémeux|biscuit/i

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
    ['id', 'product_id', 'product_qty', 'product_uom_id'], { limit: 40 })
  return { p, bom, lignes }
}

const grand = await recetteDe(GRAND)
const indiv = await recetteDe(INDIV)
fs.writeFileSync('gianduja-692-avant.json',
  JSON.stringify({ date: new Date().toISOString(), grand, indiv }, null, 1))

// ---- LE GRAND ----
const mousseGrand = grand.lignes.filter(l => !A_LA_PIECE.test(l.product_id[1]))
const avant = mousseGrand.reduce((t, l) => t + enG(l.product_qty, l.product_uom_id[1]), 0)
const parPiece = avant / (grand.bom.product_qty || 1)
const facteur = MOUSSE_GRAND / parPiece
console.log(`${GRAND} — recette #${grand.bom.id}, sort ${grand.bom.product_qty} ${grand.bom.product_uom_id[1]}`)
console.log(`   mousse : ${parPiece} g la pièce  →  ${MOUSSE_GRAND} g   (× ${Math.round(facteur * 10000) / 10000})`)
const aEcrire = []
for (const l of grand.lignes) {
  if (A_LA_PIECE.test(l.product_id[1])) {
    console.log(`   ${String(l.product_id[1]).slice(0, 34).padEnd(36)} ${l.product_qty} ${l.product_uom_id[1]}  (inchangé — un gâteau reste un gâteau)`)
    continue
  }
  const neuf = Math.round(l.product_qty * facteur * 100) / 100
  aEcrire.push({ id: l.id, qty: neuf })
  console.log(`   ${String(l.product_id[1]).slice(0, 34).padEnd(36)} ${String(l.product_qty).padStart(7)} → ${String(neuf).padStart(7)} ${l.product_uom_id[1]}`)
}
console.log(`   total : ${Math.round(aEcrire.reduce((t, x) => t + x.qty, 0) * 100) / 100} g`)

// ---- L'INDIVIDUEL ----
const mousseIndiv = indiv.lignes.filter(l => !A_LA_PIECE.test(l.product_id[1]))
  .reduce((t, l) => t + enG(l.product_qty, l.product_uom_id[1]), 0)
console.log(`\n${INDIV} — recette #${indiv.bom.id}`)
console.log(`   la cuve ne bouge pas : ${mousseIndiv} g`)
console.log(`   sortie : ${indiv.bom.product_qty} → ${PIECES_CUVE} pièces   (${Math.round(mousseIndiv / PIECES_CUVE * 100) / 100} g la pièce)`)
const morceaux = indiv.lignes.filter(l => A_LA_PIECE.test(l.product_id[1]))
for (const l of morceaux) {
  console.log(`   ${String(l.product_id[1]).slice(0, 34).padEnd(36)} ${String(l.product_qty).padStart(7)} → ${String(PIECES_CUVE).padStart(7)} ${l.product_uom_id[1]}`)
}

if (!appliquer) {
  console.log()
  console.log('APERÇU — rien n’est écrit. Relance avec --appliquer.')
  process.exit(0)
}

for (const x of aEcrire) await ex('mrp.bom.line', 'write', [[x.id], { product_qty: x.qty }])
await ex('mrp.bom', 'write', [[indiv.bom.id], { product_qty: PIECES_CUVE }])
for (const l of morceaux) await ex('mrp.bom.line', 'write', [[l.id], { product_qty: PIECES_CUVE }])

const g2 = await recetteDe(GRAND)
const i2 = await recetteDe(INDIV)
const tot = g2.lignes.filter(l => !A_LA_PIECE.test(l.product_id[1]))
  .reduce((t, l) => t + enG(l.product_qty, l.product_uom_id[1]), 0)
console.log()
console.log(`✅ ${GRAND} : ${Math.round(tot * 100) / 100} g de mousse la pièce`)
console.log(`✅ ${INDIV} : la cuve sort ${i2.bom.product_qty} pièces`)
