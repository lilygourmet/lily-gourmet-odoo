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
import ChecklistView from './components/ChecklistView'
import { getCurrentUser, logout, isAdmin, isPatissierOnly, isProdOnly, isLivreur, loadFreshUser, canStockPatissier, canStockCafe, canStockAudit, canSeeCalendar } from './lib/auth'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Vue active : 'calendar' | 'recap' | 'patissier' | 'prod' | 'sales' | 'stock' | ...
  const [activeView, setActiveView] = useState('calendar')

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
    setUser(stored)
    if (stored) {
      // Restaure la derniere vue ouverte si elle existe (sauf livreur, qui
      // est toujours redirige vers recap), sinon vue par defaut.
      const saved = localStorage.getItem('lily_active_view')
      if (saved && !isLivreur(stored)) {
        setActiveView(saved)
      } else {
        setActiveView(pickDefaultView(stored))
      }
      // En arriere-plan : recharge les permissions a jour depuis Supabase
      // (au cas ou l'admin aurait modifie les perms depuis la derniere connexion)
      loadFreshUser(stored.id).then(fresh => {
        if (fresh) {
          setUser(fresh)
        } else if (fresh === null) {
          // User desactive ou supprime -> deconnexion forcee
          logout()
          setUser(null)
        }
      })
    }
    setLoading(false)
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
  }

  function handleLogout() {
    logout()
    localStorage.removeItem('lily_active_view')
    setUser(null)
    setActiveView('calendar')
  }

  function handleNavigate(view) {
    setActiveView(view)
    localStorage.setItem('lily_active_view', view)
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
  if (activeView === 'vitrine') return <StockMorning {...navProps} />
  if (activeView === 'reception-vitrine') return <StockReception {...navProps} />
  if (activeView === 'checklist') return <ChecklistView {...navProps} />
  if (activeView === 'fin-journee') return <StockEvening {...navProps} />
  if (activeView === 'stock') return <StockAudit {...navProps} />
  // Default = Calendar
  return <Calendar {...navProps} />
}

export default App

