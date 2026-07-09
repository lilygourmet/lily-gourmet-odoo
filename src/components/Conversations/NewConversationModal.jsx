import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { fetchTemplates, sendTemplate, searchOrders, sendMessage } from '../../lib/conversations'
import { loadEmployes } from '../../lib/hr'
import { toast } from '../../lib/toast'

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
// Une ligne « annulée » = quantité explicitement 0 (article retiré de la commande).
// On ne l'envoie pas au client (sinon il la voit dans sa confirmation et est confus).
// NB : un article offert (ex. « Bougies ×9 — 0 DH ») a une quantité > 0 → conservé.
function isLigneAnnulee(l) {
  if (typeof l === 'string') return false
  if (l.qty === undefined || l.qty === null || l.qty === '') return false
  return Number(l.qty) === 0
}
function lignesVisibles(order) {
  return (order.productLines || []).filter(l => !isLigneAnnulee(l))
}

function composeDetails(order, tmplName) {
  // articleLine() gère les 2 formats (objet devis OU chaîne commande confirmée) :
  // évite le « Produit : undefined » et donne « Gâteau ×1 — 2500 DH ».
  const prods = lignesVisibles(order).map(l => articleLine(l)).join(' ; ')
  if (tmplName === 'devis_validation') {
    return `Montant Total : ${order.amountText}. ${prods}. Date et heure de retrait souhaitées : ${order.pickupText}`
  }
  // message_de_confirmation
  return `Montant Total : ${order.amountText}. La date et l'heure de retrait sont ${order.pickupText}. Détails : ${prods}`
}

// Une ligne d'article lisible : « Gâteau 20 pers ×1 — 2500 DH ».
// Gère les deux formats : objet {text, qty, price} ou chaîne déjà formatée.
function articleLine(l) {
  // Retire le préfixe interne CD-/GM-/GMD- (le client ne doit pas le voir).
  const clean = s => String(s || '').replace(/^[•\-\s]+/, '').replace(/^(CD-|GM-|GMD-)\s*/i, '')
  if (typeof l === 'string') return clean(l)
  const qty = l.qty && Number(l.qty) ? ` ×${l.qty}` : ''
  const price = l.price ? ` — ${l.price} DH` : ''
  return `${clean(l.text)}${qty}${price}`
}

// Version « un article par ligne » du bloc {{3}} (autorisée seulement dans un
// message NORMAL, pas dans un modèle — WhatsApp interdit les \n dans un modèle).
function composeDetailsMultiline(order, tmplName) {
  const prods = lignesVisibles(order).map(l => `• ${articleLine(l)}`).join('\n')
  if (tmplName === 'devis_validation') {
    return `Montant Total : ${order.amountText}\n${prods}\nDate et heure de retrait souhaitées : ${order.pickupText}`
  }
  return `Montant Total : ${order.amountText}\nLa date et l'heure de retrait sont ${order.pickupText}\nDétails :\n${prods}`
}
const AUTOFILL_TEMPLATES = new Set(['devis_validation', 'message_de_confirmation'])

// Commande confirmée (sale/done) -> confirmation ; sinon (brouillon/envoyé) -> devis.
const isConfirmedOrder = (state) => state === 'sale' || state === 'done'
const templateForState = (state) => isConfirmedOrder(state) ? 'message_de_confirmation' : 'devis_validation'

// Templates proposés en mode CLIENT (usage commercial).
const ALLOWED_TEMPLATES = new Set([
  'devis_validation',
  'message_de_confirmation',
  'envoi_modele_gateau',
  'relance_validation_de_devis',
  'annulation_devis_sans_reponse',
])
// Template envoyé au PERSONNEL (mode personnel).
const STAFF_TEMPLATE = 'nouvelle_demande_economat'

// Une commande est un « cake design » si une ligne commence par CD-.
// (GM-/GMD- = gourmandises : pas concernées.)
const CAKE_PREFIX_RE = /^[•\-\s]*CD-/i
function isCakeDesignOrder(order) {
  return (order?.productLines || []).some(l => CAKE_PREFIX_RE.test(typeof l === 'string' ? l : (l?.text || '')))
}

// Numéro au format WhatsApp (0… -> 212…) pour l'affichage ; le serveur normalise aussi.
function normalizePhoneFr(raw) {
  let d = String(raw || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('212')) return d
  if (d.startsWith('0')) return '212' + d.slice(1)
  return d
}

