import { useState, useEffect } from 'react'
import Login from './components/Login'
import Calendar from './components/Calendar'
import RecapVentes from './components/RecapVentes'
import PatissierView from './components/PatissierView'
import ProdView from './components/ProdView'
import FreezerView from './components/FreezerView'
import MessagesView from './components/MessagesView'
import EtiquettesView from './components/EtiquettesView'
import StockMorning from './components/StockBoutique/StockMorning'
import StockReception from './components/StockBoutique/StockReception'
import StockEvening from './components/StockBoutique/StockEvening'
import StockAudit from './components/StockBoutique/StockAudit'
import StockGS from './components/StockBoutique/StockGS'
import ChecklistView from './components/ChecklistView'
import { getCurrentUser, logout, isAdmin, isPatissierOnly, isProdOnly, isLivreur, loadFreshUser, canStockPatissier, canStockCafe, canStockAudit, canSeeCalendar } from './lib/auth'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Vue active : 'calendar' | 'recap' | 'patissier' | 'prod' | 'sales' | 'stock' | ...
  const [activeView, setActiveViewRaw] = useState('calendar')

  // Wrapper pour setActiveView : persiste dans localStorage pour que Cmd+R
  // ramene l'utilisateur sur la meme page
  function setActiveView(view) {
    setActiveViewRaw(view)
    try {
      if (view) localStorage.setItem('lily.activeView', view)
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

  // Choisit la vue par defaut en fonction du user
  function pickDefaultView(u) {
    if (!u) return 'calendar'
    if (isLivreur(u)) return 'recap'
    if (u.role === 'recap') return 'recap'
    if (u.role === 'admin') return 'calendar'
    // Stock granulaire : si user a UNIQUEMENT une perm stock, on l'oriente sur SON onglet
    const hasStockPatissier = canStockPatissier(u)
    const hasStockCafe = canStockCafe(u)
    const hasStockAudit = canStockAudit(u)
    const hasOtherMain = u.perm_calendar || isProdOnly(u) || isPatissierOnly(u)
    if (!hasOtherMain) {
      if (hasStockPatissier && !hasStockCafe && !hasStockAudit) return 'vitrine'
      if (hasStockCafe && !hasStockPatissier && !hasStockAudit) {
        const hour = new Date().getHours()
        if (hour >= 17) return 'fin-journee'
        return 'reception-vitrine'
      }
      if (hasStockAudit && !hasStockPatissier && !hasStockCafe) return 'stock'
    }
    if (u.perm_calendar) return 'calendar'
    if (isProdOnly(u)) {
      if (u.perm_sales && !u.perm_prod) return 'sales'
      return 'prod'
    }
    if (isPatissierOnly(u)) return 'patissier'
    return 'calendar'
  }

  useEffect(() => {
    const stored = getCurrentUser()
    if (!stored) {
      setLoading(false)
      return
    }
    setUser(stored)
    // Priorite : on essaie de restaurer la derniere vue depuis localStorage.
    // Sinon fallback sur la vue par defaut du user.
    const persisted = getStoredActiveView()
    if (persisted) {
      setActiveView(persisted)
    } else {
      setActiveView(pickDefaultView(stored))
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
            setActiveView(pickDefaultView(fresh))
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
    const interval = setInterval(() => {
      loadFreshUser(user.id).then(fresh => {
        if (fresh) setUser(fresh)
      })
    }, 2 * 60 * 1000)  // 2 minutes
    return () => clearInterval(interval)
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

  function handleLoginSuccess(u) {
    setUser(u)
    setActiveView(pickDefaultView(u))
    // Recharge les perms fresh juste apres login pour s'assurer d'avoir
    // toutes les colonnes (le login peut ne pas renvoyer toutes les perms)
    if (u?.id) {
      loadFreshUser(u.id).then(fresh => {
        if (fresh) {
          setUser(fresh)
          // Recalcule la vue si les perms diffèrent (cas typique : nouvel onglet
          // ajoute apres le dernier login)
          setActiveView(pickDefaultView(fresh))
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

  function handleNavigate(view) {
    setActiveView(view)
  }

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

  if (activeView === 'recap') return <RecapVentes {...navProps} fullscreen />
  if (activeView === 'patissier') return <PatissierView {...navProps} />
  if (activeView === 'prod') return <ProdView {...navProps} forcedCategory="prod" />
  if (activeView === 'sales') return <ProdView {...navProps} forcedCategory="sales" />
  if (activeView === 'freezer') return <FreezerView {...navProps} />
  if (activeView === 'messages') return <MessagesView {...navProps} />
  if (activeView === 'etiquettes') return <EtiquettesView {...navProps} />
  if (activeView === 'vitrine') return <StockMorning {...navProps} mode="sucre" />
  if (activeView === 'vitrine-sale') return <StockMorning {...navProps} mode="sale" />
  if (activeView === 'reception-vitrine') return <StockReception {...navProps} />
  if (activeView === 'fin-journee') return <StockEvening {...navProps} />
  if (activeView === 'stock') return <StockAudit {...navProps} />
  if (activeView === 'stock-gs') return <StockGS {...navProps} />
  if (activeView === 'checklist') return <ChecklistView {...navProps} />
  // Default = Calendar
  return <Calendar {...navProps} />
}

export default App

