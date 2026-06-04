import { useState, useEffect } from 'react'
import { CheckCircle2, Pencil } from 'lucide-react'
import { loadModificationsATraiter, markModificationFaite } from '../lib/modifications'
import { getJustificatifUrl } from '../lib/conges'

const fmtDT = ts => ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

export default function ModificationsView({ user }) {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState('')

  async function reload() {
    setErr('')
    try { setList(await loadModificationsATraiter()) }
    catch (e) { setErr(e.message) }
  }
  useEffect(() => {
    let cancelled = false
    loadModificationsATraiter()
      .then(d => { if (!cancelled) setList(d) })
      .catch(e => { if (!cancelled) setErr(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleFait(m) {
    setBusy(m.id); setErr('')
    try { await markModificationFaite(m.id, notes[m.id] || null, user.id); await reload() }
    catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="font-fraunces italic text-[26px] text-ink mb-1 flex items-center gap-2">
        <Pencil size={22} /> Modifications à traiter
      </h1>
      <p className="text-[12px] text-ink-soft mb-5">Demandes envoyées par les commerciaux. Fais la modif, note ce que tu as fait, puis « Fait ».</p>

      {err && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded-lg mb-3 text-[13px]">{err}</div>}

      {loading ? (
        <div className="text-center text-ink-mute py-10 text-[13px]">Chargement…</div>
      ) : list.length === 0 ? (
        <div className="text-center text-green-700 bg-green-50 rounded-xl py-10 text-[14px] flex items-center justify-center gap-2">
          <CheckCircle2 size={18} /> Aucune modification en attente 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(m => (
            <div key={m.id} className="bg-cream-warm border border-line rounded-xl p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                <div>
                  <span className="text-[17px] font-bold text-bordeaux">{m.order_ref || '—'}</span>
                  <span className="text-[14px] text-ink ml-2">{m.client_name || m.client_phone || ''}</span>
                  {m.client_name && m.client_phone && <span className="text-[11px] text-ink-mute ml-2 font-mono">{m.client_phone}</span>}
                </div>
                <span className="text-[11px] text-ink-mute">Demandé le {fmtDT(m.requested_at)}</span>
              </div>
              {m.description && (
                <div className="text-[13px] text-ink bg-cream border border-line rounded-lg px-3 py-2 mb-2 whitespace-pre-wrap">
                  <span className="text-[10px] uppercase tracking-wider text-ink-mute block mb-0.5">À modifier</span>
                  {m.description}
                </div>
              )}
              {m.justificatif_path && (
                <button onClick={async () => { const u = await getJustificatifUrl(m.justificatif_path); if (u) window.open(u, '_blank') }}
                  className="text-[12px] text-bordeaux underline mb-2 inline-block">📎 Voir le justificatif</button>
              )}
              <textarea
                value={notes[m.id] || ''}
                onChange={e => setNotes(n => ({ ...n, [m.id]: e.target.value }))}
                placeholder="Ce que tu as modifié (optionnel)…"
                rows={2}
                className="w-full px-3 py-2 text-[13px] bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-2"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => handleFait(m)}
                  disabled={busy === m.id}
                  className="px-4 py-2 text-[12px] font-medium tracking-wider uppercase bg-green-700 text-white rounded-lg hover:bg-green-800 transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 size={14} /> {busy === m.id ? '…' : 'Fait'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
