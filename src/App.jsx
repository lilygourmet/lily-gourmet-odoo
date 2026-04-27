import { useState, useEffect } from 'react'
import Login from './components/Login'
import Calendar from './components/Calendar'
import RecapVentes from './components/RecapVentes'
import { getCurrentUser, logout } from './lib/auth'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Restaure la session depuis localStorage
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
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-ink-mute">Chargement...</div>
      </div>
    )
  }

  if (!user) return <Login onLoginSuccess={handleLoginSuccess} />

  // Role 'recap' : acces direct a la page Recap, pas de calendrier
  if (user.role === 'recap') {
    return <RecapVentes user={user} onLogout={handleLogout} fullscreen />
  }

  return <Calendar user={user} onLogout={handleLogout} />
}

export default App