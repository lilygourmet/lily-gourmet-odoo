// src/components/ChecklistView.jsx
// Page Checklist Cafe : liste de tout ce que le cafe doit ranger aujourd'hui.
// 3 sections :
//   - VITRINE : articles envoyes par la vitrine (stock_day_items) non confirmes
//   - PROD : articles Prod coches "Fait" avec prefixe E-/V-/GS-/MI- non encore recus par cafe
//   - ACCESSOIRES : pareil mais prefixe GM-/GMD-
//
// Le cafe clique sur une carte => l'article disparait de la liste.
// La liste se rafraichit en realtime quand quelque chose change.
// =============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from './AppHeader'
import { supabase } from '../lib/supabase'
import { loadSalesLinesForRange } from '../lib/salesLines'
import { loadProdDoneForLines } from '../lib/prodDone'
import { loadCafeReceivedForLines, markCafeReceived, unmarkCafeReceived } from '../lib/cafeReceived'
import { confirmReception, todayISO } from '../lib/stockBoutique'

// Prefixes pour repartir entre les sections PROD et ACCESSOIRES
const PROD_PREFIXES = ['E-', 'V-', 'GS-', 'MI-']
const ACCESSOIRES_PREFIXES = ['GM-', 'GMD-']

function startsWithAny(name, prefixes) {
  if (!name) return false
  return prefixes.some(p => name.startsWith(p))
}

