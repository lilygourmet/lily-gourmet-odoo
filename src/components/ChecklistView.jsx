// src/components/ChecklistView.jsx
import Skeleton from './Skeleton'
// Page Checklist Cafe : 2 onglets - "A ranger" et "Range".
//
// ONGLET "A RANGER" - 3 sources distinctes :
//   - VITRINE : items envoyes par la vitrine (stock_day_items) du JOUR non confirmes
//   - PROD : sales_lines aujourd'hui + 3 jours futurs, cochees "Fait" par Prod
//            (prod_done.status='done'), prefixes E-/V-/GS-/MI-, non recues par cafe
//   - COMMANDES : order_items de aujourd'hui + 3 jours futurs, dont l'etape
//                 "fait" (GM/GMD) ou "fini" (CD) est cochee dans item_steps,
//                 mais dont l'etape "range" n'est PAS encore cochee.
//
// ONGLET "RANGE" :
//   - Sources combinees : cafe_received (pour Prod) + item_steps step=range (pour Commandes)
//   - Seulement les items dont la commande/sales_line est aujourd'hui ou futur
//   - Tries par heure de rangement (recent en haut), limite a 500 derniers
//   - Click sur un range = annule le rangement (revient dans "A ranger")
// =============================================================

import { useEffect, useMemo, useState } from 'react'
import { usePersistedState } from '../lib/usePersistedState'
import AppHeader from './AppHeader'
import { supabase } from '../lib/supabase'
import { loadSalesLinesForRange } from '../lib/salesLines'
import { loadProdDoneForLines } from '../lib/prodDone'
import { loadCafeReceivedForLines, markCafeReceived, unmarkCafeReceived } from '../lib/cafeReceived'
import { confirmReception, todayISO } from '../lib/stockBoutique'
import { loadItemSteps, checkItemStep, uncheckItemStep } from '../lib/orders'
import { loadVitrineReservations, loadResaRangees, markResaRangee, unmarkResaRangee } from '../lib/previsionsVitrine'
import { toast } from '../lib/toast'
import { printArticleBatch, printGroupTicket } from '../lib/printTicket'
import { RefreshCw } from 'lucide-react'

// Prefixes pour repartir entre les sections PROD et ACCESSOIRES dans sales_lines
const PROD_PREFIXES = ['E-', 'V-', 'GS-', 'MI-']
// Salé (colonne dédiée) : salés stricts SA-/SAK- + surgelés SU-.
const SALE_PREFIXES = ['SA-', 'SAK-', 'SU-']
const ACCESSOIRES_PREFIXES = ['GM-', 'GMD-']  // (commentaire historique, non utilise ici)
// Clients a exclure de la checklist (commandes internes, type vitrine boutique)
const EXCLUDED_CLIENTS = ['Vitrine']
// Fenetre : aujourd'hui + 3 jours apres
const DAYS_BEFORE = 0
const DAYS_AFTER = 3
// Envois vitrine non confirmés : on les garde visibles dans la checklist
// (reportés au jour suivant) jusqu'à N jours en arrière, pour pouvoir les confirmer en retard.
const VITRINE_CARRYOVER_DAYS = 7

function startsWithAny(name, prefixes) {
  if (!name) return false
  // Retire le code Odoo entre crochets en tete : "[447] E- Gianduja" -> "E- Gianduja"
  const cleaned = String(name).replace(/^\[\d+\]\s*/, '').trim()
  return prefixes.some(p => cleaned.startsWith(p))
}

// Viennoiseries (hors mini-cakes et cakes) : croissant, pain..., brioche, chausson, viennois.
const VIENNOISERIE_RX = /croissant|pain|viennois|brioche|chausson/i
// Lignes qui se rangent AUTOMATIQUEMENT dans la checklist du jour même, SANS attendre
// que la Prod coche « Fait » : boissons B- (toutes), viennoiseries V- (pas les
// mini-cakes/cakes), gâteaux secs GS- (sauf les plateaux).
function isAutoChecklistLine(name) {
  if (!name) return false
  const cleaned = String(name).replace(/^\[\d+\]\s*/, '').trim()
  if (cleaned.startsWith('B-')) return true
  if (cleaned.startsWith('V-') && VIENNOISERIE_RX.test(cleaned)) return true
  if (cleaned.startsWith('GS-') && !/^GS-\s*plateaux?\b/i.test(cleaned)) return true
  return false
}

// Nettoie le nom de produit pour l'affichage :
// - retire le code Odoo [447] en tete
// - garde uniquement la 1ere ligne (coupe les "Message: ...")
function cleanProductName(name) {
  if (!name) return ''
  let s = String(name).replace(/^\[\d+\]\s*/, '').trim()
  const nl = s.indexOf('\n')
  if (nl !== -1) s = s.substring(0, nl).trim()
  return s
}

// Verifie si une ligne/item provient d'un client exclu (ex : 'Vitrine')
function isExcludedClient(clientName) {
  if (!clientName) return false
  return EXCLUDED_CLIENTS.includes(String(clientName).trim())
}

