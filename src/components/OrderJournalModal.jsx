import { useState, useEffect, useMemo } from 'react'
import { loadDevisTraitementsJournal } from '../lib/conversations'

// Fenêtre admin « 📜 Journal des commandes » : qui a fait quoi sur quelle commande, quand.
// Source = table devis_traitements (actions faites dans l'app, avec le nom de la personne).
const ACTIONS = {
  created:     { emoji: '🆕', label: 'Créé',     cls: 'bg-emerald-100 text-emerald-800' },
  confirme:    { emoji: '✅', label: 'Confirmé',  cls: 'bg-emerald-100 text-emerald-800' },
  modification:{ emoji: '✏️', label: 'Modifié',   cls: 'bg-amber-100 text-amber-800' },
  relance:     { emoji: '🔔', label: 'Relancé',   cls: 'bg-blue-100 text-blue-800' },
  annulation:  { emoji: '❌', label: 'Annulé',    cls: 'bg-red-100 text-red-700' },
}
const FILTERS = [['all', 'Tout'], ['created', '🆕 Créé'], ['confirme', '✅ Confirmé'], ['modification', '✏️ Modifié'], ['relance', '🔔 Relancé'], ['annulation', '❌ Annulé']]

function fmt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function OrderJournalModal({ onClose }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  // Recherche côté base (par n° de commande / nom) → retrouve même les commandes anciennes.
  // Débounce léger pour ne pas requêter à chaque frappe.
  useEffect(() => {
    let cancel = false
    const t = setTimeout(() => {
      loadDevisTraitementsJournal({ limit: 400, search: query })
        .then(d => { if (!cancel) { setRows(d); setError('') } })
        .catch(e => { if (!cancel) { setError(e?.message || 'Chargement impossible'); setRows([]) } })
    }, query.trim() ? 300 : 0)
    return () => { cancel = true; clearTimeout(t) }
  }, [query])

  const shown = useMemo(() => {
    if (filter === 'all') return rows || []
    return (rows || []).filter(r => r.action === filter)
  }, [rows, filter])

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-fraunces italic text-[20px] text-ink m-0">📜 Journal des commandes</h3>
          <button onClick={onClose} className="text-ink-mute hover:text-bordeaux text-[18px]">✕</button>
        </div>

        <input
          type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="🔍 n° commande (Sxxxx) ou nom…"
          className="w-full px-3 py-2 mb-2 text-[13px] border border-line rounded-lg bg-cream-warm focus:outline-none focus:border-bordeaux"
        />
        <div className="flex flex-wrap gap-1.5 mb-3">
          {FILTERS.map(([k, lab]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${filter === k ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft hover:border-bordeaux'}`}>
              {lab}
            </button>
          ))}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5 text-[12px] mb-2">{error}</div>}

        {rows === null ? (
          <div className="text-center text-ink-mute py-8 text-[13px]">Chargement…</div>
        ) : shown.length === 0 ? (
          <div className="text-center text-ink-mute py-8 text-[13px]">Aucune action trouvée.</div>
        ) : (
          <div className="space-y-1.5">
            {shown.map(r => {
              const a = ACTIONS[r.action] || { emoji: '•', label: r.action, cls: 'bg-cream-warm text-ink-soft' }
              return (
                <div key={r.id} className="bg-white border border-line rounded-lg px-3 py-2 flex items-start gap-2.5">
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${a.cls}`}>{a.emoji} {a.label}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-[13px] font-bold text-bordeaux">{r.order_num || '?'}</span>
                      <span className="text-[12px] text-ink-soft">par <b className="text-ink">{r.user_name || '?'}</b></span>
                    </div>
                    {r.detail && <div className="text-[12px] text-ink-mute mt-0.5 break-words">{r.detail}</div>}
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-ink-mute whitespace-nowrap">{fmt(r.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}

        <div className="text-[10px] text-ink-mute mt-3 italic">
          {rows !== null && `${shown.length} action(s) affichée(s)`} · actions faites dans l'app uniquement.
        </div>
      </div>
    </div>
  )
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal = { background: '#FBF7F1', borderRadius: 14, padding: 18, maxWidth: 560, width: '100%', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }
