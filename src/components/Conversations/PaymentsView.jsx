import { useState, useEffect } from 'react'
import { loadPaymentsToValidate, validatePayment, getMediaSignedUrl } from '../../lib/conversations'
import { canValidatePayments } from '../../lib/auth'

function fmtDate(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// Liste interne des preuves de paiement transférées depuis Conversations.
export default function PaymentsView({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [urls, setUrls] = useState({}) // messageId -> URL affichable
  const [busyId, setBusyId] = useState(null)

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

  const aValider = items.filter(m => !m.payment_validated_at)
  const valides = items.filter(m => m.payment_validated_at)

  function Card({ m }) {
    const href = urls[m.id]
    const mt = m.media_type || ''
    const isImage = /image/i.test(mt) || (m.media_url && /\.(jpe?g|png|gif|webp)$/i.test(m.media_url))
    const done = !!m.payment_validated_at
    return (
      <div className={`rounded-xl border p-3 flex gap-3 ${done ? 'bg-cream-warm/50 border-line opacity-75' : 'bg-cream-warm border-line'}`}>
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
          <div className="text-[14px] font-medium text-ink truncate">{m.conversation?.client_name || 'Client'}</div>
          <div className="text-[12px] text-ink-soft">{m.conversation?.client_phone || ''}</div>
          {m.payment_order_ref && <div className="text-[12px] text-ink mt-0.5">Commande : <span className="font-medium">{m.payment_order_ref}</span></div>}
          <div className="text-[10px] text-ink-mute mt-0.5">Reçu le {fmtDate(m.sent_at)}</div>
          {done ? (
            <div className="text-[11px] text-emerald-700 mt-1.5">✅ Validé{m.validator?.full_name ? ` par ${m.validator.full_name}` : ''} · {fmtDate(m.payment_validated_at)}</div>
          ) : canValidate ? (
            <button
              onClick={() => handleValidate(m)}
              disabled={busyId === m.id}
              className="mt-2 px-4 py-1.5 text-[12px] font-medium bg-bordeaux text-cream rounded-full hover:bg-bordeaux-deep disabled:opacity-50"
            >{busyId === m.id ? '…' : '✅ Valider'}</button>
          ) : (
            <div className="text-[11px] text-amber-700 mt-1.5">⏳ À valider</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="font-fraunces italic text-[22px] text-ink mb-1">💰 Paiements à valider</h1>
      <p className="text-[12px] text-ink-mute mb-4">Preuves de virement transférées depuis les conversations.</p>

      {loading && <div className="text-center py-8 text-ink-mute italic">Chargement…</div>}
      {error && <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded mb-4">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="text-center py-12 text-ink-mute italic">Aucune preuve de paiement pour l'instant.</div>
      )}

      {aValider.length > 0 && (
        <div className="space-y-2 mb-6">
          {aValider.map(m => <Card key={m.id} m={m} />)}
        </div>
      )}

      {valides.length > 0 && (
        <>
          <div className="text-[11px] font-medium text-ink-mute uppercase tracking-wider mb-2">Déjà validés</div>
          <div className="space-y-2">
            {valides.map(m => <Card key={m.id} m={m} />)}
          </div>
        </>
      )}
    </div>
  )
}
