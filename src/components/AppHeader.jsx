import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { isAdmin, canRecaps, canSync, canSeeCalendar, canPrintLabels, canSeeFreezer, canSeeMessages, canSeeEtiquettes, canSeeCakeVision, canSeeChecklist, isLivreur, canStockPatissier, canStockCafe, canStockAudit, canStockGS, canSeeVitrineSale, canSeeCaisse, canSeeConversations} from '../lib/auth'
import { countUnreadTasks } from '../lib/tasks'
import ChangePasswordModal from './ChangePasswordModal'
import AdminUsers from './AdminUsers'
import AdminGmConfig from './AdminGmConfig'
import LabelsButton from './LabelsButton'

// ============================================================
// AppHeader : header de navigation unifie (Option B)
// 3 boutons fixes en 1 clic : Calendrier + Recap + onglet principal du role
// 3 menus deroulants : Production / Vitrine / Outils
// ============================================================
export default function AppHeader({ user, activeView, onNavigate, onLogout, onSyncSuccess }) {
  const admin = isAdmin(user)
  const isProdUser = !admin && (user?.perm_prod || user?.perm_sales)
  const isPatissierUser = !admin && user?.perm_patissier
  const userCanSync = canSync(user)

  const [showCog, setShowCog] = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showAdminUsers, setShowAdminUsers] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [lastSyncAt, setLastSyncAt] = useState(() => {
    const v = localStorage.getItem('lastSyncAt')
    return v ? new Date(v) : null
  })
  const [, setNow] = useState(0)
  // Badge "articles non termines" sur le bouton Reception Vitrine
  const [receptionBadge, setReceptionBadge] = useState(0)
  // Badge "articles a ranger" sur le bouton Checklist
  const [checklistBadge, setChecklistBadge] = useState(0)
  // Badge "taches non lues" sur le bouton Tâches
  const [tasksBadge, setTasksBadge] = useState(0)
  // Menus deroulants ouverts (un seul a la fois)
  const [openMenu, setOpenMenu] = useState(null) // 'prod' | 'vitrine' | 'outils' | null

  const showReceptionBtn = !isLivreur(user) && canStockCafe(user)
  const showChecklistBtn = !isLivreur(user) && canSeeChecklist(user)

  // Refresh affichage relatif chaque minute
  useEffect(() => {
    const t = setInterval(() => setNow(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  // Badge Reception Vitrine : compte les articles non termines du jour
  useEffect(() => {
    if (!showReceptionBtn) return
    let cancelled = false
    let channel = null

    const today = new Date().toISOString().slice(0, 10)

    async function refreshBadge() {
      try {
        const { data: sd, error: e1 } = await supabase
          .from('stock_day')
          .select('id')
          .eq('day', today)
          .maybeSingle()
        if (e1 || !sd) { if (!cancelled) setReceptionBadge(0); return }

        const { count, error: e2 } = await supabase
          .from('stock_day_items')
          .select('id', { count: 'exact', head: true })
          .eq('stock_day_id', sd.id)
          .eq('source', 'morning')
          .or('reception_status.eq.pending,discrepancy_status.in.(pending_patissier,pending_cafe)')
        if (!e2 && !cancelled) setReceptionBadge(count || 0)
      } catch (e) {
        console.warn('[receptionBadge]', e?.message || e)
      }
    }

    refreshBadge()

    channel = supabase
      .channel('reception-badge')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'stock_day_items' },
          () => { refreshBadge() })
      .subscribe()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReceptionBtn, user?.id])

  // Badge Checklist : compte les articles a ranger (toutes sections confondues)
  // Vitrine pending + lignes Prod 'done' non encore 'cafe_received'
  useEffect(() => {
    if (!showChecklistBtn) return
    let cancelled = false
    let channels = []

    const today = new Date().toISOString().slice(0, 10)
    const PROD_PREFIXES = ['E-', 'V-', 'GS-', 'MI-']
    // Fenetre commandes : aujourd'hui + 3 jours futurs
    const dt = new Date(today)
    dt.setDate(dt.getDate() + 4) // +4 = exclusif
    const toStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`

    async function refreshChecklistBadge() {
      try {
        // 1) Vitrine pending
        const { data: sd } = await supabase
          .from('stock_day').select('id').eq('day', today).maybeSingle()
        let vitCount = 0
        if (sd?.id) {
          const { count } = await supabase
            .from('stock_day_items')
            .select('id', { count: 'exact', head: true })
            .eq('stock_day_id', sd.id)
            .eq('source', 'morning')
            .eq('reception_status', 'pending')
          vitCount = count || 0
        }

        // 2) Lignes Prod : faites par Prod, non recues, prefixes E-/V-/GS-/MI-
        // Filtre par delivery_at (la table sales_lines n'a pas de colonne 'day')
        const todayDate = new Date(today)
        const nextDay = new Date(todayDate)
        nextDay.setDate(nextDay.getDate() + 1)
        const nextDayStr = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`
        const { data: lines } = await supabase
          .from('sales_lines')
          .select('odoo_line_id, product_name')
          .gte('delivery_at', `${today}T00:00:00`)
          .lt('delivery_at', `${nextDayStr}T00:00:00`)
        const candidateIds = (lines || [])
          .filter(l => l.product_name && PROD_PREFIXES.some(p => l.product_name.startsWith(p)))
          .map(l => l.odoo_line_id).filter(Boolean)

        let prodCount = 0
        if (candidateIds.length > 0) {
          const { data: dones } = await supabase
            .from('prod_done')
            .select('odoo_line_id, status')
            .in('odoo_line_id', candidateIds)
          const doneIds = (dones || []).filter(d => d.status === 'done').map(d => d.odoo_line_id)
          if (doneIds.length > 0) {
            const { data: receiveds } = await supabase
              .from('cafe_received')
              .select('odoo_line_id')
              .in('odoo_line_id', doneIds)
            const receivedSet = new Set((receiveds || []).map(r => r.odoo_line_id))
            prodCount = doneIds.filter(id => !receivedSet.has(id)).length
          }
        }

        // 3) Commandes CD/GM/GMD : items dont fait/fini coche mais pas range
        let cmdCount = 0
        const { data: orders } = await supabase
          .from('orders')
          .select('order_items(id, type)')
          .gte('delivery_at', `${today}T00:00:00`)
          .lt('delivery_at', `${toStr}T00:00:00`)
        const cmdItemIds = []
        const cmdItemType = new Map()
        for (const order of (orders || [])) {
          for (const it of (order.order_items || [])) {
            if (it.type === 'CD' || it.type === 'GM' || it.type === 'GMD') {
              cmdItemIds.push(it.id)
              cmdItemType.set(it.id, it.type)
            }
          }
        }
        if (cmdItemIds.length > 0) {
          const { data: steps } = await supabase
            .from('item_steps')
            .select('item_id, step_key')
            .in('item_id', cmdItemIds)
            .eq('done', true)
          // Pour chaque item : verifie si fait/fini coche mais pas range
          const stepsByItem = new Map()
          for (const s of (steps || [])) {
            if (!stepsByItem.has(s.item_id)) stepsByItem.set(s.item_id, new Set())
            stepsByItem.get(s.item_id).add(s.step_key)
          }
          for (const itemId of cmdItemIds) {
            const set = stepsByItem.get(itemId) || new Set()
            if (set.has('range')) continue
            const type = cmdItemType.get(itemId)
            if (type === 'CD' && set.has('fini')) cmdCount++
            else if ((type === 'GM' || type === 'GMD') && set.has('fait')) cmdCount++
          }
        }

        if (!cancelled) setChecklistBadge(vitCount + prodCount + cmdCount)
      } catch (e) {
        console.warn('[checklistBadge]', e?.message || e)
      }
    }

    refreshChecklistBadge()

    // Realtime sur 4 tables qui influent sur le badge
    channels = [
      supabase.channel('checklist-badge-stock')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_day_items' }, refreshChecklistBadge)
        .subscribe(),
      supabase.channel('checklist-badge-prod')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prod_done' }, refreshChecklistBadge)
        .subscribe(),
      supabase.channel('checklist-badge-cafe')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cafe_received' }, refreshChecklistBadge)
        .subscribe(),
      supabase.channel('checklist-badge-steps')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'item_steps' }, refreshChecklistBadge)
        .subscribe(),
    ]

    return () => {
      cancelled = true
      channels.forEach(c => supabase.removeChannel(c))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChecklistBtn, user?.id])

  // Badge Tâches : compte les taches non lues du user connecté
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    let channel = null

    async function refreshTasksBadge() {
      try {
        const n = await countUnreadTasks(user.id)
        if (!cancelled) setTasksBadge(n)
      } catch (e) {
        console.warn('[tasksBadge]', e?.message || e)
      }
    }

    refreshTasksBadge()

    // Realtime : refresh quand une tâche concernant ce user change
    channel = supabase
      .channel('tasks-badge-' + user.id)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'tasks' },
          () => { refreshTasksBadge() })
      .subscribe()

    // Refresh régulier toutes les 2 min (au cas où realtime louppe un event)
    const interval = setInterval(refreshTasksBadge, 2 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
      if (channel) supabase.removeChannel(channel)
    }
  }, [user?.id])

  // Auto-sync toutes les 5 min
  useEffect(() => {
    if (!userCanSync) return
    const CHECK_MS = 60 * 1000
    const MIN_INTERVAL_MS = 5 * 60 * 1000

    async function tryAutoSync() {
      if (syncing) return
      const lastStr = localStorage.getItem('lastSyncAt')
      const last = lastStr ? new Date(lastStr) : null
      if (last && (Date.now() - last.getTime()) < MIN_INTERVAL_MS) return
      console.log('[auto-sync] declenchement')
      try {
        await handleSync()
      } catch (_) { /* handleSync gere deja l'erreur */ }
    }

    tryAutoSync()
    const t = setInterval(tryAutoSync, CHECK_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCanSync])

  function fmtRelative(d) {
    if (!d) return ''
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return 'à l\'instant'
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  async function handleSync() {
    if (syncing) return
    setSyncing(true)
    setSyncStatus('Synchro...')
    try {
      const res = await fetch('/api/sync-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`)
      setSyncStatus('Synchronisé')
      const now = new Date()
      setLastSyncAt(now)
      localStorage.setItem('lastSyncAt', now.toISOString())
      if (onSyncSuccess) onSyncSuccess()
      setTimeout(() => setSyncStatus(''), 2500)
    } catch (e) {
      console.error('[sync]', e)
      setSyncStatus('Erreur')
      alert(`Erreur sync : ${e.message}`)
      setTimeout(() => setSyncStatus(''), 2500)
    } finally {
      setSyncing(false)
    }
  }

  // ============================================================
  // Determine l'onglet "principal" du role (3eme bouton fixe)
  // Admin : Galerie CD (lien externe Cake Vision)
  // Cafe : Reception
  // Patissier : Vitrine
  // Prod : Prod ou Sales
  // Patisserie-accessoires : Accessoires
  // ============================================================
  function pickPrimaryNav() {
    if (isLivreur(user)) return null
    if (admin) {
      // Admin : on met Galerie CD comme bouton principal (lien externe)
      if (canSeeCakeVision(user)) {
        return { view: 'cake-vision-link', emoji: '📸', label: 'Galerie CD', badge: 0, externalUrl: 'https://cake-vision-app.vercel.app' }
      }
    }
    if (canStockCafe(user)) return { view: 'reception-vitrine', emoji: '📦', label: 'Réception', badge: receptionBadge }
    if (canStockPatissier(user)) return { view: 'vitrine', emoji: '🥐', label: 'Vitrine', badge: 0 }
    if (admin || isProdUser) {
      if (user?.perm_sales && !user?.perm_prod) return { view: 'sales', emoji: '🥪', label: 'Salés', badge: 0 }
      return { view: 'prod', emoji: '🥐', label: 'Prod', badge: 0 }
    }
    if (isPatissierUser) return { view: 'patissier', emoji: '🧁', label: 'Accessoires', badge: 0 }
    return null
  }
  const primary = pickPrimaryNav()

  // ============================================================
  // Definition des menus deroulants
  // ============================================================
  const menuProduction = [
    { view: 'prod',       emoji: '🥐', label: 'Prod',        visible: !isLivreur(user) && (admin || (isProdUser && user.perm_prod)) },
    { view: 'sales',      emoji: '🥪', label: 'Salés',       visible: !isLivreur(user) && (admin || (isProdUser && user.perm_sales)) },
    { view: 'stock-gs',   emoji: '🥪', label: 'Stock GS-',   visible: !isLivreur(user) && canStockGS(user) },
    { view: 'patissier',  emoji: '🧁', label: 'Accessoires', visible: !isLivreur(user) && (admin || isPatissierUser) },
  ].filter(i => i.visible)

  const menuVitrine = [
    { view: 'vitrine',           emoji: '🥐', label: 'Vitrine',           visible: !isLivreur(user) && canStockPatissier(user), badge: 0 },
    { view: 'vitrine-sale',      emoji: '🥟', label: 'Vitrine Salé',      visible: !isLivreur(user) && canSeeVitrineSale(user), badge: 0 },
    { view: 'reception-vitrine', emoji: '📦', label: 'Réception Vitrine', visible: !isLivreur(user) && canStockCafe(user),     badge: receptionBadge },
    { view: 'fin-journee',       emoji: '🌙', label: 'Fin de journée',    visible: !isLivreur(user) && canStockCafe(user),     badge: 0 },
    { view: 'stock',             emoji: '📊', label: 'Stock',             visible: !isLivreur(user) && canStockAudit(user),    badge: 0 },
  ].filter(i => i.visible)

  const menuOutils = [
    { view: 'etiquettes',       emoji: '🏷',  label: 'Étiquettes Café', visible: !isLivreur(user) && canSeeEtiquettes(user) },
    // Galerie CD : pour les admins, c'est le bouton principal donc on l'enleve d'ici.
    // Pour les non-admins qui ont la perm, on la garde dans Outils.
    { view: 'cake-vision-link', emoji: '📸', label: 'Galerie CD',       visible: !isLivreur(user) && !admin && canSeeCakeVision(user), externalUrl: 'https://cake-vision-app.vercel.app' },
    { view: 'messages',         emoji: '💬', label: 'Messages',         visible: !isLivreur(user) && canSeeMessages(user) },
    { view: 'conversations',    emoji: '📱', label: 'Conversations',    visible: !isLivreur(user) && canSeeConversations(user) },
    { view: 'freezer',          emoji: '❄️', label: 'CD Négatif',       visible: !isLivreur(user) && canSeeFreezer(user) },
    { view: 'caisse',           emoji: '💰', label: 'Caisse',           visible: !isLivreur(user) && canSeeCaisse(user) && (admin || !user?.perm_admin_users) },
    { view: 'hr',               emoji: '🏢', label: 'RH',               visible: (admin || !!user?.perm_hr) && (admin || !user?.perm_admin_users) },
  ].filter(i => i.visible)

  // ============================================================
  // Composants helper
  // ============================================================
  function NavButton({ emoji, label, isActive, badgeCount = 0, onClick }) {
    return (
      <button
        onClick={onClick}
        className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 ${
          isActive
            ? 'bg-bordeaux text-cream border border-bordeaux'
            : 'border border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream hover:border-bordeaux'
        }`}
      >
        <span>{emoji}</span>
        <span>{label}</span>
        {badgeCount > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[12px] font-bold bg-red-600 text-white rounded-full border-2 border-cream shadow-md animate-pulse">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>
    )
  }

  function DropdownMenu({ id, emoji, label, items }) {
    const open = openMenu === id
    const hasActive = items.some(it => it.view === activeView)
    const totalBadge = items.reduce((s, it) => s + (it.badge || 0), 0)

    if (items.length === 0) return null

    return (
      <div className="relative">
        <button
          onClick={() => setOpenMenu(open ? null : id)}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 ${
            hasActive
              ? 'bg-bordeaux text-cream border border-bordeaux'
              : 'border border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream hover:border-bordeaux'
          }`}
        >
          <span>{emoji}</span>
          <span>{label}</span>
          <span className="text-[9px] opacity-70">▾</span>
          {totalBadge > 0 && !hasActive && (
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full border-2 border-cream shadow-md animate-pulse">
              {totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setOpenMenu(null)} />
            <div className="absolute left-0 top-full mt-1 z-[70] bg-cream rounded-lg shadow-xl border border-line min-w-[200px] py-1">
              {items.map(item => {
                const isActive = item.view === activeView
                const handleClick = () => {
                  setOpenMenu(null)
                  if (item.externalUrl) {
                    window.open(item.externalUrl, '_blank', 'noopener,noreferrer')
                  } else {
                    onNavigate(item.view)
                  }
                }
                return (
                  <button
                    key={item.view}
                    onClick={handleClick}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[12px] transition-colors ${
                      isActive ? 'bg-bordeaux text-cream' : 'hover:bg-cream-warm text-ink'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[14px]">{item.emoji}</span>
                      <span>{item.label}</span>
                    </span>
                    {item.badge > 0 && (
                      <span className="min-w-[20px] h-[20px] px-1.5 flex items-center justify-center text-[11px] font-bold bg-red-600 text-white rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-line px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
        {/* Logo cliquable -> calendrier */}
        <button
          onClick={() => !isLivreur(user) && canSeeCalendar(user) && onNavigate && onNavigate('calendar')}
          className={`flex items-center gap-2.5 ${!isLivreur(user) && canSeeCalendar(user) ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} flex-shrink-0`}
        >
          <img src="/Logo_LG.jpg" alt="Lily Gourmet" className="w-8 h-8 object-contain" />
          <div className="hidden sm:block text-left">
            <div className="font-sans font-semibold text-[12px] tracking-[0.12em] text-ink leading-tight">LILY GOURMET</div>
            {user?.full_name && (
              <div className="font-mono text-[8px] tracking-[0.2em] uppercase text-bordeaux mt-0.5">{user.full_name}</div>
            )}
          </div>
        </button>

        {/* Navigation : 3 boutons fixes + 3 menus deroulants */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {!isLivreur(user) && canSeeCalendar(user) && (
            <NavButton emoji="📅" label="Calendrier" isActive={activeView === 'calendar'} onClick={() => onNavigate('calendar')} />
          )}
          {(canRecaps(user) || isLivreur(user)) && (
            <NavButton emoji="📊" label="Récap" isActive={activeView === 'recap'} onClick={() => onNavigate('recap')} />
          )}
          <NavButton emoji="📋" label="Tâches" isActive={activeView === 'tasks'} badgeCount={tasksBadge} onClick={() => onNavigate('tasks')} />
          {primary && (
            <NavButton
              emoji={primary.emoji}
              label={primary.label}
              isActive={activeView === primary.view}
              badgeCount={primary.badge}
              onClick={() => {
                if (primary.externalUrl) {
                  window.open(primary.externalUrl, '_blank', 'noopener,noreferrer')
                } else {
                  onNavigate(primary.view)
                }
              }}
            />
          )}
          {showChecklistBtn && (
            <NavButton
              emoji="📋"
              label="Checklist"
              isActive={activeView === 'checklist'}
              badgeCount={checklistBadge}
              onClick={() => onNavigate('checklist')}
            />
          )}

          {/* Separateur visuel (admin uniquement, separe les boutons fixes des menus) */}
          {admin && (menuProduction.length > 0 || menuVitrine.length > 0 || menuOutils.length > 0) && (
            <div className="w-px h-5 bg-line/60 mx-1" />
          )}

          {admin ? (
            <>
              {/* Mode admin : 3 menus deroulants */}
              <DropdownMenu id="prod" emoji="🥐" label="Production" items={menuProduction} />
              <DropdownMenu id="vitrine" emoji="🥐" label="Vitrine" items={menuVitrine} />
              <DropdownMenu id="outils" emoji="🛠" label="Outils" items={menuOutils} />
            </>
          ) : (
            <>
              {/* Mode user non-admin : boutons à plat. On exclut l'item "primary"
                  qui est déjà affiché en NavButton fixe au-dessus. */}
              {[...menuProduction, ...menuVitrine, ...menuOutils]
                .filter(item => !primary || item.view !== primary.view)
                .map(item => (
                  <NavButton
                    key={item.view}
                    emoji={item.emoji}
                    label={item.label}
                    isActive={activeView === item.view}
                    badgeCount={item.badge || 0}
                    onClick={() => {
                      if (item.externalUrl) {
                        window.open(item.externalUrl, '_blank', 'noopener,noreferrer')
                      } else {
                        onNavigate(item.view)
                      }
                    }}
                  />
                ))}
            </>
          )}
        </div>

        {/* Actions : sync + roue + logout */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {canPrintLabels(user) && <LabelsButton />}

          {lastSyncAt && !syncing && (
            <span className="font-mono text-[9px] text-ink-mute hidden md:inline" title={`Dernière sync : ${lastSyncAt.toLocaleString('fr-FR')}`}>
              sync {fmtRelative(lastSyncAt)}
            </span>
          )}

          {userCanSync && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[10px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-60 disabled:cursor-wait"
              title={lastSyncAt ? `Dernière synchro : ${lastSyncAt.toLocaleString('fr-FR')}` : 'Synchroniser depuis Odoo'}
            >
              {syncing ? (
                <>
                  <span>⏳</span>
                  <span className="hidden sm:inline">{syncStatus || 'SYNC...'}</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span className="hidden sm:inline">SYNC</span>
                </>
              )}
            </button>
          )}

          {(admin || user?.perm_admin_users) && (
            <div className="relative">
              <button
                onClick={() => setShowCog(!showCog)}
                className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
                title="Paramètres"
              >
                ⚙️
              </button>
              {showCog && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCog(false)} />
                  <div className="absolute right-0 mt-1 z-50 bg-cream rounded-lg shadow-xl border border-line min-w-[200px] py-1">
                    <CogItem icon="🔑" label="Mot de passe" onClick={() => { setShowChangePwd(true); setShowCog(false) }} />
                    <CogItem icon="👥" label="Utilisateurs" onClick={() => { setShowAdminUsers(true); setShowCog(false) }} />
                    {admin && <CogItem icon="🎨" label="Palette couleurs" onClick={() => { setShowPalette(true); setShowCog(false) }} />}
                  </div>
                </>
              )}
            </div>
          )}

          {!admin && !user?.perm_admin_users && (
            <button
              onClick={() => setShowChangePwd(true)}
              className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Changer mot de passe"
            >
              🔑
            </button>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Se déconnecter"
            >
              ↩
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {showChangePwd && <ChangePasswordModal user={user} onClose={() => setShowChangePwd(false)} />}
      {showAdminUsers && <AdminUsers currentUser={user} onClose={() => setShowAdminUsers(false)} />}
      {showPalette && <AdminGmConfig onClose={() => setShowPalette(false)} />}
    </>
  )
}

function CogItem({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream-warm text-[12px] text-ink"
    >
      <span className="text-[14px]">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
