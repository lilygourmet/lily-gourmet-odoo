// src/components/ChecklistView.jsx
// Page Checklist Cafe : 2 onglets - "A ranger" et "Range".
//
// ONGLET "A RANGER" :
//   - VITRINE : items envoyes par la vitrine (stock_day_items) du JOUR non confirmes
//   - PROD : sales_lines aujourd'hui + 3 jours futurs, cochees "Fait" par Prod,
//            prefixes E-/V-/GS-/MI-, non recues par cafe
//   - ACCESSOIRES : pareil mais prefixes GM-/GMD-
//
// ONGLET "RANGE" :
//   - Items rangés par le cafe pour des commandes du JOUR J ou FUTURES uniquement
//     (les rangés des dates passées disparaissent automatiquement le lendemain)
//   - Tries par heure de rangement (recent en haut), limite a 500 derniers
//   - Click sur un item range = annule le rangement (revient dans "A ranger")
// =============================================================

import { useEffect, useMemo, useState } from 'react'
import AppHeader from './AppHeader'
import { supabase } from '../lib/supabase'
import { loadSalesLinesForRange } from '../lib/salesLines'
import { loadProdDoneForLines } from '../lib/prodDone'
import { loadCafeReceivedForLines, markCafeReceived, unmarkCafeReceived } from '../lib/cafeReceived'
import { confirmReception, todayISO } from '../lib/stockBoutique'

// Prefixes pour repartir entre les sections PROD et ACCESSOIRES
const PROD_PREFIXES = ['E-', 'V-', 'GS-', 'MI-']
const ACCESSOIRES_PREFIXES = ['GM-', 'GMD-']
// Fenetre pour Prod/Accessoires : aujourd'hui + 3 jours apres (pas de jours passes)
const DAYS_BEFORE = 0
const DAYS_AFTER = 3

function startsWithAny(name, prefixes) {
  if (!name) return false
  return prefixes.some(p => name.startsWith(p))
}

