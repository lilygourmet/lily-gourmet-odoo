import { useState, useEffect } from 'react'
import { closeConversation } from '../../lib/conversations'

// Durée écoulée, format court.
function elapsed(ts) {
  if (!ts) return ''
  const min = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return d === 1 ? '1 jour' : `${d} jours`
}

// Écran BLOQUANT « Nettoyage du jour » : la liste des conversations ouvertes assignées au user.
// Pour chacune : Fermer ou Garder. Quand la liste est vide -> onExit('done').
// « Tout garder (urgence) » (une fois/jour) -> onExit('skip') : laisse entrer mais ne marque pas fait.
export default function ConversationCleanup({ user, items, escapeAllowed, onExit }) {
  const [list, setList] = useState(items)
  const [busy, setBusy] = useState(null)

  useEffect(() => { if (list.length === 0) onExit('done') }, [list.length])

  const remove = (id) => setList(prev => prev.filter(c => c.id !== id))

  async function fermer(c) {
    setBusy(c.id)
    try { await closeConversation(c.id, user.id) } catch { /* on retire quand même de la liste */ }
    setBusy(null)
    remove(c.id)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm">
      <div className="bg-cream rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-bordeaux text-cream px-5 py-4 flex-shrink-0">
          <h2 className="font-fraunces italic text-[22px] font-semibold">🧹 Nettoyage du jour</h2>
          <p className="text-[13px] opacity-90 mt-0.5">Avant d'utiliser les conversations, fais le point sur les tiennes.</p>
          <span className="inline-flex items-center gap-1.5 mt-2.5 bg-cream/15 border border-cream/30 px-3 py-1 rounded-full text-[13px] font-semibold">Reste {list.length} à traiter</span>
        </div>

        <div className="overflow-y-auto p-3 flex-1 space-y-2">
          {list.map(c => {
            const weSpokeLast = c.last_message_at && (!c.last_inbound_at || new Date(c.last_message_at) > new Date(c.last_inbound_at))
            return (
              <div key={c.id} className="bg-white border border-line rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold text-ink truncate">{c.client_name || c.client_phone}</div>
                  <div className="text-[12.5px] text-ink-mute truncate mt-0.5">{c.last_message_body || '—'}</div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-cream-warm text-[#7a6a55]">{elapsed(c.last_message_at)}</span>
                    {weSpokeLast
                      ? <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Vous avez répondu</span>
                      : <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">⏳ En attente de VOUS</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <button disabled={busy === c.id} onClick={() => fermer(c)} className="text-[12px] font-semibold px-3.5 py-1.5 rounded-full bg-bordeaux text-cream hover:bg-bordeaux-deep transition-all disabled:opacity-50">{busy === c.id ? '…' : 'Fermer'}</button>
                  <button disabled={busy === c.id} onClick={() => remove(c.id)} className="text-[12px] font-semibold px-3.5 py-1.5 rounded-full bg-white text-ink border border-line hover:bg-cream-warm transition-all disabled:opacity-50">Garder</button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t border-line px-4 py-3 text-center flex-shrink-0">
          {escapeAllowed ? (
            <button onClick={() => onExit('skip')} className="text-[12.5px] text-ink-mute underline hover:text-ink">Tout garder (urgence)</button>
          ) : (
            <span className="text-[11.5px] text-amber-600">Échappatoire déjà utilisée aujourd'hui — termine le nettoyage.</span>
          )}
        </div>
      </div>
    </div>
  )
}
