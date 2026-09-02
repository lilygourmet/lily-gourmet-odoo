import { useState, useEffect, lazy } from 'react'
import Login from './components/Login'
// Écrans rares/lourds : chargés à la demande (réduit le poids au démarrage).
const Calendar = lazy(() => import('./components/Calendar'))
const RecapVentes = lazy(() => import('./components/RecapVentes'))
const PatissierView = lazy(() => import('./components/PatissierView'))
const ProdView = lazy(() => import('./components/ProdView'))
const InventaireView = lazy(() => import('./components/InventaireView'))
const FabricationView = lazy(() => import('./components/FabricationView'))
const PrepaView = lazy(() => import('./components/PrepaView'))
const FabricationProdView = lazy(() => import('./components/FabricationProdView'))
const FabricationAnnexeView = lazy(() => import('./components/FabricationAnnexeView'))
const ValidationView = lazy(() => import('./components/ValidationView'))
const FreezerView = lazy(() => import('./components/FreezerView'))
const CheckCdView = lazy(() => import('./components/CheckCdView'))
const MessagesView = lazy(() => import('./components/MessagesView'))
const EtiquettesView = lazy(() => import('./components/EtiquettesView'))
const EtiquettesBoitesView = lazy(() => import('./components/EtiquettesBoitesView'))
const ProductLabelsView = lazy(() => import('./components/ProductLabelsView'))
const StockMorning = lazy(() => import('./components/StockBoutique/StockMorning'))
const StockPrevisions = lazy(() => import('./components/StockBoutique/StockPrevisions'))
const StockReception = lazy(() => import('./components/StockBoutique/StockReception'))
const StockEvening = lazy(() => import('./components/StockBoutique/StockEvening'))
const StockAudit = lazy(() => import('./components/StockBoutique/StockAudit'))
const StockGS = lazy(() => import('./components/StockBoutique/StockGS'))
const StockProd = lazy(() => import('./components/StockProd'))
const ChecklistView = lazy(() => import('./components/ChecklistView'))
const EconomatView = lazy(() => import('./components/Economat/EconomatView'))
const PhotoshopView = lazy(() => import('./components/Photoshop/PhotoshopView'))
const CaisseView = lazy(() => import('./components/Caisse/CaisseView'))
const CaisseRapide = lazy(() => import('./components/Caisse/CaisseRapide'))
const CaisseLivreur = lazy(() => import('./components/Caisse/CaisseLivreur'))
const TasksView = lazy(() => import('./components/Tasks/TasksView'))
const HRView = lazy(() => import('./components/HR/HRView'))
const InboxView = lazy(() => import('./components/Conversations/InboxView'))
const DevisView = lazy(() => import('./components/DevisView'))
const OcpManage = lazy(() => import('./components/OcpManage'))
const OcpFactureView = lazy(() => import('./components/OcpFactureView'))
const NewOrderView = lazy(() => import('./components/NewOrderView'))
const SupportsView = lazy(() => import('./components/SupportsView'))
const ModificationsView = lazy(() => import('./components/ModificationsView'))
const LivraisonsView = lazy(() => import('./components/LivraisonsView'))
const PaymentsView = lazy(() => import('./components/Conversations/PaymentsView'))
const AbsencesView = lazy(() => import('./components/AbsencesView'))
const CongesView = lazy(() => import('./components/CongesView'))
const PresenceView = lazy(() => import('./components/PresenceView'))
const CakeVisionView = lazy(() => import('./components/CakeVision/CakeVisionView'))
const StockPolyView = lazy(() => import('./components/StockPolyView'))
const PolyDecoupeView = lazy(() => import('./components/PolyDecoupeView'))
const SimulationGateauxView = lazy(() => import('./components/SimulationGateauxView'))
const TransfertsStockView = lazy(() => import('./components/TransfertsStockView'))
const ReglementsLivraisonsView = lazy(() => import('./components/ReglementsLivraisonsView'))
import ConversationNotifier from './components/Conversations/ConversationNotifier'
import AppHeader from './components/AppHeader'
import UpdateBanner from './components/UpdateBanner'
import GlobalSearch from './components/GlobalSearch'
import LazyBoundary from './components/LazyBoundary'
import ToastHost from './components/ToastHost'
import ConfirmHost from './components/ConfirmHost'
import MobileBottomNav from './components/MobileBottomNav'
import SideNav from './components/SideNav'
import TabLockGate from './components/TabLockGate'
import { getCurrentUser, logout, isAdmin, isLivreur, loadFreshUser, canSeeCalendar, canSeeConversations, canViewPayments, canSeeLivraisons, canSeeModifications, canSeeDevis, hasValidJwt } from './lib/auth'
import { tracerOnglet } from './lib/navUsage'
import { estModeTest } from './lib/modeTest'
import { refreshOnReturn } from './lib/autoRefresh'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Vue active : 'calendar' | 'recap' | 'patissier' | 'prod' | 'sales' | 'stock' | ...
  const [activeView, setActiveViewRaw] = useState('calendar')
  // Conversation à ouvrir d'office (deep-link depuis une notif push)
  const [deepLinkConv, setDeepLinkConv] = useState(null)
  // Ouverture d'un fil par numéro de téléphone (depuis le bouton Relancer des Devis)
  const [deepLinkPhone, setDeepLinkPhone] = useState(null)
  // N° de commande à marquer « Relancé par » au 1er envoi réel (relance depuis Devis)
  const [deepLinkRelanceRef, setDeepLinkRelanceRef] = useState(null)
  // Commande à ouvrir d'office dans l'onglet Commandes (depuis le 📦 Cmd d'une conversation)
  const [deepLinkDevis, setDeepLinkDevis] = useState(null)
  // Client (nom + téléphone) à pré-remplir dans « Nouvelle commande » (depuis une conversation)
  const [deepLinkNewCmd, setDeepLinkNewCmd] = useState(null)
  // Tâche à ouvrir d'office dans l'onglet Tâches (depuis le lien du message WhatsApp)
  const [deepLinkTask, setDeepLinkTask] = useState(null)
  // Onglet de la caisse Meriem à ouvrir directement (raccourcis depuis la caisse rapide)
  const [deepLinkCaisseSub, setDeepLinkCaisseSub] = useState(null)
  // Sous-onglet RH (+ sous-onglet Congés) à ouvrir depuis le menu de gauche
  const [hrDeep, setHrDeep] = useState(null)
  // Onglet Caisse (admin) à ouvrir depuis le menu de gauche
  const [caisseDeep, setCaisseDeep] = useState(null)
  // Bande de gauche « fantôme » : visible au survol du bord gauche
  const [sideHover, setSideHover] = useState(false)
  // Barre de gauche : chacun choisit son mode. 'fixe' (toujours ouverte) | 'auto' (se cache) | 'rail' (icônes fines). Mémorisé par appareil.
  const [sideMode, setSideModeRaw] = useState(() => {
    try {
      const m = localStorage.getItem('lily.sidebar.mode')
      if (m === 'auto' || m === 'fixe' || m === 'rail') return m
      return localStorage.getItem('lily.sidebar.pinned') === '1' ? 'fixe' : 'auto'   // reprise de l'ancien réglage
    } catch (e) { return 'auto' }
  })
  function setSideMode(m) { setSideModeRaw(m); try { localStorage.setItem('lily.sidebar.mode', m) } catch (e) { /* ignore */ } }
  // Recherche universelle (Ctrl/Cmd+K) + commande à ouvrir dans le calendrier depuis un résultat
  const [showSearch, setShowSearch] = useState(false)
  const [deepLinkOrder, setDeepLinkOrder] = useState(null)
  // Menu de gauche (ordi + tablette ≥ 768px). En dessous : navigation actuelle (haut/bas).
  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const h = e => setIsWide(e.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])

  // Wrapper pour setActiveView : persiste dans localStorage pour que Cmd+R
  // ramene l'utilisateur sur la meme page
  function setActiveView(view) {
    setActiveViewRaw(view)
    try {
      if (view) {
        localStorage.setItem('lily.activeView', view)
        // Met l'onglet dans l'URL (ex. ?view=caisse) → bookmarkable, on revient direct dessus.
        window.history.replaceState({}, '', '?view=' + view)
      }
    } catch (e) { /* ignore */ }
  }

  // Recupere la derniere vue sauvegardee (ou null)
  function getStoredActiveView() {
    try {
      return localStorage.getItem('lily.activeView') || null
    } catch (e) {
      return null
    }
  }

  // Ecran d'accueil : tout le monde arrive sur Taches (demande de Layla, 01/09/2026).
  // La vue memorisee dans le navigateur reste prioritaire : un Cmd+R garde l'onglet en cours.
  function pickDefaultView() {
    return 'tasks'
  }

  useEffect(() => {
    const stored = getCurrentUser()
    if (!stored) {
      setLoading(false)
      return
    }
    // Sécurité : une session sans jeton valide (ancienne session) doit se
    // reconnecter proprement, sinon elle perdra l'accès une fois la RLS resserrée.
    if (!hasValidJwt()) {
      logout()
      setLoading(false)
      return
    }
    setUser(stored)
    // Priorite : on essaie de restaurer la derniere vue depuis localStorage.
    // Sinon fallback sur la vue par defaut du user.
    const persisted = getStoredActiveView()
    // Deep-link depuis une notif push (/?conv=123) : ouvre direct la conversation
    const sp = new URLSearchParams(window.location.search)
    const convParam = sp.get('conv')
    const convPhoneParam = sp.get('convphone')
    if (convParam) {
      setActiveView('conversations')
      setDeepLinkConv(Number(convParam))
      try { window.history.replaceState({}, '', window.location.pathname) } catch (e) { /* ignore */ }
    } else if (convPhoneParam) {
      setActiveView('conversations')
      setDeepLinkPhone(convPhoneParam)
      const relanceRefParam = sp.get('relanceref')
      if (relanceRefParam) setDeepLinkRelanceRef(relanceRefParam)
      try { window.history.replaceState({}, '', window.location.pathname) } catch (e) { /* ignore */ }
    } else if (sp.get('devis')) {
      // Ouverture d'une commande précise dans l'onglet Commandes (depuis 📦 Cmd)
      setActiveView('devis')
      setDeepLinkDevis({ q: sp.get('devis'), state: sp.get('dstate') || '', day: sp.get('dday') || '' })
      try { window.history.replaceState({}, '', window.location.pathname) } catch (e) { /* ignore */ }
    } else if (sp.get('newcmd')) {
      // Nouvelle commande pré-remplie avec le client (depuis une conversation WhatsApp)
      setActiveView('nouvelle-commande')
      setDeepLinkNewCmd({ phone: sp.get('cmdphone') || '', name: sp.get('cmdname') || '' })
      try { window.history.replaceState({}, '', window.location.pathname) } catch (e) { /* ignore */ }
    } else if (sp.get('task')) {
      // Lien direct vers une tâche précise (depuis le message WhatsApp de notif)
      setActiveView('tasks')
      setDeepLinkTask(sp.get('task'))
      try { window.history.replaceState({}, '', window.location.pathname) } catch (e) { /* ignore */ }
    } else if (sp.get('view')) {
      // Favori / lien direct vers un onglet précis (ex. ?view=caisse)
      setActiveView(sp.get('view'))
    } else if (persisted) {
      setActiveView(persisted)
    } else {
      setActiveView(pickDefaultView())
    }
    // Recharge les permissions a jour depuis Supabase
    loadFreshUser(stored.id).then(fresh => {
      if (fresh) {
        setUser(fresh)
        // Seul cas ou on recalcule la vue : si l'utilisateur n'avait pas de vue
        // persistee et que ses perms ont change (impossible en pratique vu qu'on
        // vient juste de lire stored, mais par securite).
        if (!persisted) {
          const permsChanged = (
            stored.role !== fresh.role ||
            stored.perm_calendar !== fresh.perm_calendar ||
            stored.perm_prod !== fresh.perm_prod ||
            stored.perm_sales !== fresh.perm_sales ||
            stored.perm_patissier !== fresh.perm_patissier ||
            stored.perm_stock_patissier !== fresh.perm_stock_patissier ||
            stored.perm_stock_cafe !== fresh.perm_stock_cafe ||
            stored.perm_stock_audit !== fresh.perm_stock_audit ||
            stored.perm_stock_gs !== fresh.perm_stock_gs
          )
          if (permsChanged) {
            setActiveView(pickDefaultView())
          }
        }
      } else if (fresh === null) {
        // User desactive ou supprime -> deconnexion forcee
        logout()
        setUser(null)
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })
  }, [])

  // Refresh periodique des permissions (toutes les 2 min) pour propager les
  // changements d'admin sans que l'utilisateur ait besoin de se reconnecter
  useEffect(() => {
    if (!user) return
    // Re-vérifie les permissions au retour sur l'app + filet espacé (elles changent rarement).
    const refresh = () => loadFreshUser(user.id).then(fresh => { if (fresh) setUser(fresh) }).catch(() => {})
    return refreshOnReturn(refresh)
  }, [user?.id])

  // Refresh quand l'onglet redevient visible (changement de fenetre, retour de veille...)
  useEffect(() => {
    if (!user) return
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        loadFreshUser(user.id).then(fresh => {
          if (fresh) setUser(fresh)
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [user?.id])

  // Précharge en arrière-plan les écrans "à la demande" ~1,2 s après l'ouverture,
  // pour que la navigation soit instantanée (plus de "Chargement…"), tout en
  // gardant un démarrage rapide. Les livreurs (un seul écran) ne préchargent rien.
  useEffect(() => {
    if (!user || isLivreur(user)) return
    const id = setTimeout(() => {
      const warm = [
        () => import('./components/Caisse/CaisseView'),
        () => import('./components/HR/HRView'),
        () => import('./components/PatissierView'),
        () => import('./components/ProdView'),
        () => import('./components/FreezerView'),
        () => import('./components/MessagesView'),
        () => import('./components/EtiquettesView'),
        () => import('./components/StockBoutique/StockMorning'),
        () => import('./components/StockBoutique/StockReception'),
        () => import('./components/StockBoutique/StockEvening'),
        () => import('./components/StockBoutique/StockAudit'),
        () => import('./components/StockBoutique/StockGS'),
        () => import('./components/ChecklistView'),
        () => import('./components/Economat/EconomatView'),
        () => import('./components/Conversations/InboxView'),
        () => import('./components/ModificationsView'),
        () => import('./components/Conversations/PaymentsView'),
        () => import('./components/AbsencesView'),
        () => import('./components/CongesView'),
      ]
      warm.forEach(fn => fn().catch(() => {}))
    }, 1200)
    return () => clearTimeout(id)
  }, [user?.id])

  // Qui ouvre quels onglets. Une ligne par personne, par onglet et par jour :
  // de quoi savoir ce qui sert vraiment, et ce que personne n'ouvre jamais.
  useEffect(() => {
    if (user?.id && activeView) tracerOnglet(activeView, user.id)
  }, [user?.id, activeView])

  function handleLoginSuccess(u) {
    setUser(u)
    setActiveView(pickDefaultView())
    // Recharge les perms fresh juste apres login pour s'assurer d'avoir
    // toutes les colonnes (le login peut ne pas renvoyer toutes les perms)
    if (u?.id) {
      loadFreshUser(u.id).then(fresh => {
        if (fresh) {
          setUser(fresh)
          // Recalcule la vue si les perms diffèrent (cas typique : nouvel onglet
          // ajoute apres le dernier login)
          setActiveView(pickDefaultView())
        }
      }).catch(() => {})
    }
  }

  function handleLogout() {
    logout()
    setUser(null)
    setActiveView('calendar')
    // Nettoie la vue persistee pour eviter qu'un autre user qui se reconnecte
    // tombe sur l'onglet d'un autre.
    try { localStorage.removeItem('lily.activeView') } catch (e) { /* ignore */ }
  }

  function handleNavigate(view, opts) {
    setDeepLinkConv(null)
    setDeepLinkPhone(null)
    setDeepLinkCaisseSub(opts?.caisseSub || null)
    setHrDeep(opts?.hrTab ? { tab: opts.hrTab, ctab: opts.congesTab || null } : null)
    setCaisseDeep(opts?.caisseTab ? { tab: opts.caisseTab } : null)
    setActiveView(view)
  }

  // Raccourci Ctrl/Cmd + K + clic sur la loupe du header → ouvre la recherche universelle.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setShowSearch(s => !s) }
    }
    function onOpen() { setShowSearch(true) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('lily:open-search', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('lily:open-search', onOpen) }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-ink-mute">Chargement...</div>
      </div>
    )
  }

  if (!user) return <Login onLoginSuccess={handleLoginSuccess} />

  // Communs : passer activeView, onNavigate, onLogout, user
  const navProps = { user, activeView, onNavigate: handleNavigate, onLogout: handleLogout }

  // Ouvre une conversation précise (depuis un toast)
  function openConversation(convId) {
    setDeepLinkConv(convId)
    setActiveView('conversations')
  }

  function renderActiveView() {
    // Livreur : accès limité à Livraisons + sa caisse (Hamid) + ses Tâches (jamais Récap, même via onglet mémorisé).
    if (isLivreur(user)) {
      if (activeView === 'caisse-livreur') return <CaisseLivreur {...navProps} />
      if (activeView === 'decoupe-poly') return <PolyDecoupeView {...navProps} />
      if (activeView === 'recap') return <RecapVentes {...navProps} fullscreen />
      if (activeView === 'tasks') return <TasksWrapper {...navProps} taskDeep={deepLinkTask} />
      return <LivraisonsWrapper {...navProps} />
    }
    if (activeView === 'recap') return <RecapVentes {...navProps} fullscreen />
    if (activeView === 'patissier') return <PatissierView {...navProps} />
    if (activeView === 'prod') return <ProdView {...navProps} forcedCategory="prod" />
    if (activeView === 'fabrication') return <FabricationView {...navProps} />
    if (activeView === 'fabrication-glacage') return <PrepaView key="glacage" quoi="glacage" {...navProps} />
    if (activeView === 'fabrication-pate-sucre') return <PrepaView key="pate-sucre" quoi="pate-sucre" {...navProps} />
    if (activeView === 'fabrication-prod') return <FabricationProdView {...navProps} />
    if (activeView === 'fabrication-annexe') return <FabricationAnnexeView {...navProps} />
    if (activeView === 'fabrication-valider') return <ValidationView {...navProps} />
    if (activeView === 'sales') return <ProdView {...navProps} forcedCategory="sales" />
    if (activeView === 'freezer') return <FreezerView {...navProps} />
    if (activeView === 'check-cd') return <CheckCdView {...navProps} />
    if (activeView === 'messages') return <MessagesView {...navProps} />
    if (activeView === 'cake-vision-edit') return <CakeVisionView {...navProps} />
    if (activeView === 'etiquettes') return <EtiquettesView {...navProps} />
    if (activeView === 'etiquettes-boites') return <EtiquettesBoitesView {...navProps} />
    if (activeView === 'etiquettes-prix') return <ProductLabelsView {...navProps} />
    if (activeView === 'vitrine') return <StockMorning {...navProps} mode="sucre" />
    if (activeView === 'vitrine-previsions') return <StockPrevisions {...navProps} />
    if (activeView === 'vitrine-sale') return <StockMorning {...navProps} mode="sale" />
    if (activeView === 'reception-vitrine') return <StockReception {...navProps} />
    if (activeView === 'presence') return <PresenceView {...navProps} />
    if (activeView === 'fin-journee') return <StockEvening {...navProps} />
    if (activeView === 'stock') return <StockAudit {...navProps} />
    if (activeView === 'stock-gs') return <StockGS {...navProps} />
    if (activeView === 'stock-prod-vitrine') return <StockProd {...navProps} lieu="vitrine" />
    if (activeView === 'stock-prod-annexe') return <StockProd {...navProps} lieu="annexe" />
    if (activeView === 'inventaire') return <InventaireView {...navProps} />
    if (activeView === 'inventaire-zero') return <InventaireView {...navProps} mode="zero" />
    if (activeView === 'tasks') return <TasksWrapper {...navProps} taskDeep={deepLinkTask} />
    if (activeView === 'hr') return isAdmin(user)
      ? <TabLockGate label="RH"><HRWrapper {...navProps} hrDeep={hrDeep} /></TabLockGate>
      : <HRWrapper {...navProps} hrDeep={hrDeep} />
    if (activeView === 'conversations') return <ConversationsWrapper {...navProps} initialConversationId={deepLinkConv} initialPhone={deepLinkPhone} initialRelanceRef={deepLinkRelanceRef} />
    if (activeView === 'devis') return <DevisWrapper key="devis" {...navProps} initialDevis={deepLinkDevis} />
    if (activeView === 'ocp-link') return <div className="min-h-screen bg-cream"><AppHeader {...navProps} /><OcpManage /></div>
    if (activeView === 'facture-ocp') return <div className="min-h-screen bg-cream"><AppHeader {...navProps} /><OcpFactureView user={user} /></div>
    if (activeView === 'devis-internet') return <DevisWrapper key="devis-internet" {...navProps} internetOnly />
    if (activeView === 'nouvelle-commande') return <NewOrderWrapper {...navProps} initialClient={deepLinkNewCmd} />
    if (activeView === 'modifications') return <ModificationsWrapper {...navProps} />
    if (activeView === 'livraisons') return <LivraisonsWrapper {...navProps} />
    if (activeView === 'paiements') return <PaymentsWrapper {...navProps} />
    if (activeView === 'absences') return <AbsencesWrapper {...navProps} />
    if (activeView === 'caisse') return isAdmin(user)
      ? <TabLockGate label="Caisse"><CaisseView {...navProps} initialSub={deepLinkCaisseSub} deepTab={caisseDeep} /></TabLockGate>
      : <CaisseView {...navProps} initialSub={deepLinkCaisseSub} deepTab={caisseDeep} />
    if (activeView === 'caisse-rapide') return <CaisseRapide {...navProps} />
    if (activeView === 'caisse-livreur') return <CaisseLivreur {...navProps} />
    if (activeView === 'checklist') return <ChecklistView {...navProps} />
    if (activeView === 'supports') return <SupportsView {...navProps} />
    if (activeView === 'economat') return <EconomatView {...navProps} />
    if (activeView === 'stock-poly') return <StockPolyView {...navProps} />
    if (activeView === 'decoupe-poly') return <PolyDecoupeView {...navProps} />
    if (activeView === 'simu-gateaux') return <SimulationGateauxView {...navProps} />
    if (activeView === 'transferts-mp') return <TransfertsStockView {...navProps} famille="mp" />
    if (activeView === 'transferts-sm') return <TransfertsStockView {...navProps} famille="sm" />
    if (activeView === 'reglements-livraisons') return <ReglementsLivraisonsView {...navProps} />
    if (activeView === 'photoshop') return <PhotoshopView {...navProps} />
    // Catch-all : Calendrier UNIQUEMENT si l'utilisateur en a la permission.
    // Sinon repli sûr (livreur -> Livraisons, autres -> Tâches) pour ne jamais
    // exposer le calendrier à un user sans perm_calendar.
    if (canSeeCalendar(user)) return <Calendar {...navProps} openOrderNum={deepLinkOrder} onOrderOpened={() => setDeepLinkOrder(null)} onOpenDevis={(num) => { setDeepLinkDevis({ q: num, state: '', day: '' }); setActiveView('devis') }} />
    if (isLivreur(user)) return <LivraisonsWrapper {...navProps} />
    return <TasksWrapper {...navProps} welcome />
  }

  return (
    <>
      <UpdateBanner />
      <BandeauModeTest />
      <ToastHost />
      <ConfirmHost />
      {canSeeConversations(user) && (
        <ConversationNotifier user={user} onOpen={openConversation} />
      )}
      {(() => {
        const showSide = isWide && !isLivreur(user)
        if (!showSide) return <LazyBoundary>{renderActiveView()}</LazyBoundary>
        const W = 222, RW = 52
        const nav = (v, o) => { handleNavigate(v, o); setSideHover(false) }

        // Mode RAIL : icônes FIXES (52px). Survol d'une icône = son nom en étiquette (géré dans SideNav).
        if (sideMode === 'rail') {
          return (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: RW, zIndex: 47,
                background: '#F7F2EA', borderRight: '1px solid #e5d8c3' }}>
                <SideNav user={user} activeView={activeView} onNavigate={nav} width={RW} collapsed mode={sideMode} onSetMode={setSideMode} />
              </div>
              <div style={{ marginLeft: RW }}>
                <LazyBoundary>{renderActiveView()}</LazyBoundary>
              </div>
            </>
          )
        }

        // Modes FIXE / AUTO
        const sideOpen = sideMode === 'fixe' || sideHover
        return (
          <>
            {sideMode === 'auto' && (
              <div onMouseEnter={() => setSideHover(true)} style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: 16, zIndex: 46 }} />
            )}
            {sideMode === 'auto' && (
              <div onClick={() => setSideHover(h => !h)} onMouseEnter={() => setSideHover(true)} title="Menu"
                style={{ position: 'fixed', top: '50%', left: 0, transform: 'translateY(-50%)', zIndex: 46,
                  width: 18, height: 66, background: '#993556', color: '#fff', borderRadius: '0 10px 10px 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  boxShadow: '1px 0 6px rgba(0,0,0,0.15)', opacity: sideHover ? 0 : 1, transition: 'opacity 0.2s' }}>
                <span style={{ fontSize: 15 }}>›</span>
              </div>
            )}
            <div onMouseEnter={() => { if (sideMode !== 'fixe') setSideHover(true) }} onMouseLeave={() => { if (sideMode !== 'fixe') setSideHover(false) }}
              style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: W, zIndex: 47,
                transform: sideOpen ? 'translateX(0)' : `translateX(-${W}px)`, transition: 'transform 0.2s ease',
                boxShadow: (sideMode !== 'fixe' && sideHover) ? '2px 0 18px rgba(0,0,0,0.18)' : 'none', borderRight: '0.5px solid #e5d8c3' }}>
              <SideNav user={user} activeView={activeView} onNavigate={nav} width={W} mode={sideMode} onSetMode={setSideMode} />
            </div>
            <div style={{ marginLeft: sideMode === 'fixe' ? W : 0, transition: 'margin-left 0.2s ease' }}>
              <LazyBoundary>{renderActiveView()}</LazyBoundary>
            </div>
          </>
        )
      })()}
      <MobileBottomNav user={user} activeView={activeView} onNavigate={handleNavigate} />
      {showSearch && (
        <GlobalSearch
          onClose={() => setShowSearch(false)}
          onOpenOrder={(num, day) => { setDeepLinkDevis({ q: num, state: 'sale', day: (day || '').slice(0, 10) }); setActiveView('devis'); setShowSearch(false) }}
          onOpenDevis={(num, day) => { setDeepLinkDevis({ q: num, state: '', day: (day || '').slice(0, 10) }); setActiveView('devis'); setShowSearch(false) }}
          onOpenConv={(id) => { openConversation(id); setShowSearch(false) }}
          onNavigate={(v) => { setActiveView(v); setShowSearch(false) }}
        />
      )}
    </>
  )
}

