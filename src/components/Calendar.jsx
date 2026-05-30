import { useState, useEffect, useMemo, useRef } from 'react'
import { Search, Printer, FileText } from 'lucide-react'
import {
  loadOrdersForWeek,
  loadAllOrders,
  loadStepsForOrders,
  cleanupOldOrders,
  loadAllProfiles,
} from '../lib/orders'
import { logout, canSync, canManageUsers, canPatissier, isPatissierOnly, canPrintBatch, canRecaps, isAdmin } from '../lib/auth'
import AdminUsers from './AdminUsers'
import ChangePasswordModal from './ChangePasswordModal'
import OrderModal from './OrderModal'
import AdminGmConfig from './AdminGmConfig'
import PrintBatchModal from './PrintBatchModal'
import RecapVentes from './RecapVentes'
import AppHeader from './AppHeader'
import { filterUnprintedOrders, filterCurrentWeek } from '../lib/printOrders'

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
  // Une commande est "modifiee" UNIQUEMENT si :
  // - Elle a un last_changes_summary non vide (= vraie modif detectee par sync Odoo)
  if (order.last_changes_summary && Object.keys(order.last_changes_summary).length > 0) {
    return true
  }
  return false
}

function itemIsModified(item) {
  // Un item est modifie UNIQUEMENT si last_changes contient une entree
  if (item.last_changes && Object.keys(item.last_changes).length > 0) {
    return true
  }
  return false
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


function filterOrderItemsForView(order, isPatissierMode) {
  // 1) On retire systematiquement les items a quantite zero (acompte, lignes
  //    Odoo ajoutees pour reference, etc.) : ils n'ont pas a apparaitre nulle
  //    part dans le calendrier ni dans les fiches/imprimes derives.
  const rawItems = order.order_items || []
  let filteredItems = rawItems.filter(i => {
    const q = parseFloat(i?.quantity)
    return !isNaN(q) && q > 0
  })
  // 2) En mode patissier on ne garde que les items GM
  if (isPatissierMode) {
    filteredItems = filteredItems.filter(i => i.type === 'GM')
  }
  return { ...order, order_items: filteredItems }
}

export default function Calendar({ user, onLogout, activeView, onNavigate }) {
  // Helpers nav
  const goPatissier = () => onNavigate && onNavigate('patissier')
  const goProd = () => onNavigate && onNavigate('prod')
  const goSales = () => onNavigate && onNavigate('sales')
  const goRecap = () => onNavigate && onNavigate('recap')
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
  const [mobileDayIdx, setMobileDayIdx] = useState(0) // jour affiché sur téléphone
  const touchStartXRef = useRef(null)
  const [profiles, setProfiles] = useState({})

  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const userCanSync = canSync(user)
  const canAdmin = canManageUsers(user)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showRecaps, setShowRecaps] = useState(false)
  const [showGmConfig, setShowGmConfig] = useState(false)
  const [showBatchPrint, setShowBatchPrint] = useState(false)
  const [viewMode, setViewMode] = useState(() => {
    // Si user n'est QUE patissier (pas admin), force mode patissier
    return isPatissierOnly(user) ? 'patissier' : 'admin'
  })
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

  // SYNC AUTO toutes les 15 min, pause si onglet inactif
  useEffect(() => {
    const INTERVAL_MS = 15 * 60 * 1000  // 15 minutes
    let timer = null

    async function silentSync() {
      // sync silencieuse : pas d'alerte si erreur, pas de status visible
      if (document.hidden) return  // skip si onglet inactif
      if (syncing) return  // skip si deja en cours
      try {
        await fetch('/api/sync-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        })
        const fresh = await loadOrdersForWeek(currentMonday)
        setOrders(fresh)
      } catch (e) {
        console.warn('[sync auto] erreur (ignoree):', e.message)
      }
    }

    function start() {
      stop()
      timer = setInterval(silentSync, INTERVAL_MS)
    }
    function stop() {
      if (timer) { clearInterval(timer); timer = null }
    }

    function onVisibilityChange() {
      if (document.hidden) stop()
      else { silentSync(); start() }  // sync immediat au retour + relance timer
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, currentMonday])

  const isPatissierMode = viewMode === 'patissier'

  // Commandes de la semaine courante non imprimees (pour le bouton batch)
  const unprintedThisWeek = useMemo(() => {
    const inWeek = filterCurrentWeek(orders, currentMonday)
    return filterUnprintedOrders(inWeek)
      .filter(o => o.odoo_state !== 'cancel') // exclure annulees
      .sort((a, b) => {
        const da = a.delivery_at ? new Date(a.delivery_at).getTime() : 0
        const db = b.delivery_at ? new Date(b.delivery_at).getTime() : 0
        return da - db
      })
  }, [orders, currentMonday])
  const isSearching = searchQuery.trim().length > 0
  const sourceOrders = isSearching ? allOrders : orders

  const filteredOrders = useMemo(() => {
    return sourceOrders.filter(order => {
      if (isSearching) {
        const q = normalizeForSearch(searchQuery.trim())
        const inOrderNum = normalizeForSearch(order.order_num).includes(q)
        const inClient = normalizeForSearch(order.client_name).includes(q)
        // Recherche dans theme, message, age, title des items
        const inItems = (order.order_items || []).some(i =>
          normalizeForSearch(i.theme).includes(q) ||
          normalizeForSearch(i.message).includes(q) ||
          normalizeForSearch(i.title).includes(q) ||
          normalizeForSearch(i.age).includes(q)
        )
        if (!inOrderNum && !inClient && !inItems) return false
      }

      // En mode patissier : ne garder que les commandes avec au moins 1 GM
      if (isPatissierMode) {
        const hasGm = (order.order_items || []).some(i => i.type === 'GM')
        if (!hasGm) return false
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
  }, [sourceOrders, isSearching, searchQuery, typeFilter, statusFilter, stepsMap, isPatissierMode])

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

      return { date: day, capsules: ordersToCapsules(dayOrders.map(o => filterOrderItemsForView(o, isPatissierMode))) }
    })
  }, [currentMonday, filteredOrders, isSearching, typeFilter, statusFilter, stepsMap])

  // Téléphone : à chaque changement de semaine, ouvrir le jour d'aujourd'hui (sinon lundi)
  useEffect(() => {
    const ti = Array.from({ length: 7 }, (_, i) => addDays(currentMonday, i)).findIndex(d => isSameDay(d, today))
    setMobileDayIdx(ti >= 0 ? ti : 0)
  }, [currentMonday])

  function openCapsule(capsule) {
    const focusItemId = capsule.kind === 'item' ? capsule.item.id : null
    // Si la commande a une modification non vue ET pas annulee -> popup diff d'abord
    if (capsule.order.last_changes_summary && Object.keys(capsule.order.last_changes_summary).length > 0 && capsule.order.odoo_state !== 'cancel') {
      setDiffPopupOrder({ order: capsule.order, focusItemId })
    } else {
      setSelected({ order: capsule.order, focusItemId })
    }
  }

  function openOrder(order) {
    if (order.last_changes_summary && Object.keys(order.last_changes_summary).length > 0 && order.odoo_state !== 'cancel') {
      setDiffPopupOrder({ order, focusItemId: null })
    } else {
      setSelected({ order, focusItemId: null })
    }
  }

  // Affiche les capsules (commandes) d'un jour — utilisé en vue ordinateur et téléphone
  function renderDayCapsules(day) {
    if (day.capsules.length === 0) {
      return <div className="py-4 flex items-center justify-center text-[11px] text-ink-mute italic">—</div>
    }
    return day.capsules.map(capsule => (
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
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <AppHeader
        user={user}
        activeView={activeView || 'calendar'}
        onNavigate={onNavigate}
        onLogout={onLogout}
        onSyncSuccess={async () => {
          const fresh = await loadOrdersForWeek(currentMonday)
          setOrders(fresh)
        }}
      />

      <header className="bg-cream border-b border-line px-4 py-3 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="flex-1 max-w-xs relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Rechercher S47... ou nom"
            className="w-full px-3 py-2 pl-8 text-[12px] bg-cream-warm border border-line rounded-full focus:outline-none focus:border-bordeaux transition-all"
          />
          <Search size={13} strokeWidth={1.8} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-mute" />
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
        {/* Navigation semaine (centree) */}
        {!isSearching && (
          <div className="flex items-center gap-1.5 flex-shrink-0 mx-auto">
            <button
              onClick={() => setCurrentMonday(addDays(currentMonday, -7))}
              className="w-8 h-8 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Semaine précédente"
            >‹</button>
            <div className="text-center min-w-[140px] px-1">
              <div className="font-fraunces text-[13px] font-medium text-ink capitalize leading-tight">
                {formatWeekRange(currentMonday)}
              </div>
              <div className="font-mono text-[8px] tracking-[0.15em] uppercase text-ink-mute">
                Sem. {getWeekNumber(currentMonday)} {loadingOrders && '·...'}
              </div>
            </div>
            <button
              onClick={() => setCurrentMonday(addDays(currentMonday, 7))}
              className="w-8 h-8 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Semaine suivante"
            >›</button>
            <button
              onClick={() => setCurrentMonday(getMondayOf(new Date()))}
              className="px-2.5 py-1 text-[9px] font-mono tracking-[0.15em] uppercase text-bordeaux border border-bordeaux rounded-full hover:bg-bordeaux hover:text-cream transition-all flex-shrink-0"
            >Aujourd'hui</button>
          </div>
        )}

        {/* Groupe Imprimer + Etiquettes a droite */}
        <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
          {/* Bouton impression batch */}
          {canPrintBatch(user) && !isPatissierMode && (
            <button
              onClick={() => unprintedThisWeek.length > 0 && setShowBatchPrint(true)}
              disabled={unprintedThisWeek.length === 0}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium tracking-wider transition-all flex-shrink-0 ${
                unprintedThisWeek.length > 0
                  ? 'border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream cursor-pointer'
                  : 'border border-line text-ink-mute cursor-not-allowed opacity-60'
              }`}
              title={
                unprintedThisWeek.length > 0
                  ? `${unprintedThisWeek.length} commande(s) non imprimee(s) cette semaine`
                  : 'Aucune nouvelle commande a imprimer'
              }
            >
              <Printer size={14} strokeWidth={1.8} />
              <span>{unprintedThisWeek.length}</span>
            </button>
          )}
          {/* Bouton Etiquettes Zebra deplace dans AppHeader */}
        </div>

      </header>

      {/* Ancienne barre semaine supprimee, integree au header ci-dessus */}

      <div className="bg-cream border-b border-line px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <FilterButton active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label="Tous" />
          <FilterButton active={typeFilter === 'cd'} onClick={() => setTypeFilter('cd')} label="Gâteaux" />
          <FilterButton active={typeFilter === 'gm'} onClick={() => setTypeFilter('gm')} label="Accessoires" />
          <span className="w-px h-3.5 bg-line" aria-hidden="true" />
          <FilterButton active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} label="En cours" small />
          <FilterButton active={statusFilter === 'couvrir'} onClick={() => setStatusFilter('couvrir')} label="À couvrir" small />
          <FilterButton active={statusFilter === 'faire'} onClick={() => setStatusFilter('faire')} label="À faire" small />
          <FilterButton active={statusFilter === 'ranger'} onClick={() => setStatusFilter('ranger')} label="À ranger" small />
          <FilterButton active={statusFilter === 'range'} onClick={() => setStatusFilter('range')} label="Rangé" small />
          <span className="w-px h-3.5 bg-line" aria-hidden="true" />
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
          {/* ORDINATEUR : grille 7 colonnes (inchangée) */}
          <div className="hidden md:block h-full overflow-hidden">
            <div className="h-full grid grid-cols-7 gap-2 p-3">
              {days.map((day, idx) => {
                const isToday = isSameDay(day.date, today)
                const isPast = day.date < today
                return (
                  <div
                    key={idx}
                    className={`flex flex-col rounded-xl p-2.5 ${isToday ? 'bg-cream border border-bordeaux shadow-sm' : 'bg-cream-warm border border-transparent'} ${isPast ? 'opacity-55' : ''}`}
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
                      {renderDayCapsules(day)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* TÉLÉPHONE : un jour à la fois, swipe ←→ pour changer */}
          <div className="md:hidden flex flex-col h-full">
            {/* Sélecteur des 7 jours */}
            <div className="flex gap-1 px-2 pt-2">
              {days.map((d, i) => {
                const isToday = isSameDay(d.date, today)
                const sel = i === mobileDayIdx
                return (
                  <button
                    key={i}
                    onClick={() => setMobileDayIdx(i)}
                    className={`flex-1 py-1 rounded-lg text-center leading-tight ${sel ? 'bg-bordeaux text-cream' : isToday ? 'bg-cream border border-bordeaux text-bordeaux' : 'bg-cream-warm text-ink-soft'}`}
                  >
                    <div className="text-[10px] font-medium capitalize">{DAY_NAMES[i].slice(0, 3)}</div>
                    <div className="text-[10px] font-mono">{String(d.date.getDate()).padStart(2, '0')}</div>
                  </button>
                )
              })}
            </div>
            {/* Jour courant */}
            <div
              className="flex-1 overflow-y-auto p-3"
              onTouchStart={e => { touchStartXRef.current = e.touches[0].clientX }}
              onTouchEnd={e => {
                if (touchStartXRef.current == null) return
                const dx = e.changedTouches[0].clientX - touchStartXRef.current
                touchStartXRef.current = null
                if (dx < -50) setMobileDayIdx(i => Math.min(i + 1, days.length - 1))
                else if (dx > 50) setMobileDayIdx(i => Math.max(i - 1, 0))
              }}
            >
              {days[mobileDayIdx] && (() => {
                const day = days[mobileDayIdx]
                const isToday = isSameDay(day.date, today)
                return (
                  <>
                    <div className="flex items-baseline justify-between pb-2 mb-3 border-b border-dashed border-line">
                      <div className="font-fraunces font-medium text-[18px] text-ink capitalize">
                        {DAY_NAMES[mobileDayIdx]}{isToday ? " · aujourd'hui" : ''}
                      </div>
                      <div className={`font-mono text-[13px] ${isToday ? 'bg-bordeaux text-cream px-2 py-0.5 rounded' : 'text-ink-mute'}`}>
                        {String(day.date.getDate()).padStart(2, '0')}.{String(day.date.getMonth() + 1).padStart(2, '0')}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {renderDayCapsules(day)}
                    </div>
                    <div className="text-center text-[10px] text-ink-mute mt-4">‹ glisse pour changer de jour ›</div>
                  </>
                )
              })()}
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
            isPatissierMode={isPatissierMode}
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

      {showBatchPrint && (
        <PrintBatchModal
          orders={unprintedThisWeek}
          user={user}
          onClose={() => setShowBatchPrint(false)}
          onPrinted={async () => {
            // Recharger les commandes pour avoir les nouveaux printed_at
            const fresh = await loadOrdersForWeek(currentMonday)
            setOrders(fresh)
          }}
        />
      )}

      {showGmConfig && (
        <AdminGmConfig onClose={() => setShowGmConfig(false)} />
      )}

      {/* Modal Recap : remplace par navigation plein ecran via onNavigate */}

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
      className={`bg-cream rounded-xl p-3 border border-line/60 shadow-sm hover:border-bordeaux hover:shadow-md cursor-pointer transition-all flex items-center gap-3 ${cancelled ? 'opacity-60' : ''}`}
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
  // Style epure : texte simple, soulignement bordeaux quand actif
  const sizeClass = small ? 'text-[11px]' : 'text-[12px]'
  return (
    <button
      onClick={onClick}
      className={`${sizeClass} px-1 pb-0.5 font-normal whitespace-nowrap transition-colors border-b-[1.5px] ${
        active
          ? 'text-bordeaux border-bordeaux'
          : 'text-ink-soft border-transparent hover:text-bordeaux'
      }`}
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
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const isFull = done === total
  return (
    <div
      className="flex items-center gap-1.5 flex-shrink-0"
      title={`${done}/${total} étapes complétées`}
    >
      <div className="w-12 h-[3px] rounded-full bg-line/60 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isFull ? 'bg-ok' : 'bg-bordeaux/70'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-[9px] font-medium ${isFull ? 'text-ok' : 'text-ink-mute'}`}>
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
  // Point ambre discret au lieu d'un badge plein
  return (
    <span
      className="inline-block w-[7px] h-[7px] rounded-full bg-gold flex-shrink-0"
      title="Commande modifiée"
      aria-label="Modifié"
    />
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
    <div className={`bg-cream rounded-xl border border-line/60 shadow-sm hover:border-bordeaux hover:shadow-md cursor-pointer transition-all ${cancelled ? 'opacity-60' : ''}`}>
      {/* === Mobile (< md) === */}
      <div className="md:hidden p-2.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={`font-mono text-[12px] tracking-wider text-bordeaux font-semibold flex items-center gap-1.5 min-w-0 ${titleClass}`}>
            <span className="truncate">{order.order_num}</span>
            {warningOnOrder && <WarningBadge />}
          </span>
          <div className="flex-shrink-0">
            <ProgressDotsOrder order={order} stepsMap={stepsMap} />
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="font-mono text-[12px] text-ink-soft font-medium">{deliveryTime}</span>
            {!cancelled && needsPolys && <PolyBadge />}
          </div>
        </div>

        {(cancelled || modified) && (
          <div className="flex gap-1 mb-2">
            {cancelled && <CancelledBadge />}
            {!cancelled && modified && <ModifiedBadge />}
          </div>
        )}

        <div className="flex items-start gap-3">
          {photoUrl && (
            <div className="w-28 h-28 rounded-lg overflow-hidden border border-line/60 bg-cream-warm flex-shrink-0">
              <img
                src={photoUrl}
                alt=""
                className={`w-full h-full object-cover ${cancelled ? 'grayscale' : ''}`}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            {mainCD ? (
              <>
                {(mainCD.etages_count || mainCD.pers) && (
                  <div className={`text-[13px] text-ink leading-tight ${titleClass}`}>
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
                  <div className={`text-[12px] text-ink-soft italic leading-tight ${titleClass}`}>
                    {mainCD.theme}
                  </div>
                )}
              </>
            ) : gmItems.length > 0 ? (
              <div className={`text-[13px] text-ink leading-tight ${titleClass}`}>
                {gmItems.length} accessoire{gmItems.length > 1 ? 's' : ''}
              </div>
            ) : null}

            {(cdItems.length > 1 || (mainCD && gmItems.length > 0)) && (
              <div className="flex gap-1 flex-wrap pt-1">
                {cdItems.length > 1 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-bordeaux/10 text-bordeaux rounded">
                    +{cdItems.length - 1} CD
                  </span>
                )}
                {mainCD && gmItems.length > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 bg-gold/15 text-chocolate rounded">
                    +{gmItems.length} GM
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === Desktop (md+) — original === */}
      <div className="hidden md:block p-2">
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
    <div className={`bg-cream rounded-xl border border-line/60 shadow-sm hover:border-bordeaux hover:shadow-md cursor-pointer transition-all ${cancelled ? 'opacity-60' : ''}`}>
      {/* === Mobile (< md) : progression au milieu, Poly sous l'horaire, image en grand === */}
      <div className="md:hidden p-2.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={`font-mono text-[12px] tracking-wider text-bordeaux font-semibold flex items-center gap-1.5 min-w-0 ${titleClass}`}>
            <span className="truncate">{order.order_num}</span>
            <span className="text-[9px] font-mono px-1 py-0.5 bg-bordeaux/10 text-bordeaux rounded flex-shrink-0">CD</span>
            {itemWarning && <WarningBadge />}
          </span>
          <div className="flex-shrink-0">
            <ProgressDotsItem item={item} stepsMap={stepsMap} />
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="font-mono text-[12px] text-ink-soft font-medium">{deliveryTime}</span>
            {!cancelled && needsPolys && <PolyBadge />}
          </div>
        </div>

        {(cancelled || modified) && (
          <div className="flex gap-1 mb-2">
            {cancelled && <CancelledBadge />}
            {!cancelled && modified && <ModifiedBadge />}
          </div>
        )}

        <div className="flex items-start gap-3">
          {photoUrl && (
            <div className="w-28 h-28 rounded-lg overflow-hidden border border-line/60 bg-cream-warm flex-shrink-0">
              <img
                src={photoUrl}
                alt=""
                className={`w-full h-full object-cover ${cancelled ? 'grayscale' : ''}`}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            {(item.etages_count || item.pers) && (
              <div className={`text-[13px] text-ink leading-tight ${titleClass}`}>
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
              <div className={`text-[12px] text-ink-soft italic leading-tight ${titleClass}`}>
                {item.theme}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === Desktop (md+) : layout compact original === */}
      <div className="hidden md:block p-2">
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
    <div className={`bg-cream rounded-xl border border-line/60 shadow-sm hover:border-gold hover:shadow-md cursor-pointer transition-all ${cancelled ? 'opacity-60' : ''}`}>
      {/* === Mobile (< md) === */}
      <div className="md:hidden p-2.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={`font-mono text-[12px] tracking-wider text-chocolate font-semibold flex items-center gap-1.5 min-w-0 ${titleClass}`}>
            <span className="truncate">{order.order_num}</span>
            <span className="text-[9px] font-mono px-1 py-0.5 bg-gold/20 text-chocolate rounded flex-shrink-0">GM</span>
            {itemWarning && <WarningBadge />}
          </span>
          <div className="flex-shrink-0">
            <ProgressDotsItem item={item} stepsMap={stepsMap} />
          </div>
          <span className="font-mono text-[12px] text-ink-soft font-medium flex-shrink-0">{deliveryTime}</span>
        </div>

        {(cancelled || modified) && (
          <div className="flex gap-1 mb-2">
            {cancelled && <CancelledBadge />}
            {!cancelled && modified && <ModifiedBadge />}
          </div>
        )}

        <div className="flex items-start gap-3">
          {photoUrl && (
            <div className="w-28 h-28 rounded-lg overflow-hidden border border-line/60 bg-cream-warm flex-shrink-0">
              <img
                src={photoUrl}
                alt=""
                className={`w-full h-full object-cover ${cancelled ? 'grayscale' : ''}`}
                loading="lazy"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1">
            <div className={`text-[13px] text-ink leading-tight font-medium ${titleClass}`}>
              {item.title || '—'}
            </div>
            {item.parfums && item.parfums.length > 0 && (
              <div className={`text-[12px] text-ink-soft italic leading-tight ${titleClass}`}>
                {item.parfums.join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === Desktop (md+) — original === */}
      <div className="hidden md:block p-2">
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
            <FileText size={15} strokeWidth={1.8} className="text-gold" />
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
                      Item ajouté
                    </span>
                    {item && (
                      <span className="text-ink ml-2">
                        {item.type}- {item.title}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="font-mono text-[10px] tracking-wider uppercase text-bordeaux font-semibold">
                    Item supprimé (idx {idx})
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
