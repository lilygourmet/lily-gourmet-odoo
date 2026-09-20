// ============================================================
// LES CUVES DEVIENNENT DE VRAIS ARTICLES.
//
// « Le problème : l'article mousse n'existe pas. Comment Odoo va le
// traiter ? » (Layla, 2026-09-20) — et elle avait raison de s'inquiéter :
// « Mousse Gianduja », « La mousse » du tiramisu et celle du royal n'étaient
// que des NOMS donnés à un groupe de matières premières. La mousse qui reste
// dans la cuve n'existait donc nulle part : ni en stock, ni dans « À finir ».
//
// Ce script crée les trois articles manquants, leur donne leur recette, et
// remplace les ingrédients figés par une seule ligne de mousse dans chacun des
// sept gâteaux.
//
// ⚠️ Les proportions ont été vérifiées AVANT : d'une taille à l'autre, les
// ingrédients gardent les mêmes pourcentages à 0,12 % près. C'est donc bien la
// même mousse, et une seule recette suffit par famille.
//
// ⚠️ « Chacun a sa propre recette » (Layla) : le tiramisu et le royal ne
// partagent PAS leur mousse, même si l'app les appelait toutes les deux
// « La mousse ».
//
// ⚠️ Le LAIT UHT du royal chocolat (838 g / 2 100 g) n'est pas dans ses figés :
// il reste dans la recette du gâteau et continue de suivre la quantité. À
// déplacer aussi si Layla le confirme.
//
//   node scripts/mousses-en-articles.mjs              → essai à blanc
//   node scripts/mousses-en-articles.mjs --appliquer  → écrit pour de bon
//
// La sauvegarde de l'état d'avant est écrite dans `mousses-avant.json`.
// ============================================================
import fs from 'fs'

const env = {}
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim()
}
const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD,
  VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env

const rpc = async (service, method, args) => {
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
  })
  const j = await r.json()
  if (j.error) throw new Error(String(j.error.data?.message || j.error.message || '').slice(0, 400))
  return j.result
}
const uid = await rpc('common', 'authenticate', [ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD, {}])
const ex = (model, method, args, kw = {}) =>
  rpc('object', 'execute_kw', [ODOO_DB, uid, ODOO_PASSWORD, model, method, args, kw])
const sr = (model, domain, fields, opts = {}) => ex(model, 'search_read', [domain, fields], opts)

const sb = (chemin, opts = {}) => fetch(`${VITE_SUPABASE_URL}/rest/v1/${chemin}`, {
  ...opts,
  headers: {
    apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json', ...(opts.headers || {}),
  },
})

const APPLIQUER = process.argv.includes('--appliquer')
const G = 13                    // l'unité « g » chez Odoo
const CATEG = 33                // « Produits Semi Finis »
const sansRef = t => String(t || '').replace(/^\[[^\]]*\]\s*/, '').trim()
const rond = v => Math.round(v * 100) / 100

// Chaque famille : le gâteau qui sert de RÉFÉRENCE pour la recette, de combien
// de fois on multiplie sa cuve, et ce que chaque gâteau en prendra.
const FAMILLES = [
  { mousse: 'SM. Mousse Gianduja', reference: 'SM- Gianduja Indiv', fois: 1,
    gateaux: ['SM- Gianduja Indiv', 'SM- Gianduja 10 pers'] },
  // ×10 : la cuve d'un seul 20 cm ne veut rien dire, dix en font une vraie.
  { mousse: 'SM. Mousse Tiramisu', reference: 'SM- Tiramisu 20cm', fois: 10,
    gateaux: ['SM- Tiramisu 20cm', 'SM- Tiramisu 15cm', 'SM- Tiramisu Indiv'] },
  { mousse: 'SM. Mousse Royal Chocolat', reference: 'SM- Royal Chocolat 20 cm', fois: 1,
    gateaux: ['SM- Royal Chocolat 20 cm', 'SM- Royal Chocolat 15 cm'] },
]

// ---------- 1. ON LIT ET ON SAUVEGARDE ----------
const cat = await (await sb('fab_annexe_articles?select=produit,figes_nom,figes&limit=2000')).json()
const regl = new Map(cat.map(c => [c.produit, c]))

const etat = {}
for (const f of FAMILLES) {
  for (const nom of f.gateaux) {
    const p = (await sr('product.product', [['name', '=', nom]],
      ['id', 'name', 'product_tmpl_id'], { limit: 1 }))[0]
    if (!p) throw new Error('article introuvable : ' + nom)
    const bom = (await sr('mrp.bom', [['product_tmpl_id', '=', p.product_tmpl_id[0]]],
      ['id', 'product_qty', 'product_uom_id'], { limit: 1 }))[0]
    if (!bom) throw new Error('recette introuvable : ' + nom)
    const lignes = await sr('mrp.bom.line', [['bom_id', '=', bom.id]],
      ['id', 'product_id', 'product_qty', 'product_uom_id'])
    const figes = new Set(regl.get(nom)?.figes || [])
    etat[nom] = { produit: p, bom, lignes, figes: [...figes],
      figesNom: regl.get(nom)?.figes_nom || null,
      aRetirer: lignes.filter(l => figes.has(sansRef(l.product_id[1]))) }
  }
}
fs.writeFileSync('mousses-avant.json', JSON.stringify(etat, null, 1))
console.log('💾 état d’avant sauvegardé dans mousses-avant.json\n')

