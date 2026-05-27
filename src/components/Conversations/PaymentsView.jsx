import { useState, useEffect } from 'react'
import { loadPaymentsToValidate, validatePayment, rejectPayment, getMediaSignedUrl } from '../../lib/conversations'
import { canValidatePayments } from '../../lib/auth'

function fmtDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtAmount(n) {
  if (n == null) return ''
  return `${Number(n).toLocaleString('fr-FR')} DH`
}

// Liste interne des preuves de paiement transférées depuis Conversations.
export default function PaymentsView({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [urls, setUrls] = useState({}) // messageId -> URL affichable
  const [busyId, setBusyId] = useState(null)
  const [tab, setTab] = useState('todo') // 'todo' = à valider | 'done' = déjà validés
  const [q, setQ] = useState('')

  const canValidate = canValidatePayments(user)

  async function refresh() {
    setLoading(true); setError('')
    try {
      const data = await loadPaymentsToValidate()
      setItems(data)
      // Prépare les URL affichables (lien direct si http, sinon URL signée)
      const map = {}
      await Promise.all(data.map(async m => {
        if (!m.media_url) return
        map[m.id] = m.media_url.startsWith('http') ? m.media_url : await getMediaSignedUrl(m.media_url).catch(() => null)
      }))
      setUrls(map)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  async function handleValidate(m) {
    setBusyId(m.id)
    try {
      const updated = await validatePayment(m.id, user.id)
      setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setBusyId(null) }
  }

  async function handleReject(m) {
    const reason = prompt('Motif du refus ? (ex. illisible, montant ne correspond pas, doublon)')
    if (reason === null) return // annulé
    setBusyId(m.id)
    try {
      const updated = await rejectPayment(m.id, user.id, reason)
      setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
    } catch (e) { alert('Erreur : ' + e.message) }
    finally { setBusyId(null) }
  }

  // pending = ni validé ni refusé ; traité = validé OU refusé
  const isPending = m => !m.payment_validated_at && !m.payment_rejected_at
  const term = q.trim().toLowerCase()
  const visible = items.filter(m => {
    if (tab === 'todo' && !isPending(m)) return false
    if (tab === 'done' && isPending(m)) return false
    if (!term) return true
    const haystack = [
      m.payment_order_ref,
      m.payment_client_name,
      m.conversation?.client_name,
      m.conversation?.client_phone,
    ].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(term)
  })
  const nbTodo = items.filter(isPending).length
  const nbDone = items.length - nbTodo
  const sumTodo = items.filter(isPending).reduce((s, m) => s + (Number(m.payment_amount) || 0), 0)
  const sumValid = items.filter(m => m.payment_validated_at).reduce((s, m) => s + (Number(m.payment_amount) || 0), 0)

  function Card({ m }) {
    const href = urls[m.id]
    const mt = m.media_type || ''
    const isImage = /image/i.test(mt) || (m.media_url && /\.(jpe?g|png|gif|webp)$/i.test(m.media_url))
    const validated = !!m.payment_validated_at
    const rejected = !!m.payment_rejected_at
    const pending = !validated && !rejected
    return (
      <div className={`rounded-xl border p-3 flex gap-3 ${pending ? 'bg-cream-warm border-line' : 'bg-cream-warm/50 border-line opacity-80'}`}>
        {href ? (
          isImage ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="flex-shrink-0" title="Ouvrir en grand">
              <img src={href} alt="" className="w-20 h-20 object-cover rounded-lg border border-line" />
            </a>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 w-20 h-20 rounded-lg border border-line bg-cream flex items-center justify-center text-[11px] text-ink-soft text-center px-1" title="Ouvrir le document">📎 PDF</a>
          )
        ) : (
          <div className="flex-shrink-0 w-20 h-20 rounded-lg border border-line bg-cream flex items-center justify-center text-[11px] text-ink-mute">…</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-ink truncate">{m.payment_client_name || m.conversation?.client_name || 'Client'}</div>
          <div className="text-[12px] text-ink-soft">{m.conversation?.client_phone || ''}</div>
          {m.payment_order_ref && <div className="text-[12px] text-ink mt-0.5">Commande : <span className="font-medium">{m.payment_order_ref}</span></div>}
          {m.payment_amount != null && <div className="text-[13px] text-ink font-semibold mt-0.5">{fmtAmount(m.payment_amount)}</div>}
          <div className="text-[10px] text-ink-mute mt-0.5">Reçu le {fmtDate(m.sent_at)}</div>
          {validated && (
            <div className="text-[11px] text-emerald-700 mt-1.5">✅ Validé{m.validator?.full_name ? ` par ${m.validator.full_name}` : ''} · {fmtDate(m.payment_validated_at)}</div>
          )}
          {rejected && (
            <div className="text-[11px] text-bordeaux mt-1.5">❌ Refusé{m.rejector?.full_name ? ` par ${m.rejector.full_name}` : ''}{m.payment_rejection_reason ? ` — ${m.payment_rejection_reason}` : ''}</div>
          )}
          {pending && (
            canValidate ? (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => handleValidate(m)}
                  disabled={busyId === m.id}
                  className="px-4 py-1.5 text-[12px] font-medium bg-bordeaux text-cream rounded-full hover:bg-bordeaux-deep disabled:opacity-50"
                >{busyId === m.id ? '…' : '✅ Valider'}</button>
                <button
                  onClick={() => handleReject(m)}
                  disabled={busyId === m.id}
                  className="px-4 py-1.5 text-[12px] font-medium border border-bordeaux text-bordeaux rounded-full hover:bg-bordeaux hover:text-cream disabled:opacity-50"
                >❌ Refuser</button>
              </div>
            ) : (
              <div className="text-[11px] text-amber-700 mt-1.5">⏳ À valider</div>
            )
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="font-fraunces italic text-[26px] text-ink mb-1">💰 Paiements à valider</h1>
      <p className="text-[12px] text-ink-mute mb-4">Preuves de virement transférées depuis les conversations.</p>

      {/* Totaux */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="flex-1 min-w-[140px] rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-amber-700">À valider</div>
          <div className="text-[16px] font-semibold text-ink">{fmtAmount(sumTodo) || '0 DH'}</div>
        </div>
        <div className="flex-1 min-w-[140px] rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700">Validé</div>
          <div className="text-[16px] font-semibold text-ink">{fmtAmount(sumValid) || '0 DH'}</div>
        </div>
      </div>

      {/* Onglets À valider / Traités */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setTab('todo')}
          className={`px-4 py-1.5 text-[12px] font-medium rounded-full transition-all ${tab === 'todo' ? 'bg-bordeaux text-cream' : 'border border-line text-ink-soft hover:bg-cream-warm'}`}
        >À valider ({nbTodo})</button>
        <button
          onClick={() => setTab('done')}
          className={`px-4 py-1.5 text-[12px] font-medium rounded-full transition-all ${tab === 'done' ? 'bg-bordeaux text-cream' : 'border border-line text-ink-soft hover:bg-cream-warm'}`}
        >Traités ({nbDone})</button>
      </div>

      {/* Recherche par n° de commande ou nom du client */}
      <input
        type="text"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Chercher un n° (S-…) ou un nom de client…"
        className="w-full px-4 py-2 text-[13px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux mb-4"
      />

      {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
      {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded mb-4">{error}</div>}

      {!loading && !error && visible.length === 0 && (
        <div className="text-center py-12 text-ink-mute italic">
          {term ? 'Aucun résultat pour cette recherche.' : tab === 'todo' ? 'Aucune preuve à valider.' : 'Aucune preuve traitée.'}
        </div>
      )}

      <div className="space-y-2">
        {visible.map(m => <Card key={m.id} m={m} />)}
      </div>
    </div>
  )
}
