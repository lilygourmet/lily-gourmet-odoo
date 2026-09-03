import { supabase } from './supabase'
import { sendWatiInfo } from './watiInfo'

// ============================================================
// TRANSFERTS DE STOCK entre PROD ANNEXE et PROD BOUTIQUE
//   • deux sens, deux familles d'articles : « mp » (matières premières) et « sm » (produits)
//   • l'expéditeur enregistre l'envoi, le destinataire confirme la quantité reçue
//   • à la confirmation seulement, un transfert Odoo est créé EN BROUILLON avec la
//     quantité RÉELLEMENT reçue (le stock Odoo ne bouge qu'après validation dans Odoo)
//   • le WhatsApp part à ce moment-là, une fois la ligne DANS Odoo — pas à l'envoi :
//     on annonce ce qui est vraiment entré, pas ce qui est annoncé
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


// ---- Unités de saisie ----
// L'unité proposée dépend de celle dans laquelle Odoo compte l'article : on peut
// saisir en grammes un produit compté en kilos, la conversion est faite ensuite.
// Un article compté à la pièce n'a qu'un seul choix : il est pris d'office.
export const UNITES_SAISIE = { kg: ['g', 'kg'], g: ['g', 'kg'], l: ['cl', 'l'], cl: ['cl', 'l'] }
const FACTEUR = { 'g→kg': 0.001, 'kg→g': 1000, 'cl→l': 0.01, 'l→cl': 100 }

export const unitesPour = uniteOdoo => UNITES_SAISIE[uniteOdoo] || ['u.']

// Quantité à enregistrer, dans l'unité d'Odoo. 500 g d'un produit compté en kg → 0,5.
export function versUniteOdoo(qty, uniteSaisie, uniteOdoo) {
  const f = FACTEUR[`${uniteSaisie}→${uniteOdoo}`]
  return f ? Math.round(Number(qty) * f * 10000) / 10000 : Number(qty)
}

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

// ⚠️ Sans .limit(), Supabase s'arrête à 1000 lignes SANS PRÉVENIR : le journal
// se serait tronqué en silence le jour où l'atelier aurait dépassé ce chiffre
// (244 aujourd'hui). Le même piège a déjà mangé des journées de Pointage.
export async function loadTransferts(famille) {
  const { data, error } = await supabase
    .from('transferts_mp').select('*')
    .eq('famille', famille)
    .order('transfer_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw error
  return data || []
}

/**
 * Ce qui attend d'être réceptionné, dans les deux familles — pour le rappel
 * affiché en haut de l'app. On ne rapporte que ce que CET utilisateur peut
 * confirmer : inutile de rappeler à l'annexe ce que la boutique doit prendre.
 */
export async function loadEnAttentePour(user) {
  if (!lieuxDe(user).length) return []
  const { data, error } = await supabase
    .from('transferts_mp').select('id, matiere, qty_envoye, unite, sens, famille, transfer_date, envoye_par')
    .eq('statut', 'en_attente')
    .order('transfer_date', { ascending: true })
    .limit(200)
  if (error) throw error
  return (data || []).filter(t => peutConfirmer(user, t.sens))
}

/**
 * Retire un envoi que personne n'a encore reçu. Réservé à celui qui l'a saisi
 * (ou à un admin) : une erreur de frappe se corrige sans attendre que l'autre
 * atelier la refuse. Une ligne déjà reçue ou refusée n'est jamais touchée —
 * elle a un bon Odoo derrière elle.
 */
export async function retirerEnvoi(t, user) {
  if (t.statut !== 'en_attente') throw new Error('déjà traité — trop tard pour le retirer')
  const sien = t.envoye_par_id && user?.id && t.envoye_par_id === user.id
  if (!sien && user?.role !== 'admin') throw new Error('seul celui qui l\'a envoyé peut le retirer')
  const { error } = await supabase.from('transferts_mp')
    .delete().eq('id', t.id).eq('statut', 'en_attente')
  if (error) throw error
}

/**
 * L'habitude, pour cet article : la plus grosse quantité déjà envoyée.
 * Sert à repérer une faute de frappe AVANT l'envoi — le 28/08, 2 500 kg de
 * mascarpone sont partis pour 2,5, et personne ne les a rattrapés : le bon
 * Odoo a été créé avec 2,5 tonnes.
 */
export function habitude(rows, odooProductId) {
  const passes = rows
    .filter(r => r.odoo_product_id === odooProductId && Number(r.qty_envoye) > 0)
    .map(r => Number(r.qty_envoye))
  return passes.length ? Math.max(...passes) : null
}

/** Le facteur au-delà duquel on demande confirmation (20 × l'habitude). */
export const FACTEUR_ALERTE = 20

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
}

/**
 * Un nombre lisible, sans décimale inutile : 5,48 · 2 · 5 480 000.
 * `toLocaleString` sépare les milliers par une espace insécable ÉTROITE
 * (U+202F) : elle passe mal dans un message WhatsApp, on remet une espace
 * ordinaire.
 */
const nbT = v => Number(Number(v) || 0)
  .toLocaleString('fr-FR', { maximumFractionDigits: 3 })
  .replace(/[\u202f\u00a0]/g, ' ')

/**
 * Le message envoyé à celui qui a préparé le transfert. Il doit dire tout de
 * suite si la ligne a été REFUSÉE ou MODIFIÉE : c'est là-dessus qu'il vérifie.
 * Une réception conforme se contente d'annoncer l'entrée en stock.
 *
 * Séparée du reste pour être testable — c'est la seule phrase que l'expéditeur
 * lira, elle ne doit pas se tromper.
 */