// ============================================================
// Wrapper pour TasksView : inclut AppHeader
// (TasksView ne gere pas le header lui-meme)
// ============================================================
function TasksWrapper(props) {
  const { user, onLogout, onNavigate, activeView, welcome, taskDeep } = props
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      {welcome && (
        <div className="max-w-3xl mx-auto mt-4 px-4">
          <div className="rounded-xl border border-bordeaux/30 bg-bordeaux/5 p-4 text-[14px] text-ink">
            <div className="font-semibold text-bordeaux mb-1">👋 Bienvenue {user.full_name || user.username} !</div>
            Ton compte est créé. Tes accès seront activés par l'administration. En attendant, tu peux consulter tes <strong>tâches</strong> ci-dessous.
          </div>
        </div>
      )}
      <TasksView user={user} deepLinkTaskId={taskDeep} />
    </div>
  )
}

function HRWrapper(props) {
  const { user, onLogout, onNavigate, activeView, hrDeep } = props
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <HRView user={user} deep={hrDeep} />
    </div>
  )
}

function NewOrderWrapper(props) {
  const { user, onLogout, onNavigate, activeView, initialClient } = props
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <NewOrderView user={user} initialClient={initialClient} />
    </div>
  )
}

function ConversationsWrapper(props) {
  const { user, onLogout, onNavigate, activeView, initialConversationId, initialPhone, initialRelanceRef } = props
  return (
    <div className="min-h-[100dvh] bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <InboxView user={user} initialConversationId={initialConversationId} initialPhone={initialPhone} initialRelanceRef={initialRelanceRef} />
    </div>
  )
}

