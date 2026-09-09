import { supabase } from './supabase'
import { estModeTest } from './modeTest'

// Odoo répond en 1 à 2 secondes : on réaffiche d'abord ce qu'on avait la
// dernière fois, puis on remplace dès que la vraie réponse arrive. L'écran
// s'ouvre instantanément au lieu de rester vide.
export function dernierEcran(cle) {
  try { const v = sessionStorage.getItem('ecran:' + cle); return v ? JSON.parse(v) : null } catch { return null }
}
export function garderEcran(cle, data) {
  try { sessionStorage.setItem('ecran:' + cle, JSON.stringify(data)) } catch { /* quota plein : tant pis */ }
}

// Liste de fabrication CD* : lue dans Odoo (ordres de fabrication encore à faire),
// la coche « fait » vit dans l'app (table prod_of_faits).

/**
 * Ce qu'il y a à fabriquer : les ordres CD* encore à faire (retards compris),
 * les recettes des préparations (nomenclatures Odoo) et les stocks disponibles.
 * → { ofs, ordres, recettes, stocks, catalogue }
 */
export async function loadFabrication(jours = 60) {
  const r = await fetch(`/api/freezer-list?mode=fabrication&jours=${jours}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const data = await r.json()
  return { ofs: data.ofs || [], ordres: data.ordres || [], recettes: data.recettes || {}, stocks: data.stocks || {}, catalogue: data.catalogue || [] }
}

/**
 * Relance les CD* passés sous leur mini. Ce sont les mini/maxi de l'APP (table
 * `cd_minmax`) : les 55 règles d'Odoo ont été effacées, elles relançaient les
 * mêmes fabrications chaque matin. Sans effet quand il n'y a rien à lancer —
 * on peut donc l'appeler à chaque « Actualiser ».
 */
export async function reapproCD() {
  const r = await fetch('/api/freezer-list?mode=reappro-cd')
  if (!r.ok) throw new Error(`réappro indisponible (${r.status})`)
  return await r.json()
}

/**
 * Les articles dont Odoo compte MOINS QUE ZÉRO au labo. Un stock négatif compte
 * comme zéro disponible : c'est lui qui fait dire « il manque 600 g de crème »
 * alors que la crème est là. Affiché à côté de « À valider », là où la question
 * se pose. Chaque écran ne voit QUE ses articles : `cd` → le labo cake design,
 * noms portant « CD* » ; `annexe` → l'annexe, noms commençant par « SM ».
 */
export async function loadStocksNegatifs(atelier = 'cd') {
  const r = await fetch(`/api/freezer-list?mode=stocks-negatifs&atelier=${encodeURIComponent(atelier)}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).articles || []
}

/**
 * Le nom des gens, par identifiant — pour dire QUI a déclaré une fabrication.
 * L'app enregistrait déjà l'auteur de chaque coche sans jamais le montrer :
 * « d'où sortent ces articles ? » (Layla, 2026-09-08) n'avait pas de réponse à
 * l'écran. Silencieux : sans les noms on affiche juste l'heure.
 */
export async function loadNoms() {
  const { data, error } = await supabase.from('profiles').select('id, username, full_name')
  if (error) return {}
  const out = {}
  for (const p of data || []) out[p.id] = p.full_name || p.username || ''
  return out
}

/**
 * Les mini/maxi que l'app tient à la place d'Odoo (voir supabase/cd_minmax.sql).
 * Réservé aux admins côté écran ; la table, elle, est lue par tout le monde —
 * c'est le réappro du matin qui s'en sert.
 */
export async function loadMinMax() {
  const { data, error } = await supabase.from('cd_minmax')
    .select('produit, mini, maxi, unite, actif, maj_le').order('produit').limit(2000)
  if (error) throw error
  return data || []
}

