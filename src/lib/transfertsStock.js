import { supabase } from './supabase'

// ============================================================
// TRANSFERTS DE STOCK entre PROD ANNEXE et PROD BOUTIQUE
//   • deux sens, deux familles d'articles : « mp » (matières premières) et « sm » (produits)
//   • l'expéditeur enregistre l'envoi, le destinataire confirme la quantité reçue
//   • à la confirmation seulement, un transfert Odoo est créé EN BROUILLON avec la
//     quantité RÉELLEMENT reçue (le stock Odoo ne bouge qu'après validation dans Odoo)
// ============================================================

export const SENS = {
  annexe_boutique: { label: 'Annexe → Boutique', de: 'Prod annexe', vers: 'Prod boutique', lieuEnvoi: 'annexe', lieuRecu: 'boutique' },
  boutique_annexe: { label: 'Boutique → Annexe', de: 'Prod boutique', vers: 'Prod annexe', lieuEnvoi: 'boutique', lieuRecu: 'annexe' },
}

// Catégories d'articles, dans l'ordre voulu par Layla (rangement du 2026-08-22).
// Les clés sont figées : elles sont stockées dans transferts_articles.groupe.
export const GROUPES = [
  { key: 'creme',        label: 'Crème/amande/Caramel' },
  { key: 'glacage',      label: 'Glaçages/Ganache et Confit' },
  { key: 'viennoiserie', label: 'Viennoiseries & Donuts' },
  { key: 'cake',         label: 'Cakes/Cookies' },
  { key: 'entremet',     label: 'Entremets' },
  { key: 'tarte',        label: 'Tartes' },
  { key: 'genoise',      label: 'Genoises/Crunchy' },
  { key: 'matiere',      label: 'Matières premières' },
  { key: 'mignardise',   label: 'Mignardises/Choux' },
  { key: 'chocolat',     label: 'Chocolat' },
]

export const FAMILLES = {
  mp: { label: 'Matières premières', titre: 'Transferts MP' },
  sm: { label: 'Produits', titre: 'Transferts Produits SM' },
}

// La permission d'un employé désigne son ATELIER : il envoie DEPUIS son atelier
// et confirme ce qui y ARRIVE. Pas de droit séparé « envoyer » / « réceptionner » :
// dans les faits, les mêmes personnes font les deux.
export function lieuxDe(user) {
  if (!user) return []
  if (user.role === 'admin') return ['annexe', 'boutique']
  const l = []
  if (user.perm_transfert_annexe === true) l.push('annexe')
  if (user.perm_transfert_boutique === true) l.push('boutique')
  return l
}
export const peutEnvoyer = (user, sens) => lieuxDe(user).includes(SENS[sens]?.lieuEnvoi)
export const peutConfirmer = (user, sens) => lieuxDe(user).includes(SENS[sens]?.lieuRecu)

// ---- Articles proposés (vignettes) ----

// Liste d'une famille, les plus transférés d'abord (fréquence Odoo sur 5 mois).
// `tout` inclut les articles masqués, pour pouvoir les remettre.
export async function loadArticles(famille, tout = false) {
  let q = supabase.from('transferts_articles').select('*').eq('famille', famille)
  if (!tout) q = q.eq('actif', true)
  const { data, error } = await q
    .order('nb_transferts', { ascending: false })
    .order('nom')
  if (error) throw error
  return data || []
}

// Masquer / réafficher un article (l'historique n'est jamais touché).
export async function setArticleActif(odooProductId, actif) {
  const { error } = await supabase.from('transferts_articles')
    .update({ actif: !!actif }).eq('odoo_product_id', odooProductId)
  if (error) throw error
}

