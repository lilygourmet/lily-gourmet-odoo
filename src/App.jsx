import { useState, useEffect } from 'react'
import Login from './components/Login'
import Calendar from './components/Calendar'
import RecapVentes from './components/RecapVentes'
import PatissierView from './components/PatissierView'
import ProdView from './components/ProdView'
import { getCurrentUser, logout, isAdmin, isPatissierOnly, isProdOnly } from './lib/auth'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // Vue active : 'calendar' | 'recap' | 'patissier' | 'prod' | 'sales'
  const [activeView, setActiveView] = useState('calendar')

  useEffect(() => {
    const stored = getCurrentUser()
    setUser(stored)
    if (stored) {
      // Vue par défaut selon le role/permissions
      if (stored.role === 'recap') setActiveView('recap')
      else if (isProdOnly(stored)) setActiveView(stored.prod_category === 'sales' ? 'sales' : 'prod')
      else if (isPatissierOnly(stored)) setActiveView('patissier')
      else setActiveView('calendar')
    }
    setLoading(false)
  }, [])

  function handleLoginSuccess(u) {
    setUser(u)
    if (u.role === 'recap') setActiveView('recap')
    else if (isProdOnly(u)) setActiveView(u.prod_category === 'sales' ? 'sales' : 'prod')
    else if (isPatissierOnly(u)) setActiveView('patissier')
    else setActiveView('calendar')
  }

  function handleLogout() {
    logout()
    setUser(null)
    setActiveView('calendar')
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

  // Default = Calendar
  return <Calendar {...navProps} />
}

export default App
