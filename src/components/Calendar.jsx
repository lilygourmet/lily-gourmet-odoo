import { useState, useEffect, useMemo } from 'react'
import {
  loadOrdersForWeek,
  loadAllOrders,
  loadStepsForOrders,
  cleanupOldOrders,
  loadAllProfiles,
} from '../lib/orders'
import { logout, canSync, canManageUsers } from '../lib/auth'
import AdminUsers from './AdminUsers'
import ChangePasswordModal from './ChangePasswordModal'
import OrderModal from './OrderModal'
import AdminGmConfig from './AdminGmConfig'

const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const MONTH_NAMES = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

function getMondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function formatWeekRange(monday) {
  const sunday = addDays(monday, 6)
  const sameMonth = monday.getMonth() === sunday.getMonth()
  if (sameMonth) {
    return `${monday.getDate()} – ${sunday.getDate()} ${MONTH_NAMES[monday.getMonth()]} ${monday.getFullYear()}`
  }
  return `${monday.getDate()} ${MONTH_NAMES[monday.getMonth()]} – ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]} ${monday.getFullYear()}`
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function formatTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}h${String(date.getMinutes()).padStart(2, '0')}`
}

function getAnyOrderPhoto(order) {
  const items = order.order_items || []
  const cdItems = items.filter(i => i.type === 'CD')
  const ordered = [...cdItems, ...items.filter(i => i.type !== 'CD')]
  for (const item of ordered) {
    const urls = item.image_urls
    if (Array.isArray(urls) && urls.length > 0) {
      return urls[0]
    }
  }
  return null
}

// Adapté pour la nouvelle base : warnings est un ARRAY (pas un objet avec .text)
function hasWarning(order) {
  const items = order.order_items || []
  return items.some(i => Array.isArray(i.warnings) && i.warnings.length > 0)
}

function itemHasWarning(item) {
  return Array.isArray(item.warnings) && item.warnings.length > 0
}

function isCancelled(order) {
  return order.odoo_state === 'cancel'
}

function isModified(order) {
  return !!order.modified_at
}

function itemIsModified(item) {
  return !!item.modified_at
}

function sequentialStepsForItem(item) {
  return item.type === 'CD' ? ['couvert', 'fini', 'range'] : ['fait', 'range']
}

function totalSequentialSteps(order) {
  const items = order.order_items || []
  return items.reduce((sum, item) => sum + sequentialStepsForItem(item).length, 0)
}

function checkedSequentialSteps(order, stepsMap) {
  const items = order.order_items || []
  let count = 0
  for (const item of items) {
    for (const step of sequentialStepsForItem(item)) {
      if (stepsMap[`${item.id}_${step}`]) count++
    }
  }
  return count
}

function itemTotalSteps(item) {
  return sequentialStepsForItem(item).length
}
function itemCheckedSteps(item, stepsMap) {
  return sequentialStepsForItem(item).filter(s => stepsMap[`${item.id}_${s}`]).length
}

function isOrderFullyRanged(order, stepsMap) {
  const items = order.order_items || []
  if (items.length === 0) return false
  return items.every(item => !!stepsMap[`${item.id}_range`])
}

function currentPendingStepForItem(item, stepsMap) {
  const sequence = sequentialStepsForItem(item)
  for (const step of sequence) {
    if (!stepsMap[`${item.id}_${step}`]) return step
  }
  return null
}

function itemHasStepPending(item, stepsMap, step) {
  return currentPendingStepForItem(item, stepsMap) === step
}

function isItemRanged(item, stepsMap) {
  return !!stepsMap[`${item.id}_range`]
}

function cdItemNeedsPolys(item) {
  if (item.type !== 'CD') return false
  const etagesCount = Math.max(1, item.etages_count || 1)
  const polys = item.polys && typeof item.polys === 'object' ? item.polys : {}
  for (let i = 1; i <= etagesCount; i++) {
    if (!polys[`etage${i}`]) return true
  }
  return false
}

function orderMainCdNeedsPolys(order) {
  const items = order.order_items || []
  const cdItems = items.filter(i => i.type === 'CD').sort((a, b) => a.item_idx - b.item_idx)
  if (cdItems.length === 0) return false
  return cdItemNeedsPolys(cdItems[0])
}

function normalizeForSearch(str) {
  if (!str) return ''
  return str.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export default function Calendar({ user, onLogout }) {
  const [currentMonday, setCurrentMonday] = useState(() => getMondayOf(new Date()))
  const [orders, setOrders] = useState([])
  const [allOrders, setAllOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)

  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [searchQuery, setSearchQuery] = useState('')

  const [selected, setSelected] = useState(null)
  const [diffPopupOrder, setDiffPopupOrder] = useState(null)
  const [stepsMap, setStepsMap] = useState({})
  const [profiles, setProfiles] = useState({})

  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const userCanSync = canSync(user)
  const canAdmin = canManageUsers(user)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showGmConfig, setShowGmConfig] = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)

  useEffect(() => {
    loadWeek()
  }, [currentMonday])

  useEffect(() => {
    loadAllOrders().then(data => setAllOrders(data))
    loadAllProfiles().then(p => setProfiles(p))

    // Nettoyage auto 1x par semaine (le lundi) si pas déjà fait aujourd'hui
    const today = new Date()
    const isMonday = today.getDay() === 1
    if (isMonday) {
      const todayKey = today.toISOString().slice(0, 10)
      const lastCleanup = localStorage.getItem('lg_last_cleanup')
      if (lastCleanup !== todayKey) {
        cleanupOldOrders().then(res => {
          localStorage.setItem('lg_last_cleanup', todayKey)
          if (res.deleted > 0) {
            console.log(`🧹 ${res.deleted} commande(s) ancienne(s) supprimée(s) (${res.photos} photos)`)
            loadAllOrders().then(data => setAllOrders(data))
            loadWeek()
          }
        })
      }
    }
  }, [])

  async function loadWeek() {
    setLoadingOrders(true)
    const data = await loadOrdersForWeek(currentMonday)
    setOrders(data)
    const steps = await loadStepsForOrders(data)
    setStepsMap(steps)
    setLoadingOrders(false)
  }

  function handleStepsChanged(itemId, stepKey, checked, userId) {
    const key = `${itemId}_${stepKey}`
    setStepsMap(prev => {
      const next = { ...prev }
      if (checked) {
        next[key] = { done_by: userId, done_at: new Date().toISOString() }
      } else {
        delete next[key]
      }
      return next
    })
  }

  function handlePolysChanged(itemId, newPolys) {
    const updateItem = (item) =>
      item.id === itemId ? { ...item, polys: newPolys } : item

    const updateOrders = (list) =>
      list.map(order => ({
        ...order,
        order_items: (order.order_items || []).map(updateItem),
      }))

    setOrders(prev => updateOrders(prev))
    setAllOrders(prev => updateOrders(prev))

    setSelected(prev => {
      if (!prev) return prev
      return {
        ...prev,
        order: {
          ...prev.order,
          order_items: (prev.order.order_items || []).map(updateItem),
        },
      }
    })
  }

  async function handleOrderDeleted(orderId) {
    setOrders(prev => prev.filter(o => o.id !== orderId))
    setAllOrders(prev => prev.filter(o => o.id !== orderId))
    setSelected(null)
  }

  function handleLogout() {
    logout()
    if (onLogout) onLogout()
  }

  // Bouton "Synchroniser maintenant" : appelle /api/sync-now
  async function handleSyncNow() {
    if (syncing) return
    setSyncing(true)
    setSyncStatus('Synchro...')
    try {
      const res = await fetch('/api/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Erreur ${res.status}`)
      }
      // Rafraichir les commandes affichees
      const fresh = await loadOrdersForWeek(currentMonday)
      setOrders(fresh)
      setSyncStatus('Synchronise')
      setTimeout(() => setSyncStatus(''), 3000)
    } catch (e) {
      console.error('[sync-now] Erreur:', e)
      setSyncStatus('Erreur')
      alert(`Erreur de synchronisation : ${e.message}`)
      setTimeout(() => setSyncStatus(''), 3000)
    } finally {
      setSyncing(false)
    }
  }

  const isSearching = searchQuery.trim().length > 0
  const sourceOrders = isSearching ? allOrders : orders

  const filteredOrders = useMemo(() => {
    return sourceOrders.filter(order => {
      if (isSearching) {
        const q = normalizeForSearch(searchQuery.trim())
        const inOrderNum = normalizeForSearch(order.order_num).includes(q)
        const inClient = normalizeForSearch(order.client_name).includes(q)
        if (!inOrderNum && !inClient) return false
      }

      const cdItems = (order.order_items || []).filter(i => i.type === 'CD')
      const gmItems = (order.order_items || []).filter(i => i.type === 'GM')
      if (typeFilter === 'cd' && cdItems.length === 0) return false
      if (typeFilter === 'gm' && gmItems.length === 0) return false

      const fullyRanged = isOrderFullyRanged(order, stepsMap)

      if (statusFilter === 'range') {
        if (!fullyRanged) return false
      } else {
        if (fullyRanged) return false
      }

      return true
    })
  }, [sourceOrders, isSearching, searchQuery, typeFilter, statusFilter, stepsMap])

  function itemMatchesStatusFilter(item) {
    if (statusFilter === 'active') {
      return !isItemRanged(item, stepsMap)
    }
    if (statusFilter === 'poly') {
      return cdItemNeedsPolys(item) && !isItemRanged(item, stepsMap)
    }
    if (statusFilter === 'range') {
      return isItemRanged(item, stepsMap)
    }
    if (statusFilter === 'couvrir') {
      return itemHasStepPending(item, stepsMap, 'couvert')
    }
    if (statusFilter === 'faire') {
      return itemHasStepPending(item, stepsMap, 'fait')
    }
    if (statusFilter === 'ranger') {
      return itemHasStepPending(item, stepsMap, 'range')
    }
    return true
  }

  function ordersToCapsules(ordersList) {
    const capsules = []
    for (const order of ordersList) {
      if (typeFilter === 'all') {
        const items = order.order_items || []
        const anyMatch = items.some(item => itemMatchesStatusFilter(item))
        if (!anyMatch && statusFilter !== 'active' && statusFilter !== 'range') continue
        if (statusFilter === 'poly' && !anyMatch) continue
        capsules.push({ kind: 'order', id: order.id, order })
      } else if (typeFilter === 'cd') {
        const cds = (order.order_items || [])
          .filter(i => i.type === 'CD')
          .filter(i => itemMatchesStatusFilter(i))
          .sort((a, b) => a.item_idx - b.item_idx)
        for (const item of cds) {
          capsules.push({ kind: 'item', id: `${order.id}_${item.id}`, order, item })
        }
      } else if (typeFilter === 'gm') {
        const gms = (order.order_items || [])
          .filter(i => i.type === 'GM')
          .filter(i => itemMatchesStatusFilter(i))
          .sort((a, b) => a.item_idx - b.item_idx)
        for (const item of gms) {
          capsules.push({ kind: 'item', id: `${order.id}_${item.id}`, order, item })
        }
      }
    }
    return capsules
  }

  const days = useMemo(() => {
    if (isSearching) return []
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(currentMonday, i)
      const dayStart = new Date(day)
      const dayEnd = addDays(day, 1)

      const dayOrders = filteredOrders.filter(order => {
        const dt = new Date(order.delivery_at)
        return dt >= dayStart && dt < dayEnd
      })

      return { date: day, capsules: ordersToCapsules(dayOrders) }
    })
  }, [currentMonday, filteredOrders, isSearching, typeFilter, statusFilter, stepsMap])

  function openCapsule(capsule) {
    const focusItemId = capsule.kind === 'item' ? capsule.item.id : null
    // Si la commande a une modification non vue ET pas annulee -> popup diff d'abord
    if (capsule.order.modified_at && capsule.order.odoo_state !== 'cancel') {
      setDiffPopupOrder({ order: capsule.order, focusItemId })
    } else {
      setSelected({ order: capsule.order, focusItemId })
    }
  }

  function openOrder(order) {
    if (order.modified_at && order.odoo_state !== 'cancel') {
      setDiffPopupOrder({ order, focusItemId: null })
    } else {
      setSelected({ order, focusItemId: null })
    }
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">

      <header className="bg-cream border-b border-line px-4 py-3 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/Logo_LG.jpg" alt="Lily Gourmet" className="w-9 h-9 object-contain flex-shrink-0" />
          <div className="min-w-0 hidden sm:block">
            <div className="font-sans font-semibold text-[13px] tracking-[0.12em] text-ink leading-tight truncate">LILY GOURMET</div>
            <div className="font-mono text-[8px] tracking-[0.2em] uppercase text-bordeaux mt-0.5">
              {user?.full_name || user?.username || 'Planning'}
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-xs relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher S47... ou nom"
            className="w-full px-3 py-2 pl-8 text-[12px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux transition-all"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute text-[12px]">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-mute hover:text-bordeaux text-[12px]"
              title="Effacer"
            >
              ✕
            </button>
          )}
        </div>

        {userCanSync && (
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-2 px-3.5 py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[11px] font-medium tracking-wider transition-all active:scale-[0.98] flex-shrink-0 disabled:opacity-60 disabled:cursor-wait"
            title="Synchroniser depuis Odoo maintenant"
          >
            {syncing ? (
              <>
                <span>⏳</span>
                <span className="hidden sm:inline">{syncStatus || 'SYNC...'}</span>
              </>
            ) : (
              <>
                <span className="text-[14px] leading-none">🔄</span>
                <span className="hidden sm:inline">SYNC</span>
              </>
            )}
          </button>
        )}

        {canAdmin && (
          <button
            onClick={() => setShowGmConfig(true)}
            className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0"
            title="Configuration GM (palette couleurs)"
          >
            <span className="text-[14px]">🎨</span>
          </button>
        )}

        {canAdmin && (
          <button
            onClick={() => setShowAdmin(true)}
            className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0"
            title="Administration"
          >
            ⚙️
          </button>
        )}

        <button
          onClick={() => setShowChangePwd(true)}
          className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0"
          title="Changer mon mot de passe"
        >
          🔑
        </button>

        <button
          onClick={handleLogout}
          className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0"
          title="Se déconnecter"
        >
          ⏻
        </button>
      </header>

      {!isSearching && (
        <div className="bg-cream-warm border-b border-line px-4 py-3 flex items-center justify-center gap-3 flex-shrink-0">
          <button
            onClick={() => setCurrentMonday(addDays(currentMonday, -7))}
            className="w-9 h-9 rounded-full bg-cream border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
          >
            ‹
          </button>
          <div className="text-center min-w-[180px]">
            <div className="font-fraunces text-[15px] font-medium text-ink capitalize leading-tight">
              {formatWeekRange(currentMonday)}
            </div>
            <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-ink-mute mt-0.5">
              Semaine {getWeekNumber(currentMonday)} {loadingOrders && '· chargement...'}
            </div>
          </div>
          <button
            onClick={() => setCurrentMonday(addDays(currentMonday, 7))}
            className="w-9 h-9 rounded-full bg-cream border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
          >
            ›
          </button>
          <button
            onClick={() => setCurrentMonday(getMondayOf(new Date()))}
            className="ml-3 px-3 py-1.5 text-[10px] font-mono tracking-[0.15em] uppercase text-bordeaux border border-bordeaux rounded-full hover:bg-bordeaux hover:text-cream transition-all"
          >
            Aujourd'hui
          </button>
        </div>
      )}

      <div className="bg-cream border-b border-line px-4 py-2.5 flex flex-col items-center gap-2 flex-shrink-0">
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <FilterButton active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label="Tous" />
          <FilterButton active={typeFilter === 'cd'} onClick={() => setTypeFilter('cd')} label="Gâteaux" />
          <FilterButton active={typeFilter === 'gm'} onClick={() => setTypeFilter('gm')} label="Accessoires" />
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <FilterButton active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} label="En cours" small />
          <FilterButton active={statusFilter === 'couvrir'} onClick={() => setStatusFilter('couvrir')} label="À couvrir" small />
          <FilterButton active={statusFilter === 'faire'} onClick={() => setStatusFilter('faire')} label="À faire" small />
          <FilterButton active={statusFilter === 'ranger'} onClick={() => setStatusFilter('ranger')} label="À ranger" small />
          <FilterButton active={statusFilter === 'range'} onClick={() => setStatusFilter('range')} label="Rangé" small />
          <span className="w-4" />
          <FilterButton active={statusFilter === 'poly'} onClick={() => setStatusFilter('poly')} label="Poly" small />
        </div>
      </div>

      {isSearching ? (
        <SearchResults
          orders={filteredOrders}
          stepsMap={stepsMap}
          onOrderClick={openOrder}
          query={searchQuery}
        />
      ) : (
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-x-auto md:overflow-hidden">
            <div className="h-full flex md:grid md:grid-cols-7 gap-2 p-3 min-w-max md:min-w-0">
              {days.map((day, idx) => {
                const isToday = isSameDay(day.date, today)
                const isPast = day.date < today
                return (
                  <div
                    key={idx}
                    className={`w-[180px] md:w-auto flex flex-col rounded-xl p-2.5 flex-shrink-0 ${isToday ? 'bg-cream border border-bordeaux shadow-sm' : 'bg-cream-warm border border-transparent'} ${isPast ? 'opacity-55' : ''}`}
                  >
                    <div className="flex items-baseline justify-between pb-2 mb-2 border-b border-dashed border-line">
                      <div>
                        <div className="font-fraunces font-medium text-[13px] text-ink capitalize leading-none">
                          {DAY_NAMES[idx]}
                        </div>
                        {isToday && (
                          <div className="font-mono text-[8px] tracking-[0.18em] uppercase text-bordeaux mt-1">
                            · aujourd'hui
                          </div>
                        )}
                      </div>
                      <div className={`font-mono text-[11px] ${isToday ? 'bg-bordeaux text-cream px-1.5 py-0.5 rounded' : 'text-ink-mute'}`}>
                        {String(day.date.getDate()).padStart(2, '0')}.{String(day.date.getMonth() + 1).padStart(2, '0')}
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto">
                      {day.capsules.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-[10px] text-ink-mute italic">
                          —
                        </div>
                      ) : (
                        day.capsules.map(capsule => (
                          <div key={capsule.id} onClick={() => openCapsule(capsule)}>
                            {capsule.kind === 'order' ? (
                              <AllCapsule order={capsule.order} stepsMap={stepsMap} />
                            ) : capsule.item.type === 'CD' ? (
                              <CDItemCapsule order={capsule.order} item={capsule.item} stepsMap={stepsMap} />
                            ) : (
                              <GMItemCapsule order={capsule.order} item={capsule.item} stepsMap={stepsMap} />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {diffPopupOrder && (
        <DiffPopup
          order={diffPopupOrder.order}
          onClose={() => setDiffPopupOrder(null)}
          onViewDetails={() => {
            setSelected({ order: diffPopupOrder.order, focusItemId: diffPopupOrder.focusItemId })
            setDiffPopupOrder(null)
          }}
        />
      )}

      {selected && (() => {
        // Liste des commandes du meme jour (non annulees en premier, puis annulees)
        const selectedDayKey = selected.order.delivery_at?.slice(0, 10)
        const dayOrders = filteredOrders
          .filter(o => o.delivery_at?.slice(0, 10) === selectedDayKey)
          .sort((a, b) => {
            // Annulees a la fin
            const aCancel = a.odoo_state === 'cancel' ? 1 : 0
            const bCancel = b.odoo_state === 'cancel' ? 1 : 0
            if (aCancel !== bCancel) return aCancel - bCancel
            // Sinon par delivery_at puis order_num
            if (a.delivery_at !== b.delivery_at) {
              return (a.delivery_at || '').localeCompare(b.delivery_at || '')
            }
            return (a.order_num || '').localeCompare(b.order_num || '')
          })
        return (
          <OrderModal
            order={selected.order}
            focusItemId={selected.focusItemId}
            dayOrders={dayOrders}
            onNavigate={(newOrder) => setSelected({ order: newOrder, focusItemId: null })}
            onClose={() => setSelected(null)}
            user={user}
            profiles={profiles}
            onStepsChanged={handleStepsChanged}
            onPolysChanged={handlePolysChanged}
            onOrderDeleted={handleOrderDeleted}
          />
        )
      })()}

      {showGmConfig && (
        <AdminGmConfig onClose={() => setShowGmConfig(false)} />
      )}

      {showAdmin && (
        <AdminUsers
          currentUser={user}
          onClose={() => {
            setShowAdmin(false)
            loadAllProfiles().then(p => setProfiles(p))
          }}
        />
      )}

      {showChangePwd && (
        <ChangePasswordModal
          user={user}
          onClose={() => setShowChangePwd(false)}
        />
      )}
    </div>
  )
}

function SearchResults({ orders, stepsMap, onOrderClick, query }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto">
        <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-ink-mute mb-3">
          {orders.length} résultat{orders.length > 1 ? 's' : ''} pour « {query} »
        </div>
        {orders.length === 0 ? (
          <div className="text-center text-ink-mute italic py-12">
            Aucune commande ne correspond
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {orders.map(order => (
              <SearchResultRow
                key={order.id}
                order={order}
                stepsMap={stepsMap}
                onClick={() => onOrderClick(order)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SearchResultRow({ order, stepsMap, onClick }) {
  const dt = new Date(order.delivery_at)
  const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  const photoUrl = getAnyOrderPhoto(order)
  const cancelled = isCancelled(order)
  const modified = isModified(order)

  return (
    <div
      onClick={onClick}
      className={`bg-cream rounded-lg p-3 border border-line/60 hover:border-bordeaux hover:shadow-sm cursor-pointer transition-all flex items-center gap-3 ${cancelled ? 'opacity-60' : ''}`}
    >
      {photoUrl && (
        <img src={photoUrl} alt="" className={`w-12 h-12 rounded-md object-cover flex-shrink-0 ${cancelled ? 'grayscale' : ''}`} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[11px] text-bordeaux font-semibold ${cancelled ? 'line-through' : ''}`}>{order.order_num}</span>
          <span className={`text-[12px] text-ink font-medium truncate ${cancelled ? 'line-through' : ''}`}>{order.client_name || '—'}</span>
          {cancelled && <CancelledBadge />}
          {!cancelled && modified && <ModifiedBadge />}
        </div>
        <div className="text-[11px] text-ink-soft mt-0.5">
          {dateStr} · {formatTime(dt)}
        </div>
      </div>
      <ProgressDotsOrder order={order} stepsMap={stepsMap} />
    </div>
  )
}

function FilterButton({ active, onClick, label, small }) {
  const sizeClasses = small ? 'px-3 py-1 text-[10px]' : 'px-4 py-1.5 text-[11px]'
  return (
    <button
      onClick={onClick}
      className={`${sizeClasses} rounded-full font-medium tracking-wider uppercase transition-all ${active ? 'bg-bordeaux text-cream shadow-sm' : 'bg-cream text-ink-soft border border-line hover:border-bordeaux hover:text-bordeaux'}`}
    >
      {label}
    </button>
  )
}

function ProgressDotsOrder({ order, stepsMap }) {
  const total = totalSequentialSteps(order)
  const done = checkedSequentialSteps(order, stepsMap)
  return <ProgressDotsRaw total={total} done={done} />
}

function ProgressDotsItem({ item, stepsMap }) {
  const total = itemTotalSteps(item)
  const done = itemCheckedSteps(item, stepsMap)
  return <ProgressDotsRaw total={total} done={done} />
}

function ProgressDotsRaw({ total, done }) {
  if (total === 0) return null
  return (
    <div className="flex items-center gap-1 flex-shrink-0" title={`${done}/${total} étapes complétées`}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`w-2 h-2 rounded-full transition-all ${
              i < done ? 'bg-ok shadow-sm' : 'bg-line/80 border border-line'
            }`}
          />
        ))}
      </div>
      <span className={`font-mono text-[9px] font-semibold ml-1 ${done === total ? 'text-ok' : 'text-ink-mute'}`}>
        {done}/{total}
      </span>
    </div>
  )
}

function MiniPhoto({ url, dimmed }) {
  if (!url) return null
  return (
    <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 border border-line/60 bg-cream-warm">
      <img
        src={url}
        alt=""
        className={`w-full h-full object-cover ${dimmed ? 'grayscale' : ''}`}
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
    </div>
  )
}

function WarningBadge() {
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-bordeaux text-cream text-[9px] font-bold flex-shrink-0"
      title="Avertissement à lire"
    >
      !
    </span>
  )
}

function PolyBadge() {
  return (
    <span
      className="font-sans text-[10px] font-bold text-cream bg-bordeaux px-1.5 py-0.5 rounded tracking-wider uppercase"
      title="Polys à choisir"
    >
      poly
    </span>
  )
}

function CancelledBadge() {
  return (
    <span
      className="font-sans text-[9px] font-bold text-cream bg-ink-mute px-1.5 py-0.5 rounded tracking-wider uppercase flex-shrink-0"
      title="Commande annulée"
    >
      Annulé
    </span>
  )
}

function ModifiedBadge() {
  return (
    <span
      className="font-sans text-[9px] font-bold text-cream bg-gold px-1.5 py-0.5 rounded tracking-wider uppercase flex-shrink-0"
      title="Commande modifiée"
    >
      Modifié
    </span>
  )
}

function AllCapsule({ order, stepsMap }) {
  const deliveryTime = formatTime(new Date(order.delivery_at))
  const cdItems = order.order_items.filter(i => i.type === 'CD')
  const gmItems = order.order_items.filter(i => i.type === 'GM')
  const photoUrl = getAnyOrderPhoto(order)
  const warningOnOrder = hasWarning(order)
  const mainCD = cdItems[0]
  const needsPolys = orderMainCdNeedsPolys(order)
  const cancelled = isCancelled(order)
  const modified = isModified(order)

  const titleClass = cancelled ? 'line-through' : ''

  return (
    <div className={`bg-cream rounded-lg p-2 border border-line/60 hover:border-bordeaux hover:shadow-sm cursor-pointer transition-all ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <span className={`font-mono text-[10px] tracking-wider text-bordeaux font-semibold flex items-center gap-1.5 min-w-0 ${titleClass}`}>
          <span className="truncate">{order.order_num}</span>
          {warningOnOrder && <WarningBadge />}
        </span>
        <span className="font-mono text-[10px] text-ink-soft font-medium flex-shrink-0">{deliveryTime}</span>
      </div>

      {(cancelled || modified) && (
        <div className="flex gap-1 mb-1.5">
          {cancelled && <CancelledBadge />}
          {!cancelled && modified && <ModifiedBadge />}
        </div>
      )}

      <div className="flex items-center gap-2">
        <MiniPhoto url={photoUrl} dimmed={cancelled} />
        <div className="flex-1 min-w-0">
          {mainCD ? (
            <div className="space-y-0.5">
              {(mainCD.etages_count || mainCD.pers) && (
                <div className={`text-[11px] text-ink leading-tight ${titleClass}`}>
                  {mainCD.etages_count && (
                    <span className="font-medium">
                      {mainCD.etages_count} étage{mainCD.etages_count > 1 ? 's' : ''}
                    </span>
                  )}
                  {mainCD.etages_count && mainCD.pers && <span className="text-ink-mute"> · </span>}
                  {mainCD.pers && <span className="font-medium">{mainCD.pers} pers</span>}
                </div>
              )}
              {mainCD.theme && (
                <div className={`text-[10px] text-ink-soft italic leading-tight truncate ${titleClass}`}>
                  {mainCD.theme}
                </div>
              )}
            </div>
          ) : gmItems.length > 0 ? (
            <div className={`text-[11px] text-ink leading-tight ${titleClass}`}>
              {gmItems.length} accessoire{gmItems.length > 1 ? 's' : ''}
            </div>
          ) : null}
        </div>
      </div>

      {(cdItems.length > 1 || (mainCD && gmItems.length > 0)) && (
        <div className="flex gap-1 flex-wrap mt-1.5">
          {cdItems.length > 1 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 bg-bordeaux/10 text-bordeaux rounded">
              +{cdItems.length - 1} CD
            </span>
          )}
          {mainCD && gmItems.length > 0 && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 bg-gold/15 text-chocolate rounded">
              +{gmItems.length} GM
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-1.5">
        <div>{!cancelled && needsPolys && <PolyBadge />}</div>
        <ProgressDotsOrder order={order} stepsMap={stepsMap} />
      </div>
    </div>
  )
}

function CDItemCapsule({ order, item, stepsMap }) {
  const deliveryTime = formatTime(new Date(order.delivery_at))
  const photoUrl = getAnyOrderPhoto(order)
  const itemWarning = itemHasWarning(item)
  const needsPolys = cdItemNeedsPolys(item)
  const cancelled = isCancelled(order)
  const modified = itemIsModified(item) || isModified(order)
  const titleClass = cancelled ? 'line-through' : ''

  return (
    <div className={`bg-cream rounded-lg p-2 border border-line/60 hover:border-bordeaux hover:shadow-sm cursor-pointer transition-all ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <span className={`font-mono text-[10px] tracking-wider text-bordeaux font-semibold flex items-center gap-1.5 min-w-0 ${titleClass}`}>
          <span className="truncate">{order.order_num}</span>
          <span className="text-[8px] font-mono px-1 py-0.5 bg-bordeaux/10 text-bordeaux rounded flex-shrink-0">CD</span>
          {itemWarning && <WarningBadge />}
        </span>
        <span className="font-mono text-[10px] text-ink-soft font-medium flex-shrink-0">{deliveryTime}</span>
      </div>

      {(cancelled || modified) && (
        <div className="flex gap-1 mb-1.5">
          {cancelled && <CancelledBadge />}
          {!cancelled && modified && <ModifiedBadge />}
        </div>
      )}

      <div className="flex items-center gap-2">
        <MiniPhoto url={photoUrl} dimmed={cancelled} />
        <div className="flex-1 min-w-0 space-y-0.5">
          {(item.etages_count || item.pers) && (
            <div className={`text-[11px] text-ink leading-tight ${titleClass}`}>
              {item.etages_count && (
                <span className="font-medium">
                  {item.etages_count} étage{item.etages_count > 1 ? 's' : ''}
                </span>
              )}
              {item.etages_count && item.pers && <span className="text-ink-mute"> · </span>}
              {item.pers && <span className="font-medium">{item.pers} pers</span>}
            </div>
          )}
          {item.theme && (
            <div className={`text-[10px] text-ink-soft italic leading-tight truncate ${titleClass}`}>
              {item.theme}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-1.5">
        <div>{!cancelled && needsPolys && <PolyBadge />}</div>
        <ProgressDotsItem item={item} stepsMap={stepsMap} />
      </div>
    </div>
  )
}

function GMItemCapsule({ order, item, stepsMap }) {
  const deliveryTime = formatTime(new Date(order.delivery_at))
  const photoUrl = getAnyOrderPhoto(order)
  const itemWarning = itemHasWarning(item)
  const cancelled = isCancelled(order)
  const modified = itemIsModified(item) || isModified(order)
  const titleClass = cancelled ? 'line-through' : ''

  return (
    <div className={`bg-cream rounded-lg p-2 border border-line/60 hover:border-gold hover:shadow-sm cursor-pointer transition-all ${cancelled ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between mb-1.5 gap-1">
        <span className={`font-mono text-[10px] tracking-wider text-chocolate font-semibold flex items-center gap-1.5 min-w-0 ${titleClass}`}>
          <span className="truncate">{order.order_num}</span>
          <span className="text-[8px] font-mono px-1 py-0.5 bg-gold/20 text-chocolate rounded flex-shrink-0">GM</span>
          {itemWarning && <WarningBadge />}
        </span>
        <span className="font-mono text-[10px] text-ink-soft font-medium flex-shrink-0">{deliveryTime}</span>
      </div>

      {(cancelled || modified) && (
        <div className="flex gap-1 mb-1.5">
          {cancelled && <CancelledBadge />}
          {!cancelled && modified && <ModifiedBadge />}
        </div>
      )}

      <div className="flex items-center gap-2">
        <MiniPhoto url={photoUrl} dimmed={cancelled} />
        <div className="flex-1 min-w-0">
          <div className={`text-[11px] text-ink leading-tight font-medium truncate ${titleClass}`}>
            {item.title || '—'}
          </div>
          {item.parfums && item.parfums.length > 0 && (
            <div className={`text-[10px] text-ink-soft italic leading-tight truncate mt-0.5 ${titleClass}`}>
              {item.parfums.join(', ')}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end mt-1.5">
        <ProgressDotsItem item={item} stepsMap={stepsMap} />
      </div>
    </div>
  )
}

// ==========================================
// DIFF POPUP - affiche les modifications d'une commande
// ==========================================

const DIFF_FIELD_LABELS = {
  title: 'Produit',
  theme: 'Thème',
  message: 'Message',
  age: 'Âge',
  parfums: 'Parfums',
  etages_count: 'Étages',
  pers: 'Personnes / Boîte',
  taille_value: 'Taille',
  quantity: 'Quantité',
  image_urls: 'Photos',
  warnings: 'Avertissement',
}

function formatDiffValue(val) {
  if (val == null || val === '') return '—'
  if (Array.isArray(val)) {
    if (val.length === 0) return '—'
    if (val.every(v => typeof v === 'string')) return val.join(', ')
    return `${val.length} élément(s)`
  }
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function DiffPopup({ order, onClose, onViewDetails }) {
  const items = order.order_items || []
  const itemsByIdx = new Map()
  for (const it of items) itemsByIdx.set(it.item_idx, it)

  // Construit la liste des modifications a afficher
  const modifiedItems = items
    .filter(it => it.last_changes && Object.keys(it.last_changes).length > 0)
    .sort((a, b) => a.item_idx - b.item_idx)

  // Items ajoutes ou supprimes (depuis last_changes_summary)
  const summary = order.last_changes_summary || {}
  const itemActions = []
  for (const [key, changes] of Object.entries(summary)) {
    const idx = parseInt(key.replace('item_', ''), 10)
    if (Array.isArray(changes)) {
      if (changes.includes('ajoute')) itemActions.push({ idx, action: 'ajoute', item: itemsByIdx.get(idx) })
      if (changes.includes('supprime')) itemActions.push({ idx, action: 'supprime' })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl border border-line"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-line px-6 py-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[16px]">📝</span>
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-gold font-bold">
              Modification
            </span>
          </div>
          <div className="font-fraunces italic text-[20px] font-medium text-ink leading-tight">
            Cette commande a été modifiée
          </div>
          <div className="font-mono text-[11px] text-bordeaux mt-1.5">
            {order.order_num} · {order.client_name}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {modifiedItems.length === 0 && itemActions.length === 0 && (
            <div className="text-center text-ink-mute italic py-4">
              Aucun détail disponible
            </div>
          )}

          {/* Items modifies */}
          {modifiedItems.map(item => (
            <div key={item.id} className="rounded-lg border border-line/60 bg-cream-warm p-3">
              <div className="font-mono text-[10px] tracking-wider uppercase text-bordeaux font-semibold mb-2">
                {item.type}- {item.title}
              </div>
              <div className="space-y-1.5">
                {Object.entries(item.last_changes).map(([field, change]) => (
                  <div key={field} className="text-[12px] leading-snug">
                    <span className="font-medium text-ink">
                      {DIFF_FIELD_LABELS[field] || field}
                    </span>
                    <span className="text-ink-mute"> : </span>
                    <span className="text-bordeaux line-through">
                      {formatDiffValue(change.from)}
                    </span>
                    <span className="text-ink-mute mx-1">→</span>
                    <span className="text-ok font-medium">
                      {formatDiffValue(change.to)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Items ajoutes / supprimes */}
          {itemActions.map(({ idx, action, item }) => (
            <div key={`act-${idx}-${action}`} className="rounded-lg border border-gold/40 bg-gold/5 p-3">
              <div className="text-[12px]">
                {action === 'ajoute' ? (
                  <>
                    <span className="font-mono text-[10px] tracking-wider uppercase text-gold font-semibold">
                      ➕ Item ajouté
                    </span>
                    {item && (
                      <span className="text-ink ml-2">
                        {item.type}- {item.title}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-mono text-[10px] tracking-wider uppercase text-bordeaux font-semibold">
                    ➖ Item supprimé (idx {idx})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-line px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-[11px] font-medium tracking-wider uppercase text-ink-soft border border-line rounded-lg hover:bg-cream-warm transition-all"
          >
            Fermer
          </button>
          <button
            onClick={onViewDetails}
            className="flex-1 px-4 py-2.5 text-[11px] font-medium tracking-wider uppercase bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all"
          >
            Voir détails
          </button>
        </div>
      </div>
    </div>
  )
}

// ==========================================
