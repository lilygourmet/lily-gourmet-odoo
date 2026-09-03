// ============================================================
// Inventaire de l'annexe : compter le stock réel de
// WHPDX/Stock Prod annexe et le comparer à ce que dit Odoo.
//
// La liste des articles vient d'Odoo EN DIRECT (elle bouge) ; les
// quantités comptées vivent dans Supabase (elles nous appartiennent).
// ============================================================
import { supabase } from './supabase'

// Articles à compter : matières premières (MP-) et semi-finis (SM…) présents
// dans l'emplacement. Les fiches archivées ne remontent pas.
export async function loadArticlesInventaire(lieu = 'annexe') {
  const r = await fetch(`/api/catalog-from-odoo?inventaire=${encodeURIComponent(lieu)}`)
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j.articles || []
}

// ⚠️ Sans .limit(), Supabase s'arrête à 1000 lignes sans prévenir.
export async function loadComptages(lieu = 'annexe') {
  const { data, error } = await supabase
    .from('inventaire_comptages').select('*').eq('lieu', lieu).limit(5000)
  if (error) throw error
  return data || []
}

export async function saveComptage(lieu, row) {
  const { error } = await supabase
    .from('inventaire_comptages')
    .upsert({ ...row, lieu, compte_le: new Date().toISOString() }, { onConflict: 'lieu,product_id' })
  if (error) throw error
}

export async function deleteComptages(lieu, productIds) {
  if (!productIds.length) return
  const { error } = await supabase
    .from('inventaire_comptages').delete().eq('lieu', lieu).in('product_id', productIds)
  if (error) throw error
}

// Ce qui est en stock mais absent du catalogue Odoo.
export async function loadAjouts(lieu = 'annexe') {
  const { data, error } = await supabase
    .from('inventaire_ajouts').select('*').eq('lieu', lieu).order('id').limit(2000)
  if (error) throw error
  return data || []
}

export async function addAjout(lieu, row) {
  const { data, error } = await supabase
    .from('inventaire_ajouts').insert({ ...row, lieu }).select().single()
  if (error) throw error
  return data
}

export async function updateAjout(id, quantite) {
  const { error } = await supabase
    .from('inventaire_ajouts').update({ quantite }).eq('id', id)
  if (error) throw error
}

export async function deleteAjout(id) {
  const { error } = await supabase.from('inventaire_ajouts').delete().eq('id', id)
  if (error) throw error
}

// La case de saisie accepte un petit calcul : « 2500+1800+400 » pour trois sacs,
// « 3*500 » pour trois boîtes de 500 g. On ne se sert PAS de eval() (qui
// exécuterait n'importe quoi) : on découpe et on calcule à la main.
// Renvoie null si le texte n'est pas calculable — l'appelant garde alors l'ancienne valeur.
export function calculer(texte) {
  const s = String(texte ?? '').replace(/,/g, '.').replace(/\s/g, '')
  if (!s) return null
  if (!/^[0-9.+\-*]+$/.test(s)) return null
  let total = 0
  for (const terme of s.split(/(?=[+-])/)) {          // « 2500+1800 » → ['2500', '+1800']
    if (!terme || terme === '+' || terme === '-') return null
    let corps = terme, signe = 1
    if (corps[0] === '+') corps = corps.slice(1)
    else if (corps[0] === '-') { signe = -1; corps = corps.slice(1) }
    let produit = 1
    for (const facteur of corps.split('*')) {
      const n = Number(facteur)
      if (facteur === '' || !Number.isFinite(n)) return null
      produit *= n
    }
    total += signe * produit
  }
  return Math.round(total * 1000) / 1000
}

// Tableau prêt à coller dans Excel : une ligne par article compté.
export function tableauInventaire(articles, comptes, ajouts) {
  const vf = n => String(n).replace('.', ',')
  const l = ['Article\tUnité\tCompté\tStock Odoo\tÉcart\tCatégorie\tFamille\tCompté par']
  for (const a of articles) {
    const c = comptes[a.id]
    if (!c) continue
    const ecart = Math.round((c.quantite - a.qty) * 100) / 100
    l.push(`${a.nom}\t${a.uom || ''}\t${vf(c.quantite)}\t${vf(a.qty)}\t${vf(ecart)}\t${a.cat}\t${a.fam}\t${c.compte_par || ''}`)
  }
  for (const a of ajouts) {
    l.push(`${a.nom}\t${a.uom || ''}\t${vf(a.quantite)}\t\t\t\tAjouté à la main\t${a.compte_par || ''}`)
  }
  return l.join('\n')
}
