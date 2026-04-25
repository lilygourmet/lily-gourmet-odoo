import { useState, useEffect } from 'react'
import Login from './components/Login'
import Calendar from './components/Calendar'
import { getCurrentUser } from './lib/auth'

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

  return <Calendar user={user} onLogout={handleLogout} />
}

export default App