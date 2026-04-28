import { useState, useEffect } from 'react'
import Login from './components/Login'
import Calendar from './components/Calendar'
import RecapVentes from './components/RecapVentes'
import PatissierView from './components/PatissierView'
import { getCurrentUser, logout, isAdmin, isPatissierOnly } from './lib/auth'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adminPatissierMode, setAdminPatissierMode] = useState(false)

  useEffect(() => {
    const stored = getCurrentUser()
    setUser(stored)
    setLoading(false)
  }, [])

  function handleLoginSuccess(u) {
    setUser(u)
  }

  function handleLogout() {
    logout()
    setUser(null)
    setAdminPatissierMode(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-ink-mute">Chargement...</div>
      </div>
    )
  }

  if (!user) return <Login onLoginSuccess={handleLoginSuccess} />

  if (user.role === 'recap') {
    return <RecapVentes user={user} onLogout={handleLogout} fullscreen />
  }

  if (isPatissierOnly(user)) {
    return <PatissierView user={user} onLogout={handleLogout} />
  }

  if (isAdmin(user) && adminPatissierMode) {
    return (
      <PatissierView
        user={user}
        onBackToCalendar={() => setAdminPatissierMode(false)}
      />
    )
  }

  return (
    <Calendar
      user={user}
      onLogout={handleLogout}
      onSwitchToPatissier={isAdmin(user) ? () => setAdminPatissierMode(true) : null}
    />
  )
}

export default App
