import { useState, useEffect } from 'react'
import { loadDevis, loadDevisPhotos } from '../lib/conversations'
import NewConversationModal from './Conversations/NewConversationModal'
import { toast } from '../lib/toast'

// Jour lisible à partir d'une date Odoo "2026-06-06 12:00:00"
function dayKey(dateOrder) {
  return (dateOrder || '').slice(0, 10) || 'sans-date'
}
function dayLabel(key) {
  if (key === 'sans-date') return 'Sans date de livraison'
  const d = new Date(key + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86400000)
  const txt = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  if (diff === 0) return `Aujourd'hui · ${txt}`
  if (diff === -1) return `Hier · ${txt}`
  return txt
}

export default function DevisView({ user }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')   // all | sent | draft
  const [devis, setDevis] = useState([])
  const [loading, setLoading] = useState(true)
  const [waTarget, setWaTarget] = useState(null)
  const [detail, setDetail] = useState(null)

  async function run(q) {
    setLoading(true)
    try { setDevis(await loadDevis(q)) }
    catch (e) { toast.error(e?.message || 'Erreur de chargement'); setDevis([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { run('') }, [])
  useEffect(() => {
    const t = setTimeout(() => run(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  const shown = devis
    .filter(d => !/vitrin/i.test(d.clientName || ''))
    .filter(d => filter === 'all' ? true : d.state === filter)

  // Regrouper par date de LIVRAISON (chronologique). "Sans date" à la fin.
  const groups = {}
  for (const d of shown) { const k = dayKey(d.deliveryAt); (groups[k] ||= []).push(d) }
  const dayKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'sans-date') return 1
    if (b === 'sans-date') return -1
    return a < b ? -1 : 1
  })

  const FILTERS = [['all', 'Tous'], ['sent', 'Devis envoyé'], ['draft', 'Brouillon']]

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none">📄 Devis à relancer</h1>
        <span className="font-mono text-[11px] tracking-wider uppercase text-ink-mute">{shown.length} devis</span>
      </div>

      <input
        value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher : nom client, n° devis (S…) ou téléphone…"
        className="w-full px-3 py-2 text-[13px] border border-line rounded-lg bg-white focus:outline-none focus:border-bordeaux mb-3"
      />

      <div className="flex gap-2 mb-4">
        {FILTERS.map(([k, lab]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all ${filter === k ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft hover:border-bordeaux'}`}>
            {lab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-ink-mute py-10 text-[13px]">Chargement…</div>
      ) : shown.length === 0 ? (
        <div className="text-center text-ink-mute py-10 text-[13px]">Aucun devis.</div>
      ) : (
        <div className="space-y-5">
          {dayKeys.map(k => (
            <div key={k}>
              <div className="font-mono text-[11px] uppercase tracking-wider text-bordeaux font-semibold mb-1.5 capitalize">{dayLabel(k)} <span className="text-ink-mute">· {groups[k].length}</span></div>
              <div className="space-y-2">
                {groups[k].map(d => {
                  const isSent = d.state === 'sent'
                  return (
                    <button key={d.id} onClick={() => setDetail(d)}
                      className="w-full text-left bg-white border border-line rounded-xl p-3 hover:border-bordeaux transition-all">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[13px] font-semibold text-bordeaux">{d.name}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isSent ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                          {isSent ? 'Devis envoyé' : 'Brouillon'}
                        </span>
                      </div>
                      <div className="text-[13px] text-ink font-medium mt-0.5 truncate">{d.clientName || '—'}</div>
                      <div className="text-[11px] text-ink-soft mt-0.5 flex flex-wrap gap-x-3">
                        {d.pickupText && <span>🗓️ {d.pickupText}</span>}
                        {d.amountText && <span>💰 {d.amountText}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <DevisDetail devis={detail} onClose={() => setDetail(null)} onWhatsapp={() => { setWaTarget(detail); setDetail(null) }} />
      )}

      {waTarget && (
        <NewConversationModal
          user={user}
          initialOrder={waTarget}
          initialPhone={waTarget.clientPhone}
          initialName={waTarget.clientName || ''}
          onClose={() => setWaTarget(null)}
          onSent={() => setWaTarget(null)}
        />
      )}
    </div>
  )
}

// Détail d'un devis : produits complets, horaire, montant, photos (si présentes), contact.
function DevisDetail({ devis: d, onClose, onWhatsapp }) {
  const [photos, setPhotos] = useState([])
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  useEffect(() => {
    loadDevisPhotos(d.id).then(setPhotos).catch(() => setPhotos([])).finally(() => setLoadingPhotos(false))
  }, [d.id])
  const isSent = d.state === 'sent'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <div className="font-mono text-[13px] font-semibold text-bordeaux">{d.name}</div>
            <div className="font-fraunces italic text-[20px] text-ink leading-tight">{d.clientName || '—'}</div>
          </div>
          <button onClick={onClose} className="text-ink-mute hover:text-bordeaux text-[18px]">✕</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-soft mb-3">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isSent ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{isSent ? 'Devis envoyé' : 'Brouillon'}</span>
          {d.pickupText && <span>🗓️ {d.pickupText}</span>}
          {d.amountText && <span>💰 {d.amountText}</span>}
          {d.clientPhone && <span className="font-mono">{d.clientPhone}</span>}
        </div>

        {Array.isArray(d.productLines) && d.productLines.length > 0 && (
          <div className="bg-white border border-line rounded-xl p-3 mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-1.5">Détail</div>
            <div className="space-y-1.5">
              {d.productLines.map((l, i) => <div key={i} className="text-[12px] text-ink whitespace-pre-wrap leading-snug">• {l}</div>)}
            </div>
          </div>
        )}

        {loadingPhotos ? (
          <div className="text-[11px] text-ink-mute mb-3">Recherche de photos…</div>
        ) : photos.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-1.5">Photos</div>
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <a key={i} href={p.dataUrl} target="_blank" rel="noopener noreferrer">
                  <img src={p.dataUrl} alt={p.name} className="w-full h-24 object-cover rounded-lg border border-line" />
                </a>
              ))}
            </div>
          </div>
        )}

        {d.clientPhone ? (
          <button onClick={onWhatsapp}
            className="w-full px-4 py-2.5 bg-bordeaux text-cream rounded-full text-[13px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all">
            💬 Contacter sur WhatsApp
          </button>
        ) : (
          <div className="text-center text-[12px] text-ink-mute italic">Pas de téléphone pour ce client</div>
        )}
      </div>
    </div>
  )
}