function PaymentsWrapper(props) {
  const { user, onLogout, onNavigate, activeView } = props
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <PaymentsView user={user} />
    </div>
  )
}

function DevisWrapper(props) {
  const { user, onLogout, onNavigate, activeView, initialDevis, internetOnly } = props
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <DevisView user={user} initialDevis={initialDevis} internetOnly={internetOnly} />
    </div>
  )
}

function ModificationsWrapper(props) {
  const { user, onLogout, onNavigate, activeView } = props
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <ModificationsView user={user} />
    </div>
  )
}

function LivraisonsWrapper(props) {
  const { user, onLogout, onNavigate, activeView } = props
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <LivraisonsView user={user} />
    </div>
  )
}

// Quand l'app tourne en mode test (?test=1), rien ne part vers Odoo : on le dit
// en permanence, sinon on croit avoir validé pour de vrai.
function BandeauModeTest() {
  if (!estModeTest()) return null
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 60,
      background: '#854F0B', color: '#FFF7E0', textAlign: 'center',
      padding: '4px 10px', fontSize: 12.5, fontWeight: 700 }}>
      MODE TEST — rien n'est envoyé à Odoo ·{' '}
      <a href="?test=0" style={{ textDecoration: 'underline', color: '#FFF7E0' }}>revenir au mode normal</a>
    </div>
  )
}

function AbsencesWrapper(props) {
  const { user, onLogout, onNavigate, activeView } = props
  return (
    <div className="min-h-screen bg-cream">
      <CongesView user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
    </div>
  )
}

export default App

