import { useState, useEffect, useMemo, useRef } from 'react'
import {
  loadOrdersWithFichesForRange, loadPalette, findColor,
  isLotDone, isItemFullyDone, aggregateByProduct,
  markLotDone, unmarkLotDone, markItemAllDone, unmarkItemAllDone,
  TYPE_LABELS, TYPE_EMOJIS,
  getRealQuantity, loadGmLogs,
} from '../lib/gmFiches'
import { toast } from '../lib/toast'
import AppHeader from './AppHeader'
import ActivityLog, { relativeTime } from './ActivityLog'
import OrderModal from './OrderModal'
import { loadFullOrderByNum, loadAllProfiles } from '../lib/orders'
import { canSeeCalendar } from '../lib/auth'
import { Printer, FileText, AlertTriangle } from 'lucide-react'

const DAYS = 14

export default function PatissierView({ user, onLogout, onNavigate, activeView }) {
  const [data, setData] = useState([])  // [{order, items: [{item, fiche, dones}]}]
  const [palette, setPalette] = useState([])
  const [loading, setLoading] = useState(true)
  const [tabsByDate, setTabsByDate] = useState({})    // 'todo' | 'done' par date
  const [viewMode, setViewMode] = useState('client')  // 'client' | 'product'
  const [printDate, setPrintDate] = useState(null)
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const [expandedKey, setExpandedKey] = useState(null)
  // Détail commande (fiche OrderModal) — réservé à ceux qui peuvent voir le calendrier.
  const canDetails = canSeeCalendar(user)
  const [modalOrder, setModalOrder] = useState(null)
  const [profiles, setProfiles] = useState({})
  const openOrderDetail = async (orderNum) => {
    if (!orderNum) return
    try {
      const [ord, profs] = await Promise.all([loadFullOrderByNum(orderNum), loadAllProfiles()])
      setProfiles(profs || {})
      if (ord) setModalOrder(ord)
      else toast.error('Commande introuvable (non synchronisée).')
    } catch (e) { toast.error('Ouverture impossible : ' + (e.message || e)) }
  }

  // Date locale (pas UTC) pour eviter les decalages timezone
  const todayStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  async function refresh() {
    setLoading(true)
    try {
      const [d, pal] = await Promise.all([
        loadOrdersWithFichesForRange(todayStr, DAYS),
        loadPalette(),
      ])
      setData(d)
      setPalette(pal)
    } catch (e) {
      console.error('[Accessoires]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) refresh() }, 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  // Group par date
  const byDate = useMemo(() => {
    const map = new Map()
    for (const { order, items } of data) {
      const dt = new Date(order.delivery_at)
      const d = dt.toISOString().slice(0, 10)
      if (!map.has(d)) map.set(d, [])
      map.get(d).push({ order, items })
    }
    return map
  }, [data])

  function setDayTab(date, tab) {
    setTabsByDate(prev => ({ ...prev, [date]: tab }))
  }

  // Compte items à faire / faits pour un set d'orders
  function countItems(ordersList) {
    let toDo = 0, done = 0
    for (const { items } of ordersList) {
      for (const { fiche, dones } of items) {
        if (!fiche) {
          // Items "à définir" : consideres faits si lotIdx -1 est marque
          if (isLotDone(dones, -1)) done += 1
          else toDo += 1
          continue
        }
        if (isItemFullyDone(fiche, dones)) done += 1
        else toDo += 1
      }
    }
    return { toDo, done }
  }

  function handlePrint(date) {
    const dayOrders = byDate.get(date) || []
    // Filtrer items non faits
    const todoOrders = dayOrders.map(({ order, items }) => ({
      order,
      items: items.filter(({ fiche, dones }) => {
        if (!fiche) return !isLotDone(dones, -1)
        return !isItemFullyDone(fiche, dones)
      }),
    })).filter(({ items }) => items.length > 0)
    if (todoOrders.length === 0) {
      toast.error('Rien à imprimer pour ce jour')
      return
    }
    const html = buildPrintHtml(date, todoOrders, palette, viewMode)
    const w = window.open('', '_blank')
    if (!w) return toast.error('Bloquez les popups ?')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
    setPrintDate(null)
  }

  const datesWithLines = [...byDate.keys()].sort()

  return (
    <div className="min-h-screen lg-vibrant pb-40">
      <AppHeader
        user={user}
        activeView={activeView || 'patissier'}
        onNavigate={onNavigate}
        onLogout={onLogout}
      />

      {/* Sous-header : titre centré + toggle vue + impression */}
      <div className="bg-cream-warm/30 border-b border-line py-3 px-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-fraunces italic text-[18px] text-ink">Accessoires</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-cream-warm rounded-full p-0.5 border border-line">
              <button
                onClick={() => setViewMode('client')}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  viewMode === 'client' ? 'bg-bordeaux text-cream' : 'text-ink-mute'
                }`}
              >Par client</button>
              <button
                onClick={() => setViewMode('product')}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  viewMode === 'product' ? 'bg-bordeaux text-cream' : 'text-ink-mute'
                }`}
              >Par produit</button>
            </div>
            <button
              onClick={() => setPrintDate('__open__')}
              className="px-4 py-1.5 rounded-full text-[11px] lg-grad transition-all"
            >Imprimer</button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {loading ? (
          <div className="text-center text-ink-mute italic py-12">Chargement...</div>
        ) : byDate.size === 0 ? (
          <div className="text-center text-ink-mute italic py-12">Aucune commande GM sur les 14 prochains jours</div>
        ) : (
          <div className="space-y-5">
            {[...byDate.entries()].map(([date, dayOrders]) => {
              const d = new Date(date)
              const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
              const tab = tabsByDate[date] || 'todo'
              const { toDo, done } = countItems(dayOrders)

              // Filtrer selon tab
              const filteredOrders = dayOrders.map(({ order, items }) => ({
                order,
                items: items.filter(({ fiche, dones }) => {
                  if (!fiche) {
                    const isDone = isLotDone(dones, -1)
                    return tab === 'todo' ? !isDone : isDone
                  }
                  const isDone = isItemFullyDone(fiche, dones)
                  return tab === 'todo' ? !isDone : isDone
                }),
              })).filter(({ items }) => items.length > 0)

              return (
                <div key={date} className="bg-white rounded-2xl border border-line p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-bordeaux/30 flex-wrap">
                    <div className="font-fraunces italic text-[16px] text-bordeaux-deep capitalize">
                      {label}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex bg-cream-warm rounded-full p-0.5 border border-line">
                        <button
                          onClick={() => setDayTab(date, 'todo')}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                            tab === 'todo' ? 'bg-bordeaux text-cream' : 'text-ink-mute'
                          }`}
                        >À faire ({toDo})</button>
                        <button
                          onClick={() => setDayTab(date, 'done')}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                            tab === 'done' ? 'bg-bordeaux text-cream' : 'text-ink-mute'
                          }`}
                        >Faites ({done})</button>
                      </div>
                      {toDo > 0 && (
                        <button
                          onClick={() => handlePrint(date)}
                          className="px-2 py-0.5 text-[10px] text-bordeaux border border-bordeaux/40 rounded-full hover:bg-bordeaux hover:text-cream"
                          title="Imprimer ce jour"
                        ><Printer size={13} strokeWidth={1.8} /></button>
                      )}
                    </div>
                  </div>

                  {filteredOrders.length === 0 ? (
                    <div className="text-center text-ink-mute italic py-3 text-[11px]">
                      {tab === 'todo' ? 'Tout est fait ✓' : 'Rien fait pour le moment'}
                    </div>
                  ) : viewMode === 'client' ? (
                    <ClientView
                      ordersList={filteredOrders}
                      palette={palette}
                      currentUserId={user?.id}
                      onChange={refresh}
                      onPhotoClick={setLightboxUrl}
                      onOpenOrder={canDetails ? openOrderDetail : null}
                    />
                  ) : (
                    <ProductView
                      ordersList={filteredOrders}
                      palette={palette}
                      currentUserId={user?.id}
                      onChange={refresh}
                      onPhotoClick={setLightboxUrl}
                      expandedKey={expandedKey}
                      setExpandedKey={setExpandedKey}
                      dateKey={date}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Dialog impression */}
      {printDate === '__open__' && (
        <div className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
             onClick={() => setPrintDate(null)}>
          <div className="bg-cream rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-line"
               onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[18px] text-ink mb-3">Imprimer</h3>
            <p className="text-[12px] text-ink-mute mb-3">Choisis le jour à imprimer (non-faites uniquement)</p>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {datesWithLines.map(d => {
                const dt = new Date(d)
                const lab = dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                const dayOrders = byDate.get(d) || []
                const { toDo } = countItems(dayOrders)
                return (
                  <button
                    key={d}
                    onClick={() => handlePrint(d)}
                    disabled={toDo === 0}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded border text-[12px] transition-colors ${
                      toDo === 0
                        ? 'bg-cream-warm/30 border-line/40 text-ink-mute cursor-not-allowed'
                        : 'bg-cream-warm border-line hover:border-bordeaux hover:bg-bordeaux/5'
                    }`}
                  >
                    <span className="capitalize">{lab}</span>
                    <span className="font-mono text-[10px] text-bordeaux">{toDo} à faire</span>
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setPrintDate(null)}
              className="mt-4 w-full py-2 border border-line rounded-full text-[12px] text-ink-soft hover:bg-cream-warm"
            >Annuler</button>
          </div>
        </div>
      )}

      {/* Lightbox photo */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center cursor-pointer p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="" className="max-h-full max-w-full object-contain rounded-lg shadow-2xl" />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur text-white text-[20px] hover:bg-white/30"
          >×</button>
        </div>
      )}

      {/* Fiche commande complète (réservée à ceux qui peuvent voir le calendrier) */}
      {modalOrder && (
        <OrderModal
          order={modalOrder}
          profiles={profiles}
          user={user}
          isPatissierMode={false}
          onClose={() => setModalOrder(null)}
          onOrderDeleted={() => setModalOrder(null)}
        />
      )}

      {/* Footer logs */}
      <ActivityLog
        storageKey="activity_log_open_patissier"
        loadFn={() => loadGmLogs(14)}
        refreshKey={data.length}
        formatEntry={(log) => {
          const who = log.profiles?.full_name || log.profiles?.username || '?'
          const oi = log.order_items
          const ord = oi?.orders
          const qty = oi ? (oi.quantity || 0) * (oi.pers || 1) : ''
          const what = oi ? `${oi.title || ''}${qty ? ' ×' + qty : ''}` : '(item supprimé)'
          const where = ord?.order_num ? ` pour ${ord.order_num}${ord.client_name ? ' · ' + ord.client_name : ''}` : ''
          const lotInfo = log.lot_idx >= 0 ? ` [lot ${log.lot_idx + 1}]` : ''
          return `${relativeTime(log.done_at)} — ${who} a fait ${what}${lotInfo}${where}`
        }}
      />
    </div>
  )
}

// ============================================================
// Vue par client : commande par commande
// ============================================================
function ClientView({ ordersList, palette, currentUserId, onChange, onPhotoClick, onOpenOrder }) {
  return (
    <div className="space-y-2">
      {ordersList.map(({ order, items }) => (
        <div key={order.id} className="bg-white rounded-2xl p-3 border border-line shadow-sm">
          <div className="flex items-center gap-2 mb-1.5 text-[12px]">
            <span className="font-mono text-[10px] text-bordeaux font-bold">{order.order_num}</span>
            <span className="font-medium text-ink">— {order.client_name || 'Sans nom'}</span>
            {onOpenOrder && (
              <button onClick={() => onOpenOrder(order.order_num)} title="Voir le détail complet de la commande"
                className="inline-flex items-center gap-1 text-[10px] px-3 py-1 rounded-full lg-gold transition-all">
                <FileText size={12} strokeWidth={2} /> Détails
              </button>
            )}
            <span className="ml-auto font-mono text-[10px] text-ink-mute">
              {new Date(order.delivery_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {order.handler && (
            <div className="text-[10px] text-ink-mute mb-1.5">Pris par <span className="font-medium text-ink-soft">{order.handler}</span></div>
          )}
          <div className="space-y-1.5">
            {items.map(({ item, fiche, dones }) => (
              <ItemCard
                key={item.id}
                item={item}
                fiche={fiche}
                dones={dones}
                palette={palette}
                currentUserId={currentUserId}
                onChange={onChange}
                onPhotoClick={onPhotoClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// « 2 touches » : 1er appui = arme (visuel « valider ? »), 2e appui (sous 3 s) = confirme.
// Évite qu'un article passe en « fait » sur un appui accidentel. Annuler (déjà fait → ○) reste instantané.
function useTwoTap(onConfirm, ms = 3000) {
  const [armed, setArmed] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const tap = () => {
    if (armed) { if (timer.current) clearTimeout(timer.current); setArmed(false); onConfirm() }
    else { setArmed(true); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setArmed(false), ms) }
  }
  return [armed, tap]
}

// Lot (vue par commande) : 2 touches pour marquer fait, annuler instantané.
function LotChip({ lot, done, palette, onToggle }) {
  const [armed, tap] = useTwoTap(() => onToggle(false))
  const couleur = findColor(palette, lot.couleur_id)
  const zigzag = findColor(palette, lot.zigzag_couleur_id)
  const perles = findColor(palette, lot.perles_couleur_id)
  const cls = done ? 'bg-success/10 border-success/30 text-success line-through'
    : armed ? 'bg-bordeaux/10 border-bordeaux text-bordeaux ring-1 ring-bordeaux'
      : 'bg-cream-warm border-line hover:border-bordeaux'
  return (
    <button onClick={() => (done ? onToggle(true) : tap())}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border transition-all ${cls}`}>
      <span className="font-medium">×{lot.qty}</span>
      {lot.parfum && <span>{lot.parfum}</span>}
      {couleur && <span className="w-2.5 h-2.5 rounded-full border border-line/40" style={{ backgroundColor: couleur.hex }} title={couleur.nom} />}
      {lot.forme && <span className="capitalize">{lot.forme}</span>}
      {lot.has_zigzag && zigzag && (
        <span className="inline-flex items-center gap-0.5"><span className="text-ink-mute">·zig</span><span className="w-2 h-2 rounded-full" style={{ backgroundColor: zigzag.hex }} /></span>
      )}
      {lot.has_perles && perles && (
        <span className="inline-flex items-center gap-0.5"><span className="text-ink-mute">·perl</span><span className="w-2 h-2 rounded-full" style={{ backgroundColor: perles.hex }} /></span>
      )}
      <span className="ml-0.5">{armed ? '●' : done ? '✓' : '○'}</span>
    </button>
  )
}

// Bouton « Tout fait » : 2 touches pour marquer, instantané pour annuler.
function AllDoneButton({ fullyDone, onToggle }) {
  const [armed, tap] = useTwoTap(() => onToggle())
  return (
    <button onClick={() => (fullyDone ? onToggle() : tap())}
      className={`text-[9px] px-3 py-1 rounded-full whitespace-nowrap transition-all ${fullyDone ? 'bg-success/10 text-success border border-success/30' : armed ? 'bg-bordeaux/20 text-bordeaux border border-bordeaux ring-1 ring-bordeaux' : 'lg-grad'}`}>
      {fullyDone ? '✓' : armed ? 'Valider ?' : 'Tout fait'}
    </button>
  )
}

// Article « à définir » (sans fiche) : 2 touches pour marquer fait, annuler instantané.
function UndefItem({ item, dones, currentUserId, onChange }) {
  const undefDone = isLotDone(dones, -1)
  async function doToggle(mark) {
    try {
      if (!mark) await unmarkLotDone(item.id, -1)
      else await markLotDone(item.id, -1, currentUserId)
      onChange && onChange()
    } catch (e) { console.error(e); toast.error('Erreur : ' + e.message) }
  }
  const [armed, tap] = useTwoTap(() => doToggle(true))
  return (
    <button onClick={() => (undefDone ? doToggle(false) : tap())}
      className={`w-full text-left border rounded p-2 flex items-center gap-2 transition-all ${undefDone ? 'bg-amber-50 border-amber-200 opacity-60' : armed ? 'bg-bordeaux/10 border-bordeaux ring-1 ring-bordeaux' : 'bg-amber-50 border-amber-200 hover:border-amber-400'}`}>
      <div className={`w-10 h-10 rounded flex items-center justify-center text-[16px] flex-shrink-0 ${undefDone ? 'bg-success/10 text-success' : armed ? 'bg-bordeaux/10 text-bordeaux' : 'bg-amber-100 text-amber-700'}`}>
        {undefDone ? '✓' : armed ? '●' : <AlertTriangle size={15} strokeWidth={2} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-medium text-amber-900 truncate ${undefDone ? 'line-through' : ''}`}>{item.title}</div>
        <div className="text-[10px] text-amber-700 italic">{undefDone ? 'Fait' : armed ? 'Toucher pour valider' : 'À définir'}</div>
      </div>
    </button>
  )
}

function ItemCard({ item, fiche, dones, palette, currentUserId, onChange, onPhotoClick }) {
  const realQty = getRealQuantity(item)
  const photoUrl = Array.isArray(item.image_urls) && item.image_urls[0] ? item.image_urls[0] : null

  if (!fiche) {
    return <UndefItem item={item} dones={dones} currentUserId={currentUserId} onChange={onChange} />
  }

  const typeGm = fiche.type_gm
  const emoji = TYPE_EMOJIS[typeGm] || '✏️'
  const fullyDone = isItemFullyDone(fiche, dones)

  async function toggleAllDone() {
    try {
      if (fullyDone) {
        await unmarkItemAllDone(item.id)
      } else {
        if (fiche.parfum_normal) {
          await markLotDone(item.id, -1, currentUserId)
        } else {
          const lotsCount = (fiche.lots || []).length
          if (lotsCount > 0) {
            await markItemAllDone(item.id, lotsCount, currentUserId)
          }
        }
      }
      onChange && onChange()
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + e.message)
    }
  }

  async function toggleLot(lotIdx, currentlyDone) {
    try {
      if (currentlyDone) await unmarkLotDone(item.id, lotIdx)
      else await markLotDone(item.id, lotIdx, currentUserId)
      onChange && onChange()
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + e.message)
    }
  }

  return (
    <div className={`bg-white rounded-xl border p-3 ${fullyDone ? 'border-success/30 opacity-70' : 'border-line/60'}`}>
      <div className="flex gap-2 items-start">
        <button
          onClick={() => photoUrl && onPhotoClick && onPhotoClick(photoUrl)}
          className="w-14 h-14 rounded-2xl lg-gold border border-line/40 flex items-center justify-center flex-shrink-0 overflow-hidden hover:opacity-90 shadow-sm"
          disabled={!photoUrl}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="text-[20px] opacity-50">{emoji}</span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[12px] font-medium text-ink">{TYPE_LABELS[typeGm]} ({realQty})</span>
            {fiche.is_mixte && <span className="text-[9px] font-mono text-bordeaux uppercase tracking-wider">MIXTE</span>}
            {fiche.parfum_normal && (
              <span className="text-[10px] text-ink-mute italic">
                {Array.isArray(item.parfums) && item.parfums.length > 0
                  ? item.parfums.join(', ')
                  : 'parfum normal'}
              </span>
            )}
          </div>
          {fiche.note_patissier && (
            <div className="text-[10px] text-amber-700 italic mt-0.5">{fiche.note_patissier}</div>
          )}

          {!fiche.parfum_normal && (
            <div className="flex flex-wrap gap-1 mt-1">
              {(fiche.lots || []).map((lot, idx) => (
                <LotChip key={idx} lot={lot} done={isLotDone(dones, idx)} palette={palette} onToggle={(d) => toggleLot(idx, d)} />
              ))}
            </div>
          )}
        </div>

        <AllDoneButton fullyDone={fullyDone} onToggle={toggleAllDone} />
      </div>
    </div>
  )
}

// ============================================================
// Vue par produit : agrégé fusion par couleur+parfum
// ============================================================
function ProductView({ ordersList, palette, currentUserId, onChange, onPhotoClick, expandedKey, setExpandedKey, dateKey }) {
  // Reconstituer le format aggregateByProduct attend
  const ordersWithFiches = ordersList
  const products = useMemo(() => aggregateByProduct(ordersWithFiches), [ordersWithFiches])

  if (products.length === 0) {
    return <div className="text-center text-ink-mute italic py-3 text-[11px]">Aucun produit</div>
  }

  return (
    <div className="space-y-2">
      {products.map(prod => (
        <ProductGroup
          key={prod.typeGm}
          product={prod}
          palette={palette}
          currentUserId={currentUserId}
          onChange={onChange}
          expandedKey={expandedKey}
          setExpandedKey={setExpandedKey}
          dateKey={dateKey}
        />
      ))}
    </div>
  )
}

function ProductGroup({ product, palette, currentUserId, onChange, expandedKey, setExpandedKey, dateKey }) {
  const visibleParfums = Object.entries(product.parfums)

  if (visibleParfums.length === 0) return null

  // Quantité totale du produit (somme de tous les lots) — pour savoir combien en faire en un coup d'œil.
  const totalQty = visibleParfums.reduce((s, [, entries]) => s + entries.reduce((a, e) => a + (Number(e.qty) || 0), 0), 0)

  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${product.isNonDefini ? 'bg-amber-50 border-amber-200' : 'bg-white border-line'}`}>
      <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-line/30">
        <span className="text-[16px]">{product.emoji}</span>
        <span className="text-[12px] font-medium text-ink">{product.label}</span>
        <span className="text-[12px] font-bold text-bordeaux ml-auto">×{totalQty}</span>
      </div>

      {(() => {
        // Notes pâtissier (dédupliquées par commande) pour ce produit
        const seen = new Set(); const notes = []
        for (const [, entries] of visibleParfums) {
          for (const entry of entries) {
            for (const s of (entry.sources || [])) {
              if (s.note && !seen.has(s.itemId)) { seen.add(s.itemId); notes.push(s) }
            }
          }
        }
        if (notes.length === 0) return null
        return (
          <div className="mb-1.5 space-y-0.5">
            {notes.map((s, i) => (
              <div key={i} className="text-[10px] text-amber-700 italic flex gap-1">
                <span>📝</span>
                <span><span className="font-mono not-italic text-amber-800">{s.clientName}</span> — {s.note}</span>
              </div>
            ))}
          </div>
        )
      })()}

      <div className="space-y-1.5">
        {visibleParfums.map(([parfum, entries]) => (
          <div key={parfum} className="bg-white rounded-xl border border-line/50 p-2.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-mute mb-1">
              {parfum === '__normal__' ? 'Parfum normal' : parfum === '__sansparfum__' ? '(sans parfum)' : parfum === '__pasdefini__' ? '⚠ Pas défini' : parfum}
            </div>
            {product.isNonDefini ? (
              <div className="space-y-0.5">
                {entries.map((entry, idx) => (
                  <div key={idx} className="text-[11px] text-amber-900">
                    <span className="font-mono text-amber-700">{entry.sources[0].orderNum}</span>
                    <span> · {entry.sources[0].clientName} · ×{entry.qty}</span>
                    <span className="text-amber-700 italic ml-1">— {entry.itemTitle}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {entries.map((entry, idx) => (
                  <AggLotChip
                    key={idx}
                    entry={entry}
                    palette={palette}
                    currentUserId={currentUserId}
                    onChange={onChange}
                    fusionKey={`${dateKey}|${product.typeGm}|${parfum}|${idx}`}
                    expandedKey={expandedKey}
                    setExpandedKey={setExpandedKey}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AggLotChip({ entry, palette, currentUserId, onChange, fusionKey, expandedKey, setExpandedKey }) {
  const allDone = entry.doneCount >= entry.totalSources
  const couleur = findColor(palette, entry.lot.couleur_id)
  const zigzag = findColor(palette, entry.lot.zigzag_couleur_id)
  const perles = findColor(palette, entry.lot.perles_couleur_id)
  const isExpanded = expandedKey === fusionKey

  async function toggle() {
    try {
      for (const s of entry.sources) {
        if (s.lotIdx === -1) {
          if (allDone) await unmarkItemAllDone(s.itemId)
          else await markLotDone(s.itemId, -1, currentUserId)
        } else {
          if (allDone) await unmarkLotDone(s.itemId, s.lotIdx)
          else await markLotDone(s.itemId, s.lotIdx, currentUserId)
        }
      }
      onChange && onChange()
    } catch (e) {
      console.error(e)
      toast.error('Erreur : ' + e.message)
    }
  }

  const [armed, tap] = useTwoTap(toggle)
  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={() => (allDone ? toggle() : tap())}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border transition-all ${
          allDone
            ? 'bg-success/10 border-success/30 text-success line-through'
            : armed
              ? 'bg-bordeaux/10 border-bordeaux text-bordeaux ring-1 ring-bordeaux'
              : 'bg-cream-warm border-line hover:border-bordeaux'
        }`}
      >
        <span className="font-medium">×{entry.qty}</span>
        {couleur && <span className="w-3 h-3 rounded-full border border-line/40" style={{ backgroundColor: couleur.hex }} title={couleur.nom} />}
        {entry.lot.forme && <span className="capitalize">{entry.lot.forme}</span>}
        {entry.lot.has_zigzag && zigzag && (
          <span className="inline-flex items-center gap-0.5">
            <span className="text-ink-mute">·zig</span>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zigzag.hex }} />
          </span>
        )}
        {entry.lot.has_perles && perles && (
          <span className="inline-flex items-center gap-0.5">
            <span className="text-ink-mute">·perl</span>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: perles.hex }} />
          </span>
        )}
        <span className="ml-1">{allDone ? '✓' : armed ? '●' : entry.totalSources > 1 ? `(${entry.totalSources})` : '○'}</span>
      </button>
      {entry.totalSources > 1 && (
        <button
          onClick={() => setExpandedKey(isExpanded ? null : fusionKey)}
          className="text-[10px] text-ink-mute hover:text-bordeaux px-1"
          title="Voir détail clients"
        >
          {isExpanded ? '▼' : '▶'}
        </button>
      )}
      {isExpanded && (
        <div className="ml-1 text-[10px] text-ink-soft">
          ({entry.sources.map(s => `${s.orderNum} ${s.clientName} ×${s.qty}`).join(', ')})
        </div>
      )}
    </div>
  )
}

// ============================================================
// Build print HTML
// ============================================================
function buildPrintHtml(dateStr, ordersList, palette, viewMode) {
  const d = new Date(dateStr)
  const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const findCol = (id) => palette.find(c => c.id === id)
  let body = ''

  if (viewMode === 'product') {
    const products = aggregateByProduct(ordersList)
    for (const prod of products) {
      let prodHtml = ''
      let prodTotal = 0
      for (const [parfum, entries] of Object.entries(prod.parfums)) {
        const notDone = entries.filter(e => e.doneCount < e.totalSources)
        if (notDone.length === 0) continue
        prodTotal += notDone.reduce((a, e) => a + (Number(e.qty) || 0), 0)
        const parfumLabel = parfum === '__normal__' ? 'Parfum normal' : parfum === '__sansparfum__' ? '(sans parfum)' : parfum === '__pasdefini__' ? 'Pas défini' : parfum
        let chips = ''
        for (const e of notDone) {
          const couleur = findCol(e.lot.couleur_id)
          const zigzag = findCol(e.lot.zigzag_couleur_id)
          const perles = findCol(e.lot.perles_couleur_id)
          let extras = ''
          if (couleur) extras += ` <span style="background:${couleur.hex};display:inline-block;width:9px;height:9px;border-radius:50%;border:1px solid #999"></span> ${couleur.nom}`
          if (e.lot.forme) extras += ` · ${e.lot.forme}`
          if (e.lot.has_zigzag && zigzag) extras += ` · zig ${zigzag.nom}`
          if (e.lot.has_perles && perles) extras += ` · perl ${perles.nom}`
          let detail = ''
          if (e.totalSources > 1 && !e.notDefined) {
            detail = ' <span style="color:#888;font-size:9px">(' + e.sources.map(s => `${s.orderNum} ${s.clientName} ×${s.qty}`).join(', ') + ')</span>'
          } else if (e.notDefined) {
            detail = ` <span style="color:#888;font-size:9px">${e.itemTitle || ''}</span>`
          }
          chips += `<div style="margin:2px 0">×${e.qty}${extras}${detail}</div>`
        }
        if (chips) {
          prodHtml += `<div style="margin:6px 0 0;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#666">${parfumLabel}</div>${chips}`
        }
      }
      if (prodHtml) {
        body += `<div style="margin:10px 0;padding:6px;border-bottom:1px solid #ccc"><div style="font-size:13px;font-weight:600">${prod.emoji} ${prod.label} <span style="color:#a8324b">×${prodTotal}</span></div>${prodHtml}</div>`
      }
    }
  } else {
    // Par client
    for (const { order, items } of ordersList) {
      const t = new Date(order.delivery_at)
      const hour = `${String(t.getHours()).padStart(2, '0')}h${String(t.getMinutes()).padStart(2, '0')}`
      let itemsHtml = ''
      for (const { item, fiche, dones } of items) {
        const realQty = getRealQuantity(item)
        if (!fiche) {
          if (isLotDone(dones, -1)) continue
          itemsHtml += `<div style="margin:2px 0;color:#a85"><strong>×${realQty}</strong> ${item.title} <em>(à définir)</em></div>`
          continue
        }
        const typeGm = fiche.type_gm
        const label = TYPE_LABELS[typeGm] || typeGm
        let lotsHtml = ''
        if (fiche.parfum_normal) {
          const parfumsLabel = Array.isArray(item.parfums) && item.parfums.length > 0
            ? item.parfums.join(', ')
            : 'parfum normal'
          lotsHtml = ` <em style="color:#888">${parfumsLabel}</em>`
        } else {
          for (const lot of (fiche.lots || [])) {
            const couleur = findCol(lot.couleur_id)
            const zigzag = findCol(lot.zigzag_couleur_id)
            const perles = findCol(lot.perles_couleur_id)
            let part = ` <span>×${lot.qty}`
            if (lot.parfum) part += ` ${lot.parfum}`
            if (couleur) part += ` <span style="background:${couleur.hex};display:inline-block;width:9px;height:9px;border-radius:50%;border:1px solid #999"></span> ${couleur.nom}`
            if (lot.forme) part += ` ${lot.forme}`
            if (lot.has_zigzag && zigzag) part += ` zig ${zigzag.nom}`
            if (lot.has_perles && perles) part += ` perl ${perles.nom}`
            part += '</span>'
            lotsHtml += part
          }
        }
        itemsHtml += `<div style="margin:2px 0"><strong>×${realQty} ${label}</strong>${lotsHtml}${fiche.note_patissier ? ' <em style="color:#a85">📝 ' + fiche.note_patissier + '</em>' : ''}</div>`
      }
      body += `<div style="margin:8px 0;padding:6px;border-bottom:1px solid #ccc">
        <div style="font-size:11px"><strong style="color:#a8324b">${order.order_num}</strong> · ${order.client_name || ''} <span style="color:#888;float:right">${hour}</span></div>
        ${itemsHtml}
      </div>`
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Accessoires - ${label}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#222;margin:12px;line-height:1.4}
  h1{font-size:14px;margin:0 0 4px}
  @media print{body{margin:6mm}}
</style></head><body>
<h1>🧁 Accessoires · ${label} · À FAIRE</h1>
${body || '<p>Tout est fait !</p>'}
</body></html>`
}
