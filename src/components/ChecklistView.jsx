// src/components/ChecklistView.jsx
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
import AppHeader from './AppHeader'
import { supabase } from '../lib/supabase'
import { loadSalesLinesForRange } from '../lib/salesLines'
import { loadProdDoneForLines } from '../lib/prodDone'
import { loadCafeReceivedForLines, markCafeReceived, unmarkCafeReceived } from '../lib/cafeReceived'
import { confirmReception, todayISO } from '../lib/stockBoutique'
import { loadItemSteps, checkItemStep, uncheckItemStep } from '../lib/orders'

// Prefixes pour repartir entre les sections PROD et ACCESSOIRES dans sales_lines
const PROD_PREFIXES = ['E-', 'V-', 'GS-', 'MI-']
const ACCESSOIRES_PREFIXES = ['GM-', 'GMD-']  // (commentaire historique, non utilise ici)
// Clients a exclure de la checklist (commandes internes, type vitrine boutique)
const EXCLUDED_CLIENTS = ['Vitrine']
// Fenetre : aujourd'hui + 3 jours apres
const DAYS_BEFORE = 0
const DAYS_AFTER = 3

function startsWithAny(name, prefixes) {
  if (!name) return false
  // Retire le code Odoo entre crochets en tete : "[447] E- Gianduja" -> "E- Gianduja"
  const cleaned = String(name).replace(/^\[\d+\]\s*/, '').trim()
  return prefixes.some(p => cleaned.startsWith(p))
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
function isItemToRange(item, steps) {
  const fini = !!steps[`${item.id}_fini`]
  const fait = !!steps[`${item.id}_fait`]
  const range = !!steps[`${item.id}_range`]
  if (range) return false
  if (item.type === 'CD') return fini
  return fait // GM, GMD, autres
}
function isItemRanged(item, steps) {
  return !!steps[`${item.id}_range`]
}

export default function ChecklistView({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('todo') // 'todo' | 'done'

  // Section VITRINE
  const [vitrineItems, setVitrineItems] = useState([])

  // Section PROD (sales_lines E-/V-/GS-/MI- via prod_done)
  const [prodLines, setProdLines] = useState([])

  // Section COMMANDES (order_items CD/GM/GMD via item_steps)
  const [commandeItems, setCommandeItems] = useState([])

  // Onglet RANGE : items deja ranges (separes par source pour 3 colonnes)
  const [doneVitrine, setDoneVitrine] = useState([])
  const [doneProd, setDoneProd] = useState([])
  const [doneCommandes, setDoneCommandes] = useState([])

  // Recherche partout (filtre les 3 colonnes)
  const [searchQuery, setSearchQuery] = useState('')
  // Bouton refresh manuel
  const [refreshing, setRefreshing] = useState(false)

  const todayStr = todayISO()

  // ============================================================
  // Chargement principal : combine 3 sources de donnees
  // ============================================================
  async function refresh() {
    setLoading(true)
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
      ] = await Promise.all([
        // 2a) Vitrine "A ranger" : items pending
        sd?.id
          ? supabase
              .from('stock_day_items')
              .select('id, product_name, product_code, qty_announced, reception_status, discrepancy_status')
              .eq('stock_day_id', sd.id)
              .eq('source', 'morning')
              .eq('reception_status', 'pending')
              .order('product_name')
          : Promise.resolve({ data: [] }),
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
      ])

      // ============================================================
      // PHASE 3 : assemblage et calculs (synchrone, rapide)
      // ============================================================

      // 3a) VITRINE a ranger
      setVitrineItems(vitItemsResult?.data || [])

      // 3b) PROD a ranger
      const doneSet = new Set(dones.filter(d => d.status === 'done').map(d => d.odoo_line_id))
      const receivedMap = new Map(receiveds.map(r => [r.odoo_line_id, r]))
      const todoLines = allLines.filter(l =>
        doneSet.has(l.odoo_line_id) &&
        !receivedMap.has(l.odoo_line_id) &&
        startsWithAny(l.product_name, PROD_PREFIXES) &&
        !isExcludedClient(l.client_name)
      )
      setProdLines(todoLines)

      // 3c) COMMANDES a ranger
      const todoCommandes = allOrderItems.filter(i => isItemToRange(i, stepsMap))
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

      // 3e) PROD rangee
      const doneProdItems = []
      if (allReceivedIds.length > 0) {
        const linesDone = linesDoneResult?.data || []
        const linesDoneMap = new Map(linesDone.map(l => [l.odoo_line_id, l]))
        const recvByLine = new Map(allReceived.map(r => [r.odoo_line_id, r.received_at]))

        for (const r of allReceived) {
          const line = linesDoneMap.get(r.odoo_line_id)
          if (!line) continue
          if (!startsWithAny(line.product_name, PROD_PREFIXES)) continue
          if (isExcludedClient(line.client_name)) continue
          const day = lineDay(line)
          if (!day || day < todayStr) continue
          doneProdItems.push({
            kind: 'prod',
            key: `prod-${r.odoo_line_id}`,
            title: cleanProductName(line.product_name),
            subtitle: buildSalesLineSubtitle(line),
            quantity: line.quantity,
            received_at: recvByLine.get(r.odoo_line_id),
            odoo_line_id: r.odoo_line_id,
          })
        }
      }
      setDoneProd(doneProdItems)

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
      setLoading(false)
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
    const interval = setInterval(refresh, 5 * 60 * 1000)

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
    } catch (e) {
      console.error('[handleVitrineDone]', e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleProdDone(line) {
    try {
      await markCafeReceived(line.odoo_line_id, user.id)
      setProdLines(prev => prev.filter(l => l.odoo_line_id !== line.odoo_line_id))
    } catch (e) {
      console.error('[handleProdDone]', e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleCommandeDone(item) {
    try {
      const ok = await checkItemStep(item.id, 'range', user.id)
      if (!ok) throw new Error("La requete a echoue")
      setCommandeItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) {
      console.error('[handleCommandeDone]', e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  // Undo dans l'onglet Range
  async function handleUndo(doneItem) {
    try {
      if (doneItem.kind === 'prod') {
        await unmarkCafeReceived(doneItem.odoo_line_id)
        setDoneProd(prev => prev.filter(d => d.key !== doneItem.key))
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
    } catch (e) {
      console.error('[handleUndo]', e)
      alert('Erreur : ' + (e.message || e))
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
  const totalTodo = vitrineItems.length + prodLines.length + commandeItems.length
  const totalDone = doneVitrine.length + doneProd.length + doneCommandes.length
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
  const filteredCommandeItems = commandeItems.filter(i =>
    matchesSearch([i.title, i.client_name, i.order_num])
  )

  // Filtre les listes "Range"
  const filteredDoneVitrine = doneVitrine.filter(d => matchesSearch([d.title]))
  const filteredDoneProd = doneProd.filter(d => matchesSearch([d.title, d.subtitle]))
  const filteredDoneCommandes = doneCommandes.filter(d => matchesSearch([d.title, d.subtitle]))

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-[24px] font-semibold text-ink tracking-tight">📋 Checklist</h1>
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
            <span>⏳ À ranger</span>
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
            <span>✓ Rangé</span>
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
                placeholder="🔍 Rechercher..."
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
              <span className={refreshing ? 'inline-block animate-spin' : ''}>🔄</span>
              <span className="hidden sm:inline">{refreshing ? 'Rafraîchissement...' : 'Rafraîchir'}</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-line p-6 text-center text-[13px] text-ink-mute">
            Chargement...
          </div>
        ) : tab === 'todo' ? (
          <TodoTab
            allDone={allDone && !q}
            total={totalTodo}
            vitrineItems={filteredVitrineItems}
            prodLines={filteredProdLines}
            commandeItems={filteredCommandeItems}
            onVitrineDone={handleVitrineDone}
            onProdDone={handleProdDone}
            onCommandeDone={handleCommandeDone}
          />
        ) : (
          <DoneTab
            vitrineItems={filteredDoneVitrine}
            prodItems={filteredDoneProd}
            commandeItems={filteredDoneCommandes}
            onUndo={handleUndo}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
// Onglet "A ranger"
// ============================================================
function TodoTab({ allDone, total, vitrineItems, prodLines, commandeItems, onVitrineDone, onProdDone, onCommandeDone }) {
  if (allDone) {
    return (
      <div className="bg-white rounded-xl border border-line p-8 text-center">
        <div className="text-[40px] mb-2">🎉</div>
        <p className="text-[15px] font-semibold text-emerald-600">Tout est rangé !</p>
        <p className="text-[12px] text-ink-mute mt-1">Rien n'attend de t'être rangé pour l'instant.</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-line p-4 mb-6">
        <p className="text-[14px] font-medium text-bordeaux">
          {total} article{total > 1 ? 's' : ''} à ranger
        </p>
      </div>

      {/* 3 colonnes c\u00f4te \u00e0 c\u00f4te (toujours, m\u00eame sur mobile) */}
      <div className="grid grid-cols-3 gap-3">
        <ColumnSection title="VITRINE" count={vitrineItems.length} subtitle="envoyés par la vitrine">
          {vitrineItems.length === 0 ? (
            <EmptyHint>Aucun envoi</EmptyHint>
          ) : (
            vitrineItems.map(item => (
              <ItemCard
                key={`vit-${item.id}`}
                title={cleanProductName(item.product_name)}
                subtitle={null}
                quantity={item.qty_announced}
                onClick={() => onVitrineDone(item)}
                compact
              />
            ))
          )}
        </ColumnSection>

        <ColumnSection title="PROD" count={prodLines.length} subtitle="préparés par la prod">
          {prodLines.length === 0 ? (
            <EmptyHint>Rien à ranger</EmptyHint>
          ) : (
            prodLines.map(line => (
              <ItemCard
                key={`prod-${line.odoo_line_id}`}
                title={cleanProductName(line.product_name)}
                subtitle={buildSalesLineSubtitle(line)}
                quantity={line.quantity}
                onClick={() => onProdDone(line)}
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
function DoneTab({ vitrineItems, prodItems, commandeItems, onUndo }) {
  const total = vitrineItems.length + prodItems.length + commandeItems.length
  if (total === 0) {
    return (
      <div className="bg-white rounded-xl border border-line p-8 text-center">
        <div className="text-[40px] mb-2">📭</div>
        <p className="text-[15px] font-semibold text-ink">Rien rangé pour le moment</p>
        <p className="text-[12px] text-ink-mute mt-1">Les items que tu rangeras apparaîtront ici.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3">
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
      className={`w-full bg-white border rounded-lg ${padding} text-left transition-all flex items-center justify-between gap-2 group ${baseColor}`}
    >
      <div className="flex-1 min-w-0">
        <div className={`${titleSize} font-medium truncate ${done ? 'line-through text-ink-mute' : ''}`}>
          {done && <span className="mr-1">✓</span>}
          {title}
        </div>
        {subtitle && (
          <div className={`${subtitleSize} text-ink-mute group-hover:text-cream/80 mt-0.5 truncate`}>
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
