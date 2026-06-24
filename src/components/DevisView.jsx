import { useState, useEffect, useRef } from 'react'
import CopyableRef from './CopyableRef'
import Skeleton from './Skeleton'
import { loadDevis, loadConfirmedOrders, loadDevisPhotos, loadDevisEnvois, recordDevisEnvoi, confirmDevis, cancelDevis, restoreDevis, loadContactedOrderRefs, recordDevisTraitement, loadDevisTraitements } from '../lib/conversations'
import { createModification } from '../lib/modifications'
import NewConversationModal from './Conversations/NewConversationModal'
import OrderEditModal from './OrderEditModal'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import WhatsAppLogo from './WhatsAppLogo'

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
function fmtJour(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}
// Date locale au format YYYY-MM-DD (sans décalage de fuseau).
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Affiche une ligne produit : "12× Mini Hot Dogs — 240 DH".
// Gère l'ancien format (string) et le nouveau ({ text, qty, price }).
function lineLabel(l) {
  if (typeof l === 'string') return l
  const qty = parseFloat(l.qty) || 1
  const p = parseFloat(l.price)
  const prix = p ? ` — ${Math.round(p).toLocaleString('fr-FR')} DH` : ''
  return `${qty}× ${l.text}${prix}`
}

export default function DevisView({ user, initialDevis = null, internetOnly = false }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState(internetOnly ? 'sent' : 'all')   // all | sent | draft
  const [devis, setDevis] = useState([])
  const [loading, setLoading] = useState(true)
  const [waTarget, setWaTarget] = useState(null)
  const [lightbox, setLightbox] = useState(null)   // orderId dont on regarde la/les photo(s) en plein écran
  const [editOrder, setEditOrder] = useState(null)
  const [envois, setEnvois] = useState({})
  const [confirmingId, setConfirmingId] = useState(null)
  const [dayOffset, setDayOffset] = useState(0)   // décalage de la fenêtre
  const [articleFilter, setArticleFilter] = useState('')  // filtre par article / thème
  // PC : 4 jours côte à côte. Téléphone : 1 jour à la fois (plus lisible).
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const [viewMode, setViewMode] = useState(isDesktop ? '4jours' : 'jour')  // jour | 4jours | semaine
  const WINDOW = viewMode === 'jour' ? 1 : viewMode === 'semaine' ? 7 : 4
  // N° de devis (S…) déjà cités dans une conversation = ce devis précis a été contacté.
  const [contactedRefs, setContactedRefs] = useState(() => new Set())
  useEffect(() => {
    loadContactedOrderRefs().then(setContactedRefs).catch(() => {})
  }, [])
  const [traitements, setTraitements] = useState({})
  function reloadTraitements() { loadDevisTraitements().then(setTraitements).catch(() => {}) }
  useEffect(() => { reloadTraitements() }, [])

  // Ouverture directe d'une commande précise (depuis le 📦 Cmd d'une conversation) :
  // on cherche son n°, on choisit le bon filtre (confirmée vs devis) et on cale la
  // fenêtre de jours sur sa date de livraison pour qu'elle s'affiche d'office.
  useEffect(() => {
    if (!initialDevis) return
    setQuery(initialDevis.q || '')
    setFilter(initialDevis.state === 'sale' ? 'confirmed' : 'all')
    if (initialDevis.day) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const target = new Date(initialDevis.day + 'T00:00:00')
      const off = Math.round((target - today) / 86400000)
      if (Number.isFinite(off)) setDayOffset(off)
    }
  }, [initialDevis])

  async function run(q, f = filter) {
    if (f === 'cancelled') { setDevis([]); setLoading(false); return }  // liste issue des traitements
    setLoading(true)
    try {
      let data
      if (f === 'confirmed') data = await loadConfirmedOrders(q)
      else if (f === 'all') {
        // « Tous » = devis (brouillon + internet) + commandes confirmées
        const [dv, cf] = await Promise.all([loadDevis(q), loadConfirmedOrders(q)])
        const byId = new Map()
        for (const o of [...(dv || []), ...(cf || [])]) byId.set(o.id, o)
        data = [...byId.values()]
      } else data = await loadDevis(q)
      setDevis(data)
    }
    catch (e) { toast.error(e?.message || 'Erreur de chargement'); setDevis([]) }
    finally { setLoading(false) }
  }

  // « Annuler » : annule dans Odoo (effet réel). Pour une commande CONFIRMÉE on
  // crée en plus une demande dans l'onglet Modifications (traçabilité).
  async function handleCancel(d) {
    const isConfirmed = d.state === 'sale'
    const ok = await confirmDialog(
      isConfirmed
        ? `Annuler la commande ${d.name} dans Odoo ?\n\nLa commande sera annulée côté Odoo (effet réel) et une demande sera envoyée à l'onglet « Modifications ».`
        : `Annuler le devis ${d.name} dans Odoo ?\n\nLe devis sera annulé côté Odoo (effet réel).`,
      { danger: true, confirmLabel: 'Annuler dans Odoo' }
    )
    if (!ok) return
    setConfirmingId(d.id)
    try {
      const r = await cancelDevis(d.id, user?.id)
      if (isConfirmed) {
        await createModification({
          order_ref: d.name,
          client_name: d.clientName || null,
          client_phone: d.clientPhone || null,
          requested_by: user?.id || null,
          description: `❌ ANNULATION — commande ${d.name}${d.amountText ? ` (${d.amountText})` : ''} (annulée dans Odoo)`,
        })
      }
      await recordDevisTraitement({ order_num: d.name, action: 'annulation', user_id: user?.id, user_name: user?.full_name || user?.username })
      reloadTraitements()
      toast.success(isConfirmed ? `${r.name || d.name} annulée dans Odoo + demande Modifications` : `${r.name || d.name} annulé dans Odoo ✅`)
      run(query.trim())   // recharge : l'élément annulé sort de la liste
    } catch (e) {
      toast.error(e?.message || "Échec de l'annulation")
    } finally {
      setConfirmingId(null)
    }
  }

  // Relance : ouvre la conversation du client dans un NOUVEL ONGLET (Devis reste
  // ouvert). On n'enregistre rien ici : "Relancé par" se baserait sur un clic, pas
  // sur un envoi réel — donc la carte garde la personne qui a traité la commande.
  function handleRelance(d) {
    if (!d.clientPhone) return
    window.open(`/?convphone=${encodeURIComponent(d.clientPhone)}&relanceref=${encodeURIComponent(d.name)}`, '_blank')
  }

  // Remet une commande annulée en DEVIS dans Odoo, puis l'enlève de la liste « Annulés ».
  async function handleRestore(orderNum) {
    const ok = await confirmDialog(
      `Remettre la commande ${orderNum} en devis ?\n\nElle repassera de « annulée » à « devis » dans Odoo (effet réel).`,
      { confirmLabel: 'Remettre en devis' }
    )
    if (!ok) return
    try {
      await restoreDevis({ orderNum, actorId: user?.id })
      await recordDevisTraitement({ order_num: orderNum, action: 'restauration', user_id: user?.id, user_name: user?.full_name || user?.username })
      reloadTraitements()
      toast.success(`${orderNum} remis en devis ✅`)
    } catch (e) { toast.error(e?.message || 'Échec') }
  }

  // Confirme le devis dans Odoo (effet réel) après une confirmation explicite.
  async function handleConfirm(d) {
    const ok = await confirmDialog(
      `Confirmer le devis ${d.name} dans Odoo ?\n\nLe devis devient une commande confirmée côté Odoo (effet réel).`,
      { confirmLabel: 'Confirmer dans Odoo' }
    )
    if (!ok) return
    setConfirmingId(d.id)
    try {
      const r = await confirmDevis(d.id, user?.id)
      await recordDevisTraitement({ order_num: d.name, action: 'confirme', user_id: user?.id, user_name: user?.full_name || user?.username })
      reloadTraitements()
      toast.success(`${r.name} confirmé dans Odoo ✅`)
      run(query.trim())   // recharge : le devis confirmé sort de la liste
      // Propose d'envoyer le message de confirmation au client.
      if (await confirmDialog('Envoyer le message de confirmation au client sur WhatsApp ?', { confirmLabel: 'Envoyer' })) {
        setWaTarget({ ...d, state: 'sale' })
      }
    } catch (e) {
      toast.error(e?.message || 'Échec de la confirmation')
    } finally {
      setConfirmingId(null)
    }
  }
  function reloadEnvois() { loadDevisEnvois().then(setEnvois).catch(() => {}) }
  useEffect(() => { reloadEnvois() }, [])
  // Recharge quand la recherche OU le filtre change (le filtre « Confirmés »
  // change la source : commandes confirmées au lieu des devis).
  useEffect(() => {
    const t = setTimeout(() => run(query.trim(), filter), 400)
    return () => clearTimeout(t)
  }, [query, filter])

  // Fenêtre de 4 jours à partir d'aujourd'hui (+ décalage via les flèches).
  const winStart = new Date(); winStart.setHours(0, 0, 0, 0); winStart.setDate(winStart.getDate() + dayOffset)
  const winDates = Array.from({ length: WINDOW }, (_, i) => {
    const d = new Date(winStart); d.setDate(d.getDate() + i); return ymd(d)
  })
  const winEnd = new Date(winStart); winEnd.setDate(winEnd.getDate() + WINDOW - 1)
  const winLabel = WINDOW === 1
    ? winStart.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: '2-digit' })
    : `${winStart.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} → ${winEnd.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`

  // « Devis internet » (sent) = liste simple de TOUS les devis envoyés (pas de calendrier 4 jours).
  const isList = filter === 'sent'
  const isCancelled = filter === 'cancelled'
  // La RECHERCHE texte élargit à tous les jours À VENIR (aujourd'hui et après).
  // Le FILTRE article/thème s'applique dans la vue jour/4j/semaine affichée (par jour).
  const af = articleFilter.trim().toLowerCase()
  const searching = query.trim().length > 0
  const todayYmd = ymd(new Date())
  const shown = devis
    .filter(d => !/vitrin/i.test(d.clientName || ''))
    .filter(d => {
      const matchArticle = () => {
        if (!af) return true
        const lines = Array.isArray(d.productLines) ? d.productLines : []
        return lines.some(l => (typeof l === 'string' ? l : (l.text || '')).toLowerCase().includes(af))
      }
      const contacted = () => !!envois[d.name] || contactedRefs.has(String(d.name || '').toUpperCase()) || ['relance', 'confirme'].includes(traitements[d.name]?.action)
      // Devis internet : QUE les non traités (les traités partent vers « Commandes »).
      if (isList) {
        if (d.state !== 'sent') return false
        if (!matchArticle()) return false
        if (contacted()) return false
        return true
      }
      if (!d.deliveryAt) return false
      const dk = dayKey(d.deliveryAt)
      if (searching) {
        if (dk < todayYmd) return false           // recherche : uniquement aujourd'hui et après
      } else {
        if (!winDates.includes(dk)) return false  // sinon : la fenêtre courante (jour/4j/semaine)
      }
      if (!matchArticle()) return false
      // Devis internet NON traité → reste dans « Devis internet », pas dans « Commandes ».
      if (d.state === 'sent' && !contacted()) return false
      return (filter === 'all' || filter === 'confirmed') ? true : d.state === filter
    })

  // Regrouper par date de LIVRAISON (chronologique). "Sans date" à la fin.
  const groups = {}
  for (const d of shown) { const k = dayKey(d.deliveryAt); (groups[k] ||= []).push(d) }
  const dayKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'sans-date') return 1
    if (b === 'sans-date') return -1
    return a < b ? -1 : 1
  })

  const FILTERS = internetOnly
    ? [['sent', 'Devis internet']]
    : [['all', 'Tous'], ['draft', 'Devis'], ['confirmed', '✅ Confirmés'], ['cancelled', '❌ Annulés']]

  // Journal des annulations (traçabilité « qui a annulé »), du plus récent au plus ancien.
  const annulations = Object.values(traitements)
    .filter(t => t.action === 'annulation')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))

  function renderCard(d) {
    const isSent = d.state === 'sent'
    const isConfirmed = d.state === 'sale'
    const env = envois[d.name]
    const alreadyContacted = !!env || contactedRefs.has(String(d.name || '').toUpperCase()) || ['relance', 'confirme'].includes(traitements[d.name]?.action)   // devis envoyé, ce devis cité dans une conversation, relance ou confirmation
    const trait = traitements[d.name]
    const statusLabel = isConfirmed ? 'Confirmée' : isSent ? 'Devis internet' : 'Devis'
    const statusCls = isConfirmed ? 'bg-emerald-100 text-emerald-800' : isSent ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
    return (
      <div key={d.id} className="bg-white border border-line rounded-2xl p-4 shadow-sm">
        {/* En-tête : infos à gauche, photo à droite */}
        <div className="flex gap-3">
          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[14px] font-semibold text-bordeaux"><CopyableRef value={d.name} /></span>
              {env && (
                <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800" title={`Devis envoyé ${env.count} fois`}>
                  📤 {fmtJour(env.last)}{env.count > 1 ? ` ×${env.count}` : ''}
                </span>
              )}
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
            </div>
            <div className="text-[15px] text-ink font-semibold leading-tight">{d.clientName || '—'}</div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {d.dateOrder && <span className="px-2 py-1 rounded-full bg-cream-warm/60 text-ink-soft" title="Date de prise de la commande">📝 Pris le {d.dateOrder.slice(0, 10).split('-').reverse().join('/')}</span>}
              {d.pickupText && <span className="px-2 py-1 rounded-full bg-cream-warm/60 text-ink-soft">🗓️ {d.pickupText}</span>}
              {d.amountText && <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-800 font-semibold">💰 {d.amountText}</span>}
              {d.clientPhone && <span className="px-2 py-1 rounded-full bg-cream-warm/60 text-ink-soft font-mono">{d.clientPhone}</span>}
              {d.sellerName && !/API|Planning/i.test(d.sellerName) && <span className="px-2 py-1 rounded-full bg-cream-warm/60 text-ink-soft">🧑‍💼 {d.sellerName}</span>}
            </div>
          </div>
        </div>
        <CardPhotos orderId={d.id} hasPhoto={d.hasPhoto} onOpen={() => setLightbox(d.id)} />

        {/* Produits */}
        {Array.isArray(d.productLines) && d.productLines.length > 0 && (
          <div className="mt-3 border-t border-line/60 pt-3 space-y-2">
            {d.productLines.map((l, i) => <div key={i} className="text-[12px] text-ink leading-relaxed">• {lineLabel(l)}</div>)}
          </div>
        )}

        {/* Commentaire */}
        {d.note && (
          <div className="mt-3 text-[12px] text-ink-soft bg-cream/60 border border-line/60 rounded-lg px-3 py-2 leading-relaxed">💬 {d.note}</div>
        )}

        {/* Qui a traité */}
        {trait && (
          <div className={`mt-3 text-[11px] font-semibold ${trait.action === 'annulation' ? 'text-red-700' : 'text-emerald-800'}`}>
            👤 {trait.action === 'confirme' ? 'Confirmé' : trait.action === 'annulation' ? 'Annulé' : trait.action === 'relance' ? 'Relancé' : trait.action === 'created' ? 'Créé' : 'Traité'} par {trait.user_name || '?'}
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {d.clientPhone ? (
            <button onClick={() => alreadyContacted ? handleRelance(d) : setWaTarget(d)}
              title={alreadyContacted ? 'Relancer sur WhatsApp' : 'Contacter sur WhatsApp'}
              className="relative w-9 h-9 flex items-center justify-center bg-[#25D366] text-white rounded-full hover:bg-[#1ebe5d] transition-all">
              <WhatsAppLogo size={18} />
              {alreadyContacted && <span className="absolute -top-1 -right-1 text-[10px] bg-white rounded-full leading-none">🔁</span>}
            </button>
          ) : (
            <span className="text-[11px] text-ink-mute italic">Pas de téléphone</span>
          )}
          <button onClick={() => setEditOrder(d)}
            title="Ajouter / modifier / supprimer des articles"
            className="px-3 py-1.5 bg-gold/15 text-gold border border-gold/40 rounded-full text-[11px] font-medium tracking-wider hover:bg-gold/25 transition-all">
            ✏️ Articles
          </button>
          {!isConfirmed && (
            <button onClick={() => handleConfirm(d)} disabled={confirmingId === d.id}
              className="ml-auto px-3 py-1.5 bg-emerald-600 text-white rounded-full text-[11px] font-medium tracking-wider hover:bg-emerald-700 transition-all disabled:opacity-50">
              {confirmingId === d.id ? '⏳ …' : '✅ Confirmer'}
            </button>
          )}
          <button onClick={() => handleCancel(d)} disabled={confirmingId === d.id}
            className={`${isConfirmed ? 'ml-auto ' : ''}px-3 py-1.5 bg-red-600 text-white rounded-full text-[11px] font-medium tracking-wider hover:bg-red-700 transition-all disabled:opacity-50`}>
            {confirmingId === d.id ? '⏳ …' : '🗑 Annuler'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none">{internetOnly ? '🌐 Devis internet' : '📄 Commandes'}</h1>
        <span className="font-mono text-[11px] tracking-wider uppercase text-ink-mute">{isCancelled ? `${annulations.length} annulés` : `${shown.length} devis`}</span>
      </div>

      {!internetOnly && (
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Rechercher : nom client, n° devis (S…) ou téléphone…"
          className="w-full px-3 py-2 text-[13px] border border-line rounded-lg bg-white focus:outline-none focus:border-bordeaux mb-2"
        />
      )}
      {!internetOnly && (
        <input
          value={articleFilter} onChange={e => setArticleFilter(e.target.value)}
          placeholder="🔎 Filtrer par article ou thème (ex : Tiramisu, Licorne…)"
          className="w-full px-3 py-2 text-[13px] border border-line rounded-lg bg-white focus:outline-none focus:border-bordeaux mb-3"
        />
      )}

      {!internetOnly && (
        <div className="flex gap-2 mb-3 flex-wrap">
          {FILTERS.map(([k, lab]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all ${filter === k ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft hover:border-bordeaux'}`}>
              {lab}
            </button>
          ))}
        </div>
      )}

      {/* Mode d'affichage (jour / 4 jours / semaine) */}
      {!isList && !isCancelled && (
        <div className="flex items-center justify-end gap-1.5 mb-2">
          <span className="text-[11px] text-ink-mute mr-1">Voir :</span>
          {[['jour', 'Jour'], ['4jours', '4 jours'], ['semaine', 'Semaine']].map(([m, lab]) => (
            <button key={m} onClick={() => { setViewMode(m); setDayOffset(0) }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${viewMode === m ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft hover:border-bordeaux'}`}>{lab}</button>
          ))}
        </div>
      )}

      {/* Navigation par fenêtre (masquée en recherche, en liste « Devis internet » / « Annulés ») */}
      {!isList && !isCancelled && !searching && (
      <div className="flex items-center justify-between gap-2 mb-4 bg-white border border-line rounded-full px-2 py-1.5">
        <button onClick={() => setDayOffset(o => Math.max(0, o - WINDOW))} disabled={dayOffset === 0}
          className="px-3 py-1 rounded-full text-[13px] text-ink hover:bg-line/40 transition-all disabled:opacity-30">◀</button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-ink tabular-nums">{winLabel}</span>
          {dayOffset !== 0 && (
            <button onClick={() => setDayOffset(0)}
              className="text-[11px] text-bordeaux underline">Aujourd'hui</button>
          )}
        </div>
        <button onClick={() => setDayOffset(o => o + WINDOW)}
          className="px-3 py-1 rounded-full text-[13px] text-ink hover:bg-line/40 transition-all">▶</button>
      </div>
      )}

      {loading ? (
        <Skeleton rows={6} />
      ) : isCancelled ? (
        annulations.length === 0 ? (
          <div className="text-center text-ink-mute py-10 text-[13px]">Aucune annulation enregistrée.</div>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {annulations.map(t => (
              <div key={t.order_num} className="bg-white border border-line rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono text-[14px] font-semibold text-bordeaux">{t.order_num}</span>
                  <div className="text-[12px] text-red-700 font-medium">❌ Annulé par {t.user_name || '?'}</div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => handleRestore(t.order_num)}
                    className="text-[12px] font-semibold text-emerald-700 border border-emerald-600/40 rounded-lg px-2.5 py-1 hover:bg-emerald-50 transition-colors"
                    title="Repasser cette commande de « annulée » à « devis » dans Odoo">↩️ Remettre en devis</button>
                  <span className="font-mono text-[11px] text-ink-mute">{fmtJour(t.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      ) : shown.length === 0 ? (
        <div className="text-center text-ink-mute py-10 text-[13px]">{isList ? 'Aucun devis internet.' : searching ? 'Aucune commande ne correspond à la recherche.' : `${filter === 'confirmed' ? 'Aucune commande confirmée' : 'Aucun devis'} sur ${WINDOW === 1 ? 'ce jour' : WINDOW === 7 ? 'cette semaine' : 'ces 4 jours'} (${winLabel}). Utilise ◀ ▶ pour changer.`}</div>
      ) : (isList || searching) ? (
        <div className={`space-y-4 max-w-3xl ${internetOnly ? 'mx-auto' : ''}`}>
          {dayKeys.map(k => (
            <div key={k}>
              <div className="font-mono text-[11px] uppercase tracking-wider text-bordeaux font-semibold mb-1.5 capitalize">{dayLabel(k)} <span className="text-ink-mute">· {groups[k].length}</span></div>
              <div className="space-y-2">{groups[k].map(renderCard)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {winDates.map(dk => {
            const items = groups[dk] || []
            return (
            <div key={dk} className="min-w-[250px] flex-1">
              <div className="font-mono text-[11px] uppercase tracking-wider text-bordeaux font-semibold mb-1.5 capitalize">{dayLabel(dk)} <span className="text-ink-mute">· {items.length}</span></div>
              <div className="space-y-2">
                {items.length === 0 && <div className="text-[11px] text-ink-mute italic text-center py-6 border border-dashed border-line rounded-xl">—</div>}
                {items.map(renderCard)}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {lightbox && (
        <PhotoLightbox orderId={lightbox} onClose={() => setLightbox(null)} />
      )}

      {editOrder && (
        <OrderEditModal
          order={editOrder}
          user={user}
          onClose={() => setEditOrder(null)}
          onChanged={() => run(query.trim(), filter)}
        />
      )}

      {waTarget && (
        <NewConversationModal
          user={user}
          initialOrder={waTarget}
          initialPhone={waTarget.clientPhone}
          initialName={waTarget.clientName || ''}
          onClose={() => setWaTarget(null)}
          onSent={async () => { await recordDevisEnvoi(waTarget.name, waTarget.clientPhone, user?.id); reloadEnvois(); setWaTarget(null) }}
        />
      )}
    </div>
  )
}

// TOUTES les photos (cake design) d'une commande, en bande sous la carte.
// Chargées en LAZY (quand la carte devient visible) pour ne pas alourdir la liste.
// Triées de l'ancienne → la plus récente ; les photos ajoutées il y a < 3 j sont marquées 🆕.
function CardPhotos({ orderId, hasPhoto, onOpen }) {
  const ref = useRef(null)
  const [vis, setVis] = useState(false)
  const [photos, setPhotos] = useState(null)
  useEffect(() => {
    const el = ref.current; if (!el || hasPhoto === false) return
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { setVis(true); io.disconnect() } }, { rootMargin: '250px' })
    io.observe(el); return () => io.disconnect()
  }, [hasPhoto])
  useEffect(() => {
    if (!vis) return
    let on = true
    loadDevisPhotos(orderId).then(ph => { if (on) setPhotos(ph || []) }).catch(() => { if (on) setPhotos([]) })
    return () => { on = false }
  }, [vis, orderId])
  if (hasPhoto === false) return null
  const recent = ts => { if (!ts) return false; return Date.now() - new Date(String(ts).replace(' ', 'T') + 'Z').getTime() < 3 * 86400000 }
  return (
    <div ref={ref} className="mt-3">
      {photos === null ? <div className="text-[11px] text-ink-mute">📷 …</div>
        : photos.length === 0 ? null
        : (
          <div className="flex flex-wrap gap-1.5">
            {photos.map((p, i) => (
              <button key={i} type="button" onClick={onOpen} title="Voir en grand"
                className="relative w-[54px] h-[54px] rounded-lg overflow-hidden border border-line hover:outline hover:outline-2 hover:outline-bordeaux flex-shrink-0">
                <img src={p.dataUrl} alt={p.name || 'photo'} className="w-full h-full object-cover" />
                {recent(p.create_date) && <span className="absolute bottom-0 inset-x-0 text-[8px] font-bold text-white text-center bg-emerald-600/90 leading-tight">🆕</span>}
              </button>
            ))}
          </div>
        )}
    </div>
  )
}

// Photo(s) d'une commande en plein écran. Tape n'importe où pour fermer.
function PhotoLightbox({ orderId, onClose }) {
  const [photos, setPhotos] = useState(null)
  useEffect(() => {
    loadDevisPhotos(orderId).then(p => setPhotos(p || [])).catch(() => setPhotos([]))
  }, [orderId])
  return (
    <div className="fixed inset-0 z-[140] bg-black/90 flex items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <button onClick={onClose} className="fixed top-4 right-5 text-white/90 text-[30px] leading-none">✕</button>
      {photos === null ? (
        <div className="text-white/70 text-[14px]">Chargement…</div>
      ) : photos.length === 0 ? (
        <div className="text-white/70 text-[14px]">Aucune photo</div>
      ) : (
        <div className="flex flex-col items-center gap-3 my-auto">
          {photos.map((p, i) => (
            <img key={i} src={p.dataUrl} alt={p.name || 'photo'} className="max-w-full max-h-[92vh] object-contain rounded-lg" />
          ))}
        </div>
      )}
    </div>
  )
}