// Recherche dans le catalogue Odoo pour ajouter un article absent de la liste.
export async function searchOdooProducts(q) {
  const res = await fetch(`/api/catalog-from-odoo?transferts=1&q=${encodeURIComponent(q)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Recherche Odoo impossible')
  return data.products || []
}

// Ajoute un produit Odoo à la liste d'une famille (il y restera pour tout le monde).
export async function addArticle({ produit, famille, user }) {
  const { error } = await supabase.from('transferts_articles').upsert({
    odoo_product_id: produit.id,
    nom: produit.nom,
    unite: produit.unite || 'Units',
    famille,
    actif: true,
    ajoute_par: user?.full_name || null,
  }, { onConflict: 'odoo_product_id' })
  if (error) throw error
}

// Retire un article de la liste (sans toucher à l'historique des transferts).
export async function removeArticle(odooProductId) {
  const { error } = await supabase.from('transferts_articles')
    .update({ actif: false }).eq('odoo_product_id', odooProductId)
  if (error) throw error
}

// ---- Transferts ----

export async function loadTransferts(famille) {
  const { data, error } = await supabase
    .from('transferts_mp').select('*')
    .eq('famille', famille)
    .order('transfer_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Enregistre un envoi (en attente de confirmation) puis prévient l'autre atelier.
export async function addTransfert({ famille, sens, article, qty, date, user }) {
  const { error } = await supabase.from('transferts_mp').insert({
    famille,
    sens,
    matiere: article.nom,
    odoo_product_id: article.odoo_product_id || article.id || null,
    unite: article.unite || 'kg',
    qty_envoye: Number(qty),
    transfer_date: date,
    envoye_par: user?.full_name || null,
    envoye_par_id: user?.id || null,
  })
  if (error) throw error
  // Le message ne doit pas faire échouer l'enregistrement du transfert.
  notifier(sens, `${SENS[sens].de} envoie ${qty} ${article.unite || 'kg'} de ${article.nom} — à confirmer dans l'app (${SENS[sens].vers}).`, user)
    .catch(() => {})
}

// Envoie une LISTE d'articles d'un coup (le panier) : une ligne par article,
// et un seul message WhatsApp qui récapitule.
export async function addTransfertsGroupes({ famille, sens, lignes, date, user }) {
  const rows = lignes.map(l => ({
    famille,
    sens,
    matiere: l.nom,
    odoo_product_id: l.odoo_product_id || l.id || null,
    unite: l.unite || 'kg',
    qty_envoye: Number(l.qty),
    transfer_date: date,
    envoye_par: user?.full_name || null,
    envoye_par_id: user?.id || null,
  }))
  const { error } = await supabase.from('transferts_mp').insert(rows)
  if (error) throw error
  const detail = lignes.map(l => `${l.nom} ${l.qty} ${l.unite || 'kg'}`).join(', ')
  notifier(sens, `${SENS[sens].de} envoie ${lignes.length} article(s) : ${detail} — à confirmer dans l'app (${SENS[sens].vers}).`, user)
    .catch(() => {})
}

/**
 * Confirme la réception avec la quantité réellement reçue, puis crée le
 * transfert Odoo EN BROUILLON. Si Odoo refuse, la confirmation reste
 * enregistrée et l'erreur est gardée (odoo_error) pour pouvoir réessayer.
 */
export async function confirmTransfert(t, qtyRecu, user) {
  const qty = Number(qtyRecu)
  const { error } = await supabase.from('transferts_mp').update({
    statut: 'recu',
    qty_recu: qty,
    recu_par: user?.full_name || null,
    recu_par_id: user?.id || null,
    confirmed_at: new Date().toISOString(),
  }).eq('id', t.id)
  if (error) throw error
  if (!(qty > 0) || !t.odoo_product_id) return null      // rien à passer dans Odoo
  return envoyerVersOdoo(t, qty, user)
}

// Crée le transfert Odoo (brouillon) d'une ligne déjà confirmée.
export async function envoyerVersOdoo(t, qty, user) {
  try {
    const res = await fetch('/api/economat-transfert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'stock',
        sens: t.sens,
        origine: `TRANSFERT ${SENS[t.sens]?.label || ''} — envoyé par ${t.envoye_par || '?'}, reçu par ${user?.full_name || '?'}`.trim(),
        lignes: [{
          odooProductId: t.odoo_product_id,
          nom: t.matiere,
          qty,
          envoyePar: t.envoye_par || null,
          recuPar: user?.full_name || null,
        }],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Odoo a refusé le transfert')
    await supabase.from('transferts_mp')
      .update({ odoo_picking_id: data.id, odoo_picking_name: data.name, odoo_error: null })
      .eq('id', t.id)
    return data.name || null
  } catch (e) {
    await supabase.from('transferts_mp').update({ odoo_error: String(e.message || e).slice(0, 300) }).eq('id', t.id)
    throw e
  }
}

// ---- Numéros WhatsApp prévenus (un par sens) ----

const CLE_WA = { annexe_boutique: 'transfert_wa_boutique', boutique_annexe: 'transfert_wa_annexe' }

export async function loadWaNumbers() {
  const { data } = await supabase.from('app_config').select('key, value').in('key', Object.values(CLE_WA))
  const m = Object.fromEntries((data || []).map(r => [r.key, r.value]))
  return { annexe_boutique: m[CLE_WA.annexe_boutique] || '', boutique_annexe: m[CLE_WA.boutique_annexe] || '' }
}

export async function saveWaNumbers(nums) {
  const rows = Object.entries(CLE_WA).map(([sens, key]) => ({ key, value: String(nums[sens] || '').trim() }))
  const { error } = await supabase.from('app_config').upsert(rows, { onConflict: 'key' })
  if (error) throw error
}

const normalizePhone = raw => {
  let n = String(raw || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '212' + n.slice(1)
  return n
}

// Prévient le numéro configuré pour ce sens : message de conversation si elle est
// ouverte, sinon modèle « wati_info » (une seule ligne : un modèle Wati n'accepte
// pas de retour à la ligne dans sa variable).
async function notifier(sens, texte, user) {
  const nums = await loadWaNumbers()
  const phone = normalizePhone(nums[sens])
  if (!phone) return false
  const message = String(texte).replace(/\s*\n\s*/g, ' ')
  const { data: conv } = await supabase.from('conversations').select('id').eq('client_phone', phone).maybeSingle()
  if (conv?.id) {
    const r = await fetch('/api/wati-webhook?action=send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conv.id, clientPhone: phone, userId: user?.id, text: `📦 ${message}` }),
    })
    if (r.ok) return true
  }
  const r2 = await fetch('/api/wati-webhook?action=send-template', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientPhone: phone, templateName: 'wati_info', parameters: [{ name: '1', value: message }], userId: user?.id }),
  }).catch(() => null)
  return !!(r2 && r2.ok)
}
