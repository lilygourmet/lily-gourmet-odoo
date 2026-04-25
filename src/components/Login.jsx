import { useState } from 'react'
import { loginWithUsername } from '../lib/auth'

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [signing, setSigning] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setErrorMsg('')
    setSigning(true)

    const { user, error } = await loginWithUsername(username, password)
    setSigning(false)

    if (error) {
      setErrorMsg(error)
      return
    }

    if (onLoginSuccess) onLoginSuccess(user)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-b from-cream to-cream-warm relative overflow-hidden">
      <div
        className="absolute pointer-events-none"
        style={{
          top: '10%',
          left: '-30%',
          width: '160%',
          height: '50%',
          background: 'radial-gradient(ellipse, rgba(184,137,60,0.18) 0%, transparent 65%)',
        }}
      />

      <div className="w-full max-w-[360px] relative z-10 py-12">
        <div className="flex flex-col items-center mb-10">
          <img src="/Logo_LG.jpg" alt="Lily Gourmet" className="w-24 h-24 mb-6 object-contain" />
          <h1 className="font-sans font-semibold text-[26px] tracking-[0.15em] text-ink">LILY GOURMET</h1>
          <div className="font-sans text-[10px] tracking-[0.35em] text-ink-soft mt-1.5">DÉLICES CRÉATIFS</div>
          <div className="font-mono text-[9px] tracking-[0.3em] uppercase text-bordeaux mt-4">Planning CD</div>
        </div>

        <form className="flex flex-col gap-3" onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Nom d'utilisateur"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            className="px-4 py-3.5 border border-line bg-cream rounded-xl text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-bordeaux focus:ring-1 focus:ring-bordeaux/30 transition"
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="px-4 py-3.5 border border-line bg-cream rounded-xl text-[13px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-bordeaux focus:ring-1 focus:ring-bordeaux/30 transition"
          />

          {errorMsg && (
            <div className="text-center text-[11px] text-bordeaux font-medium mt-1">{errorMsg}</div>
          )}

          <button
            type="submit"
            disabled={signing}
            className="mt-3 py-3.5 px-4 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-xl text-[13px] font-medium tracking-wider transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signing ? 'CONNEXION...' : 'SE CONNECTER'}
          </button>
        </form>

        <div className="mt-12 text-center font-mono text-[9px] tracking-[0.3em] uppercase text-ink-mute">
          — Agdal · Rabat —
        </div>
      </div>
    </div>
  )
}