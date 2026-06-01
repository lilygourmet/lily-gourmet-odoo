import { useState, useEffect } from 'react'
import { fetchTemplates, sendTemplate, searchOrders } from '../../lib/conversations'

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

// Compose le bloc détails {{3}} sur UNE seule ligne (WhatsApp interdit les
// retours à la ligne dans les variables de template).
function composeDetails(order, tmplName) {
  const prods = (order.productLines || [])
    .map(l => `Produit : ${l.text} Qté : ${l.qty} Prix : ${l.price}`)
    .join(' ; ')
  if (tmplName === 'devis_val') {
    return `Montant : ${order.amountText}. ${prods}. Date et heure de retrait souhaitées : ${order.pickupText}`
  }
  // message_de_confirmation
  return `Montant : ${order.amountText}. La date et l'heure de retrait sont ${order.pickupText}. Détails : ${prods}`
}
const AUTOFILL_TEMPLATES = new Set(['devis_val', 'message_de_confirmation'])

// Commande confirmée (sale/done) -> confirmation ; sinon (brouillon/envoyé) -> devis.
const isConfirmedOrder = (state) => state === 'sale' || state === 'done'
const templateForState = (state) => isConfirmedOrder(state) ? 'message_de_confirmation' : 'devis_val'

// Seuls ces templates (usage commercial) sont proposés ; on cache congés/économat/tâches.
const ALLOWED_TEMPLATES = new Set([
  'devis_val',
  'message_de_confirmation',
  'envoi_modele_gateau',
  'relance_validation_de_devis',
  'annulation_devis_sans_reponse',
])

export default function NewConversationModal({ user, onClose, onSent }) {
  const [templates, setTemplates] = useState([])
  const [loadingT, setLoadingT] = useState(true)
  const [errT, setErrT] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedName, setSelectedName] = useState('')
  const [params, setParams] = useState({})
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  // Recherche commande Odoo (pré-remplissage)
  const [orderQuery, setOrderQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(true)  // true = chargement initial des dernières commandes
  const [searchErr, setSearchErr] = useState('')
  const [pickedOrder, setPickedOrder] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchTemplates()
      .then(list => { if (!cancelled) setTemplates(list.filter(t => ALLOWED_TEMPLATES.has(templateName(t)))) })
      .catch(e => { if (!cancelled) setErrT(e.message) })
      .finally(() => { if (!cancelled) setLoadingT(false) })
    return () => { cancelled = true }
  }, [])

  // Dernières commandes affichées d'office (pour ne rien avoir à taper).
  useEffect(() => {
    let cancelled = false
    searchOrders('')
      .then(list => { if (!cancelled) setResults(list) })
      .catch(e => { if (!cancelled) setSearchErr(e.message) })
      .finally(() => { if (!cancelled) setSearching(false) })
    return () => { cancelled = true }
  }, [])

  const selected = templates.find(t => templateName(t) === selectedName) || null
  const body = selected ? templateBody(selected) : ''
  const vars = placeholders(body)

  async function handleSearch() {
    const q = orderQuery.trim()
    if (q.length < 2) return
    setSearching(true)
    setSearchErr('')
    try {
      setResults(await searchOrders(q))
    } catch (e) {
      setSearchErr(e.message)
    } finally {
      setSearching(false)
    }
  }

  // Remplit le numéro + les variables {{1}}{{2}}{{3}} à partir d'une commande.
  function fillFromOrder(order, tmplName) {
    if (order.clientPhone) setPhone(order.clientPhone)
    if (tmplName && AUTOFILL_TEMPLATES.has(tmplName)) {
      setParams({ 1: order.clientName, 2: order.name, 3: composeDetails(order, tmplName) })
    }
  }

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

        {/* Pré-remplir depuis une commande Odoo */}
        <label className="block text-[11px] font-medium text-ink-soft mb-1">Pré-remplir depuis une commande (n° S, nom, ou téléphone)</label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={orderQuery}
            onChange={e => setOrderQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch() } }}
            placeholder="S48587 · Meryem · 0661…"
            className="flex-1 px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux"
          />
          <button
            onClick={handleSearch}
            disabled={searching || orderQuery.trim().length < 2}
            className="px-3 py-2 text-[11px] font-medium tracking-wider uppercase bg-ink text-cream rounded-lg hover:bg-bordeaux transition-all disabled:opacity-50"
          >
            {searching ? '…' : 'Chercher'}
          </button>
        </div>
        {searchErr && <div className="text-[12px] text-bordeaux mb-2">{searchErr}</div>}
        {results.length > 0 && (
          <>
          <div className="text-[10px] uppercase tracking-wider text-ink-mute mb-1">{orderQuery.trim().length >= 2 ? 'Résultats' : 'Commandes récentes'}</div>
          <div className="border border-line rounded-lg divide-y divide-line mb-4 max-h-48 overflow-y-auto">
            {results.map(o => (
              <button
                key={o.id}
                onClick={() => {
                  const tmpl = templateForState(o.state)
                  setPickedOrder(o)
                  setResults([])
                  setSelectedName(tmpl)
                  fillFromOrder(o, tmpl)
                }}
                className="w-full text-left px-3 py-2 hover:bg-cream-warm transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-ink">{o.name} · {o.clientName}</span>
                  <span className="text-[10px] uppercase tracking-wider text-ink-mute">{isConfirmedOrder(o.state) ? 'Confirmée' : 'Devis'}</span>
                </div>
                <div className="text-[11px] text-ink-mute">{o.amountText} · retrait {o.pickupText}</div>
              </button>
            ))}
          </div>
          </>
        )}
        {pickedOrder && (
          <div className="text-[11px] text-ink-soft bg-cream-warm border border-line rounded-lg px-3 py-2 mb-4">
            Commande sélectionnée : <span className="font-medium">{pickedOrder.name} · {pickedOrder.clientName}</span>
            {' '}→ message <span className="font-medium">{isConfirmedOrder(pickedOrder.state) ? 'de confirmation' : 'de devis'}</span>
          </div>
        )}

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
        {pickedOrder ? (
          <div className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg mb-3 text-ink font-medium">
            {isConfirmedOrder(pickedOrder.state) ? 'Confirmation de commande' : 'Devis'}
          </div>
        ) : loadingT ? (
          <div className="text-[12px] text-ink-mute italic py-2">Chargement des templates…</div>
        ) : errT ? (
          <div className="text-[12px] text-bordeaux py-2">{errT}</div>
        ) : templates.length === 0 ? (
          <div className="text-[12px] text-ink-mute italic py-2">Aucun template approuvé pour l'instant.</div>
        ) : (
          <select
            value={selectedName}
            onChange={e => {
              const n = e.target.value
              setSelectedName(n)
              if (pickedOrder && AUTOFILL_TEMPLATES.has(n)) {
                setParams({ 1: pickedOrder.clientName, 2: pickedOrder.name, 3: composeDetails(pickedOrder, n) })
              } else {
                setParams({})
              }
            }}
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
