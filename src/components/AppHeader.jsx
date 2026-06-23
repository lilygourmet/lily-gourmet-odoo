import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { isAdmin, canRecaps, canSync, canSeeCalendar, canPrintLabels, canSeeFreezer, canSeeMessages, canSeeEtiquettes, canSeeCakeVision, canEditCakeVision, canSeeChecklist, isLivreur, canStockPatissier, canStockCafe, canStockAudit, canStockGS, canStockProdVitrine, canStockProdAnnexe, canSeeVitrineSale, canSeeCaisse, canSeeConversations, canSeeDevis, canSeeModifications, canSeeLivraisons, canViewPayments, canSeeCommande, canSeePhotoshop} from '../lib/auth'
import { countUnreadTasks } from '../lib/tasks'
import { countConversationBadges, markConversationsVisited, countDevisInternetNonTraites } from '../lib/conversations'
import { countModificationsATraiter } from '../lib/modifications'
import { countLivraisonsARelancer } from '../lib/deliveries'
import ChangePasswordModal from './ChangePasswordModal'
import AdminUsers from './AdminUsers'
import AdminGmConfig from './AdminGmConfig'
import OrderJournalModal from './OrderJournalModal'
import NavbarConfigModal from './NavbarConfigModal'
import { saveNavbarConfig } from '../lib/users'
import LabelsButton from './LabelsButton'
import NewConversationModal from './Conversations/NewConversationModal'
import WhatsAppLogo from './WhatsAppLogo'
import {
  Calendar, BarChart3, ListTodo, Cake, Croissant, Sandwich, Boxes, Store,
  PackageCheck, Moon, ClipboardList, ListChecks, Tag, Camera, MessageSquare,
  MessageCircle, Wallet, CreditCard, Snowflake, Banknote, Users, Plane, Receipt,
  Settings, RefreshCw, LogOut, KeyRound, Printer, Wrench, Palette, Circle, ChevronDown,
  Sliders, MoreHorizontal, Pencil, Truck, Bell, ShoppingBag, Send,
} from 'lucide-react'

// Icône (Lucide) par vue / menu / action — remplace les émoticônes du header.
const HEADER_ICONS = {
  calendar: Calendar, recap: BarChart3, tasks: ListTodo, patissier: Cake,
  prod: Croissant, sales: Sandwich, 'stock-gs': Boxes, 'stock-prod-vitrine': Boxes, 'stock-prod-annexe': Boxes,
  vitrine: Store, 'vitrine-sale': Store, 'reception-vitrine': PackageCheck, 'vitrine-previsions': BarChart3,
  'fin-journee': Moon, stock: ClipboardList, checklist: ListChecks,
  etiquettes: Tag, 'etiquettes-prix': Tag, 'cake-vision-link': Camera, messages: MessageSquare,
  conversations: MessageCircle, modifications: Pencil, livraisons: Truck, paiements: CreditCard, freezer: Snowflake,
  caisse: Banknote, hr: Users, absences: Plane, economat: Receipt,
  devis: ShoppingBag, photoshop: Palette,
  // menus déroulants
  menu_prod: Croissant, menu_vitrine: Store, menu_outils: Wrench, menu_more: MoreHorizontal,
  // actions
  settings: Settings, sync: RefreshCw, logout: LogOut, password: KeyRound,
  print: Printer, palette: Palette, users: Users, nav_config: Sliders, journal: ClipboardList,
}