// Formatte une date 'YYYY-MM-DD' en libelle relatif court
function formatDayLabel(dayStr) {
  if (!dayStr) return ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = dayStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const diffDays = Math.round((date - today) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return "aujourd'hui"
  if (diffDays === -1) return 'hier'
  if (diffDays === 1) return 'demain'
  if (diffDays === 2) return 'après-demain'
  const days = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
  return `${days[date.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

// Format relatif court ("il y a 5 min", "il y a 2h")
function formatRelativeTime(isoStr) {
  if (!isoStr) return ''
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`
  return `il y a ${Math.floor(diff / 86400)} j`
}

// Decale une date ISO de N jours
function shiftISO(isoStr, deltaDays) {
  const [y, m, d] = isoStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// Extrait juste la date YYYY-MM-DD d'un timestamp delivery_at
function deliveryDayStr(deliveryAt) {
  if (!deliveryAt) return null
  const d = new Date(deliveryAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Pour une sales_line : recupere YYYY-MM-DD depuis le timestamp delivery_at
// (la table sales_lines n'a pas de colonne 'day' separee)
function lineDay(line) {
  return deliveryDayStr(line?.delivery_at)
}

// Formatte l'heure depuis un timestamp : "14h00"
function formatHour(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}h${mm}`
}

// Charge les orders avec leurs items sur la fenetre [todayStr, todayStr+DAYS_AFTER]
async function loadOrdersForRange(fromStr, toStr) {
  // toStr exclus (passe fromDate + DAYS_AFTER + 1)
  const { data, error } = await supabase
    .from('orders')
    .select(`
      id, order_num, client_name, delivery_at,
      order_items ( id, item_idx, type, title, quantity )
    `)
    .gte('delivery_at', `${fromStr}T00:00:00`)
    .lt('delivery_at', `${toStr}T00:00:00`)
    .order('delivery_at', { ascending: true })
  if (error) {
    console.warn('[ChecklistView loadOrders]', error)
    return []
  }
  return data || []
}

// Pour chaque item d'une commande, on determine si l'item est "a ranger" :
// - Type GM/GMD : etape 'fait' cochee mais 'range' pas cochee
// - Type CD     : etape 'fini' cochee mais 'range' pas cochee
function isItemToRange(item, steps, gmDoneNoFiche) {
  const fini = !!steps[`${item.id}_fini`]
  const fait = !!steps[`${item.id}_fait`]
  const range = !!steps[`${item.id}_range`]
  if (range) return false
  if (item.type === 'CD') return fini
  // GM/GMD : « fait » via item_steps OU via le lot « à définir » des accessoires (articles sans fiche, ex. macarons)
  return fait || !!(gmDoneNoFiche && gmDoneNoFiche.has(item.id))
}
function isItemRanged(item, steps) {
  return !!steps[`${item.id}_range`]
}

export default function ChecklistView({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = usePersistedState('lily.checklist.tab', 'todo') // 'todo' | 'done' | 'vitrine'

  // Colonne « Réservation Vitrine » (dans « À ranger ») : commandes vitrine du jour à
  // mettre de côté (depuis Odoo) + suivi de celles déjà rangées (table Supabase).
  const [vitrineResa, setVitrineResa] = useState(null)   // null = pas encore chargé
  const [resaRangees, setResaRangees] = useState(new Set())
  async function loadVitrineResa() {
    try {
      const [orders, ranged] = await Promise.all([
        loadVitrineReservations(todayISO()),
        loadResaRangees(todayISO()).catch(() => new Set()),
      ])
      setVitrineResa(orders); setResaRangees(ranged)
    } catch { setVitrineResa([]) }
  }
  useEffect(() => { loadVitrineResa() }, [])

  async function handleResaDone(x) {
    setResaRangees(prev => new Set(prev).add(x.lineId))   // optimiste
    try { await markResaRangee({ day: todayISO(), lineId: x.lineId, orderId: x.orderId, orderName: x.orderName, clientName: x.clientName, productName: x.text, userId: user?.id }) }
    catch (e) { toast.error(e?.message || 'Erreur'); loadVitrineResa() }
  }
  async function handleResaUndo(x) {
    setResaRangees(prev => { const n = new Set(prev); n.delete(x.lineId); return n })
    try { await unmarkResaRangee(todayISO(), x.lineId) }
    catch (e) { toast.error(e?.message || 'Erreur'); loadVitrineResa() }
  }
  // Aplati : chaque ARTICLE (ligne) de réservation se range séparément.
  const resaLines = Array.isArray(vitrineResa)
    ? vitrineResa.flatMap(o => (o.lines || []).filter(l => l.id != null).map(l => ({
        lineId: l.id, orderId: o.id, orderName: o.name, clientName: o.clientName, pickupText: o.pickupText, text: l.text, qty: l.qty,
      })))
    : null
  const resaTodo = resaLines ? resaLines.filter(x => !resaRangees.has(x.lineId)) : vitrineResa
  const resaDone = resaLines ? resaLines.filter(x => resaRangees.has(x.lineId)) : []

  // Section VITRINE
  const [vitrineItems, setVitrineItems] = useState([])

  // Section PROD (sales_lines E-/V-/GS-/MI- via prod_done)
  const [prodLines, setProdLines] = useState([])

  // Section SALÉ (sales_lines SA-/SAK-/SU- via prod_done) — colonne dédiée
  const [saleLines, setSaleLines] = useState([])

  // Section COMMANDES (order_items CD/GM/GMD via item_steps)
  const [commandeItems, setCommandeItems] = useState([])
  // Flux d'impression des tickets depuis Commandes : photo ? → nb de boîtes → imprimer → ranger.
  const [printFlow, setPrintFlow] = useState(null)   // { item } ou null
  const [printStep, setPrintStep] = useState('photo')   // 'photo' | 'boxes'
  const [boxCount, setBoxCount] = useState(1)
  const [printing, setPrinting] = useState(false)

  // Onglet RANGE : items deja ranges (separes par source pour 3 colonnes)
  const [doneVitrine, setDoneVitrine] = useState([])
  const [doneProd, setDoneProd] = useState([])
  const [doneSale, setDoneSale] = useState([])
  const [doneCommandes, setDoneCommandes] = useState([])

  // Recherche partout (filtre les 3 colonnes)
  const [searchQuery, setSearchQuery] = useState('')
  // Bouton refresh manuel
  const [refreshing, setRefreshing] = useState(false)

  const todayStr = todayISO()

  // ============================================================
  // Chargement principal : combine 3 sources de donnees
  // ============================================================
  async function refresh(silent = false) {
    if (!silent) setLoading(true)
    try {
      const fromStr = shiftISO(todayStr, -DAYS_BEFORE)
      const toStr = shiftISO(todayStr, DAYS_AFTER + 1)
      const totalDays = DAYS_BEFORE + 1 + DAYS_AFTER

      // ============================================================
      // PHASE 1 : 4 requetes independantes en parallele
      // ============================================================
      const [sdResult, allLines, orders, allReceivedResult] = await Promise.all([
        // 1a) stock_day du jour (pour vitrine)
        supabase.from('stock_day').select('id').eq('day', todayStr).maybeSingle(),
        // 1b) toutes les sales_lines sur la fenetre (pour PROD)
        loadSalesLinesForRange(fromStr, totalDays),
        // 1c) toutes les orders sur la fenetre (pour COMMANDES)
        loadOrdersForRange(fromStr, toStr),
        // 1d) tous les cafe_received recents (pour onglet RANGE prod)
        supabase
          .from('cafe_received')
          .select('odoo_line_id, received_at')
          .order('received_at', { ascending: false })
          .limit(500),
      ])

      const sd = sdResult?.data
      const lineIds = allLines.map(l => l.odoo_line_id).filter(Boolean)
      const allReceived = allReceivedResult?.data || []
      const allReceivedIds = allReceived.map(r => r.odoo_line_id)

      // Pre-traitement des order_items pour avoir itemIds (utilise en phase 2)
      const allOrderItems = []
      for (const order of orders) {
        if (isExcludedClient(order.client_name)) continue
        const dayStr = deliveryDayStr(order.delivery_at)
        for (const item of order.order_items || []) {
          if (item.type === 'CD' || item.type === 'GM' || item.type === 'GMD') {
            allOrderItems.push({
              ...item,
              order_id: order.id,
              order_num: order.order_num,
              client_name: order.client_name,
              delivery_at: order.delivery_at,
              day: dayStr,
            })
          }
        }
      }
      const itemIds = allOrderItems.map(i => i.id)
      // GM/GMD sans fiche : marqués « fait » par les accessoires via le lot « à définir » (lot_idx = -1).
      const gmIds = allOrderItems.filter(i => i.type === 'GM' || i.type === 'GMD').map(i => i.id)

      // ============================================================
      // PHASE 2 : 5 requetes qui dependent de phase 1, en parallele
      // ============================================================
      const [
        vitItemsResult,
        vitDoneResult,
        dones,
        receiveds,
        stepsMap,
        linesDoneResult,
        gmDoneNoFicheResult,
      ] = await Promise.all([
        // 2a) Vitrine "A ranger" : items pending du jour ET des jours précédents non confirmés (report)
        supabase
          .from('stock_day_items')
          .select('id, product_name, product_code, qty_announced, reception_status, discrepancy_status, stock_day!inner(day)')
          .eq('source', 'morning')
          .eq('reception_status', 'pending')
          .gte('stock_day.day', shiftISO(todayStr, -VITRINE_CARRYOVER_DAYS))
          .lte('stock_day.day', todayStr)
          .order('product_name'),
        // 2b) Vitrine "Range" : items deja recus
        sd?.id
          ? supabase
              .from('stock_day_items')
              .select('id, product_name, qty_announced, reception_status, received_at')
              .eq('stock_day_id', sd.id)
              .eq('source', 'morning')
              .neq('reception_status', 'pending')
              .order('received_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        // 2c) Prod done pour les sales_lines
        loadProdDoneForLines(lineIds),
        // 2d) Cafe received pour les sales_lines (utilise pour PROD a ranger)
        loadCafeReceivedForLines(lineIds),
        // 2e) Item steps pour les order_items
        itemIds.length > 0 ? loadItemSteps(itemIds) : Promise.resolve({}),
        // 2f) Sales_lines correspondant aux cafe_received recents (onglet Range)
        allReceivedIds.length > 0
          ? supabase
              .from('sales_lines')
              .select('odoo_line_id, product_name, quantity, client_name, order_num, delivery_at')
              .in('odoo_line_id', allReceivedIds)
          : Promise.resolve({ data: [] }),
        // 2g) GM/GMD sans fiche faits par les accessoires (lot_idx = -1) → à ranger dans la checklist
        gmIds.length > 0
          ? supabase.from('gm_done').select('order_item_id').in('order_item_id', gmIds).eq('lot_idx', -1)
          : Promise.resolve({ data: [] }),
      ])

      // ============================================================
      // PHASE 3 : assemblage et calculs (synchrone, rapide)
      // ============================================================

      // 3a) VITRINE a ranger (avec report des jours précédents non confirmés)
      const yestStr = shiftISO(todayStr, -1)
      setVitrineItems((vitItemsResult?.data || []).map(it => {
        const day = it.stock_day?.day
        const carryLabel = !day || day === todayStr
          ? null
          : (day === yestStr ? "⚠️ envoi d'hier" : `⚠️ envoi du ${day.slice(8, 10)}/${day.slice(5, 7)}`)
        return { ...it, day, carryLabel }
      }))

      // 3b) PROD a ranger
      const doneSet = new Set(dones.filter(d => d.status === 'done').map(d => d.odoo_line_id))
      const receivedMap = new Map(receiveds.map(r => [r.odoo_line_id, r]))
      const eligibleLines = allLines.filter(l =>
        doneSet.has(l.odoo_line_id) &&
        !receivedMap.has(l.odoo_line_id) &&
        !isExcludedClient(l.client_name)
      )
      // Lignes auto (B- / viennoiseries V- / GS- hors plateau) : du jour même, sans validation Prod.
      const autoLines = allLines.filter(l =>
        lineDay(l) === todayStr &&
        isAutoChecklistLine(l.product_name) &&
        !receivedMap.has(l.odoo_line_id) &&
        !isExcludedClient(l.client_name)
      )
      const autoIds = new Set(autoLines.map(l => l.odoo_line_id))
      // PROD = lignes auto + lignes validées par la Prod (sans doublon avec les auto)
      const prodFromDone = eligibleLines.filter(l => startsWithAny(l.product_name, PROD_PREFIXES) && !autoIds.has(l.odoo_line_id))
      setProdLines([...autoLines, ...prodFromDone])
      setSaleLines(eligibleLines.filter(l => startsWithAny(l.product_name, SALE_PREFIXES)))

      // 3c) COMMANDES a ranger
      const gmDoneNoFiche = new Set((gmDoneNoFicheResult?.data || []).map(r => r.order_item_id))
      const todoCommandes = allOrderItems.filter(i => isItemToRange(i, stepsMap, gmDoneNoFiche))
      setCommandeItems(todoCommandes)

      // 3d) VITRINE rangee
      const vitDoneItems = (vitDoneResult?.data || []).map(it => ({
        kind: 'vitrine',
        key: `vit-${it.id}`,
        title: cleanProductName(it.product_name),
        subtitle: formatHour(it.received_at) || '',
        quantity: it.qty_announced,
        received_at: it.received_at,
        item_id: it.id,
      }))
      setDoneVitrine(vitDoneItems)

      // 3e) PROD + SALÉ rangee
      const doneProdItems = []
      const doneSaleItems = []
      if (allReceivedIds.length > 0) {
        const linesDone = linesDoneResult?.data || []
        const linesDoneMap = new Map(linesDone.map(l => [l.odoo_line_id, l]))
        const recvByLine = new Map(allReceived.map(r => [r.odoo_line_id, r.received_at]))

        for (const r of allReceived) {
          const line = linesDoneMap.get(r.odoo_line_id)
          if (!line) continue
          const isSale = startsWithAny(line.product_name, SALE_PREFIXES)
          const isProd = startsWithAny(line.product_name, PROD_PREFIXES) || startsWithAny(line.product_name, ['B-'])
          if (!isSale && !isProd) continue
          if (isExcludedClient(line.client_name)) continue
          const day = lineDay(line)
          if (!day || day < todayStr) continue
          const entry = {
            kind: isSale ? 'sale' : 'prod',
            key: `${isSale ? 'sale' : 'prod'}-${r.odoo_line_id}`,
            title: cleanProductName(line.product_name),
            subtitle: buildSalesLineSubtitle(line),
            quantity: line.quantity,
            received_at: recvByLine.get(r.odoo_line_id),
            odoo_line_id: r.odoo_line_id,
          }
          ;(isSale ? doneSaleItems : doneProdItems).push(entry)
        }
      }
      setDoneProd(doneProdItems)
      setDoneSale(doneSaleItems)

      // 4c) Commandes rangees : items dont 'range' est coche, commande aujourd'hui ou futur
      const doneCommandeItems = []
      for (const item of allOrderItems) {
        if (!isItemRanged(item, stepsMap)) continue
        if (!item.day || item.day < todayStr) continue
        const rangeStep = stepsMap[`${item.id}_range`]
        doneCommandeItems.push({
          kind: 'commande',
          key: `cmd-${item.id}`,
          title: extractItemTitle(item),
          subtitle: buildOrderItemSubtitle(item),
          quantity: item.quantity || 1,
          received_at: rangeStep?.done_at || null,
          item_id: item.id,
        })
      }
      doneCommandeItems.sort((a, b) => new Date(b.received_at || 0) - new Date(a.received_at || 0))
      setDoneCommandes(doneCommandeItems)
    } catch (e) {
      console.error('[ChecklistView] refresh', e)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // ============================================================
  // Realtime : s'abonne aux tables qui influent
  // ============================================================
  useEffect(() => {
    refresh()

    const channels = [
      supabase.channel('checklist-stock-items')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_day_items' }, refresh)
        .subscribe(),
      supabase.channel('checklist-prod-done')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prod_done' }, refresh)
        .subscribe(),
      supabase.channel('checklist-cafe-received')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cafe_received' }, refresh)
        .subscribe(),
      supabase.channel('checklist-item-steps')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'item_steps' }, refresh)
        .subscribe(),
    ]

    // Refresh toutes les 5 min en backup (realtime gere les changements instantanes)
    const interval = setInterval(() => refresh(true), 5 * 60 * 1000)

    return () => {
      channels.forEach(c => supabase.removeChannel(c))
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ============================================================
  // Actions de click
  // ============================================================
  async function handleVitrineDone(item) {
    try {
      await confirmReception(item.id, item.qty_announced, user.id)
      setVitrineItems(prev => prev.filter(i => i.id !== item.id))
      refresh(true)
    } catch (e) {
      console.error('[handleVitrineDone]', e)
      toast.error('Erreur : ' + (e.message || e))
    }
  }

  async function handleProdDone(line) {
    try {
      await markCafeReceived(line.odoo_line_id, user.id)
      setProdLines(prev => prev.filter(l => l.odoo_line_id !== line.odoo_line_id))
      refresh(true)
    } catch (e) {
      console.error('[handleProdDone]', e)
      toast.error('Erreur : ' + (e.message || e))
    }
  }

  // Jus (B-) / gâteaux secs (GS-) : 1 SEUL ticket regroupant tous les articles de la commande, puis rangement.
  const [groupBusy, setGroupBusy] = useState(null)   // clé du groupe en cours d'impression
  async function handleProdGroupDone(group) {
    setGroupBusy(group.key)
    try {
      // 1) Impression : si ça échoue, on s'arrête (rien n'est rangé) et on le dit clairement.
      try {
        await printGroupTicket({
          deliveryAt: group.delivery_at,
          orderNum: group.order_num,
          clientName: group.client_name,
          items: group.lines.map(l => ({ productName: cleanProductName(l.product_name), quantity: l.quantity })),
        })
      } catch (e) {
        console.error('[handleProdGroupDone] impression', e)
        toast.error('Impression échouée — vérifie l\'imprimante et réessaie.')
        return
      }
      toast.success('Ticket imprimé')
      // 2) Enregistrement (rangement) : message distinct si ça échoue (le ticket, lui, est bien sorti).
      try {
        for (const l of group.lines) await markCafeReceived(l.odoo_line_id, user.id)
        const ids = new Set(group.lines.map(l => l.odoo_line_id))
        setProdLines(prev => prev.filter(l => !ids.has(l.odoo_line_id)))
        refresh(true)
      } catch (e) {
        console.error('[handleProdGroupDone] enregistrement', e)
        toast.error('Ticket imprimé, mais enregistrement incomplet — rafraîchis la page.')
      }
    } finally {
      setGroupBusy(null)
    }
  }

  // Salé : impression DIRECTE du ticket (pas d'étape photo), puis rangement.
  const [saleBusy, setSaleBusy] = useState(null)   // odoo_line_id en cours
  async function handleSaleDone(line) {
    setSaleBusy(line.odoo_line_id)
    try {
      const res = await printArticleBatch([{
        deliveryAt: line.delivery_at,
        orderNum: line.order_num,
        clientName: line.client_name,
        productName: cleanProductName(line.product_name),
        quantity: line.quantity,
        boxCount: 1,
      }])
      if (!res || res.ok < 1) { toast.error('Impression échouée — vérifie l\'imprimante et réessaie.'); return }
      toast.success('Ticket imprimé')
      await markCafeReceived(line.odoo_line_id, user.id)
      setSaleLines(prev => prev.filter(l => l.odoo_line_id !== line.odoo_line_id))
      refresh(true)
    } catch (e) {
      console.error('[handleSaleDone]', e)
      toast.error('Erreur : ' + (e.message || e))
    } finally {
      setSaleBusy(null)
    }
  }

  // Clic sur une commande (CD, GM, GMD) : flux « photo ? » + impression tickets pour TOUS.
  function handleCommandeDone(item) {
    setPrintFlow(item); setPrintStep('photo'); setBoxCount(1)
  }

  // Range réellement l'item (étape 'range' cochée → quitte « À ranger »).
  async function rangeCommande(item) {
    try {
      const ok = await checkItemStep(item.id, 'range', user.id)
      if (!ok) throw new Error("La requete a echoue")
      setCommandeItems(prev => prev.filter(i => i.id !== item.id))
      refresh(true)
    } catch (e) {
      console.error('[rangeCommande]', e)
      toast.error('Erreur : ' + (e.message || e))
    }
  }

  // « Oui, photo prise » → imprime N tickets de boîte, puis range l'item (si au moins 1 imprimé).
  async function confirmPrintAndRange() {
    const item = printFlow
    if (!item) return
    setPrinting(true)
    try {
      const res = await printArticleBatch([{
        deliveryAt: item.delivery_at,
        orderNum: item.order_num,
        clientName: item.client_name,
        productName: extractItemTitle(item),
        quantity: item.quantity || 1,
        boxCount,
      }])
      if (res.ok > 0) {
        toast.success(`${res.ok} ticket(s) imprimé(s)`)
        setPrintFlow(null)
        await rangeCommande(item)
      } else {
        toast.error('Impression échouée — vérifie l\'imprimante et réessaie.')
      }
    } catch (e) {
      toast.error('Impression : ' + (e.message || e))
    } finally {
      setPrinting(false)
    }
  }

  // Undo dans l'onglet Range
  async function handleUndo(doneItem) {
    try {
      if (doneItem.kind === 'prod') {
        await unmarkCafeReceived(doneItem.odoo_line_id)
        setDoneProd(prev => prev.filter(d => d.key !== doneItem.key))
      } else if (doneItem.kind === 'sale') {
        await unmarkCafeReceived(doneItem.odoo_line_id)
        setDoneSale(prev => prev.filter(d => d.key !== doneItem.key))
      } else if (doneItem.kind === 'commande') {
        const ok = await uncheckItemStep(doneItem.item_id, 'range')
        if (!ok) throw new Error("La requete a echoue")
        setDoneCommandes(prev => prev.filter(d => d.key !== doneItem.key))
      } else if (doneItem.kind === 'vitrine') {
        // Pour la vitrine : on remet le stock_day_item en 'pending'
        await supabase
          .from('stock_day_items')
          .update({ reception_status: 'pending', received_at: null, received_by: null })
          .eq('id', doneItem.item_id)
        setDoneVitrine(prev => prev.filter(d => d.key !== doneItem.key))
      }
      refresh(true)
    } catch (e) {
      console.error('[handleUndo]', e)
      toast.error('Erreur : ' + (e.message || e))
    }
  }

  // Fonction declenchee au clic sur le bouton refresh
  async function handleManualRefresh() {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  // ============================================================
  // Compteurs
  // ============================================================
  const totalTodo = vitrineItems.length + prodLines.length + saleLines.length + commandeItems.length
  const totalDone = doneVitrine.length + doneProd.length + doneSale.length + doneCommandes.length
  const allDone = totalTodo === 0

  // ============================================================
  // Filtre de recherche : cherche dans title + subtitle + client + order_num
  // ============================================================
  const q = searchQuery.trim().toLowerCase()
  function matchesSearch(haystacks) {
    if (!q) return true
    return haystacks.some(h => h && String(h).toLowerCase().includes(q))
  }

  // Filtre les listes "A ranger"
  const filteredVitrineItems = vitrineItems.filter(i =>
    matchesSearch([i.product_name])
  )
  const filteredProdLines = prodLines.filter(l =>
    matchesSearch([l.product_name, l.client_name, l.order_num])
  )
  const filteredSaleLines = saleLines.filter(l =>
    matchesSearch([l.product_name, l.client_name, l.order_num])
  )
  const filteredCommandeItems = commandeItems.filter(i =>
    matchesSearch([i.title, i.client_name, i.order_num])
  )

  // Filtre les listes "Range"
  const filteredDoneVitrine = doneVitrine.filter(d => matchesSearch([d.title]))
  const filteredDoneProd = doneProd.filter(d => matchesSearch([d.title, d.subtitle]))
  const filteredDoneSale = doneSale.filter(d => matchesSearch([d.title, d.subtitle]))
  const filteredDoneCommandes = doneCommandes.filter(d => matchesSearch([d.title, d.subtitle]))

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-[1100px] mx-auto px-5 py-5">
        <div className="mb-5">
          <h1 className="font-fraunces italic text-[26px] text-ink">Checklist</h1>
          <p className="text-[13px] text-ink-mute mt-1">
            {tab === 'todo'
              ? 'Clique sur une carte pour la confirmer comme rangée'
              : 'Historique de ce qui a été rangé. Click pour annuler.'}
          </p>
        </div>

        {/* Tabs + recherche + refresh */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <button
            onClick={() => setTab('todo')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-all ${
              tab === 'todo'
                ? 'bg-bordeaux text-cream border border-bordeaux'
                : 'bg-white border border-line text-ink hover:border-bordeaux/40'
            }`}
          >
            <span>À ranger</span>
            {totalTodo > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[11px] font-bold rounded-full ${
                tab === 'todo' ? 'bg-cream text-bordeaux' : 'bg-red-600 text-white'
              }`}>
                {totalTodo}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('done')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-[13px] font-medium transition-all ${
              tab === 'done'
                ? 'bg-bordeaux text-cream border border-bordeaux'
                : 'bg-white border border-line text-ink hover:border-bordeaux/40'
            }`}
          >
            <span>Rangé</span>
            {totalDone > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[11px] font-bold rounded-full ${
                tab === 'done' ? 'bg-cream text-bordeaux' : 'bg-emerald-600 text-white'
              }`}>
                {totalDone}
              </span>
            )}
          </button>


          {/* Spacer + recherche + refresh */}
          <div className="flex-1 flex items-center gap-2 justify-end min-w-0">
            <div className="relative flex-1 max-w-xs">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="w-full px-3 py-2 pr-8 text-[13px] bg-white border border-line rounded-full focus:outline-none focus:border-bordeaux/60 placeholder:text-ink-mute"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-line hover:bg-bordeaux hover:text-cream text-ink-mute flex items-center justify-center text-[11px] transition-all"
                  title="Effacer"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="px-3 py-2 rounded-full bg-white border border-line text-ink hover:border-bordeaux hover:bg-bordeaux hover:text-cream text-[13px] transition-all disabled:opacity-50 flex items-center gap-1.5"
              title="Rafraîchir maintenant"
            >
              <RefreshCw size={14} strokeWidth={1.8} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{refreshing ? 'Rafraîchissement...' : 'Rafraîchir'}</span>
            </button>
          </div>
        </div>

        {loading ? (
          <Skeleton rows={6} />
        ) : tab === 'todo' ? (
          <TodoTab
            allDone={allDone && !q}
            total={totalTodo}
            vitrineItems={filteredVitrineItems}
            prodLines={filteredProdLines}
            saleLines={filteredSaleLines}
            commandeItems={filteredCommandeItems}
            vitrineResa={resaTodo}
            onVitrineDone={handleVitrineDone}
            onProdDone={handleProdDone}
            onProdGroupDone={handleProdGroupDone}
            groupBusy={groupBusy}
            onSaleDone={handleSaleDone}
            saleBusy={saleBusy}
            onCommandeDone={handleCommandeDone}
            onResaDone={handleResaDone}
          />
        ) : (
          <DoneTab
            vitrineItems={filteredDoneVitrine}
            prodItems={filteredDoneProd}
            saleItems={filteredDoneSale}
            commandeItems={filteredDoneCommandes}
            vitrineResa={resaDone}
            onResaUndo={handleResaUndo}
            onUndo={handleUndo}
          />
        )}
      </div>

      {printFlow && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-end sm:items-center justify-center" onClick={() => !printing && setPrintFlow(null)}>
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 pb-7"
            style={{ paddingBottom: 'calc(1.75rem + var(--lg-safe-bottom))' }} onClick={e => e.stopPropagation()}>
            <div className="bg-cream border border-line rounded-xl px-3 py-2 mb-4">
              <div className="font-semibold text-[14px] text-ink leading-tight">{extractItemTitle(printFlow)}</div>
              <div className="text-[11.5px] text-ink-mute mt-0.5">{buildOrderItemSubtitle(printFlow)}</div>
            </div>
            {printStep === 'photo' ? (
              <>
                <h3 className="font-fraunces italic text-[18px] text-ink mb-1">📷 Photo prise ?</h3>
                <p className="text-[13.5px] text-ink-soft mb-4">As-tu pris une photo de ce gâteau avant de l'emballer ?</p>
                <div className="flex gap-2.5">
                  <button onClick={() => setPrintFlow(null)} className="flex-1 py-3 rounded-xl bg-[#FFF4E2] border border-[#E5B978] text-[#B36B00] font-bold text-[15px]">Pas encore</button>
                  <button onClick={() => setPrintStep('boxes')} className="flex-1 py-3 rounded-xl bg-bordeaux text-cream font-bold text-[15px]">Oui, photo prise →</button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-fraunces italic text-[18px] text-ink mb-1">🖨️ Imprimer les tickets</h3>
                <p className="text-[13.5px] text-ink-soft mb-3">Combien de boîtes ? (1 ticket par boîte)</p>
                <div className="flex items-center justify-center gap-5 my-2 mb-5">
                  <button onClick={() => setBoxCount(n => Math.max(1, n - 1))} className="w-14 h-14 rounded-full border-2 border-bordeaux text-bordeaux text-3xl font-extrabold leading-none">−</button>
                  <div className="text-center min-w-[70px]"><div className="text-[40px] font-extrabold leading-none text-ink">{boxCount}</div><div className="text-[12px] text-ink-mute font-semibold">boîte(s)</div></div>
                  <button onClick={() => setBoxCount(n => n + 1)} className="w-14 h-14 rounded-full border-2 border-bordeaux text-bordeaux text-3xl font-extrabold leading-none">+</button>
                </div>
                <div className="flex gap-2.5">
                  <button onClick={() => setPrintStep('photo')} disabled={printing} className="flex-1 py-3 rounded-xl bg-white border border-line text-ink-soft font-bold text-[15px]">← Retour</button>
                  <button onClick={confirmPrintAndRange} disabled={printing} className="flex-[2] py-3 rounded-xl bg-bordeaux text-cream font-bold text-[15px] disabled:opacity-50">{printing ? 'Impression…' : `🖨️ Imprimer ${boxCount}`}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Onglet "A ranger"
// ============================================================
function TodoTab({ allDone, total, vitrineItems, prodLines, saleLines, commandeItems, vitrineResa, onVitrineDone, onProdDone, onProdGroupDone, groupBusy, onSaleDone, saleBusy, onCommandeDone, onResaDone }) {
  const nbResa = Array.isArray(vitrineResa) ? vitrineResa.length : 0
  // Jus (B-) et GS- regroupés PAR COMMANDE → 1 carte = 1 ticket. Le reste (E-/V-/MI-) reste individuel.
  const { jusGroups, gsGroups, otherProd } = groupProdForPrint(prodLines)
  if (allDone && nbResa === 0) {
    return (
      <div className="bg-white rounded-2xl border border-line p-8 text-center shadow-sm">
        <p className="text-[15px] font-semibold text-success">Tout est rangé !</p>
        <p className="text-[12px] text-ink-mute mt-1">Rien n'attend de t'être rangé pour l'instant.</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-line p-4 mb-6 shadow-sm">
        <p className="text-[14px] font-medium text-bordeaux">
          {total} article{total > 1 ? 's' : ''} à ranger
        </p>
      </div>

      {/* Colonnes c\u00f4te \u00e0 c\u00f4te (toujours, m\u00eame sur mobile) */}
      <div className="grid grid-cols-1 min-[500px]:grid-cols-3 xl:grid-cols-5 gap-3">
        <ColumnSection title="RÉSERVATION VITRINE" count={nbResa} subtitle="à mettre de côté">
          {!vitrineResa ? (
            <EmptyHint>Chargement…</EmptyHint>
          ) : nbResa === 0 ? (
            <EmptyHint>Aucune réservation</EmptyHint>
          ) : (
            vitrineResa.map(x => (
              <button key={`resa-${x.lineId}`} type="button" onClick={() => onResaDone(x)}
                title="Marquer comme rangé"
                className="w-full text-left bg-white border border-line rounded-xl p-2.5 mb-2 shadow-sm hover:border-emerald-400 hover:bg-emerald-50/40 transition-all">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-ink truncate">{x.clientName || '—'}</span>
                  {x.pickupText && <span className="text-[10px] text-ink-mute whitespace-nowrap">{x.pickupText.slice(-5)}</span>}
                </div>
                <div className="text-[11px] text-ink-soft leading-snug">{Number(x.qty) > 1 ? `${x.qty}× ` : ''}{x.text}</div>
                <div className="text-[10px] text-emerald-700 mt-1 font-medium">✓ Marquer rangé</div>
              </button>
            ))
          )}
        </ColumnSection>

        <ColumnSection title="VITRINE" count={vitrineItems.length} subtitle="envoyés par la vitrine">
          {vitrineItems.length === 0 ? (
            <EmptyHint>Aucun envoi</EmptyHint>
          ) : (
            vitrineItems.map(item => (
              <ItemCard
                key={`vit-${item.id}`}
                title={cleanProductName(item.product_name)}
                subtitle={item.carryLabel}
                quantity={item.qty_announced}
                onClick={() => onVitrineDone(item)}
                compact
              />
            ))
          )}
        </ColumnSection>

        <ColumnSection title="PROD" count={prodLines.length} subtitle="jus & GS- : clic = 1 ticket / commande">
          {prodLines.length === 0 ? (
            <EmptyHint>Rien à ranger</EmptyHint>
          ) : (
            <>
              {[...jusGroups, ...gsGroups].map(group => (
                <ItemCard
                  key={group.key}
                  title={`${group.kind === 'jus' ? '🧃 Jus' : '🍪 GS'} — ${group.client_name || group.order_num || ''}`}
                  subtitle={groupBusy === group.key ? '🖨️ impression…' : buildGroupSubtitle(group)}
                  quantity={group.lines.reduce((s, l) => s + (Number(l.quantity) || 1), 0)}
                  onClick={() => groupBusy ? null : onProdGroupDone(group)}
                  compact
                />
              ))}
              {otherProd.map(line => (
                <ItemCard
                  key={`prod-${line.odoo_line_id}`}
                  title={cleanProductName(line.product_name)}
                  subtitle={buildSalesLineSubtitle(line)}
                  quantity={line.quantity}
                  onClick={() => onProdDone(line)}
                  compact
                />
              ))}
            </>
          )}
        </ColumnSection>

        <ColumnSection title="🥪 SALÉ" count={saleLines.length} subtitle="clic = imprime + range">
          {saleLines.length === 0 ? (
            <EmptyHint>Rien à ranger</EmptyHint>
          ) : (
            saleLines.map(line => (
              <ItemCard
                key={`sale-${line.odoo_line_id}`}
                title={cleanProductName(line.product_name)}
                subtitle={saleBusy === line.odoo_line_id ? '🖨️ impression…' : buildSalesLineSubtitle(line)}
                quantity={line.quantity}
                onClick={() => saleBusy ? null : onSaleDone(line)}
                compact
              />
            ))
          )}
        </ColumnSection>

        <ColumnSection title="COMMANDES" count={commandeItems.length} subtitle="CD / GM / GMD">
          {commandeItems.length === 0 ? (
            <EmptyHint>Rien à ranger</EmptyHint>
          ) : (
            commandeItems.map(item => (
              <ItemCard
                key={`cmd-${item.id}`}
                title={extractItemTitle(item)}
                subtitle={buildOrderItemSubtitle(item)}
                quantity={item.quantity || 1}
                onClick={() => onCommandeDone(item)}
                compact
              />
            ))
          )}
        </ColumnSection>
      </div>
    </>
  )
}

// Section pour une colonne (header + contenu)
function ColumnSection({ title, count, subtitle, children }) {
  return (
    <div className="flex flex-col">
      <div className="mb-2 px-1">
        <div className="flex items-baseline justify-between gap-1">
          <h2 className="text-[10px] font-bold tracking-[0.12em] text-bordeaux truncate">{title}</h2>
          <span className="text-[10px] text-ink-mute flex-shrink-0">{count}</span>
        </div>
        {subtitle && <p className="text-[9px] text-ink-mute mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="space-y-1.5 flex-1">{children}</div>
    </div>
  )
}

function EmptyHint({ children }) {
  return (
    <div className="text-center text-[10px] italic text-ink-mute py-4 px-2 border border-dashed border-line rounded-lg">
      {children}
    </div>
  )
}

// ============================================================
// Onglet "Range"
// ============================================================
function DoneTab({ vitrineItems, prodItems, saleItems, commandeItems, vitrineResa, onResaUndo, onUndo }) {
  const resaDone = Array.isArray(vitrineResa) ? vitrineResa : []
  const total = vitrineItems.length + prodItems.length + (saleItems?.length || 0) + commandeItems.length + resaDone.length
  if (total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-line p-8 text-center shadow-sm">
        <p className="text-[15px] font-semibold text-ink">Rien rangé pour le moment</p>
        <p className="text-[12px] text-ink-mute mt-1">Les items que tu rangeras apparaîtront ici.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 min-[500px]:grid-cols-3 xl:grid-cols-5 gap-3">
      <ColumnSection title="RÉSERVATION VITRINE" count={resaDone.length} subtitle="rangées du jour">
        {resaDone.length === 0 ? (
          <EmptyHint>Rien rangé</EmptyHint>
        ) : (
          resaDone.map(x => (
            <button key={`resaD-${x.lineId}`} type="button" onClick={() => onResaUndo(x)}
              title="Annuler (remettre à ranger)"
              className="w-full text-left bg-emerald-50/60 border border-emerald-200 rounded-xl p-2.5 mb-2 shadow-sm hover:bg-white transition-all">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-ink truncate line-through decoration-emerald-600/40">{x.clientName || '—'}</span>
                {x.pickupText && <span className="text-[10px] text-ink-mute whitespace-nowrap">{x.pickupText.slice(-5)}</span>}
              </div>
              <div className="text-[11px] text-ink-soft leading-snug">{Number(x.qty) > 1 ? `${x.qty}× ` : ''}{x.text}</div>
              <div className="text-[10px] text-ink-mute mt-1">↩︎ Annuler</div>
            </button>
          ))
        )}
      </ColumnSection>

      <ColumnSection title="VITRINE" count={vitrineItems.length} subtitle="rangés du jour">
        {vitrineItems.length === 0 ? (
          <EmptyHint>Rien rangé</EmptyHint>
        ) : (
          vitrineItems.map(d => (
            <ItemCard
              key={d.key}
              title={d.title}
              subtitle={`rangé ${formatRelativeTime(d.received_at)}`}
              quantity={d.quantity}
              done={true}
              onClick={() => onUndo(d)}
              compact
            />
          ))
        )}
      </ColumnSection>

      <ColumnSection title="PROD" count={prodItems.length} subtitle="rangés du jour J+">
        {prodItems.length === 0 ? (
          <EmptyHint>Rien rangé</EmptyHint>
        ) : (
          prodItems.map(d => (
            <ItemCard
              key={d.key}
              title={d.title}
              subtitle={`${d.subtitle ? d.subtitle + ' · ' : ''}rangé ${formatRelativeTime(d.received_at)}`}
              quantity={d.quantity}
              done={true}
              onClick={() => onUndo(d)}
              compact
            />
          ))
        )}
      </ColumnSection>

      <ColumnSection title="🥪 SALÉ" count={(saleItems || []).length} subtitle="rangés du jour J+">
        {(saleItems || []).length === 0 ? (
          <EmptyHint>Rien rangé</EmptyHint>
        ) : (
          saleItems.map(d => (
            <ItemCard
              key={d.key}
              title={d.title}
              subtitle={`${d.subtitle ? d.subtitle + ' · ' : ''}rangé ${formatRelativeTime(d.received_at)}`}
              quantity={d.quantity}
              done={true}
              onClick={() => onUndo(d)}
              compact
            />
          ))
        )}
      </ColumnSection>

      <ColumnSection title="COMMANDES" count={commandeItems.length} subtitle="CD / GM / GMD">
        {commandeItems.length === 0 ? (
          <EmptyHint>Rien rangé</EmptyHint>
        ) : (
          commandeItems.map(d => (
            <ItemCard
              key={d.key}
              title={d.title}
              subtitle={`${d.subtitle ? d.subtitle + ' · ' : ''}rangé ${formatRelativeTime(d.received_at)}`}
              quantity={d.quantity}
              done={true}
              onClick={() => onUndo(d)}
              compact
            />
          ))
        )}
      </ColumnSection>
    </div>
  )
}

// ============================================================
// Helpers de presentation
// ============================================================
function extractItemTitle(item) {
  // Item d'une commande : on prefere le title net, sinon type generique
  return item.title || `Item ${item.type || ''}`
}

function buildSalesLineSubtitle(line) {
  const who = line.client_name || line.order_num || ''
  const when = formatDayLabel(lineDay(line))
  const hour = formatHour(line.delivery_at)
  const parts = []
  if (when) parts.push(when)
  if (hour) parts.push(hour)
  if (who) parts.push(who)
  return parts.join(' · ')
}

// Regroupe les lignes PROD : jus (B-) et GS- groupés PAR COMMANDE (1 ticket par groupe).
// Le reste (entremets E-, viennoiserie V-, MI-) reste en lignes individuelles.
function groupProdForPrint(lines) {
  const jus = new Map(), gs = new Map(), otherProd = []
  for (const l of lines) {
    const isJus = startsWithAny(l.product_name, ['B-'])
    const isGs = startsWithAny(l.product_name, ['GS-'])
    if (!isJus && !isGs) { otherProd.push(l); continue }
    const map = isJus ? jus : gs
    const k = l.order_num || `l${l.odoo_line_id}`
    if (!map.has(k)) map.set(k, { key: `${isJus ? 'jus' : 'gs'}-${k}`, kind: isJus ? 'jus' : 'gs', order_num: l.order_num, client_name: l.client_name, delivery_at: l.delivery_at, lines: [] })
    map.get(k).lines.push(l)
  }
  return { jusGroups: [...jus.values()], gsGroups: [...gs.values()], otherProd }
}

function buildGroupSubtitle(group) {
  const list = group.lines.map(l => `x${l.quantity || 1} ${cleanProductName(l.product_name)}`).join(' · ')
  const when = formatDayLabel(lineDay(group.lines[0]))
  const hour = formatHour(group.delivery_at)
  const head = [when, hour].filter(Boolean).join(' · ')
  return head ? `${head} — ${list}` : list
}

function buildOrderItemSubtitle(item) {
  const who = item.client_name || item.order_num || ''
  const when = formatDayLabel(item.day)
  const hour = formatHour(item.delivery_at)
  const tag = item.type === 'CD' ? 'CD' : (item.type === 'GM' ? 'GM' : 'GMD')
  const parts = []
  if (when) parts.push(when)
  if (hour) parts.push(hour)
  if (who) parts.push(who)
  parts.push(tag)
  return parts.join(' · ')
}

// ============================================================
// Composants UI
// ============================================================
function Section({ title, count, subtitle, children }) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3 px-1">
        <div>
          <h2 className="text-[11px] font-bold tracking-[0.15em] text-bordeaux">{title}</h2>
          {subtitle && <p className="text-[10px] text-ink-mute mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-[11px] text-ink-mute">{count} article{count > 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function ItemCard({ title, subtitle, quantity, onClick, done = false, compact = false }) {
  const baseColor = done
    ? 'border-emerald-300 hover:border-emerald-600 hover:bg-emerald-50'
    : 'border-bordeaux/30 hover:border-bordeaux hover:bg-bordeaux hover:text-cream'
  const qtyColor = done
    ? 'bg-emerald-600 text-white group-hover:bg-white group-hover:text-emerald-600'
    : 'bg-bordeaux text-cream group-hover:bg-cream group-hover:text-bordeaux'
  const padding = compact ? 'px-2.5 py-2' : 'px-4 py-3'
  const titleSize = compact ? 'text-[12px]' : 'text-[14px]'
  const subtitleSize = compact ? 'text-[10px]' : 'text-[11px]'
  const qtySize = compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'
  return (
    <button
      onClick={onClick}
      className={`w-full bg-white border rounded-xl shadow-sm ${padding} text-left transition-all flex items-center justify-between gap-2 group ${baseColor}`}
    >
      <div className="flex-1 min-w-0">
        <div className={`${titleSize} font-medium break-words ${done ? 'line-through text-ink-mute' : ''}`}>
          {done && <span className="mr-1">✓</span>}
          {title}
        </div>
        {subtitle && (
          <div className={`${subtitleSize} text-ink-mute group-hover:text-cream/80 mt-0.5 break-words`}>
            {subtitle}
          </div>
        )}
      </div>
      {quantity !== undefined && quantity !== null && (
        <span className={`flex-shrink-0 rounded-full font-bold transition-colors ${qtySize} ${qtyColor}`}>
          × {quantity}
        </span>
      )}
    </button>
  )
}
