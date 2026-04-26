import { useEffect, useState, useMemo } from 'react'
import GmFicheModal from './GmFicheModal'
import { detectTypeFromName, TYPE_EMOJIS, loadFichesForOrder } from '../lib/gmFiches'
import { loadDoneByItemIds, markItemDone, unmarkItemDone } from '../lib/gmDone'
import { loadPalette } from '../lib/palette'
import PrintCommande from './PrintCommande'
import { markOrderPrinted } from '../lib/printOrders'
import { computeSizesForCake } from '../lib/cakeSizes'
import {
  markWarningAsRead,
  loadItemSteps,
  checkItemStep,
  uncheckItemStep,
  updateItemPolys,
  deleteOrder,
  getPolyValue,
  getPolyInfo,
} from '../lib/orders'
import {
  canEditPolys,
  canUncheckSteps,
  canDeleteOrder,
  formatRelativeTime,
} from '../lib/auth'

const DAY_NAMES_FULL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

const POLYS_VALUES = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5']





function formatDeliveryDate(date) {
  const d = new Date(date)
  const day = DAY_NAMES_FULL[d.getDay()]
  const num = d.getDate()
  const month = MONTH_NAMES[d.getMonth()]
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${num} ${month} · ${hh}h${mm}`
}

const SEQUENTIAL_STEPS = {
  CD: ['couvert', 'fini', 'range'],
  GM: ['fait', 'range'],
}

const STEP_LABELS = {
  deco: 'Déco',
  couvert: 'Couvert',
  fini: 'Fini',
  fait: 'Fait',
  range: 'Rangé',
}

function extractShortName(title, type) {
  if (!title) return type || ''
  let name = title.trim()

  if (type === 'GM') {
    // Pour GM : on garde "(boite de X)" mais on retire le reste de la parenthese
    // Ex : "Sablés boite de 24 (Grand)" -> "Sablés (boite de 24)"
    // Ex : "Cake pops (boite de 12, Mixte)" -> "Cake pops (boite de 12)"

    // Extraire boite de X
    const boiteMatch = name.match(/boite\s+de\s+(\d+)/i)
    const boiteStr = boiteMatch ? `(boite de ${boiteMatch[1]})` : ''

    // Retirer toute la parenthese
    const parenIdx = name.indexOf('(')
    if (parenIdx > 0) name = name.substring(0, parenIdx).trim()

    // Retirer "boite de X" du nom (si pas dans la parenthese)
    name = name.replace(/\s+boite\s+de\s+\d+.*$/i, '').trim()

    return (name + (boiteStr ? ' ' + boiteStr : '')).toUpperCase()
  }

  // Pour CD : on retire la parenthese et "boite de X"
  const parenIdx = name.indexOf('(')
  if (parenIdx > 0) name = name.substring(0, parenIdx).trim()
  name = name.replace(/\s+boite\s+de\s+\d+.*$/i, '').trim()
  if (type === 'CD') {
    name = name.replace(/\s+\d+\s*étages?\s*$/i, '').trim()
  }
  return name.toUpperCase()
}

function getProfileShortName(profiles, userId) {
  if (!userId || !profiles) return null
  const p = profiles[userId]
  if (!p) return null
  return p.full_name || p.username || null
}

// Construit l'historique complet d'une commande (steps + polys)
function buildHistory(order, checkedSteps, polysMap, profiles) {
  const events = []
  const items = order.order_items || []

  // 1) Events des étapes cochées
  for (const item of items) {
    const shortName = extractShortName(item.title, item.type)
    for (const stepKey of Object.keys(STEP_LABELS)) {
      const info = checkedSteps[`${item.id}_${stepKey}`]
      if (info && info.done_at) {
        events.push({
          date: info.done_at,
          userName: getProfileShortName(profiles, info.done_by),
          label: `${STEP_LABELS[stepKey]} validé`,
          context: shortName,
        })
      }
    }
  }

  // 2) Events des polys
  for (const item of items) {
    const shortName = extractShortName(item.title, item.type)
    const polys = polysMap[item.id] || {}
    for (const etageKey of Object.keys(polys)) {
      const info = polys[etageKey]
      if (info && typeof info === 'object' && info.done_at) {
        const etageNum = etageKey.replace('etage', '')
        events.push({
          date: info.done_at,
          userName: getProfileShortName(profiles, info.done_by),
          label: `Poly Étage ${etageNum} : ${info.value}`,
          context: shortName,
        })
      }
    }
  }

  // Tri : plus récent en haut
  events.sort((a, b) => new Date(b.date) - new Date(a.date))
  return events
}

export default function OrderModal({ order, focusItemId, dayOrders, onNavigate, isPatissierMode, onClose, user, profiles, onStepsChanged, onPolysChanged, onOrderDeleted }) {

  // Raccourcis clavier : fleches gauche/droite pour naviguer entre commandes du jour
  useEffect(() => {
    if (!dayOrders || dayOrders.length <= 1 || !onNavigate) return
    const handler = (e) => {
      // Ignorer si focus dans input/textarea/select
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      const idx = dayOrders.findIndex(o => o.id === order.id)
      if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault()
        onNavigate(dayOrders[idx - 1])
      } else if (e.key === 'ArrowRight' && idx >= 0 && idx < dayOrders.length - 1) {
        e.preventDefault()
        onNavigate(dayOrders[idx + 1])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [dayOrders, order.id, onNavigate])
  const [zoomUrl, setZoomUrl] = useState(null)
  const [ficheItem, setFicheItem] = useState(null)

  async function handleToggleDone(itemId) {
    if (!user?.id) return
    try {
      if (doneByItemId[itemId]) {
        await unmarkItemDone(itemId)
        setDoneByItemId(prev => {
          const copy = { ...prev }
          delete copy[itemId]
          return copy
        })
      } else {
        const d = await markItemDone(itemId, user.id)
        setDoneByItemId(prev => ({ ...prev, [itemId]: d }))
      }
    } catch (e) {
      console.error('[done] erreur:', e)
      alert('Erreur : ' + e.message)
    }
  }

  async function handlePrint() {
    if (printing) return
    setPrinting(true)
    // Attendre 1 frame pour que le composant PrintCommande soit monte dans le DOM
    await new Promise(r => requestAnimationFrame(r))
    // Lancer l'impression
    window.print()
    // Marquer comme imprime apres l'impression (fenetre fermee)
    try {
      if (user?.id) {
        await markOrderPrinted(order.id, user.id)
      }
    } catch (e) {
      console.error('[print] erreur marquage:', e)
    }
    setPrinting(false)
  }
  const [fichesByItemId, setFichesByItemId] = useState({})
  const [doneByItemId, setDoneByItemId] = useState({})
  const [palette, setPalette] = useState([])
  const [printing, setPrinting] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!order?.id) return
    loadFichesForOrder(order.id).then(fiches => {
      if (cancelled) return
      const map = {}
      for (const f of fiches) map[f.order_item_id] = f
      setFichesByItemId(map)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [order?.id, ficheItem])

  useEffect(() => {
    if (!order?.id) return
    const itemIds = (order.order_items || []).map(i => i.id)
    if (itemIds.length === 0) return
    loadDoneByItemIds(itemIds).then(map => setDoneByItemId(map)).catch(() => {})
  }, [order?.id])

  useEffect(() => {
    loadPalette().then(p => setPalette(p)).catch(() => {})
  }, [])
  const [readThisSession, setReadThisSession] = useState(new Set())
  const [checkedSteps, setCheckedSteps] = useState({})
  const [loadingSteps, setLoadingSteps] = useState(true)
  const [polysMap, setPolysMap] = useState({})
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const canEdit = canEditPolys(user)
  const canUncheck = canUncheckSteps(user)
  const canDelete = canDeleteOrder(user)

  const sharedPhotos = useMemo(() => {
    if (!order) return []
    const items = order.order_items || []
    const all = []
    for (const item of items) {
      if (Array.isArray(item.image_urls)) {
        for (const url of item.image_urls) {
          if (!all.includes(url)) all.push(url)
        }
      }
    }
    return all
  }, [order])

  useEffect(() => {
    if (!order) return
    const itemIds = (order.order_items || []).map(i => i.id)
    setLoadingSteps(true)
    loadItemSteps(itemIds).then(steps => {
      setCheckedSteps(steps)
      setLoadingSteps(false)
    })
    const initialPolys = {}
    for (const item of order.order_items || []) {
      initialPolys[item.id] = item.polys && typeof item.polys === 'object' ? item.polys : {}
    }
    setPolysMap(initialPolys)
    setConfirmingDelete(false)
  }, [order])

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        if (zoomUrl) setZoomUrl(null)
        else onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose, zoomUrl])

  // Historique recalculé à chaque changement
  const history = useMemo(() => {
    if (!order) return []
    return buildHistory(order, checkedSteps, polysMap, profiles)
  }, [order, checkedSteps, polysMap, profiles])

  if (!order) return null

  async function handleMarkWarningAsRead(itemId) {
    setReadThisSession(prev => {
      const next = new Set(prev)
      next.add(itemId)
      return next
    })
    await markWarningAsRead(itemId, user.id)
  }

  function isStepChecked(itemId, stepKey) {
    return !!checkedSteps[`${itemId}_${stepKey}`]
  }

  function notifyParent(itemId, stepKey, checked) {
    if (onStepsChanged) onStepsChanged(itemId, stepKey, checked, user.id)
  }

  async function handleStepClick(item, stepKey) {
    const key = `${item.id}_${stepKey}`
    const alreadyChecked = isStepChecked(item.id, stepKey)

    if (alreadyChecked) {
      if (!canUncheck) {
        alert('Vous n\'avez pas la permission de décocher une étape.')
        return
      }

      if (stepKey !== 'deco') {
        const sequence = SEQUENTIAL_STEPS[item.type] || []
        const idx = sequence.indexOf(stepKey)
        if (idx >= 0) {
          const nextCheckedStep = sequence
            .slice(idx + 1)
            .find(s => isStepChecked(item.id, s))
          if (nextCheckedStep) {
            alert(`Décochez d'abord "${STEP_LABELS[nextCheckedStep]}" avant de décocher cette étape.`)
            return
          }
        }
      }

      setCheckedSteps(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      const ok = await uncheckItemStep(item.id, stepKey)
      if (!ok) {
        setCheckedSteps(prev => ({ ...prev, [key]: { done_by: user.id, done_at: new Date().toISOString() } }))
        alert('Erreur lors du décochage')
        return
      }
      notifyParent(item.id, stepKey, false)
      return
    }

    if (stepKey !== 'deco') {
      const sequence = SEQUENTIAL_STEPS[item.type] || []
      const idx = sequence.indexOf(stepKey)
      if (idx > 0) {
        const previousStep = sequence[idx - 1]
        if (!isStepChecked(item.id, previousStep)) {
          alert(`Cochez d'abord "${STEP_LABELS[previousStep]}" avant de cocher cette étape.`)
          return
        }
      }
    }

    setCheckedSteps(prev => ({
      ...prev,
      [key]: { done_by: user.id, done_at: new Date().toISOString() },
    }))
    const ok = await checkItemStep(item.id, stepKey, user.id)
    if (!ok) {
      setCheckedSteps(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      alert('Erreur lors du cochage')
      return
    }
    notifyParent(item.id, stepKey, true)
  }

  async function handlePolyClick(item, etageKey, value) {
    if (!canEdit) return
    const currentPolys = polysMap[item.id] || {}
    const currentValue = getPolyValue(currentPolys, etageKey)
    const alreadySelected = currentValue === value
    const newPolys = { ...currentPolys }

    if (alreadySelected) {
      delete newPolys[etageKey]
    } else {
      newPolys[etageKey] = {
        value,
        done_by: user.id,
        done_at: new Date().toISOString(),
      }
    }

    const oldPolys = polysMap[item.id] || {}
    setPolysMap(prev => ({ ...prev, [item.id]: newPolys }))

    const ok = await updateItemPolys(item.id, newPolys)
    if (!ok) {
      setPolysMap(prev => ({ ...prev, [item.id]: oldPolys }))
      alert('Erreur lors de la sauvegarde des polys')
      return
    }

    if (onPolysChanged) onPolysChanged(item.id, newPolys)
  }

  async function handleConfirmDelete() {
    setDeleting(true)
    const ok = await deleteOrder(order.id)
    setDeleting(false)
    if (!ok) {
      alert('Erreur lors de la suppression')
      return
    }
    if (onOrderDeleted) onOrderDeleted(order.id)
  }

  let displayedItems = []
  if (focusItemId) {
    const focus = (order.order_items || []).find(i => i.id === focusItemId)
    if (focus) displayedItems = [focus]
  } else {
    const cdItems = order.order_items.filter(i => i.type === 'CD').sort((a, b) => a.item_idx - b.item_idx)
    const gmItems = order.order_items.filter(i => i.type === 'GM').sort((a, b) => a.item_idx - b.item_idx)
    displayedItems = isPatissierMode ? [...gmItems] : [...cdItems, ...gmItems]
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      >
        <div
          className="bg-cream rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl border border-line"
          onClick={e => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-start justify-between gap-4 z-10">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-semibold mb-1">
                {order.order_num}
              </div>
              <div className={`font-fraunces italic text-[22px] font-medium text-ink leading-tight truncate ${order.odoo_state === 'cancel' ? 'line-through' : ''}`}>
                {isPatissierMode ? `Commande ${order.order_num}` : (order.client_name || '—')}
              </div>
              {(order.odoo_state === 'cancel' || order.modified_at) && (
                <div className="flex gap-1.5 mt-1.5">
                  {order.odoo_state === 'cancel' && (
                    <span className="text-[9px] font-bold text-cream bg-ink-mute px-1.5 py-0.5 rounded tracking-wider uppercase">
                      Annulé
                    </span>
                  )}
                  {order.odoo_state !== 'cancel' && order.modified_at && (
                    <span className="text-[9px] font-bold text-cream bg-gold px-1.5 py-0.5 rounded tracking-wider uppercase">
                      Modifié
                    </span>
                  )}
                </div>
              )}
              <div className="font-mono text-[10px] tracking-wider text-ink-soft mt-1.5 capitalize">
                {formatDeliveryDate(order.delivery_at)}
              </div>
              {order.seller_name && (
                <div className="text-[10px] text-ink-mute mt-0.5">
                  Vendeur : {order.seller_name}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {dayOrders && dayOrders.length > 1 && (() => {
                const idx = dayOrders.findIndex(o => o.id === order.id)
                const prev = idx > 0 ? dayOrders[idx - 1] : null
                const next = idx >= 0 && idx < dayOrders.length - 1 ? dayOrders[idx + 1] : null
                return (
                  <>
                    <button
                      onClick={() => prev && onNavigate && onNavigate(prev)}
                      disabled={!prev}
                      className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-mute disabled:hover:border-line disabled:cursor-not-allowed flex items-center justify-center transition-all"
                      title={prev ? `Commande precedente (${prev.order_num})` : 'Premiere commande du jour'}
                    >
                      ‹
                    </button>
                    <span className="font-mono text-[10px] text-ink-mute tabular-nums px-1">
                      {idx + 1}/{dayOrders.length}
                    </span>
                    <button
                      onClick={() => next && onNavigate && onNavigate(next)}
                      disabled={!next}
                      className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-mute disabled:hover:border-line disabled:cursor-not-allowed flex items-center justify-center transition-all"
                      title={next ? `Commande suivante (${next.order_num})` : 'Derniere commande du jour'}
                    >
                      ›
                    </button>
                  </>
                )
              })()}
              {!isPatissierMode && (
                <button
                  onClick={handlePrint}
                  disabled={printing}
                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all flex-shrink-0 ${
                    order.printed_at
                      ? 'border-ok text-ok hover:bg-ok hover:text-cream'
                      : 'border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux'
                  } disabled:opacity-50`}
                  title={order.printed_at ? `Deja imprime · cliquer pour reimprimer` : 'Imprimer la fiche'}
                >
                  {printing ? '⏳' : (order.printed_at ? '🖨️' : '🖨️')}
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
                title="Fermer"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="px-6 py-5 space-y-6">
            {displayedItems.map((item, idx) => (
              <ItemBlock
                key={item.id}
                item={item}
                sharedPhotos={sharedPhotos}
                isLast={idx === displayedItems.length - 1}
                onPhotoClick={setZoomUrl}
                isReadThisSession={readThisSession.has(item.id)}
                onMarkRead={handleMarkWarningAsRead}
                isStepChecked={isStepChecked}
                onStepClick={handleStepClick}
                loadingSteps={loadingSteps}
                canEdit={canEdit}
                itemPolys={polysMap[item.id] || {}}
                onPolyClick={handlePolyClick}
                hasFiche={!!fichesByItemId[item.id]}
                onOpenFiche={() => setFicheItem(item)}
                isPatissierMode={isPatissierMode}
                isDone={!!doneByItemId[item.id]}
                onToggleDone={() => handleToggleDone(item.id)}
                fiche={fichesByItemId[item.id] || null}
                palette={palette}
              />
            ))}

            {displayedItems.length === 0 && (
              <div className="text-center text-ink-mute italic py-8">
                Aucun produit à afficher
              </div>
            )}

            {/* HISTORIQUE */}
            {history.length > 0 && (
              <div className="pt-4 mt-2 border-t border-dashed border-line">
                <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute font-semibold mb-3">
                  Historique
                </div>
                <div className="space-y-1.5">
                  {history.map((ev, i) => (
                    <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                      <span className="text-bordeaux mt-0.5">•</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-ink">{ev.label}</span>
                        {ev.context && (
                          <span className="text-ink-mute"> · {ev.context}</span>
                        )}
                        <span className="text-ink-mute font-mono">
                          {' — '}
                          {ev.userName || 'inconnu'} · {formatRelativeTime(ev.date)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {canDelete && !focusItemId && !isPatissierMode && (
              <div className="pt-4 mt-2 border-t border-dashed border-line">
                {!confirmingDelete ? (
                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="w-full px-4 py-2.5 text-[11px] font-medium tracking-wider uppercase text-bordeaux border border-bordeaux rounded-lg hover:bg-bordeaux hover:text-cream transition-all"
                  >
                    ❌ Annuler cette commande
                  </button>
                ) : (
                  <div className="rounded-lg border border-bordeaux bg-bordeaux/5 p-3">
                    <div className="text-[13px] text-ink mb-3 leading-snug">
                      Supprimer définitivement la commande <span className="font-mono text-bordeaux font-semibold">{order.order_num}</span> ?
                      <br />
                      <span className="text-[11px] text-ink-mute italic">Cette action est irréversible (photos + données supprimées).</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmingDelete(false)}
                        disabled={deleting}
                        className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm transition-all disabled:opacity-50"
                      >
                        Non, garder
                      </button>
                      <button
                        onClick={handleConfirmDelete}
                        disabled={deleting}
                        className="flex-1 px-3 py-2 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all disabled:opacity-50 disabled:cursor-wait"
                      >
                        {deleting ? '⏳ Suppression...' : 'Oui, supprimer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {zoomUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-ink/90 animate-fadeIn cursor-zoom-out"
          onClick={() => setZoomUrl(null)}
        >
          <img
            src={zoomUrl}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
          />
          <button
            onClick={() => setZoomUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-cream/90 text-ink hover:bg-cream flex items-center justify-center transition-all"
            title="Fermer"
          >
            ✕
          </button>
        </div>
      )}

      {printing && (
        <PrintCommande
          orders={[order]}
          fichesByItemId={fichesByItemId}
          palette={palette}
        />
      )}

      {ficheItem && (
        <GmFicheModal
          item={ficheItem}
          onClose={() => setFicheItem(null)}
          onSaved={() => {
            // Pas de refresh necessaire pour l'instant
          }}
        />
      )}
    </>
  )
}

function ItemBlock({
  item, sharedPhotos, isLast, onPhotoClick,
  isReadThisSession, onMarkRead,
  isStepChecked, onStepClick, loadingSteps,
  canEdit, itemPolys, onPolyClick,
  hasFiche, onOpenFiche,
  isPatissierMode, isDone, onToggleDone, fiche, palette
}) {
  const isCD = item.type === 'CD'
  const warningText = (() => {
    const w = item.warnings
    if (!w) return null
    if (typeof w === 'string') return w
    if (Array.isArray(w)) {
      return w.map(x => typeof x === 'string' ? x : (x?.text || '')).filter(Boolean).join('\n\n') || null
    }
    if (typeof w === 'object' && w.text) return w.text
    return null
  })()
  const photos = Array.isArray(sharedPhotos) ? sharedPhotos : []

  const photosBlurred = !!warningText && !isReadThisSession

  const steps = isCD
    ? ['deco', 'couvert', 'fini', 'range']
    : ['deco', 'fait', 'range']

  const parfumsArray = Array.isArray(item.parfums) ? item.parfums : []
  const parfumsText = parfumsArray.length > 0 ? parfumsArray.join(', ') : null

  const shortName = extractShortName(item.title, item.type)

  const sizeLabel = (() => {
    const parts = []
    if (item.etages_count) {
      parts.push(`${item.etages_count} étage${item.etages_count > 1 ? 's' : ''}`)
    }
    if (item.pers) {
      // Pour les GM : si pers vient d'une "boite de N" -> on dit "boîte de N"
      if (!isCD) {
        parts.push(`boîte de ${item.pers}`)
      } else {
        parts.push(`${item.pers} pers`)
      }
    }
    if (item.taille_value && !item.pers) {
      parts.push(item.taille_value)
    }
    return parts.length > 0 ? parts.join(' · ') : null
  })()

  const etagesCount = Math.max(1, item.etages_count || 1)

  const sizesPerEtage = isCD ? computeSizesForCake(item.pers, etagesCount) : null

  return (
    <div className={`${!isLast ? 'pb-6 border-b border-dashed border-line' : ''} ${isPatissierMode && isDone ? 'opacity-50' : ''}`}>

      {warningText && (
        <div className="mb-4 rounded-lg border border-bordeaux bg-bordeaux/5 p-3">
          <div className="flex items-start gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-bordeaux text-cream text-[11px] font-bold flex-shrink-0 mt-0.5">
              !
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-bordeaux font-semibold mb-1">
                Avertissement
              </div>
              <div className="text-[13px] text-ink leading-snug">
                {warningText}
              </div>
              <div className="mt-3">
                {isReadThisSession ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ok">
                    <span className="w-4 h-4 rounded-full bg-ok text-cream flex items-center justify-center text-[9px]">✓</span>
                    Lu
                  </span>
                ) : (
                  <button
                    onClick={() => onMarkRead(item.id)}
                    className="px-4 py-1.5 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[11px] font-medium tracking-wider uppercase transition-all active:scale-[0.98]"
                  >
                    J'ai lu
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div className="mb-4">
          <div className="text-[10px] font-mono tracking-[0.15em] uppercase text-ink-mute mb-2 flex items-center gap-2">
            <span>Photos ({photos.length})</span>
            {photosBlurred && (
              <span className="text-bordeaux normal-case tracking-normal text-[10px] font-sans">
                — cliquez « J'ai lu » pour afficher
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((url, i) => (
              <button
                key={i}
                onClick={() => !photosBlurred && onPhotoClick(url)}
                disabled={photosBlurred}
                className={`aspect-square rounded-lg overflow-hidden bg-cream-warm border border-line/60 transition-all group ${
                  photosBlurred ? 'cursor-not-allowed' : 'hover:border-bordeaux cursor-zoom-in'
                }`}
                title={photosBlurred ? "Cliquez « J'ai lu » pour afficher la photo" : 'Agrandir'}
              >
                <img
                  src={url}
                  alt=""
                  className={`w-full h-full object-cover transition-all ${
                    photosBlurred ? 'blur-lg scale-110' : 'group-hover:scale-105'
                  }`}
                  loading="lazy"
                  onError={(e) => {
                    e.currentTarget.parentElement.style.display = 'none'
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">

        {isCD ? (
          <span className="font-fraunces italic text-[22px] font-semibold tracking-wide text-bordeaux">
            <span className="text-ink font-sans not-italic mr-2">×{item.quantity || 1}</span>
            {shortName}
            {item.pers && (
              <span className="text-ink font-sans not-italic ml-3 text-[16px] font-semibold">
                {item.pers} pers{etagesCount > 1 ? ` · ${etagesCount} etages` : ''}
              </span>
            )}
          </span>
        ) : (
          <button
            onClick={() => onOpenFiche && onOpenFiche()}
            className="text-left group flex items-baseline gap-2 hover:opacity-75 transition-opacity"
            title={hasFiche ? "Modifier la fiche patissier" : "Definir la fiche patissier"}
          >
            <span className="font-fraunces italic text-[22px] font-semibold tracking-wide text-chocolate group-hover:underline">
              <span className="text-ink font-sans not-italic mr-2">×{item.quantity || 1}</span>
              {shortName}
            </span>
            {hasFiche ? (
              <span className="text-[9px] font-bold tracking-wider uppercase bg-ok/15 text-ok px-1.5 py-0.5 rounded">
                ✓ Fiche
              </span>
            ) : (
              <span className="text-[9px] font-bold tracking-wider uppercase bg-bordeaux/10 text-bordeaux px-1.5 py-0.5 rounded">
                À définir
              </span>
            )}
          </button>
        )}

        {/* sizeLabel masque - taille affichee plus bas */}
      </div>

      {isPatissierMode && !isCD && fiche && (
        <FichePatissierDetails fiche={fiche} palette={palette} />
      )}

      {isPatissierMode && !isCD && !fiche && (
        <div className="mb-3 rounded-lg bg-bordeaux/10 border border-bordeaux/30 p-2 text-[11px] text-bordeaux">
          Fiche a definir par l'admin
        </div>
      )}

      {parfumsText && !isCD && (
        <div className="text-[14px] text-ink leading-snug mb-1">
          <span className="text-ink-mute">Parfums :</span> {parfumsText}
        </div>
      )}

      {!isCD && sizeLabel && (
        <div className="text-[14px] text-ink leading-snug mb-3">
          <span className="text-ink-mute">Taille :</span> {sizeLabel}
        </div>
      )}

      {isCD && sizesPerEtage && (
        <div className="mb-3 space-y-1">
          {sizesPerEtage.map((cm, i) => {
            const parfum = parfumsArray[i] || null
            return (
              <div key={i} className="text-[15px]">
                <span className="font-semibold text-bordeaux">
                  {etagesCount > 1 ? `Etage ${i + 1} : ` : ''}{cm} cm
                </span>
                {parfum && (
                  <span className="italic text-ink-soft"> · {parfum}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isCD && item.pers && !sizesPerEtage && (
        <div className="mb-3 rounded-lg bg-bordeaux/5 border border-bordeaux/30 p-2 text-[11px] text-bordeaux italic">
          ⚠ Tailles non trouvées ({item.pers} pers · {etagesCount} étage{etagesCount > 1 ? 's' : ''})
        </div>
      )}

      {isCD && (
        <>
          <div className="border-t border-dashed border-line my-4"></div>
          <div className="mb-3">
            <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute font-semibold mb-3">
              Polys
            </div>
            <div className="space-y-2">
              {Array.from({ length: etagesCount }).map((_, etageIdx) => {
                const etageKey = `etage${etageIdx + 1}`
                const selectedValue = getPolyValue(itemPolys, etageKey)
                return (
                  <div key={etageKey} className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-[11px] text-bordeaux font-semibold min-w-[58px] tracking-wider">
                      Étage {etageIdx + 1}
                    </span>
                    <div className="flex gap-1.5">
                      {POLYS_VALUES.map(val => (
                        <PolysButton
                          key={val}
                          value={val}
                          selected={selectedValue === val}
                          canEdit={canEdit}
                          onClick={() => onPolyClick(item, etageKey, val)}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {isCD && (
        <>
          <div className="border-t border-dashed border-line my-4"></div>
          <div className="space-y-2.5 mb-4">
            <InfoRow label="Thème" value={item.theme || '—'} />
            <InfoRow label="Âge" value={item.age || '—'} />
            <InfoRow label="Message" value={item.message || '—'} />
          </div>
        </>
      )}

      {isPatissierMode && !isCD && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={onToggleDone}
            className={`px-5 py-2 rounded-full text-[12px] font-medium tracking-wider transition-all flex items-center gap-2 ${
              isDone
                ? 'bg-ok text-cream hover:bg-ok-deep'
                : 'border-2 border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream active:scale-95'
            }`}
            title={isDone ? 'Cliquer pour annuler' : 'Marquer comme fait'}
          >
            {isDone ? '✓ Fait' : 'Marquer fait'}
          </button>
        </div>
      )}

      {!isPatissierMode && (
        <div className="flex flex-wrap gap-2 mt-4">
          {steps.map(step => {
            const checked = isStepChecked(item.id, step)
            return (
              <StepBadge
                key={step}
                label={STEP_LABELS[step]}
                checked={checked}
                onClick={() => onStepClick(item, step)}
                disabled={loadingSteps}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex gap-3 leading-snug">
      <span className="text-[13px] text-ink-mute min-w-[70px] font-medium">{label} :</span>
      <span className="text-[14px] text-ink flex-1">{value}</span>
    </div>
  )
}

function StepBadge({ label, checked, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wider border transition-all ${
        disabled ? 'opacity-50 cursor-wait' : 'cursor-pointer active:scale-[0.97]'
      } ${
        checked
          ? 'bg-ok/15 text-ok border-ok/30 hover:bg-ok/20'
          : 'bg-cream border-line text-ink-soft hover:border-bordeaux hover:text-bordeaux'
      }`}
    >
      <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
        checked ? 'bg-ok border-ok' : 'border-ink-mute'
      }`}>
        {checked && <span className="text-[9px] text-cream leading-none font-bold">✓</span>}
      </span>
      {label}
    </button>
  )
}

function PolysButton({ value, selected, canEdit, onClick }) {
  const baseClasses = 'w-9 h-9 rounded-full text-[11px] font-mono font-semibold transition-all flex items-center justify-center'

  if (!canEdit) {
    return (
      <div
        className={`${baseClasses} ${
          selected
            ? 'bg-bordeaux text-cream'
            : 'bg-cream border border-line text-ink-soft'
        }`}
        title="Lecture seule"
      >
        {value}
      </div>
    )
  }

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} cursor-pointer active:scale-[0.95] ${
        selected
          ? 'bg-bordeaux text-cream shadow-sm hover:bg-bordeaux-deep'
          : 'bg-cream border border-line text-ink-soft hover:border-bordeaux hover:text-bordeaux'
      }`}
    >
      {value}
    </button>
  )
}


// ============================================================
// Composant : details de la fiche patissier (vue en lecture)
// ============================================================
function FichePatissierDetails({ fiche, palette }) {
  if (!fiche) return null

  // Resoudre les IDs de couleurs vers {nom, hex}
  const resolveColors = (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) return []
    return ids.map(id => {
      if (typeof id === 'object' && id?.hex) return id
      const c = palette.find(p => p.id === id)
      return c || null
    }).filter(Boolean)
  }

  const couleurs = resolveColors(fiche.couleurs || [])
  const zigzagCouleurs = resolveColors(fiche.zigzag_couleurs || [])
  const decos = Array.isArray(fiche.decos) ? fiche.decos : []

  const TYPE_LABELS = {
    cupcake: 'Cupcakes',
    cakepop: 'Cakepops',
    donut: 'Donuts',
    magnum: 'Magnums',
    sable: 'Sables',
  }

  function dimensionLabel() {
    if (fiche.type_gm !== 'sable') return null
    const f = fiche.forme
    const t = fiche.taille
    if (!f || !t) return null
    if (f === 'rond')      return t === 'mini' ? '5 cm' : '7 cm'
    if (f === 'carre')     return t === 'mini' ? '4×4 cm' : '6×6 cm'
    if (f === 'decoupoir') return ''
    return t === 'mini' ? 'Mini' : 'Grand'
  }

  return (
    <div className="mb-3 rounded-lg bg-cream-warm border border-line/60 p-3 space-y-2 text-[12px]">

      {fiche.taille && fiche.type_gm !== 'sable' && (
        <div className="flex gap-2">
          <span className="text-ink-mute uppercase tracking-wider text-[9px] font-semibold w-16">Taille</span>
          <span className="text-ink font-medium capitalize">{fiche.taille}</span>
        </div>
      )}

      {fiche.type_gm === 'sable' && (
        <>
          {fiche.forme && (
            <div className="flex gap-2">
              <span className="text-ink-mute uppercase tracking-wider text-[9px] font-semibold w-16">Forme</span>
              <span className="text-ink font-medium capitalize">
                {fiche.forme}
                {dimensionLabel() && <span className="text-ink-soft"> · {dimensionLabel()}</span>}
              </span>
            </div>
          )}
          {fiche.bord && (
            <div className="flex gap-2">
              <span className="text-ink-mute uppercase tracking-wider text-[9px] font-semibold w-16">Bord</span>
              <span className="text-ink font-medium capitalize">{fiche.bord}</span>
            </div>
          )}
        </>
      )}

      {couleurs.length > 0 && (
        <div className="flex gap-2 items-start">
          <span className="text-ink-mute uppercase tracking-wider text-[9px] font-semibold w-16 pt-0.5">Couleurs</span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {couleurs.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1 bg-white rounded px-1.5 py-0.5 border border-line">
                <span className="w-3 h-3 rounded-full border border-line" style={{ background: c.hex }}></span>
                <span className="text-ink text-[11px]">{c.nom}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {fiche.voir_couleur_gateau && (
        <div className="flex gap-2">
          <span className="text-ink-mute uppercase tracking-wider text-[9px] font-semibold w-16">Aussi</span>
          <span className="text-ink-soft italic">✦ Voir couleur gateau (idem CD)</span>
        </div>
      )}

      {fiche.zigzag_mode && fiche.zigzag_mode !== 'pas' && (
        <div className="flex gap-2 items-start">
          <span className="text-ink-mute uppercase tracking-wider text-[9px] font-semibold w-16 pt-0.5">Zigzag</span>
          <div className="flex-1">
            {fiche.zigzag_mode === 'meme' && <span className="text-ink">Meme couleur</span>}
            {fiche.zigzag_mode === 'differente' && (
              <div className="flex flex-wrap gap-1.5">
                <span className="text-ink">Different :</span>
                {zigzagCouleurs.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-white rounded px-1.5 py-0.5 border border-line">
                    <span className="w-3 h-3 rounded-full border border-line" style={{ background: c.hex }}></span>
                    <span className="text-ink text-[11px]">{c.nom}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {decos.length > 0 && (
        <div className="flex gap-2">
          <span className="text-ink-mute uppercase tracking-wider text-[9px] font-semibold w-16">Deco</span>
          <span className="text-ink">{decos.join(' · ')}</span>
        </div>
      )}

    </div>
  )
}
