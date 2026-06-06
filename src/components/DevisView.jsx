import { useState, useEffect } from 'react'
import { loadDevis } from '../lib/conversations'
import NewConversationModal from './Conversations/NewConversationModal'
import { toast } from '../lib/toast'

// Liste des devis non confirmés (Odoo) + relance client par WhatsApp.
export default function DevisView({ user }) {
  const [query, setQuery] = useState('')
  const [devis, setDevis] = useState([])
  const [loading, setLoading] = useState(true)
  const [waTarget, setWaTarget] = useState(null)   // { phone, name }

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

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none">📄 Devis à relancer</h1>
        <span className="font-mono text-[11px] tracking-wider uppercase text-ink-mute">{devis.length} devis</span>
      </div>

      <input
        value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Rechercher : nom client, n° devis (S…) ou téléphone…"
        className="w-full px-3 py-2 text-[13px] border border-line rounded-lg bg-white focus:outline-none focus:border-bordeaux mb-4"
      />

      {loading ? (
        <div className="text-center text-ink-mute py-10 text-[13px]">Chargement…</div>
      ) : devis.length === 0 ? (
        <div className="text-center text-ink-mute py-10 text-[13px]">Aucun devis non confirmé.</div>
      ) : (
        <div className="space-y-2">
          {devis.map(d => {
            const isSent = d.state === 'sent'
            const phone = d.clientPhone || ''
            return (
              <div key={d.id} className="bg-white border border-line rounded-xl p-3">
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
                  {phone && <span className="font-mono">{phone}</span>}
                </div>
                {Array.isArray(d.productLines) && d.productLines.length > 0 && (
                  <div className="text-[11px] text-ink mt-1 border-t border-line/60 pt-1">
                    {d.productLines.slice(0, 5).map((l, i) => <div key={i} className="truncate">• {l}</div>)}
                  </div>
                )}
                <div className="mt-2 flex justify-end">
                  {phone ? (
                    <button
                      onClick={() => setWaTarget({ phone, name: d.clientName || '' })}
                      className="px-3 py-1.5 bg-bordeaux text-cream rounded-full text-[12px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all">
                      💬 Contacter sur WhatsApp
                    </button>
                  ) : (
                    <span className="text-[11px] text-ink-mute italic">Pas de téléphone</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {waTarget && (
        <NewConversationModal
          user={user}
          initialPhone={waTarget.phone}
          initialName={waTarget.name}
          onClose={() => setWaTarget(null)}
          onSent={() => setWaTarget(null)}
        />
      )}
    </div>
  )
}