/** Enregistre une ligne mini/maxi. `produit` est la clé : on écrase ou on crée. */
export async function saveMinMax(ligne, userId) {
  const { error } = await supabase.from('cd_minmax').upsert({
    produit: ligne.produit,
    mini: Number(ligne.mini) || 0,
    maxi: Number(ligne.maxi) || 0,
    unite: ligne.unite || null,
    actif: ligne.actif !== false,
    maj_le: new Date().toISOString(),
    maj_par: userId || null,
  }, { onConflict: 'produit' })
  if (error) throw error
}

/** Ce qu'il reste en stock de chaque article CD*, pour régler les mini/maxi. */
export async function loadStockMinMax() {
  const r = await fetch('/api/freezer-list?mode=stock-minmax')
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).stocks || {}
}

/**
 * L'état Odoo de CES ordres-là, et rien d'autre. Pour la pastille « À valider » :
 * elle doit compter exactement ce que l'écran affichera — donc sans les ordres
 * validés ou annulés — sans payer la lecture de tous leurs composants.
 * → { 'WHLVP/MO/202379': 'done', … }
 */
export async function loadEtats(ordres) {
  const noms = [...new Set((ordres || []).filter(Boolean))]
  if (!noms.length) return {}
  const r = await fetch(`/api/freezer-list?mode=etats&ordres=${encodeURIComponent(noms.join(','))}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  const out = {}
  for (const o of (await r.json()).ordres || []) out[o.name] = o.etat
  return out
}

/** Juste les ordres Odoo encore ouverts (rapide : une seule question à Odoo). */
export async function loadOrdres() {
  const r = await fetch('/api/freezer-list?mode=ordres')
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).ordres || []
}

/**
 * Les préparations que Layla considère comme des BASES : elles se font par
 * tournée entière, servent plusieurs recettes, et leur ligne reste intacte.
 * Rangées dans app_config pour qu'on puisse en ajouter sans toucher au code.
 */
export async function loadBasesChoisies() {
  // Même piège que les saisies : `app_config` est fermée au navigateur.
  const v = await loadSaisies('fabrication_bases')
  return Array.isArray(v) ? v : (Array.isArray(v?.liste) ? v.liste : [])
}

/**
 * Les quantités en cours de saisie d'un écran « À valider », rangées dans
 * app_config : commencées sur la tablette, retrouvées sur le téléphone.
 * Elles sont effacées dès que l'ordre est validé dans Odoo.
 */
// ⚠️ PAS d'accès direct à `app_config` : sa RLS est fermée exprès (elle garde le
// code du verrou Caisse/RH), le navigateur s'y casse les dents en silence — ce
// qui a fait perdre les quantités corrigées pendant une demi-journée. On passe
// par le serveur, qui a la clé de service et n'accepte que ces deux clés-là.
export async function loadSaisies(cle) {
  const r = await fetch('/api/wati-webhook?action=saisies', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cle }),
  })
  if (!r.ok) return {}
  return (await r.json()).valeurs || {}
}

export async function saveSaisies(cle, valeurs) {
  const r = await fetch('/api/wati-webhook?action=saisies', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cle, valeurs: valeurs || {} }),
  })
  if (!r.ok) throw new Error('saisies non enregistrées (' + r.status + ')')
}

export async function saveBasesChoisies(liste) {
  await saveSaisies('fabrication_bases', { liste: liste || [] })
}

/**
 * Les OF déjà cochés « fait » (clé = nom de l'OF).
 *
 * ⚠️ `.limit()` explicite : sans lui Supabase s'arrête à 1 000 lignes SANS
 * prévenir, et rend un sous-ensemble arbitraire — des déclarations
 * disparaîtraient de « À valider » sans que rien ne le dise. La table ne se
 * vide que quand un ordre est validé (ou décoché), donc elle peut grossir vite
 * un jour chargé. On lit du plus récent au plus ancien : si le plafond était
 * atteint, ce serait au moins les vieilles coches qui sauteraient, pas celles
 * du jour.
 */
export async function loadFaits() {
  const { data, error } = await supabase.from('prod_of_faits')
    .select('mo_name, produit, qty, ordres, fait_par, fait_le')
    .order('fait_le', { ascending: false })
    .limit(5000)
  if (error) throw error
  const map = {}
  for (const f of data || []) map[f.mo_name] = f
  return map
}

/** Coche / décoche un OF. `of` = objet renvoyé par loadFabrication. */
export async function setFait(of, on, userId) {
  if (!on) {
    const { error } = await supabase.from('prod_of_faits').delete().eq('mo_name', of.name)
    if (error) throw error
    return
  }
  const { error } = await supabase.from('prod_of_faits').upsert({
    mo_name: of.name,
    mo_id: of.id,
    produit: of.produit,
    qty: of.qty,
    jour: (of.quand || '').slice(0, 10) || null,
    ordres: of.ordres || null,               // les ordres Odoo que cette coche couvre
    fait_par: userId || null,
    fait_le: new Date().toISOString(),
  }, { onConflict: 'mo_name' })
  if (error) throw error
}

/**
 * Demande à Odoo de réserver (ou de libérer) les composants de ces ordres.
 * Ça ne valide rien : ça empêche seulement qu'un autre ordre compte sur le
 * même stock. Silencieux : un échec ne doit pas gêner l'équipe.
 */
export async function reserverOrdres(ordres, on) {
  if (!ordres.length) return
  try {
    await fetch('/api/freezer-list?mode=reserver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordres, on: !!on, test: estModeTest() }),
    })
  } catch { /* la réservation est un confort, pas une condition */ }
}

/**
 * Crée dans Odoo l'ordre de fabrication d'une préparation qu'Odoo ne demandait
 * pas (crème au beurre nature…). Renvoie { name } ou { error }.
 */
export async function creerOfPrepa(produit, qty, actorId, parents = [], unite = null, atelier = null, ajustements = null) {
  const r = await fetch('/api/freezer-list?mode=creer-of', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ produit, qty, actorId, parents, unite, atelier, ajustements, test: estModeTest() }),
  })
  return await r.json()
}

/**
 * Aligne un ordre qui existait DÉJÀ sur ce que l'atelier a pesé. La quantité
 * produite n'est pas touchée : le reste à faire se règle en validant.
 */
export async function ajusterOf(ordre, ajustements, actorId) {
  const r = await fetch('/api/freezer-list?mode=ajuster-of', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordre, ajustements, actorId, test: estModeTest() }),
  })
  return await r.json()
}

/**
 * Annule dans Odoo les ordres d'une coche qu'on retire — y compris ceux venus
 * d'Odoo, tant qu'ils ne sont pas validés. Renvoie les noms annulés.
 */
/**
 * Solde dans Odoo les ordres en double d'une règle mini/maxi (et leurs enfants).
 * Le serveur revérifie tout : il refuse tout ordre venu d'une commande client.
 */
export async function annulerDoublons(ordres) {
  const r = await fetch('/api/freezer-list?mode=annuler-doublons', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordres, test: estModeTest() }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `erreur ${r.status}`)
  return data
}

export async function annulerOfPrepa(ordres) {
  if (!ordres || !ordres.length) return null
  try {
    const r = await fetch('/api/freezer-list?mode=annuler-of', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordres, test: estModeTest() }),
    })
    return await r.json()
  } catch { return null }
}

/**
 * Annule un ordre dans Odoo, à la demande explicite de l'écran de validation.
 * Contrairement à `annulerOfPrepa` (le décochage), celui-ci touche AUSSI les
 * ordres qu'Odoo a lancés lui-même — et il n'efface rien : l'ordre reste,
 * marqué annulé. Un ordre terminé est refusé.
 */
export async function annulerOrdre(ordres, actorId) {
  if (!ordres || !ordres.length) return null
  const r = await fetch('/api/freezer-list?mode=annuler-ordre', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordres, actorId, test: estModeTest() }),
  })
  const j = await r.json()
  if (j.error) throw new Error(j.error)
  return j
}

/**
 * La consommation VRAIE d'un ingrédient, pesée à l'atelier au lieu d'être
 * calculée par la règle de trois. On la range dans le carnet de « À valider »,
 * qui la reprend pré-remplie puis l'envoie à Odoo.
 *
 * ⚠️ On relit avant d'écrire : l'écran de validation écrit dans le même
 * carnet, et le dernier arrivé ne doit pas effacer le travail de l'autre.
 * (Layla, 2026-09-09.)
 */
export async function noterConsommation(ordre, mesures) {
  const annexe = /^WHPDX\//i.test(ordre)
  const cle = annexe ? 'valider_annexe_saisies' : 'valider_saisies'
  const gardees = await loadSaisies(cle)
  const notes = { ...(gardees.notes || {}) }
  const pour = { ...(notes[ordre] || {}) }
  for (const m of mesures || []) {
    // ⚠️ Deux écrans, deux conventions : « À valider » (CD) saisit en GRAMMES
    // quand la ligne d'Odoo est en kg, celui de l'annexe garde l'unité de la
    // ligne. On écrit dans la convention de celui qui relira, sinon 1,59 kg
    // arrive comme 1,59 g.
    const enG = !annexe && /^kg$/i.test(String(m.unite || ''))
    pour[m.id] = String(Math.round((enG ? m.qty * 1000 : m.qty) * 100) / 100)
  }
  notes[ordre] = pour
  await saveSaisies(cle, { ...gardees, notes })
}

/** Ce qui manque pour fabriquer ces ordres Odoo (lecture seule, génoise ignorée). */
export async function loadManques(ordres) {
  if (!ordres.length) return []
  const r = await fetch(`/api/freezer-list?mode=manques&ordres=${encodeURIComponent(ordres.join(','))}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return (await r.json()).ordres || []
}

/**
 * Valide des ordres de fabrication DANS ODOO (irréversible).
 * `forcer` = passer outre les confirmations d'Odoo (stock insuffisant).
 * `produits` = { ordre: quantité vraiment produite } ; en dessous du demandé,
 * Odoo crée le reliquat et l'article revient dans « ce qu'il faut faire ».
 * Renvoie [{ name, ok, message }].
 */
export async function validerDansOdoo(ordres, forcer, actorId, quantites = null, ajouts = null, produits = null, dates = null) {
  const r = await fetch('/api/freezer-list?mode=valider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordres, forcer: !!forcer, actorId, quantites, ajouts, produits, dates, test: estModeTest() }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `erreur ${r.status}`)
  return data.resultats || []
}

/** Articles Odoo dont le nom contient ce qu'on tape (pour ajouter un ingrédient). */
export async function chercherArticles(q) {
  if (!q || q.trim().length < 2) return []
  const r = await fetch(`/api/freezer-list?mode=articles&q=${encodeURIComponent(q.trim())}`)
  if (!r.ok) return []
  return (await r.json()).articles || []
}

/** Recette d'une préparation (glaçage, pâte à sucre) + stock des ingrédients, en grammes. */
export async function loadPrepa(quoi) {
  const r = await fetch(`/api/freezer-list?mode=prepa&quoi=${encodeURIComponent(quoi)}`)
  if (!r.ok) throw new Error(`Odoo indisponible (${r.status})`)
  return await r.json()
}

/**
 * Crée et confirme l'ordre de fabrication de la préparation dans Odoo.
 * `colorants` = { identifiant de l'article : grammes } — seuls ceux-là entrent
 * dans l'ordre, les autres couleurs n'y figurent pas du tout.
 */
export async function lancerPrepa(quoi, tournees, colorants, actorId) {
  const r = await fetch(`/api/freezer-list?mode=prepa&quoi=${encodeURIComponent(quoi)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tournees, colorants, actorId, test: estModeTest() }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(data.error || `erreur ${r.status}`)
  return data
}
