import { useState, useEffect } from 'react'
import { CheckCircle2, Pencil, Clock, Plus } from 'lucide-react'
import Skeleton from './Skeleton'
import { loadModificationsATraiter, markModificationFaite, loadModificationsFaites, createModification } from '../lib/modifications'
import { getJustificatifUrl } from '../lib/conges'

const fmtDT = ts => ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

export default function ModificationsView({ user }) {
  const [tab, setTab] = useState('a_traiter')   // 'a_traiter' | 'historique'
  const [list, setList] = useState([])
  const [faites, setFaites] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [notes, setNotes] = useState({})
  const [busy, setBusy] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [nf, setNf] = useState({ order_ref: '', client_name: '', description: '' })
  const [creating, setCreating] = useState(false)

  async function submitNew() {
    if (!nf.description.trim()) { setErr('Décris la modification à faire.'); return }
    setCreating(true); setErr('')
    try {
      await createModification({
        order_ref: nf.order_ref.trim() || null,
        client_name: nf.client_name.trim() || null,
        requested_by: user?.id || null,
        description: nf.description.trim(),
      })
      setNf({ order_ref: '', client_name: '', description: '' })
      setShowNew(false); setTab('a_traiter')
      await reload()
    } catch (e) { setErr(e.message) }
    finally { setCreating(false) }
  }

  async function reload() {
    setErr('')
    try {
      const [aTraiter, hist] = await Promise.all([loadModificationsATraiter(), loadModificationsFaites()])
      setList(aTraiter); setFaites(hist)
    } catch (e) { setErr(e.message) }
  }
  useEffect(() => {
    let cancelled = false
    reload().finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleFait(m) {
    setBusy(m.id); setErr('')
    try { await markModificationFaite(m.id, notes[m.id] || null, user?.id); await reload() }
    catch (e) { setErr(e.message) }
    finally { setBusy('') }
  }

  const tabBtn = (active) => `px-4 py-2 text-[13px] font-medium rounded-full transition-all ${active ? 'bg-bordeaux text-white' : 'bg-white border border-line text-ink hover:border-bordeaux'}`

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="font-fraunces italic text-[26px] text-ink mb-1 flex items-center gap-2">
        <Pencil size={22} /> Modifications
      </h1>
      <p className="text-[12px] text-ink-soft mb-4">Demandes envoyées par les commerciaux. Fais la modif, pas besoin de noter ce que tu as fait, puis « Fait ».</p>

      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setTab('a_traiter')} className={tabBtn(tab === 'a_traiter')}>
          À traiter {list.length > 0 && <span className="ml-1 bg-white/30 rounded-full px-1.5">{list.length}</span>}
        </button>
        <button onClick={() => setTab('historique')} className={tabBtn(tab === 'historique')}>
          <Clock size={13} className="inline -mt-0.5 mr-1" /> Historique
        </button>
        <button onClick={() => setShowNew(v => !v)} className="ml-auto px-4 py-2 text-[13px] font-medium rounded-full bg-bordeaux text-white inline-flex items-center gap-1.5 hover:bg-bordeaux-deep">
          <Plus size={15} /> Nouvelle modification
        </button>
      </div>

      {showNew && (
        <div className="bg-white border border-line rounded-xl p-4 mb-5">
          <div className="font-semibold text-[14px] mb-3">Nouvelle modification</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input value={nf.order_ref} onChange={e => setNf(f => ({ ...f, order_ref: e.target.value }))}
              placeholder="N° commande (ex. S1234)" className="px-3 py-2 text-[13px] border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux" />
            <input value={nf.client_name} onChange={e => setNf(f => ({ ...f, client_name: e.target.value }))}
              placeholder="Client (optionnel)" className="px-3 py-2 text-[13px] border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux" />
          </div>
          <textarea value={nf.description} onChange={e => setNf(f => ({ ...f, description: e.target.value }))}
            placeholder="Ce qu'il faut modifier…" rows={3}
            className="w-full px-3 py-2 text-[13px] border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux mb-2" />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-3 py-2 text-[12px] rounded-lg border border-line text-ink-soft">Annuler</button>
            <button onClick={submitNew} disabled={creating}
              className="px-4 py-2 text-[12px] font-medium rounded-lg bg-bordeaux text-white disabled:opacity-50">
              {creating ? '…' : 'Créer + prévenir par WhatsApp'}
            </button>
          </div>
          <div className="text-[11px] text-ink-mute mt-2">Les personnes « 🔧 Notif modifications » recevront un WhatsApp.</div>
        </div>
      )}

      {err && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded-lg mb-3 text-[13px]">{err}</div>}

      {loading ? (
        <Skeleton rows={5} />
      ) : tab === 'a_traiter' ? (
        list.length === 0 ? (
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
                  <button onClick={() => handleFait(m)} disabled={busy === m.id}
                    className="px-4 py-2 text-[12px] font-medium tracking-wider uppercase bg-green-700 text-white rounded-lg hover:bg-green-800 transition-all disabled:opacity-50 inline-flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> {busy === m.id ? '…' : 'Fait'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        // Historique des modifications traitées (lecture seule)
        faites.length === 0 ? (
          <div className="text-center text-ink-mute py-10 text-[13px]">Aucune modification traitée pour l'instant.</div>
        ) : (
          <div className="space-y-3">
            {faites.map(m => (
              <div key={m.id} className="bg-white border border-line rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <div>
                    <span className="text-[15px] font-bold text-bordeaux">{m.order_ref || '—'}</span>
                    <span className="text-[13px] text-ink ml-2">{m.client_name || m.client_phone || ''}</span>
                  </div>
                  <span className="text-[11px] text-green-700 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Fait le {fmtDT(m.done_at)}</span>
                </div>
                {m.description && (
                  <div className="text-[12px] text-ink-soft mb-1"><span className="uppercase text-[10px] tracking-wider text-ink-mute">Demandé : </span>{m.description}</div>
                )}
                {m.note && (
                  <div className="text-[12px] text-ink bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 whitespace-pre-wrap"><span className="uppercase text-[10px] tracking-wider text-green-700 block">Ce qui a été fait</span>{m.note}</div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