// ---------- 2. CE QU'ON VA FAIRE ----------
const plan = []
for (const f of FAMILLES) {
  const ref = etat[f.reference]
  const parIngredient = new Map()
  for (const l of ref.aRetirer) {
    const e = parIngredient.get(l.product_id[0]) || { nom: sansRef(l.product_id[1]), qty: 0 }
    e.qty += Number(l.product_qty) || 0
    parIngredient.set(l.product_id[0], e)
  }
  const cuve = rond([...parIngredient.values()].reduce((t, x) => t + x.qty, 0) * f.fois)
  const recette = [...parIngredient].map(([id, x]) => ({ id, nom: x.nom, qty: rond(x.qty * f.fois) }))
  const dedans = f.gateaux.map(g => ({
    gateau: g,
    qty: rond(etat[g].aRetirer.reduce((t, l) => t + (Number(l.product_qty) || 0), 0)),
    retire: etat[g].aRetirer.length,
  }))
  plan.push({ ...f, cuve, recette, dedans })

  console.log(`=== ${f.mousse} — recette pour ${cuve} g`)
  for (const i of recette) console.log(`      ${i.nom.padEnd(36)} ${String(i.qty).padStart(9)} g`)
  for (const d of dedans) {
    console.log(`    → ${d.gateau.padEnd(26)} : ${d.retire} ligne(s) figée(s) remplacées par ${d.qty} g de mousse`)
  }
  console.log()
}

if (!APPLIQUER) {
  console.log('ESSAI À BLANC — rien n’a été écrit. Relancer avec --appliquer.')
  process.exit(0)
}

// ---------- 3. ON ÉCRIT ----------
for (const f of plan) {
  // L'article, s'il n'existe pas déjà (le script se relance sans dégât).
  let tmpl = (await sr('product.template', [['name', '=', f.mousse]], ['id'], { limit: 1 }))[0]
  if (!tmpl) {
    const id = await ex('product.template', 'create', [{
      name: f.mousse, type: 'product', uom_id: G, uom_po_id: G, categ_id: CATEG,
      sale_ok: false, purchase_ok: false,
    }])
    tmpl = { id }
    console.log(`✅ article créé : ${f.mousse} (modèle ${id})`)
  } else console.log(`↩︎ article déjà là : ${f.mousse} (modèle ${tmpl.id})`)

  // Sa recette.
  let bom = (await sr('mrp.bom', [['product_tmpl_id', '=', tmpl.id]], ['id'], { limit: 1 }))[0]
  if (!bom) {
    const id = await ex('mrp.bom', 'create', [{
      product_tmpl_id: tmpl.id, product_qty: f.cuve, product_uom_id: G, type: 'normal',
    }])
    bom = { id }
    for (const i of f.recette) {
      await ex('mrp.bom.line', 'create', [{ bom_id: id, product_id: i.id, product_qty: i.qty, product_uom_id: G }])
    }
    console.log(`   recette créée (${f.recette.length} ingrédients pour ${f.cuve} g)`)
  } else console.log(`   ↩︎ recette déjà là (${bom.id})`)

  const prod = (await sr('product.product', [['product_tmpl_id', '=', tmpl.id]], ['id'], { limit: 1 }))[0]

  // Dans chaque gâteau : les figés s'en vont, la mousse arrive.
  for (const d of f.dedans) {
    const e = etat[d.gateau]
    const ids = e.aRetirer.map(l => l.id)
    if (ids.length) await ex('mrp.bom.line', 'unlink', [ids])
    await ex('mrp.bom.line', 'create', [{
      bom_id: e.bom.id, product_id: prod.id, product_qty: d.qty, product_uom_id: G,
    }])
    console.log(`   ${d.gateau} : ${ids.length} ligne(s) retirée(s), ${d.qty} g de mousse ajoutés`)

    // ⚠️ ET LA LISTE DES FIGÉS DE L'APP SUIT. Sans ça elle chercherait des
    // ingrédients qui ont quitté la recette, et le verrou de la cuve tomberait.
    await sb(`fab_annexe_articles?produit=eq.${encodeURIComponent(d.gateau)}`, {
      method: 'PATCH', body: JSON.stringify({ figes: [f.mousse] }),
    })
  }

  // La mousse entre au catalogue de l'annexe (sinon on ne peut pas la déclarer)
  // et sur la liste « À finir » (c'est tout l'intérêt : suivre ce qui reste).
  await sb('fab_annexe_articles', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ produit: f.mousse, libelle: f.mousse.replace(/^SM\.\s*/, ''),
      mini: 0, maxi: 0, tournee: f.cuve, actif: true }),
  })
  await sb('annexe_mise_en_forme', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ produit: f.mousse, actif: true, note: 'coulée en moules' }),
  })
  console.log(`   catalogue + « À finir » : ${f.mousse} inscrite\n`)
}
console.log('Terminé. Pour revenir en arrière : mousses-avant.json garde chaque ligne retirée.')
