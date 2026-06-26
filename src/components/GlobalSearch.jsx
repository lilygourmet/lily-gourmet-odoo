import { useState, useEffect, useRef, useMemo } from 'react'
import { searchOrders, loadConversations } from '../lib/conversations'

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') }

// Date du jour locale "YYYY-MM-DD" (pour ne garder que les livraisons à venir)
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Recherche universelle (Ctrl/Cmd + K) : commandes/devis (Odoo) + conversations, depuis n'importe quel onglet.
export default function GlobalSearch({ onClose, onOpenOrder, onOpenDevis, onOpenConv, onNavigate }) {
  const [query, setQuery] = useState('')
  const [orders, setOrders] = useState([])      // résultats Odoo (devis + confirmées)
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [convs, setConvs] = useState([])
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)
  const reqId = useRef(0)                        // évite les réponses Odoo en retard

  useEffect(() => {
    inputRef.current?.focus()
    loadConversations('all').then(d => setConvs(d || [])).catch(() => {})
  }, [])

  const q = norm(query.trim())

  // Recherche Odoo (commandes + devis), debouncée. Ne garde que les livraisons à venir + non annulées.
  useEffect(() => {
    if (q.length < 2) { setOrders([]); setLoadingOrders(false); return }
    setLoadingOrders(true)
    const myId = ++reqId.current
    const t = setTimeout(() => {
      searchOrders(query.trim())
        .then(list => {
          if (myId !== reqId.current) return    // une frappe plus récente a pris le relais
          const today = todayStr()
          const kept = (list || []).filter(o => {
            if (o.state === 'cancel') return false
            const day = (o.deliveryAt || '').slice(0, 10)
            return !day || day >= today          // futures (ou sans date de livraison)
          })
          setOrders(kept)
          setLoadingOrders(false)
        })
        .catch(() => { if (myId === reqId.current) { setOrders([]); setLoadingOrders(false) } })
    }, 300)
    return () => clearTimeout(t)
  }, [q, query])

  const results = useMemo(() => {
    if (q.length < 2) return []
    const ord = (orders || [])
      .slice(0, 8)
      .map(o => {
        const isDevis = o.state === 'draft' || o.state === 'sent'
        const lines = (o.productLines || []).map(l => l.text).filter(Boolean).slice(0, 2).join(' · ')
        return {
          key: 'o_' + o.name, kind: 'order', orderNum: o.name, isDevis,
          title: `${o.clientName || '—'} — ${o.name}`,
          sub: [o.pickupText, lines].filter(Boolean).join(' · ') || (isDevis ? 'devis' : 'commande'),
        }
      })
    const cv = (convs || [])
      .filter(c => norm(c.client_name).includes(q) || norm(c.client_phone).includes(q))
      .slice(0, 4)
      .map(c => ({ key: 'c_' + c.id, kind: 'conv', convId: c.id, title: c.client_name || c.client_phone || 'Conversation', sub: c.client_phone || 'WhatsApp' }))
    return [...ord, ...cv]
  }, [q, orders, convs])

  useEffect(() => { setSel(0) }, [q, orders])

  function activate(r) {
    if (!r) return
    if (r.kind === 'order') { if (r.isDevis && onOpenDevis) onOpenDevis(r.orderNum); else onOpenOrder(r.orderNum) }
    else if (r.kind === 'conv') { if (onOpenConv) onOpenConv(r.convId); else onNavigate('conversations') }
  }

  function onKey(e) {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); activate(results[sel]) }
  }

  const orderRes = results.filter(r => r.kind === 'order')
  const convRes = results.filter(r => r.kind === 'conv')

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[12vh] px-4 bg-ink/40" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <span className="text-[18px]">🔍</span>
          <input
            ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onKey}
            placeholder="Rechercher une commande, un devis, un client, une conversation…"
            className="flex-1 bg-transparent outline-none text-[16px] text-ink"
          />
          <button onClick={onClose} className="text-[10px] border border-line rounded px-1.5 py-0.5 text-ink-mute">Échap</button>
        </div>

        <div className="max-h-[55vh] overflow-auto">
          {q.length < 2 ? (
            <div className="text-center text-ink-mute text-[13px] py-8">Tape au moins 2 lettres…</div>
          ) : (results.length === 0 && !loadingOrders) ? (
            <div className="text-center text-ink-mute text-[13px] py-8">Aucun résultat pour « {query} »</div>
          ) : (
            <>
              {(orderRes.length > 0 || loadingOrders) && <div className="text-[10px] uppercase tracking-wider text-ink-mute px-4 pt-3 pb-1">Commandes & devis {loadingOrders && '· …'}</div>}
              {orderRes.map((r) => {
                const i = results.indexOf(r)
                return (
                  <button key={r.key} onClick={() => activate(r)} onMouseEnter={() => setSel(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${sel === i ? 'bg-bordeaux/10' : ''}`}>
                    <span className="w-8 h-8 rounded-lg bg-bordeaux/10 flex items-center justify-center text-[15px] flex-shrink-0">{r.isDevis ? '📝' : '🎂'}</span>
                    <span className="flex-1 min-w-0"><span className="block text-[14px] font-medium text-ink truncate">{r.title}</span><span className="block text-[11.5px] text-ink-mute truncate">{r.sub}</span></span>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${r.isDevis ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{r.isDevis ? 'Devis' : 'Confirmée'}</span>
                  </button>
                )
              })}
              {convRes.length > 0 && <div className="text-[10px] uppercase tracking-wider text-ink-mute px-4 pt-3 pb-1">Conversations</div>}
              {convRes.map((r) => {
                const i = results.indexOf(r)
                return (
                  <button key={r.key} onClick={() => activate(r)} onMouseEnter={() => setSel(i)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${sel === i ? 'bg-bordeaux/10' : ''}`}>
                    <span className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-[15px] flex-shrink-0">💬</span>
                    <span className="flex-1 min-w-0"><span className="block text-[14px] font-medium text-ink truncate">{r.title}</span><span className="block text-[11.5px] text-ink-mute truncate">{r.sub}</span></span>
                    <span className="text-[10.5px] text-ink-mute flex-shrink-0">Conversations →</span>
                  </button>
                )
              })}
            </>
          )}
        </div>

        <div className="flex gap-4 px-4 py-2 border-t border-line text-[10.5px] text-ink-mute bg-cream-warm/50">
          <span><b>↑↓</b> naviguer</span><span><b>Entrée</b> ouvrir</span><span><b>Échap</b> fermer</span>
        </div>
      </div>
    </div>
  )
}