export function messageReception(t, qty, { refuse = false, ref = null, par = null } = {}) {
  const vers = SENS[t.sens]?.vers || '?'
  const u = t.unite || ''
  const q = n => `${nbT(n)} ${u}`.trim()
  const qui = `envoyé par ${t.envoye_par || '?'}`
  if (refuse) {
    return `❌ REFUSÉ — ${vers} n'a pas pris ${t.matiere} (${q(t.qty_envoye)}, ${qui}`
      + `${par ? `, refusé par ${par}` : ''}). Rien n'entre en stock, aucun bon Odoo. À vérifier.`
  }
  if (Number(qty) !== Number(t.qty_envoye)) {
    return `✏️ MODIFIÉ — ${t.matiere} : ${q(t.qty_envoye)} envoyé, ${q(qty)} reçu par ${vers}`
      + ` (${qui}). Bon Odoo ${ref || '—'}. À vérifier.`
  }
  return `${vers} a reçu ${q(qty)} de ${t.matiere} (${qui}) — bon Odoo ${ref || '—'}.`
}

/**
 * Confirme la réception avec la quantité réellement reçue, puis crée le
 * transfert Odoo EN BROUILLON. Si Odoo refuse, la confirmation reste
 * enregistrée et l'erreur est gardée (odoo_error) pour pouvoir réessayer.
 *
 * `refuse` : la ligne est écartée. Rien n'est créé dans Odoo — mais celui qui
 * l'a préparée est prévenu, ce qui n'arrivait pas quand « refuser » voulait
 * dire « taper 0 » : la fonction sortait avant le WhatsApp et personne ne
 * savait que sa marchandise avait été rendue.
 */
export async function confirmTransfert(t, qtyRecu, user, { refuse = false } = {}) {
  const qty = refuse ? 0 : Number(qtyRecu)
  const { error } = await supabase.from('transferts_mp').update({
    statut: refuse ? 'refuse' : 'recu',
    qty_recu: qty,
    recu_par: user?.full_name || null,
    recu_par_id: user?.id || null,
    confirmed_at: new Date().toISOString(),
  }).eq('id', t.id)
  if (error) throw error

  // Refusé, ou rien à passer : pas de bon Odoo, mais l'expéditeur est prévenu.
  if (refuse || !(qty > 0) || !t.odoo_product_id) {
    notifier(t.sens, t.famille,
      messageReception(t, qty, { refuse: true, par: user?.full_name || null }), user).catch(() => {})
    return null
  }
  const ref = await envoyerVersOdoo(t, qty, user)
  // Le WhatsApp part une fois que c'est DANS Odoo : il annonce ce qui est
  // réellement entré en stock, avec le numéro du bon. Il ne doit jamais faire
  // échouer la confirmation elle-même.
  notifier(t.sens, t.famille, messageReception(t, qty, { ref }), user).catch(() => {})
  return ref
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

// ---- Alerte WhatsApp ----
//
// Matières premières : les mêmes destinataires que l'économat, c'est-à-dire les
// économes (leur numéro vient de leur fiche).
// Produits SM : un numéro dédié, saisi dans l'écran (⚙ en haut de l'onglet).

const CLE_WA_SM = 'wa_sm'

export async function loadWaSm() {
  const { data } = await supabase.from('transferts_config').select('value').eq('key', CLE_WA_SM).maybeSingle()
  return data?.value || ''
}

export async function saveWaSm(numero) {
  const { error } = await supabase.from('transferts_config')
    .upsert({ key: CLE_WA_SM, value: String(numero || '').trim() }, { onConflict: 'key' })
  if (error) throw error
}

const normalizePhone = raw => {
  let n = String(raw || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '212' + n.slice(1)
  return n
}

// Envoi direct à un numéro : message de conversation si elle est ouverte, sinon
// modèle « wati_info » (qui n'accepte pas de retour à la ligne dans sa variable).
export async function envoyerAuNumero(numero, message, user) {
  const phone = normalizePhone(numero)
  if (!phone) return false
  const texte = String(message).replace(/\s*\n\s*/g, ' ')
  const { data: conv } = await supabase.from('conversations').select('id').eq('client_phone', phone).maybeSingle()
  if (conv?.id) {
    const r = await fetch('/api/wati-webhook?action=send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: conv.id, clientPhone: phone, userId: user?.id, text: `📦 ${texte}` }),
    })
    if (r.ok) return true
  }
  const r2 = await fetch('/api/wati-webhook?action=send-template', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientPhone: phone, templateName: 'wati_info', parameters: [{ name: '1', value: texte }], userId: user?.id }),
  }).catch(() => null)
  return !!(r2 && r2.ok)
}

async function notifier(sens, famille, texte, user) {
  if (famille === 'sm') return envoyerAuNumero(await loadWaSm(), texte, user)
  // Matières premières : les économes, comme pour l'économat.
  const { data } = await supabase.from('profiles').select('id').eq('perm_econome', true).eq('active', true)
  const ids = (data || []).map(r => r.id).filter(id => id && id !== user?.id)
  if (!ids.length) return false
  await sendWatiInfo({
    message: String(texte).replace(/\s*\n\s*/g, ' '),
    recipientIds: ids, cible: 'transferts', userId: user?.id, userName: user?.full_name,
  })
  return true
}