// Boutons affichés en LOGO SEUL (nom au survol) pour désencombrer la barre.
function Ico({ name, size = 16, className = '' }) {
  const C = HEADER_ICONS[name] || Circle
  return <C size={size} strokeWidth={1.8} className={className} />
}

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
  const cogRef = useRef(null)
  useEffect(() => {
    if (!showCog) return
    function onDown(e) { if (cogRef.current && !cogRef.current.contains(e.target)) setShowCog(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showCog])
  // Centre de notifications (cloche)
  const [showBell, setShowBell] = useState(false)
  const bellRef = useRef(null)
  useEffect(() => {
    if (!showBell) return
    function onDown(e) { if (bellRef.current && !bellRef.current.contains(e.target)) setShowBell(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showBell])
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showAdminUsers, setShowAdminUsers] = useState(false)
  const [showOrderJournal, setShowOrderJournal] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showQuickSend, setShowQuickSend] = useState(false)
  // Disposition perso des onglets (header) : { order, hidden } ou null = défaut
  const [showNavConfig, setShowNavConfig] = useState(false)
  const [navCfg, setNavCfg] = useState(user?.navbar_config || null)
  useEffect(() => { setNavCfg(user?.navbar_config || null) }, [user?.id, user?.navbar_config])
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [lastSyncAt, setLastSyncAt] = useState(() => {
    const v = localStorage.getItem('lastSyncAt')
    return v ? new Date(v) : null
  })
  const [, setNow] = useState(0)
  // Badge "articles non termines" sur le bouton Reception Vitrine
  const [receptionBadge, setReceptionBadge] = useState(0)
  // Badge "demandes congés + allocations en attente" sur le bouton Congés
  const [congesBadge, setCongesBadge] = useState(0)
  // Badge "articles a ranger" sur le bouton Checklist
  const [checklistBadge, setChecklistBadge] = useState(0)
  // Badge "paiements en attente de validation"
  const [paiementsBadge, setPaiementsBadge] = useState(0)
  // Badge "taches non lues" sur le bouton Tâches
  const [tasksBadge, setTasksBadge] = useState(0)
  // Badge double Conversations : { unassigned (à prendre), unread (non lus) }
  const [convBadge, setConvBadge] = useState({ unassigned: 0, unread: 0 })
  const lastVisitedConvRef = useRef(user?.last_visited_conversations || null)
  // Badge Modifications à traiter
  const [modifBadge, setModifBadge] = useState(0)
  // Badge Livraisons refusées à réassigner
  const [livraisonsBadge, setLivraisonsBadge] = useState(0)
  // Badge "devis internet NON TRAITÉS" (ceux qui traînent encore dans l'onglet).
  const [devisInternetBadge, setDevisInternetBadge] = useState(0)
  const prevViewRef = useRef(activeView)

  // Compte les devis internet non traités (au démarrage + toutes les 5 min).
  useEffect(() => {
    if (isLivreur(user) || !canSeeDevis(user)) return
    let cancelled = false
    async function refresh() {
      const n = await countDevisInternetNonTraites()
      if (!cancelled) setDevisInternetBadge(n)
    }
    refresh()
    const iv = setInterval(refresh, 5 * 60 * 1000)   // rafraîchit toutes les 5 min
    return () => { cancelled = true; clearInterval(iv) }
  }, [user])

  // Recompte quand on QUITTE l'onglet Devis internet (on vient peut-être de traiter des devis).
  useEffect(() => {
    if (prevViewRef.current === 'devis-internet' && activeView !== 'devis-internet'
        && !isLivreur(user) && canSeeDevis(user)) {
      countDevisInternetNonTraites().then(setDevisInternetBadge).catch(() => {})
    }
    prevViewRef.current = activeView
  }, [activeView, user])
  // Menus deroulants ouverts (un seul a la fois)
  const [openMenu, setOpenMenu] = useState(null) // 'prod' | 'vitrine' | 'outils' | null

  const showReceptionBtn = !isLivreur(user) && canStockCafe(user)
  const showChecklistBtn = !isLivreur(user) && canSeeChecklist(user)
  const userCanSeeConv = canSeeConversations(user)
  const userCanSeeModif = canSeeModifications(user)
  const userCanSeeLivraisons = canSeeLivraisons(user)
  // Étiquettes CD : maintenant dans le Calendrier. On le garde dans le header
  // UNIQUEMENT pour ceux qui peuvent imprimer mais ne voient pas le calendrier.
  const showHeaderLabels = canPrintLabels(user) && !canSeeCalendar(user)

  // Refresh affichage relatif (toutes les 5 min — évite des re-rendus globaux trop fréquents)
  useEffect(() => {
    const t = setInterval(() => setNow(n => n + 1), 5 * 60 * 1000)
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

  // Badge Congés : compte demandes de congé + allocations en attente
  useEffect(() => {
    if (!user?.id || !(admin || user?.perm_hr)) return
    let cancelled = false

    async function refreshCongesBadge() {
      try {
        const [{ count: c1 }, { count: c2 }] = await Promise.all([
          supabase.from('conges').select('id', { count: 'exact', head: true }).eq('statut', 'demande'),
          supabase.from('conges_allocations').select('id', { count: 'exact', head: true }).eq('statut', 'attente'),
        ])
        if (!cancelled) setCongesBadge((c1 || 0) + (c2 || 0))
      } catch (e) {
        console.warn('[congesBadge]', e?.message || e)
      }
    }
    refreshCongesBadge()

    const ch = supabase
      .channel('conges-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conges' },             () => refreshCongesBadge())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conges_allocations' }, () => refreshCongesBadge())
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, user?.id, user?.perm_hr])

  // Badge Paiements : compte les preuves de paiement à valider
  useEffect(() => {
    if (!user?.id || !canViewPayments(user)) return
    let cancelled = false
    let channel = null

    async function refreshPaiementsBadge() {
      try {
        const { count, error } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('is_payment_proof', true)
          .is('payment_validated_at', null)
          .is('payment_rejected_at', null)
        if (!error && !cancelled) setPaiementsBadge(count || 0)
      } catch (e) {
        console.warn('[paiementsBadge]', e?.message || e)
      }
    }

    refreshPaiementsBadge()

    channel = supabase
      .channel('paiements-badge')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'messages' },
          () => { refreshPaiementsBadge() })
      .subscribe()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

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

    // Anti-cascade : les 4 tables peuvent changer en rafale (batch) → on regroupe en 1 refresh.
    let debTimer = null
    const scheduleRefresh = () => { clearTimeout(debTimer); debTimer = setTimeout(refreshChecklistBadge, 800) }

    // Realtime sur 4 tables qui influent sur le badge
    channels = [
      supabase.channel('checklist-badge-stock')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_day_items' }, scheduleRefresh)
        .subscribe(),
      supabase.channel('checklist-badge-prod')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'prod_done' }, scheduleRefresh)
        .subscribe(),
      supabase.channel('checklist-badge-cafe')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'cafe_received' }, scheduleRefresh)
        .subscribe(),
      supabase.channel('checklist-badge-steps')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'item_steps' }, scheduleRefresh)
        .subscribe(),
    ]

    return () => {
      cancelled = true
      clearTimeout(debTimer)
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

    // Refresh de secours toutes les 5 min (au cas où le temps réel loupe un event)
    const interval = setInterval(refreshTasksBadge, 5 * 60 * 1000)

    return () => {
      cancelled = true
      clearInterval(interval)
      if (channel) supabase.removeChannel(channel)
    }
  }, [user?.id])

  // Badge Conversations : double compteur (non assignées / non lus) + temps réel
  useEffect(() => {
    if (!userCanSeeConv || !user?.id) return
    let cancelled = false
    let channel = null

    async function refreshConvBadge() {
      try {
        const b = await countConversationBadges(lastVisitedConvRef.current)
        if (!cancelled) setConvBadge(b)
      } catch (e) {
        console.warn('[convBadge]', e?.message || e)
      }
    }

    refreshConvBadge()
    channel = supabase
      .channel('conv-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, refreshConvBadge)
      .subscribe()
    const interval = setInterval(refreshConvBadge, 3 * 60 * 1000)   // secours (le temps réel est instantané)

    return () => {
      cancelled = true
      clearInterval(interval)
      if (channel) supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCanSeeConv, user?.id])

  // Badge Modifications à traiter (temps réel)
  useEffect(() => {
    if (!userCanSeeModif) return
    let cancelled = false
    let channel = null
    const refresh = () => countModificationsATraiter()
      .then(n => { if (!cancelled) setModifBadge(n) }).catch(() => {})
    refresh()
    channel = supabase
      .channel('modif-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modifications' }, refresh)
      .subscribe()
    const interval = setInterval(refresh, 3 * 60 * 1000)   // secours (temps réel instantané)
    return () => { cancelled = true; clearInterval(interval); if (channel) supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCanSeeModif, user?.id])

  // Badge Livraisons : compte les livraisons refusées à réassigner (temps réel)
  useEffect(() => {
    if (!userCanSeeLivraisons) return
    let cancelled = false
    let channel = null
    const refresh = () => countLivraisonsARelancer()
      .then(n => { if (!cancelled) setLivraisonsBadge(n) }).catch(() => {})
    refresh()
    channel = supabase
      .channel('livraisons-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'livraisons' }, refresh)
      .subscribe()
    const interval = setInterval(refresh, 3 * 60 * 1000)   // secours (temps réel instantané)
    return () => { cancelled = true; clearInterval(interval); if (channel) supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCanSeeLivraisons, user?.id])

  // À l'ouverture de l'onglet Conversations : marque la visite + remet "non lus" à 0
  useEffect(() => {
    if (activeView === 'conversations' && userCanSeeConv && user?.id) {
      lastVisitedConvRef.current = new Date().toISOString()
      markConversationsVisited(user.id).catch(() => {})
      setConvBadge(prev => ({ ...prev, unread: 0 }))
    }
  }, [activeView, userCanSeeConv, user?.id])

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
      toast.error(`Erreur sync : ${e.message}`)
      setTimeout(() => setSyncStatus(''), 2500)
    } finally {
      setSyncing(false)
    }
  }

  // Enregistre la disposition perso des onglets et l'applique tout de suite
  async function handleSaveNavCfg(cfg) {
    await saveNavbarConfig(user.id, cfg)
    setNavCfg(cfg)
    try {
      const raw = localStorage.getItem('lily_user')
      if (raw) { const u = JSON.parse(raw); u.navbar_config = cfg; localStorage.setItem('lily_user', JSON.stringify(u)) }
    } catch (_) { /* cache best-effort */ }
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
    { view: 'stock-prod-vitrine', emoji: '🛍️', label: 'Stock Prod Vitrine', visible: !isLivreur(user) && canStockProdVitrine(user) },
    { view: 'stock-prod-annexe',  emoji: '🏭', label: 'Stock Prod Annexe',  visible: !isLivreur(user) && canStockProdAnnexe(user) },
    { view: 'patissier',  emoji: '🧁', label: 'Accessoires', visible: !isLivreur(user) && (admin || isPatissierUser) },
  ].filter(i => i.visible)

  const menuVitrine = [
    { view: 'vitrine',           emoji: '🥐', label: 'Vitrine',           visible: !isLivreur(user) && canStockPatissier(user), badge: 0 },
    { view: 'vitrine-previsions', emoji: '📈', label: 'Prévisions',        visible: !isLivreur(user) && canStockPatissier(user), badge: 0 },
    { view: 'vitrine-sale',      emoji: '🥟', label: 'Vitrine Salé',      visible: !isLivreur(user) && canSeeVitrineSale(user), badge: 0 },
    { view: 'reception-vitrine', emoji: '📦', label: 'Réception Vitrine', visible: !isLivreur(user) && canStockCafe(user),     badge: receptionBadge },
    { view: 'fin-journee',       emoji: '🌙', label: 'Fin de journée',    visible: !isLivreur(user) && canStockCafe(user),     badge: 0 },
    { view: 'stock',             emoji: '📊', label: 'Stock',             visible: !isLivreur(user) && canStockAudit(user),    badge: 0 },
  ].filter(i => i.visible)

  const menuOutils = [
    { view: 'etiquettes',       emoji: '🏷',  label: 'Étiquettes Café', visible: !isLivreur(user) && canSeeEtiquettes(user) },
    { view: 'etiquettes-prix',  emoji: '🏷',  label: 'Étiquettes produits', visible: !isLivreur(user) && canSeeEtiquettes(user) },
    // Galerie CD : pour les admins, c'est le bouton principal donc on l'enleve d'ici.
    // Pour les non-admins qui ont la perm, on la garde dans Outils.
    { view: 'cake-vision-link', emoji: '📸', label: 'Galerie CD',       visible: !isLivreur(user) && !admin && canSeeCakeVision(user), externalUrl: 'https://cake-vision-app.vercel.app' },
    { view: 'cake-vision-edit', emoji: '🎂', label: 'Cake Vision',       visible: !isLivreur(user) && canEditCakeVision(user) },
    { view: 'messages',         emoji: '💬', label: 'Messages',         visible: !isLivreur(user) && canSeeMessages(user) },
    { view: 'conversations',    emoji: '📱', label: 'Conversations',    visible: !isLivreur(user) && canSeeConversations(user), badge: convBadge.unassigned + convBadge.unread, convBadge },
    { view: 'devis',            emoji: '📄', label: 'Commandes',        visible: !isLivreur(user) && canSeeDevis(user), badge: 0 },
    { view: 'ocp-link',         emoji: '🍽️', label: 'Lien OCP',         visible: admin },
    { view: 'devis-internet',   emoji: '🌐', label: 'Devis internet',   visible: !isLivreur(user) && canSeeDevis(user), badge: devisInternetBadge },
    { view: 'modifications',    emoji: '✏️', label: 'Modifications',    visible: !isLivreur(user) && canSeeModifications(user), badge: modifBadge },
    { view: 'livraisons',       emoji: '🚚', label: 'Livraisons',       visible: canSeeLivraisons(user), badge: livraisonsBadge },
    { view: 'paiements',        emoji: '💰', label: 'Paiements',         visible: !isLivreur(user) && canViewPayments(user), badge: paiementsBadge },
    { view: 'freezer',          emoji: '❄️', label: 'CD Négatif',       visible: !isLivreur(user) && canSeeFreezer(user) },
    { view: 'caisse',           emoji: '💰', label: 'Caisse',           visible: !isLivreur(user) && canSeeCaisse(user) && (admin || !user?.perm_admin_users) },
    { view: 'hr',               emoji: '🏢', label: 'RH',               visible: (admin || !!user?.perm_hr) && (admin || !user?.perm_admin_users) },
    { view: 'absences',         emoji: '🌴', label: 'Congés',           visible: !isLivreur(user) && (admin || !!user?.perm_hr), badge: congesBadge },
    { view: 'economat',         emoji: '🧾', label: 'Économat',         visible: !isLivreur(user) && (admin || !!user?.economat_profil || !!user?.perm_econome) },
    { view: 'photoshop',        emoji: '🎨', label: 'Studio photos',    visible: !isLivreur(user) && canSeePhotoshop(user) },
  ].filter(i => i.visible)

  // ============================================================
  // Liste a plat de TOUS les onglets autorises (pour l'affichage perso).
  // Les permissions priment : seuls les onglets autorises sont dans la liste.
  // ============================================================
  const fixedTabs = [
    (!isLivreur(user) && canSeeCalendar(user)) && { view: 'calendar', emoji: '📅', label: 'Calendrier', badge: 0 },
    canRecaps(user) && { view: 'recap', emoji: '📊', label: 'Récap', badge: 0 },
    isLivreur(user) && { view: 'livraisons', emoji: '🚚', label: 'Livraisons', badge: livraisonsBadge },
    { view: 'tasks', emoji: '✅', label: 'Tâches', badge: tasksBadge },
    showChecklistBtn && { view: 'checklist', emoji: '📋', label: 'Checklist', badge: checklistBadge },
  ].filter(Boolean)
  const adminGallery = (admin && canSeeCakeVision(user))
    ? [{ view: 'cake-vision-link', emoji: '📸', label: 'Galerie CD', badge: 0, externalUrl: 'https://cake-vision-app.vercel.app' }]
    : []
  const allTabs = [...fixedTabs, ...adminGallery, ...menuProduction, ...menuVitrine, ...menuOutils]
    .filter((t, i, arr) => arr.findIndex(x => x.view === t.view) === i)

  // Construit les entrees a afficher (onglets seuls + dossiers), dans l'ordre choisi.
  const allTabsMap = Object.fromEntries(allTabs.map(t => [t.view, t]))
  const customActive = !!navCfg && (Array.isArray(navCfg.items) || Array.isArray(navCfg.order) || Array.isArray(navCfg.hidden))
  const customEntries = []
  const placedViews = new Set()
  if (customActive) {
    const normItems = Array.isArray(navCfg.items)
      ? navCfg.items
      : (navCfg.order || []).filter(v => !(navCfg.hidden || []).includes(v)).map(v => ({ type: 'tab', view: v }))
    for (const it of normItems) {
      if (it.type === 'group') {
        const tabs = (it.tabs || []).map(v => allTabsMap[v]).filter(Boolean)
        if (tabs.length) {
          tabs.forEach(t => placedViews.add(t.view))
          customEntries.push({ kind: 'group', id: it.id, label: it.label || 'Dossier', emoji: it.emoji || '📁', tabs })
        }
      } else if (it.type === 'tab') {
        const t = allTabsMap[it.view]
        if (t) { placedViews.add(t.view); customEntries.push({ kind: 'tab', tab: t }) }
      }
    }
  }
  // Onglets autorises mais ranges nulle part -> menu "Plus" (jamais perdus)
  const plusTabs = allTabs.filter(t => !placedViews.has(t.view))

  // ============================================================
  // Composants helper
  // ============================================================
  // Onglet = icône seule ; au survol le nom se déploie (l'onglet actif reste ouvert).
  function NavButton({ view, label, isActive, badgeCount = 0, convBadge = null, onClick }) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={`group relative flex items-center h-[30px] rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 ${
          isActive
            ? 'bg-bordeaux text-cream border border-bordeaux'
            : 'border border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream hover:border-bordeaux'
        }`}
      >
        <span className="w-[28px] h-[28px] flex items-center justify-center flex-shrink-0">
          {view === 'conversations' ? <WhatsAppLogo size={15} /> : <Ico name={view} size={15} />}
        </span>
        <span className={`whitespace-nowrap overflow-hidden transition-all duration-300 ${
          isActive
            ? 'max-w-[170px] opacity-100 pr-3'
            : 'max-w-0 opacity-0 pr-0 group-hover:max-w-[170px] group-hover:opacity-100 group-hover:pr-3'
        }`}>{label}</span>
        {convBadge ? (
          <span className="pr-2 flex-shrink-0"><ConvBadgePills unassigned={convBadge.unassigned} unread={convBadge.unread} /></span>
        ) : badgeCount > 0 && (
          <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[12px] font-bold bg-red-600 text-white rounded-full border-2 border-cream shadow-md animate-pulse">
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </button>
    )
  }

  function DropdownMenu({ id, label, items, footerSlot = null, emoji = null }) {
    const open = openMenu === id
    const menuRef = useRef(null)
    useEffect(() => {
      if (!open) return
      function onDown(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenu(null) }
      document.addEventListener('mousedown', onDown)
      return () => document.removeEventListener('mousedown', onDown)
    }, [open])
    const hasActive = items.some(it => it.view === activeView)
    const totalBadge = items.reduce((s, it) => s + (it.badge || 0), 0)

    if (items.length === 0 && !footerSlot) return null

    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpenMenu(open ? null : id)}
          className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 ${
            hasActive
              ? 'bg-bordeaux text-cream border border-bordeaux'
              : 'border border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream hover:border-bordeaux'
          }`}
        >
          {emoji ? <span className="text-[15px] leading-none">{emoji}</span> : <Ico name={`menu_${id}`} size={15} />}
          <span>{label}</span>
          <ChevronDown size={13} strokeWidth={1.8} className="opacity-70" />
          {totalBadge > 0 && !hasActive && (
            <span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full border-2 border-cream shadow-md animate-pulse">
              {totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
        </button>
        {open && (
          <>
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
                      <Ico name={item.view} size={15} />
                      <span>{item.label}</span>
                    </span>
                    {item.convBadge ? (
                      <ConvBadgePills unassigned={item.convBadge.unassigned} unread={item.convBadge.unread} absolute={false} />
                    ) : item.badge > 0 ? (
                      <span className="min-w-[20px] h-[20px] px-1.5 flex items-center justify-center text-[11px] font-bold bg-red-600 text-white rounded-full">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                )
              })}
              {footerSlot && (
                <div className="px-3 py-2 mt-1 border-t border-line">{footerSlot}</div>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div id="app-header" className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-line px-4 py-2.5 flex items-center gap-2 flex-wrap">
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
          {customActive ? (
            <>
              {/* Mode perso : onglets seuls + dossiers, dans l'ordre choisi */}
              {customEntries.map(en => en.kind === 'tab' ? (
                <NavButton
                  key={'t-' + en.tab.view}
                  view={en.tab.view}
                  label={en.tab.label}
                  isActive={activeView === en.tab.view}
                  badgeCount={en.tab.badge || 0}
                  convBadge={en.tab.convBadge}
                  onClick={() => {
                    if (en.tab.externalUrl) {
                      window.open(en.tab.externalUrl, '_blank', 'noopener,noreferrer')
                    } else {
                      onNavigate(en.tab.view)
                    }
                  }}
                />
              ) : (
                <DropdownMenu key={'g-' + en.id} id={'grp-' + en.id} label={en.label} emoji={en.emoji} items={en.tabs} />
              ))}
              {plusTabs.length > 0 && (
                <DropdownMenu id="more" label="Plus" items={plusTabs} />
              )}
            </>
          ) : (
            <>
              {!isLivreur(user) && canSeeCalendar(user) && (
                <NavButton view="calendar" label="Calendrier" isActive={activeView === 'calendar'} onClick={() => onNavigate('calendar')} />
              )}
              {canRecaps(user) && (
                <NavButton view="recap" label="Récap" isActive={activeView === 'recap'} onClick={() => onNavigate('recap')} />
              )}
              {isLivreur(user) && (
                <NavButton view="livraisons" label="Livraisons" isActive={activeView === 'livraisons'} badgeCount={livraisonsBadge} onClick={() => onNavigate('livraisons')} />
              )}
              <NavButton view="tasks" label="Tâches" isActive={activeView === 'tasks'} badgeCount={tasksBadge} onClick={() => onNavigate('tasks')} />
              {primary && (
                <NavButton
                  view={primary.view}
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
                  view="checklist"
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
                  <DropdownMenu id="prod" label="Production" items={menuProduction} />
                  <DropdownMenu id="vitrine" label="Vitrine" items={menuVitrine} />
                  <DropdownMenu id="outils" label="Outils" items={menuOutils} footerSlot={showHeaderLabels ? <LabelsButton /> : null} />
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
                        view={item.view}
                        label={item.label}
                        isActive={activeView === item.view}
                        badgeCount={item.badge || 0}
                        convBadge={item.convBadge}
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
            </>
          )}

          {/* « Mes onglets » est désormais dans la roue ⚙️ (plus de bouton ici). */}
        </div>

        {/* Actions : sync + roue + logout */}
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
          <button
            onClick={() => onNavigate('presence')}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-all flex-shrink-0 ${activeView === 'presence' ? 'bg-bordeaux text-cream' : 'bg-white border border-line text-bordeaux hover:bg-bordeaux hover:text-cream'}`}
            title="Présence — qui est là aujourd'hui"
          >
            <Users size={16} />
          </button>
          {userCanSeeConv && (
            <button
              onClick={() => setShowQuickSend(true)}
              className="w-9 h-9 flex items-center justify-center bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-full transition-all flex-shrink-0"
              title="Envoyer un devis ou une confirmation par WhatsApp"
            >
              <Send size={16} />
            </button>
          )}
          {canSeeCommande(user) && (
            <button
              onClick={() => onNavigate('nouvelle-commande')}
              className="w-9 h-9 flex items-center justify-center bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full transition-all flex-shrink-0 text-[22px] leading-none pb-0.5"
              title="Nouvelle commande (créer un devis)"
            >+</button>
          )}

          {showHeaderLabels && <LabelsButton />}


          {!isLivreur(user) && (() => {
            const items = [
              tasksBadge > 0 && { emoji: '✅', label: `${tasksBadge} tâche(s) non lue(s)`, view: 'tasks' },
              (convBadge.unassigned + convBadge.unread) > 0 && { emoji: '📱', label: `${convBadge.unassigned + convBadge.unread} conversation(s)`, view: 'conversations' },
              livraisonsBadge > 0 && { emoji: '🚚', label: `${livraisonsBadge} livraison(s) à réassigner`, view: 'livraisons' },
              congesBadge > 0 && { emoji: '🌴', label: `${congesBadge} congé(s) à traiter`, view: 'absences' },
              modifBadge > 0 && { emoji: '✏️', label: `${modifBadge} modification(s)`, view: 'modifications' },
              paiementsBadge > 0 && { emoji: '💰', label: `${paiementsBadge} paiement(s) à valider`, view: 'paiements' },
            ].filter(Boolean)
            const total = tasksBadge + convBadge.unassigned + convBadge.unread + livraisonsBadge + congesBadge + modifBadge + paiementsBadge
            return (
              <div className="relative" ref={bellRef}>
                <button onClick={() => setShowBell(!showBell)} className="relative w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all" title="Notifications">
                  <Bell size={17} strokeWidth={1.8} />
                  {total > 0 && <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-bordeaux text-cream text-[9px] font-semibold flex items-center justify-center leading-none">{total > 99 ? '99+' : total}</span>}
                </button>
                {showBell && (
                  <div className="absolute left-0 mt-1 sm:left-auto sm:right-0 z-50 bg-cream rounded-lg shadow-xl border border-line min-w-[240px] py-1">
                    {items.length === 0 ? (
                      <div className="px-4 py-3 text-[13px] text-ink-mute">Rien à signaler 🎉</div>
                    ) : items.map((it, i) => (
                      <button key={i} onClick={() => { onNavigate(it.view); setShowBell(false) }} className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-bordeaux/5 flex items-center gap-2">
                        <span>{it.emoji}</span> {it.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Roue ⚙️ pour TOUS les employés (désencombre l'en-tête) : mot de passe,
              synchro (si permission), déconnexion + items admin (onglets/users/palette). */}
          <div className="relative" ref={cogRef}>
            <button
              onClick={() => setShowCog(!showCog)}
              className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Paramètres"
            >
              <Ico name="settings" size={17} />
            </button>
            {showCog && (
              <div className="absolute left-0 mt-1 sm:left-auto sm:right-0 z-50 bg-cream rounded-lg shadow-xl border border-line min-w-[200px] py-1">
                {admin && <CogItem name="nav_config" label="Mes onglets" onClick={() => { setShowNavConfig(true); setShowCog(false) }} />}
                <CogItem name="password" label="Mot de passe" onClick={() => { setShowChangePwd(true); setShowCog(false) }} />
                {(admin || user?.perm_admin_users) && <CogItem name="users" label="Utilisateurs" onClick={() => { setShowAdminUsers(true); setShowCog(false) }} />}
                {admin && <CogItem name="journal" label="Journal des commandes" onClick={() => { setShowOrderJournal(true); setShowCog(false) }} />}
                {admin && <CogItem name="palette" label="Palette couleurs" onClick={() => { setShowPalette(true); setShowCog(false) }} />}
                {userCanSync && <CogItem name="sync" label="Synchroniser" onClick={() => { setShowCog(false); handleSync() }} />}
                {onLogout && <CogItem name="logout" label="Se déconnecter" onClick={() => { setShowCog(false); onLogout() }} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showChangePwd && <ChangePasswordModal user={user} onClose={() => setShowChangePwd(false)} />}
      {showAdminUsers && <AdminUsers currentUser={user} onClose={() => setShowAdminUsers(false)} />}
      {showOrderJournal && <OrderJournalModal onClose={() => setShowOrderJournal(false)} />}
      {showPalette && <AdminGmConfig onClose={() => setShowPalette(false)} />}
      {showQuickSend && (
        <NewConversationModal
          user={user}
          onClose={() => setShowQuickSend(false)}
          onSent={() => setShowQuickSend(false)}
        />
      )}
      {showNavConfig && (
        <NavbarConfigModal
          tabs={allTabs}
          config={navCfg}
          onSave={handleSaveNavCfg}
          onClose={() => setShowNavConfig(false)}
        />
      )}
    </>
  )
}

// Double pastille Conversations : 🟠 non assignées (à prendre) + 🔴 non lus.
// absolute=true -> positionné en coin (NavButton) ; false -> inline (dropdown).
function ConvBadgePills({ unassigned = 0, unread = 0, absolute = true }) {
  if (!unassigned && !unread) return null
  const wrap = absolute
    ? 'absolute -top-2 -right-2 flex items-center gap-0.5'
    : 'flex items-center gap-1'
  return (
    <span className={wrap}>
      {unassigned > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-amber-500 text-white rounded-full border-2 border-cream shadow" title="À prendre (non assignées)">
          {unassigned > 99 ? '99+' : unassigned}
        </span>
      )}
      {unread > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full border-2 border-cream shadow" title="Non lus">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </span>
  )
}

function CogItem({ name, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-cream-warm text-[12px] text-ink"
    >
      <Ico name={name} size={15} />
      <span>{label}</span>
    </button>
  )
}
