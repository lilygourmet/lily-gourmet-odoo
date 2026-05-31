import { useState, useEffect } from 'react'
import { fetchTemplates, sendTemplate } from '../../lib/conversations'

// Détecte les variables {{1}}, {{2}}… dans le texte d'un template.
function templateBody(t) {
  if (t?.body) return t.body
  const comp = (t?.components || []).find(c => (c.type || '').toUpperCase() === 'BODY')
  return comp?.text || ''
}
function templateName(t) {
  return t?.elementName || t?.name || t?.templateName || '(sans nom)'
}
function placeholders(body) {
  const found = [...body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1])
  return [...new Set(found)]
}

export default function NewConversationModal({ user, onClose, onSent }) {
  const [templates, setTemplates] = useState([])
  const [loadingT, setLoadingT] = useState(true)
  const [errT, setErrT] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [params, setParams] = useState({})
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchTemplates()
      .then(list => { if (!cancelled) setTemplates(list) })
      .catch(e => { if (!cancelled) setErrT(e.message) })
      .finally(() => { if (!cancelled) setLoadingT(false) })
    return () => { cancelled = true }
  }, [])

  const selected = templates.find(t => templateName(t) === selectedName) || null
  const body = selected ? templateBody(selected) : ''
  const vars = placeholders(body)

  async function handleSend() {
    if (!phone.trim() || !selected) return
    setSending(true)
    setErr('')
    try {
      const parameters = vars.map(v => ({ name: v, value: params[v] || '' }))
      // Texte réel envoyé au client : variables {{1}}… remplacées par ce qui est saisi.
      const bodyText = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => params[k] || `{{${k}}}`)
      const r = await sendTemplate({
        clientPhone: phone,
        templateName: selectedName,
        parameters,
        bodyText,
        userId: user.id,
      })
      onSent?.(r.conversationId)
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-fraunces italic text-[20px] text-ink">Nouveau message</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0">✕</button>
        </div>

        {/* Numéro */}
        <label className="block text-[11px] font-medium text-ink-soft mb-1">Numéro du client (avec indicatif)</label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="212600000000"
          className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-4"
        />

        {/* Template */}
        <label className="block text-[11px] font-medium text-ink-soft mb-1">Modèle de message</label>
        {loadingT ? (
          <div className="text-[12px] text-ink-mute italic py-2">Chargement des templates…</div>
        ) : errT ? (
          <div className="text-[12px] text-bordeaux py-2">{errT}</div>
        ) : templates.length === 0 ? (
          <div className="text-[12px] text-ink-mute italic py-2">Aucun template approuvé pour l'instant.</div>
        ) : (
          <select
            value={selectedName}
            onChange={e => { setSelectedName(e.target.value); setParams({}) }}
            className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-3"
          >
            <option value="">— Choisir un template —</option>
            {templates.map(t => {
              const n = templateName(t)
              return <option key={n} value={n}>{n}</option>
            })}
          </select>
        )}

        {/* Aperçu + variables */}
        {selected && (
          <>
            <div className="text-[11px] text-ink-mute bg-cream-warm border border-line rounded-lg p-2 mb-3 whitespace-pre-wrap">{body}</div>
            {vars.map(v => (
              <div key={v} className="mb-2">
                <label className="block text-[11px] font-medium text-ink-soft mb-1">Variable {`{{${v}}}`}</label>
                <input
                  type="text"
                  value={params[v] || ''}
                  onChange={e => setParams(prev => ({ ...prev, [v]: e.target.value }))}
                  className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux"
                />
              </div>
            ))}
          </>
        )}

        {err && <div className="text-[12px] text-bordeaux mt-2">{err}</div>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm transition-all">Annuler</button>
          <button
            onClick={handleSend}
            disabled={sending || !phone.trim() || !selected}
            className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  )
}