// Message d'acompte proposé au client après un devis cake design (choix Oui/Non du commercial).
// Envoyé via le template WATI déjà validé « wati_info » (variable {{1}} = le texte),
// le même que le bouton « 📢 Info » de la conversation → marche aussi hors fenêtre 24h.
const ACOMPTE_TEMPLATE = 'wati_info'
const ACOMPTE_MESSAGE = `Petit rappel : *ce devis est valable 24h.*

Pour confirmer votre commande, merci de bien vouloir verser un *acompte de 50 %*. Plusieurs options s'offrent à vous :

✅ Passer en boutique pour régler
✅ Effectuer un virement bancaire « INSTANTANÉ »
✅ Régler par carte via un lien de paiement sécurisé (nous pouvons vous l'envoyer)

⚠️ Passé ce délai, et sans acompte, nous ne pourrons malheureusement pas garantir la prise en charge de votre commande. Il se peut alors que le gâteau souhaité ne soit plus réalisable, que le créneau horaire ne soit plus disponible, ou que nous ne puissions tout simplement plus prendre la commande.

Nous restons à votre disposition pour toute question 🙏

Merci pour votre confiance !`

// Explication « hauteur des gâteaux » proposée AVANT l'envoi d'un devis cake design (choix Oui/Non).
// Le texte part via wati_info ; l'image part en pièce jointe (fenêtre 24h ouverte requise).
const HAUTEUR_MESSAGE = `Pour être certaine que le rendu correspond bien à vos attentes, pourriez-vous prendre un instant pour ouvrir cette image ? Elle explique comment nous réalisons la hauteur de nos gâteaux et le résultat final obtenu.

Est-ce que cela vous convient pour votre commande ?`
const HAUTEUR_IMAGE_PATH = 'static/hauteur-gateaux.jpg'   // chemin dans le bucket Supabase conversation-media
const HAUTEUR_IMAGE_PREVIEW = '/hauteur-gateaux.jpg'      // asset public pour l'aperçu dans l'app

// WhatsApp/Meta interdit les retours à la ligne dans une variable de template ({{1}}).
// Hors fenêtre 24h (envoi via wati_info), on aplatit donc le message sur une seule ligne
// (les émojis ✅/⚠️ servent de séparateurs). En fenêtre ouverte, on garde la version multi-lignes.
const flattenForTemplate = (msg) => msg.replace(/\s*\n\s*/g, ' ').replace(/ {2,}/g, ' ').trim()

