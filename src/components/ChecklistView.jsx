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

  // Onglet RANGE : items deja ranges par le cafe (toutes sources)
  const [doneItems, setDoneItems] = useState([])

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

      // -------- 1) VITRINE (jour seulement) --------
      const { data: sd } = await supabase
        .from('stock_day')
        .select('id')
        .eq('day', todayStr)
        .maybeSingle()

      let vitItems = []
      if (sd?.id) {
        const { data: items } = await supabase
          .from('stock_day_items')
          .select('id, product_name, product_code, qty_announced, reception_status, discrepancy_status')
          .eq('stock_day_id', sd.id)
          .eq('source', 'morning')
          .eq('reception_status', 'pending')
          .order('product_name')
        vitItems = items || []
      }
      setVitrineItems(vitItems)

      // -------- 2) PROD : sales_lines avec prod_done.status='done' --------
      const allLines = await loadSalesLinesForRange(fromStr, totalDays)
      const lineIds = allLines.map(l => l.odoo_line_id).filter(Boolean)

      const dones = await loadProdDoneForLines(lineIds)
      const doneSet = new Set(dones.filter(d => d.status === 'done').map(d => d.odoo_line_id))
      const receiveds = await loadCafeReceivedForLines(lineIds)
      const receivedMap = new Map(receiveds.map(r => [r.odoo_line_id, r]))

      // A RANGER prod : faites par Prod ET pas encore recues par cafe, prefixe Prod
      // ET pas un client exclu (ex: Vitrine)
      const todoLines = allLines.filter(l =>
        doneSet.has(l.odoo_line_id) &&
        !receivedMap.has(l.odoo_line_id) &&
        startsWithAny(l.product_name, PROD_PREFIXES) &&
        !isExcludedClient(l.client_name)
      )
      setProdLines(todoLines)

      // -------- 3) COMMANDES : order_items via item_steps --------
      const orders = await loadOrdersForRange(fromStr, toStr)
      // Pour chaque order, on garde les items GM/GMD/CD
      // On exclut les commandes des clients exclus (ex: Vitrine)
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
      const stepsMap = itemIds.length > 0 ? await loadItemSteps(itemIds) : {}

      // A RANGER commandes : fait/fini coche mais range pas coche
      const todoCommandes = allOrderItems.filter(i => isItemToRange(i, stepsMap))
      setCommandeItems(todoCommandes)

      // -------- 4) ONGLET "RANGE" : combine prod + commandes --------
      // 4a) Prod ranges : cafe_received avec sales_line correspondante, du jour J ou futur
      const { data: allReceived } = await supabase
        .from('cafe_received')
        .select('odoo_line_id, received_at')
        .order('received_at', { ascending: false })
        .limit(500)
      const allReceivedIds = (allReceived || []).map(r => r.odoo_line_id)

      const doneProdItems = []
      if (allReceivedIds.length > 0) {
        const { data: linesDone } = await supabase
          .from('sales_lines')
          .select('odoo_line_id, product_name, quantity, client_name, order_num, day')
          .in('odoo_line_id', allReceivedIds)
        const linesDoneMap = new Map((linesDone || []).map(l => [l.odoo_line_id, l]))
        const recvByLine = new Map((allReceived || []).map(r => [r.odoo_line_id, r.received_at]))

        for (const r of (allReceived || [])) {
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
            // pour l'action undo
            odoo_line_id: r.odoo_line_id,
          })
        }
      }

      // 4b) Commandes rangees : items dont 'range' est coche, commande aujourd'hui ou futur
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
          // pour l'action undo
          item_id: item.id,
        })
      }

      // Combine et trie par received_at desc
      const allDone = [...doneProdItems, ...doneCommandeItems]
        .filter(x => x.received_at)
        .sort((a, b) => new Date(b.received_at) - new Date(a.received_at))
      setDoneItems(allDone)
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

    // Refresh toutes les 30 sec en backup
    const interval = setInterval(refresh, 30000)

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
      } else if (doneItem.kind === 'commande') {
        const ok = await uncheckItemStep(doneItem.item_id, 'range')
        if (!ok) throw new Error("La requete a echoue")
      }
      setDoneItems(prev => prev.filter(d => d.key !== doneItem.key))
    } catch (e) {
      console.error('[handleUndo]', e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  // ============================================================
  // Compteurs
  // ============================================================
  const totalTodo = vitrineItems.length + prodLines.length + commandeItems.length
  const totalDone = doneItems.length
  const allDone = totalTodo === 0

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

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
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
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-line p-6 text-center text-[13px] text-ink-mute">
            Chargement...
          </div>
        ) : tab === 'todo' ? (
          <TodoTab
            allDone={allDone}
            total={totalTodo}
            vitrineItems={vitrineItems}
            prodLines={prodLines}
            commandeItems={commandeItems}
            onVitrineDone={handleVitrineDone}
            onProdDone={handleProdDone}
            onCommandeDone={handleCommandeDone}
          />
        ) : (
          <DoneTab items={doneItems} onUndo={handleUndo} />
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
function DoneTab({ items, onUndo }) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-line p-8 text-center">
        <div className="text-[40px] mb-2">📭</div>
        <p className="text-[15px] font-semibold text-ink">Rien rangé pour le moment</p>
        <p className="text-[12px] text-ink-mute mt-1">Les items que tu rangeras apparaîtront ici.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map(d => (
        <ItemCard
          key={d.key}
          title={d.title}
          subtitle={`${d.subtitle ? d.subtitle + ' · ' : ''}rangé ${formatRelativeTime(d.received_at)}`}
          quantity={d.quantity}
          done={true}
          onClick={() => onUndo(d)}
        />
      ))}
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
  if (who && when) return `${who} · ${when}`
  return who || when || ''
}

function buildOrderItemSubtitle(item) {
  const who = item.client_name || item.order_num || ''
  const when = formatDayLabel(item.day)
  const tag = item.type === 'CD' ? 'CD' : (item.type === 'GM' ? 'GM' : 'GMD')
  const parts = []
  if (who) parts.push(`commande ${who}`)
  if (when) parts.push(when)
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