export default function ChecklistView({ user, activeView, onNavigate, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [stockDayId, setStockDayId] = useState(null)
  const [vitrineItems, setVitrineItems] = useState([])  // items stock_day_items source=morning pending
  const [prodLines, setProdLines] = useState([])         // sales_lines avec status done et prefixe PROD
  const [accLines, setAccLines] = useState([])          // sales_lines avec status done et prefixe ACCESSOIRES
  const todayStr = todayISO()

  // ============================================================
  // Chargement principal : combine 3 sources de donnees
  // ============================================================
  async function refresh() {
    setLoading(true)
    try {
      // 1) VITRINE : items envoyes ce jour non confirmes
      const { data: sd } = await supabase
        .from('stock_day')
        .select('id')
        .eq('day', todayStr)
        .maybeSingle()
      const sdId = sd?.id || null
      setStockDayId(sdId)

      let vitItems = []
      if (sdId) {
        const { data: items } = await supabase
          .from('stock_day_items')
          .select('id, product_name, product_code, qty_announced, reception_status, discrepancy_status')
          .eq('stock_day_id', sdId)
          .eq('source', 'morning')
          .eq('reception_status', 'pending')
          .order('product_name')
        vitItems = items || []
      }
      setVitrineItems(vitItems)

      // 2) PROD + ACCESSOIRES : sales_lines avec entree prod_done.status='done'
      //    et sans entree cafe_received (sinon deja range)
      const DAYS = 7  // marge pour voir les commandes recentes
      const allLines = await loadSalesLinesForRange(todayStr, DAYS)
      // On garde uniquement les lignes du JOUR (le cafe range ce qui sort aujourd'hui)
      const todayLines = allLines.filter(l => l.day === todayStr)
      const lineIds = todayLines.map(l => l.odoo_line_id).filter(Boolean)

      // Charge le status "fait" de Prod
      const dones = await loadProdDoneForLines(lineIds)
      const doneSet = new Set(
        dones.filter(d => d.status === 'done').map(d => d.odoo_line_id)
      )

      // Charge le status "recu" du cafe
      const receiveds = await loadCafeReceivedForLines(lineIds)
      const receivedSet = new Set(receiveds.map(r => r.odoo_line_id))

      // Filtre : faites par Prod ET pas encore recues par cafe
      const todoLines = todayLines.filter(l =>
        doneSet.has(l.odoo_line_id) && !receivedSet.has(l.odoo_line_id)
      )

      // Repartit dans PROD ou ACCESSOIRES selon le prefixe du product_name
      const prodOnes = todoLines.filter(l => startsWithAny(l.product_name, PROD_PREFIXES))
      const accOnes = todoLines.filter(l => startsWithAny(l.product_name, ACCESSOIRES_PREFIXES))

      setProdLines(prodOnes)
      setAccLines(accOnes)
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
  // Actions de click "Fait / Recu"
  // ============================================================
  async function handleVitrineDone(item) {
    try {
      await confirmReception(item.id, item.qty_announced, user.id)
      // refresh viendra via realtime, mais on retire visuellement tout de suite
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

  // ============================================================
  // Compteurs pour la barre de progression
  // ============================================================
  const total = vitrineItems.length + prodLines.length + accLines.length
  const allDone = total === 0

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[24px] font-semibold text-ink tracking-tight">📋 À ranger aujourd'hui</h1>
          <p className="text-[13px] text-ink-mute mt-1">Clique sur une carte pour la confirmer comme rangée</p>
        </div>

        {/* Barre de progression / statut global */}
        <div className="mb-6 bg-white rounded-xl border border-line p-4">
          {loading ? (
            <p className="text-[13px] text-ink-mute">Chargement...</p>
          ) : allDone ? (
            <div className="text-center py-3">
              <div className="text-[40px] mb-2">🎉</div>
              <p className="text-[15px] font-semibold text-emerald-600">Tout est rangé !</p>
              <p className="text-[12px] text-ink-mute mt-1">Rien n'attend de t'être rangé pour l'instant.</p>
            </div>
          ) : (
            <p className="text-[14px] font-medium text-bordeaux">
              {total} article{total > 1 ? 's' : ''} à ranger
            </p>
          )}
        </div>

        {/* SECTION VITRINE */}
        {vitrineItems.length > 0 && (
          <Section title="VITRINE" count={vitrineItems.length} subtitle="envoyés par la vitrine">
            {vitrineItems.map(item => (
              <ItemCard
                key={`vit-${item.id}`}
                title={item.product_name}
                subtitle="de la vitrine"
                quantity={item.qty_announced}
                onClick={() => handleVitrineDone(item)}
              />
            ))}
          </Section>
        )}

        {/* SECTION PROD */}
        {prodLines.length > 0 && (
          <Section title="PROD" count={prodLines.length} subtitle="préparés par la production">
            {prodLines.map(line => (
              <ItemCard
                key={`prod-${line.odoo_line_id}`}
                title={line.product_name}
                subtitle={line.client_name ? `commande ${line.client_name}` : (line.order_num || '')}
                quantity={line.quantity}
                onClick={() => handleProdDone(line)}
              />
            ))}
          </Section>
        )}

        {/* SECTION ACCESSOIRES */}
        {accLines.length > 0 && (
          <Section title="ACCESSOIRES" count={accLines.length} subtitle="GM et GMD">
            {accLines.map(line => (
              <ItemCard
                key={`acc-${line.odoo_line_id}`}
                title={line.product_name}
                subtitle={line.client_name ? `commande ${line.client_name}` : (line.order_num || '')}
                quantity={line.quantity}
                onClick={() => handleProdDone(line)}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  )
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

function ItemCard({ title, subtitle, quantity, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white border border-bordeaux/30 hover:border-bordeaux hover:bg-bordeaux hover:text-cream rounded-xl px-4 py-3 text-left transition-all flex items-center justify-between gap-3 group"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium truncate">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-ink-mute group-hover:text-cream/80 mt-0.5 truncate">
            {subtitle}
          </div>
        )}
      </div>
      {quantity !== undefined && quantity !== null && (
        <span className="flex-shrink-0 px-2.5 py-1 bg-bordeaux text-cream group-hover:bg-cream group-hover:text-bordeaux rounded-full text-[12px] font-bold transition-colors">
          × {quantity}
        </span>
      )}
    </button>
  )
}