export default function NewConversationModal({ user, onClose, onSent, initialPhone = '', initialName = '', initialOrder = null }) {
  const [templates, setTemplates] = useState([])
  const [loadingT, setLoadingT] = useState(true)
  const [errT, setErrT] = useState('')
  const [phone, setPhone] = useState(initialPhone || '')
  const [selectedName, setSelectedName] = useState(initialName || '')
  const [params, setParams] = useState({})
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  // Pop-up acompte bloquant, affiché juste après l'envoi d'un devis cake design :
  // le commercial DOIT choisir d'envoyer (Oui) ou non le message d'acompte au client.
  const [acompteOpen, setAcompteOpen] = useState(false)
  const [acompteSending, setAcompteSending] = useState(false)
  const [sentConvId, setSentConvId] = useState(null)

  // Pop-up hauteur bloquant, AVANT l'envoi d'un devis cake design : envoyer (Oui) ou non
  // l'explication « hauteur des gâteaux » + l'image au client.
  const [hauteurOpen, setHauteurOpen] = useState(false)
  const [hauteurSending, setHauteurSending] = useState(false)

  // Mode d'envoi : 'client' (commandes) ou 'personnel' (employés)
  const [mode, setMode] = useState('client')

  // Recherche commande Odoo (pré-remplissage)
  const [orderQuery, setOrderQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(true)  // true = chargement initial des dernières commandes
  const [searchErr, setSearchErr] = useState('')
  const [pickedOrder, setPickedOrder] = useState(null)

  // Liste du personnel (mode personnel)
  const [employes, setEmployes] = useState([])
  const [empErr, setEmpErr] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchTemplates()
      .then(list => { if (!cancelled) setTemplates(list) })
      .catch(e => { if (!cancelled) setErrT(e.message) })
      .finally(() => { if (!cancelled) setLoadingT(false) })
    return () => { cancelled = true }
  }, [])

  // Charge les employés actifs (avec numéro) la 1re fois qu'on ouvre le mode personnel.
  useEffect(() => {
    if (mode !== 'personnel' || employes.length > 0) return
    let cancelled = false
    loadEmployes(true)
      .then(list => { if (!cancelled) setEmployes((list || []).filter(e => e.telephone)) })
      .catch(e => { if (!cancelled) setEmpErr(e.message) })
    return () => { cancelled = true }
  }, [mode, employes.length])

  // Dernières commandes affichées d'office (pour ne rien avoir à taper).
  // Si on arrive avec une commande déjà choisie (depuis Devis), on saute cette liste.
  useEffect(() => {
    if (initialOrder) { setSearching(false); return }
    let cancelled = false
    searchOrders('')
      .then(list => { if (!cancelled) setResults(list) })
      .catch(e => { if (!cancelled) setSearchErr(e.message) })
      .finally(() => { if (!cancelled) setSearching(false) })
    return () => { cancelled = true }
  }, [])

  // Pré-sélection d'office de la commande/devis (ouverture depuis l'onglet Devis).
  useEffect(() => {
    if (!initialOrder) return
    const tmpl = templateForState(initialOrder.state)
    setPickedOrder(initialOrder)
    setResults([])
    setSelectedName(tmpl)
    fillFromOrder(initialOrder, tmpl)
  }, [])

  const selected = templates.find(t => templateName(t) === selectedName) || null
  const body = selected ? templateBody(selected) : ''
  const vars = placeholders(body)
  // Aperçu = message final (variables remplies). Pour un devis/confirmation avec
  // une commande, on montre la version « un article par ligne » (ce que le client
  // verra si la conversation est ouverte).
  const previewText = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    if (k === '3' && AUTOFILL_TEMPLATES.has(selectedName) && pickedOrder) {
      return composeDetailsMultiline(pickedOrder, selectedName)
    }
    return params[k] || `{{${k}}}`
  })

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

  // Sélectionne un employé : remplit son numéro et choisit le modèle personnel.
  function pickEmploye(emp) {
    setPhone(normalizePhoneFr(emp.telephone))
    setSelectedName(STAFF_TEMPLATE)
    setParams({})
    setPickedOrder(null)
  }

  // Bascule client/personnel : on repart propre.
  function switchMode(m) {
    setMode(m)
    setPhone('')
    setSelectedName('')
    setParams({})
    setPickedOrder(null)
  }

  // Clic « Envoyer » : pour un devis cake design, on demande d'abord (Oui/Non) d'envoyer
  // l'explication « hauteur des gâteaux » + l'image AVANT le devis ; sinon on envoie direct.
  function handleSend() {
    if (!phone.trim() || !selected) return
    if (selectedName === 'devis_validation' && pickedOrder && isCakeDesignOrder(pickedOrder)) {
      setHauteurOpen(true)
      return
    }
    doSendDevis()
  }

  async function doSendDevis() {
    if (!phone.trim() || !selected) return
    setSending(true)
    setErr('')
    try {
      const parameters = vars.map(v => ({ name: v, value: params[v] || '' }))
      // Texte réel envoyé au client : variables {{1}}… remplacées par ce qui est saisi.
      const bodyText = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => params[k] || `{{${k}}}`)
      // Pour un devis/confirmation : version « un article par ligne ». Le serveur
      // l'envoie en message normal si la conversation est ouverte (client a écrit
      // < 24h) ; sinon il garde le modèle (sur une ligne, obligé).
      let freeText = null
      if (AUTOFILL_TEMPLATES.has(selectedName) && pickedOrder) {
        const p3 = { ...params, 3: composeDetailsMultiline(pickedOrder, selectedName) }
        freeText = body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => p3[k] || `{{${k}}}`)
      }
      const r = await sendTemplate({
        clientPhone: phone,
        templateName: selectedName,
        parameters,
        bodyText,
        freeText,
        userId: user.id,
      })
      // Devis cake design → pop-up bloquant « acompte expliqué » avant de fermer.
      if (selectedName === 'devis_validation' && pickedOrder && isCakeDesignOrder(pickedOrder)) {
        setSentConvId(r.conversationId)
        setAcompteOpen(true)
      } else {
        onSent?.(r.conversationId)
        onClose()
      }
    } catch (e) {
      setErr(e.message)
    } finally {
      setSending(false)
    }
  }

  // Choix Oui/Non du pop-up acompte : si Oui, on envoie le message d'acompte au client.
  async function handleAcompteChoice(send) {
    if (send) {
      setAcompteSending(true)
      try {
        // freeText = envoi joli si fenêtre 24h ouverte ; sinon repli sur le template wati_info
        // (le texte va dans la variable {{1}}), exactement comme le bouton « 📢 Info ».
        await sendTemplate({
          clientPhone: phone,
          templateName: ACOMPTE_TEMPLATE,
          parameters: [{ name: '1', value: flattenForTemplate(ACOMPTE_MESSAGE) }],
          bodyText: ACOMPTE_MESSAGE,
          freeText: ACOMPTE_MESSAGE,
          userId: user.id,
        })
        toast.success("Message d'acompte envoyé au client ✓")
      } catch (e) {
        toast.error("Message d'acompte NON envoyé (" + (e?.message || 'erreur') + "). La fenêtre WhatsApp est peut-être fermée — envoie-le à la main.")
      } finally {
        setAcompteSending(false)
      }
    }
    onSent?.(sentConvId)
    onClose()
  }

  // Choix Oui/Non du pop-up hauteur (AVANT le devis) : si Oui, envoie l'explication + l'image,
  // puis on envoie le devis dans tous les cas.
  async function handleHauteurChoice(send) {
    if (send) {
      setHauteurSending(true)
      try {
        // Texte via wati_info (marche hors 24h), puis l'image en pièce jointe (fenêtre ouverte requise).
        const r = await sendTemplate({
          clientPhone: phone,
          templateName: 'wati_info',
          parameters: [{ name: '1', value: flattenForTemplate(HAUTEUR_MESSAGE) }],
          bodyText: HAUTEUR_MESSAGE,
          freeText: HAUTEUR_MESSAGE,
          userId: user.id,
        })
        await sendMessage({
          conversationId: r.conversationId,
          clientPhone: phone,
          userId: user.id,
          mediaPath: HAUTEUR_IMAGE_PATH,
          mediaType: 'image',
        })
        toast.success('Explication hauteur + image envoyées ✓')
      } catch (e) {
        toast.error("Explication hauteur NON envoyée (" + (e?.message || 'erreur') + "). La fenêtre WhatsApp est peut-être fermée — envoie-la à la main.")
      } finally {
        setHauteurSending(false)
      }
    }
    setHauteurOpen(false)
    doSendDevis()
  }

  return createPortal(
    <>
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-fraunces italic text-[20px] text-ink">Nouveau message</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0">✕</button>
        </div>

        {/* Basculeur Client / Personnel */}
        <div className="flex gap-1.5 mb-4">
          <button
            onClick={() => switchMode('client')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-medium tracking-wider uppercase transition-all ${mode === 'client' ? 'bg-bordeaux text-cream' : 'border border-line text-ink-soft hover:bg-cream-warm'}`}
          >Client (commande)</button>
          <button
            onClick={() => switchMode('personnel')}
            className={`flex-1 px-3 py-1.5 rounded-lg text-[11px] font-medium tracking-wider uppercase transition-all ${mode === 'personnel' ? 'bg-bordeaux text-cream' : 'border border-line text-ink-soft hover:bg-cream-warm'}`}
          >Personnel</button>
        </div>

        {mode === 'client' && (<>
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
        </>)}

        {mode === 'personnel' && (<>
        {/* Liste du personnel */}
        <label className="block text-[11px] font-medium text-ink-soft mb-1">Choisir un employé (le numéro se remplit tout seul)</label>
        {empErr && <div className="text-[12px] text-bordeaux mb-2">{empErr}</div>}
        {employes.length === 0 ? (
          <div className="text-[12px] text-ink-mute italic py-2 mb-2">{empErr ? '' : 'Chargement du personnel…'}</div>
        ) : (
          <div className="border border-line rounded-lg divide-y divide-line mb-4 max-h-56 overflow-y-auto">
            {employes.map(emp => (
              <button
                key={emp.id}
                onClick={() => pickEmploye(emp)}
                className="w-full text-left px-3 py-2 hover:bg-cream-warm transition-all"
              >
                <span className="text-[13px] font-medium text-ink">{emp.nom}</span>
                {emp.poste && <span className="text-[11px] text-ink-mute"> · {emp.poste}</span>}
              </button>
            ))}
          </div>
        )}
        </>)}

        {/* Numéro */}
        <label className="block text-[11px] font-medium text-ink-soft mb-1">Numéro (avec indicatif, ex : 212600000000)</label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="212600000000"
          className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg focus:outline-none focus:border-bordeaux mb-4"
        />

        {/* Template */}
        <label className="block text-[11px] font-medium text-ink-soft mb-1">Modèle de message</label>
        {mode === 'personnel' ? (
          <div className="w-full px-3 py-2 text-[13px] bg-cream-warm border border-line rounded-lg mb-3 text-ink font-medium">
            Nouvelle demande économat
          </div>
        ) : pickedOrder ? (
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
            {templates.filter(t => ALLOWED_TEMPLATES.has(templateName(t))).map(t => {
              const n = templateName(t)
              return <option key={n} value={n}>{n}</option>
            })}
          </select>
        )}

        {/* Aperçu + variables */}
        {selected && (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-mute mb-1">Aperçu (ce que verra le client)</div>
            <div className="text-[12px] text-ink bg-cream-warm border border-line rounded-lg p-2.5 mb-3 whitespace-pre-wrap leading-relaxed">{previewText}</div>
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

    {hauteurOpen && (
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
        <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5 max-h-[90vh] overflow-y-auto">
          <h3 className="font-fraunces italic text-[20px] text-ink mb-1">Avant d'envoyer le devis</h3>
          <p className="text-[13px] text-ink-soft mb-3">Envoyer d'abord au client l'explication sur la hauteur des gâteaux (avec l'image) ?</p>
          <div className="bg-cream-warm border border-bordeaux/40 rounded-lg p-3 mb-3">
            <pre className="text-[12px] text-ink leading-snug whitespace-pre-wrap font-sans m-0">{HAUTEUR_MESSAGE}</pre>
          </div>
          <img src={HAUTEUR_IMAGE_PREVIEW} alt="Explication hauteur des gâteaux" className="w-full rounded-lg border border-line mb-4" />
          <div className="flex gap-2">
            <button
              onClick={() => handleHauteurChoice(false)}
              disabled={hauteurSending}
              className="flex-1 px-3 py-2.5 text-[11px] font-medium tracking-wider uppercase bg-cream-warm text-ink border border-line rounded-lg hover:bg-line/30 transition-all disabled:opacity-50"
            >Non, envoyer juste le devis</button>
            <button
              onClick={() => handleHauteurChoice(true)}
              disabled={hauteurSending}
              className="flex-1 px-3 py-2.5 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all disabled:opacity-50"
            >{hauteurSending ? 'Envoi…' : 'Oui, envoyer'}</button>
          </div>
        </div>
      </div>
    )}

    {acompteOpen && (
      <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-ink/60 backdrop-blur-sm">
        <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line p-5">
          <h3 className="font-fraunces italic text-[20px] text-ink mb-1">Devis envoyé ✓</h3>
          <p className="text-[13px] text-ink-soft mb-3">Envoyer ce message d'acompte au client sur WhatsApp ?</p>
          <div className="bg-cream-warm border border-bordeaux/40 rounded-lg p-3 mb-4 max-h-52 overflow-y-auto">
            <pre className="text-[12px] text-ink leading-snug whitespace-pre-wrap font-sans m-0">{ACOMPTE_MESSAGE}</pre>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleAcompteChoice(false)}
              disabled={acompteSending}
              className="flex-1 px-3 py-2.5 text-[11px] font-medium tracking-wider uppercase bg-cream-warm text-ink border border-line rounded-lg hover:bg-line/30 transition-all disabled:opacity-50"
            >Non, ne pas envoyer</button>
            <button
              onClick={() => handleAcompteChoice(true)}
              disabled={acompteSending}
              className="flex-1 px-3 py-2.5 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all disabled:opacity-50"
            >{acompteSending ? 'Envoi…' : 'Oui, envoyer'}</button>
          </div>
        </div>
      </div>
    )}
    </>,
    document.body
  )
}