// Formatte une date 'YYYY-MM-DD' en libelle relatif court ("hier", "aujourd'hui", "demain", "lun 19/05")
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
  // Sinon format court "lun 19/05"
  const days = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
  return `${days[date.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

// Decale une date ISO de N jours
function shiftISO(isoStr, deltaDays) {
  const [y, m, d] = isoStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export default function ChecklistView({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('todo') // 'todo' | 'done'
  const [vitrineItems, setVitrineItems] = useState([])  // items vitrine du jour pending
  const [prodLines, setProdLines] = useState([])         // sales_lines done par Prod, non recues
  const [accLines, setAccLines] = useState([])          // pareil mais accessoires
  const [doneItems, setDoneItems] = useState([])         // items deja recus par cafe (toutes sources confondues)
  const todayStr = todayISO()

  // ============================================================
  // Chargement principal : combine 3 sources de donnees
  // ============================================================
  async function refresh() {
    setLoading(true)
    try {
      const fromStr = shiftISO(todayStr, -DAYS_BEFORE)

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

      // -------- 2) PROD + ACCESSOIRES (fenetre elargie) --------
      // Charge les sales_lines sur la fenetre 3j avant -> 3j apres
      const totalDays = DAYS_BEFORE + 1 + DAYS_AFTER  // 4 jours
      const allLines = await loadSalesLinesForRange(fromStr, totalDays)
      const lineIds = allLines.map(l => l.odoo_line_id).filter(Boolean)

      // Charge prod_done pour toutes ces lignes
      const dones = await loadProdDoneForLines(lineIds)
      const doneSet = new Set(
        dones.filter(d => d.status === 'done').map(d => d.odoo_line_id)
      )

      // Charge cafe_received pour toutes ces lignes
      const receiveds = await loadCafeReceivedForLines(lineIds)
      const receivedMap = new Map(receiveds.map(r => [r.odoo_line_id, r]))

      // A RANGER : faites par Prod ET pas encore recues par cafe
      const todoLines = allLines.filter(l =>
        doneSet.has(l.odoo_line_id) && !receivedMap.has(l.odoo_line_id)
      )
      const prodOnes = todoLines.filter(l => startsWithAny(l.product_name, PROD_PREFIXES))
      const accOnes = todoLines.filter(l => startsWithAny(l.product_name, ACCESSOIRES_PREFIXES))
      setProdLines(prodOnes)
      setAccLines(accOnes)

      // RANGE : tous les rangés (sans limite de date) du cafe.
      // On charge directement toute la table cafe_received, puis on enrichit
      // avec les sales_lines correspondantes pour avoir le nom/client/quantite.
      // On filtre cote affichage : on ne garde que les commandes du jour J et futures
      // (les rangés des dates passées disparaissent automatiquement le lendemain).
      const { data: allReceived } = await supabase
        .from('cafe_received')
        .select('odoo_line_id, received_at')
        .order('received_at', { ascending: false })
        .limit(500) // garde-fou : 500 derniers max pour ne pas exploser
      const allReceivedIds = (allReceived || []).map(r => r.odoo_line_id)

      let done = []
      if (allReceivedIds.length > 0) {
        const { data: linesDone } = await supabase
          .from('sales_lines')
          .select('odoo_line_id, product_name, quantity, client_name, order_num, day')
          .in('odoo_line_id', allReceivedIds)
        const linesDoneMap = new Map((linesDone || []).map(l => [l.odoo_line_id, l]))
        const recvByLine = new Map((allReceived || []).map(r => [r.odoo_line_id, r.received_at]))

        done = (allReceived || [])
          .map(r => {
            const line = linesDoneMap.get(r.odoo_line_id)
            if (!line) return null
            if (!startsWithAny(line.product_name, [...PROD_PREFIXES, ...ACCESSOIRES_PREFIXES])) return null
            // Filtre date : seulement aujourd'hui et futures
            if (!line.day || line.day < todayStr) return null
            return {
              ...line,
              received_at: recvByLine.get(r.odoo_line_id),
              section: startsWithAny(line.product_name, PROD_PREFIXES) ? 'PROD' : 'ACCESSOIRES',
            }
          })
          .filter(Boolean)
        // Deja trie par received_at desc grace au order de la requete
      }
      setDoneItems(done)
    } catch (e) {
      console.error('[ChecklistView] refresh', e)
    } finally {
      setLoading(false)
    }
  }

  // ============================================================
  // Realtime : s'abonne aux 3 tables pour rafraichir auto
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
  // Actions
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
      setAccLines(prev => prev.filter(l => l.odoo_line_id !== line.odoo_line_id))
    } catch (e) {
      console.error('[handleProdDone]', e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  async function handleUndoReceived(line) {
    try {
      await unmarkCafeReceived(line.odoo_line_id)
      // Le realtime va rafraichir, mais on enleve visuellement tout de suite
      setDoneItems(prev => prev.filter(l => l.odoo_line_id !== line.odoo_line_id))
    } catch (e) {
      console.error('[handleUndoReceived]', e)
      alert('Erreur : ' + (e.message || e))
    }
  }

  // ============================================================
  // Compteurs
  // ============================================================
  const totalTodo = vitrineItems.length + prodLines.length + accLines.length
  const totalDone = doneItems.length
  const allDone = totalTodo === 0

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header de page */}
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

        {/* Contenu */}
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
            accLines={accLines}
            onVitrineDone={handleVitrineDone}
            onProdDone={handleProdDone}
          />
        ) : (
          <DoneTab
            items={doneItems}
            onUndo={handleUndoReceived}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
// Onglet "A ranger"
// ============================================================
function TodoTab({ allDone, total, vitrineItems, prodLines, accLines, onVitrineDone, onProdDone }) {
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

      {vitrineItems.length > 0 && (
        <Section title="VITRINE" count={vitrineItems.length} subtitle="envoyés par la vitrine">
          {vitrineItems.map(item => (
            <ItemCard
              key={`vit-${item.id}`}
              title={item.product_name}
              subtitle="de la vitrine"
              quantity={item.qty_announced}
              onClick={() => onVitrineDone(item)}
            />
          ))}
        </Section>
      )}

      {prodLines.length > 0 && (
        <Section title="PROD" count={prodLines.length} subtitle="préparés par la production">
          {prodLines.map(line => (
            <ItemCard
              key={`prod-${line.odoo_line_id}`}
              title={line.product_name}
              subtitle={buildSubtitle(line)}
              quantity={line.quantity}
              onClick={() => onProdDone(line)}
            />
          ))}
        </Section>
      )}

      {accLines.length > 0 && (
        <Section title="ACCESSOIRES" count={accLines.length} subtitle="GM et GMD">
          {accLines.map(line => (
            <ItemCard
              key={`acc-${line.odoo_line_id}`}
              title={line.product_name}
              subtitle={buildSubtitle(line)}
              quantity={line.quantity}
              onClick={() => onProdDone(line)}
            />
          ))}
        </Section>
      )}
    </>
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
      {items.map(line => (
        <ItemCard
          key={`done-${line.odoo_line_id}`}
          title={line.product_name}
          subtitle={`${line.section} · ${buildSubtitle(line)} · rangé ${formatRelativeTime(line.received_at)}`}
          quantity={line.quantity}
          done={true}
          onClick={() => onUndo(line)}
        />
      ))}
    </div>
  )
}

// ============================================================
// Helper : construit le sous-titre d'une ligne (client + date)
// ============================================================
function buildSubtitle(line) {
  const who = line.client_name || line.order_num || ''
  const when = formatDayLabel(line.day)
  if (who && when) return `${who} · ${when}`
  return who || when || ''
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

// ============================================================
// Composants helper
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

function ItemCard({ title, subtitle, quantity, onClick, done = false }) {
  const baseColor = done
    ? 'border-emerald-300 hover:border-emerald-600 hover:bg-emerald-50'
    : 'border-bordeaux/30 hover:border-bordeaux hover:bg-bordeaux hover:text-cream'
  const qtyColor = done
    ? 'bg-emerald-600 text-white group-hover:bg-white group-hover:text-emerald-600'
    : 'bg-bordeaux text-cream group-hover:bg-cream group-hover:text-bordeaux'
  return (
    <button
      onClick={onClick}
      className={`w-full bg-white border rounded-xl px-4 py-3 text-left transition-all flex items-center justify-between gap-3 group ${baseColor}`}
    >
      <div className="flex-1 min-w-0">
        <div className={`text-[14px] font-medium truncate ${done ? 'line-through text-ink-mute' : ''}`}>
          {done && <span className="mr-1.5">✓</span>}
          {title}
        </div>
        {subtitle && (
          <div className="text-[11px] text-ink-mute group-hover:text-cream/80 mt-0.5 truncate">
            {subtitle}
          </div>
        )}
      </div>
      {quantity !== undefined && quantity !== null && (
        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[12px] font-bold transition-colors ${qtyColor}`}>
          × {quantity}
        </span>
      )}
    </button>
  )
}
