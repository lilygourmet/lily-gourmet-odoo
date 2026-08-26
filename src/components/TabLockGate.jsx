import { useState, useEffect } from 'react'
import { verifyTabLock, tabLockStatus } from '../lib/tabLock'
import { touchIdAvailable, touchIdRegistered, unlockTouchId } from '../lib/touchId'

// Verrou devant un onglet sensible (Caisse / RH). Remonté à chaque ouverture de l'onglet
// → redemande à chaque fois (protège si le compte reste ouvert ailleurs).
// Si Touch ID est configuré sur l'appareil : on le lance AUTOMATIQUEMENT à l'ouverture
// (Safari peut exiger un clic → le bouton reste dispo), avec le code en secours.
export default function TabLockGate({ label, children }) {
  const [unlocked, setUnlocked] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [checking, setChecking] = useState(true)
  const [triedAuto, setTriedAuto] = useState(false)

  const canTouchId = touchIdAvailable() && touchIdRegistered()

  // Pas de code défini → aucun verrou (on ouvre directement, sans écran).
  useEffect(() => {
    let m = true
    tabLockStatus()
      .then(r => { if (m && !r.isSet) setUnlocked(true) })
      .catch(() => {})
      .finally(() => { if (m) setChecking(false) })
    return () => { m = false }
  }, [])

  // Déclenche Touch ID tout seul à l'ouverture (une fois).
  useEffect(() => {
    if (checking || unlocked || triedAuto || !canTouchId) return
    setTriedAuto(true)
    ;(async () => {
      setBusy(true)
      try { if (await unlockTouchId()) setUnlocked(true) }
      catch { /* Safari a besoin d'un clic → on laisse le bouton */ }
      finally { setBusy(false) }
    })()
  }, [checking, unlocked, triedAuto, canTouchId])

  if (unlocked) return children
  if (checking) return null

  async function submit(e) {
    e?.preventDefault()
    setBusy(true); setErr('')
    try {
      const r = await verifyTabLock(code)
      if (r.ok) setUnlocked(true)
      else setErr('Code incorrect.')
    } catch (e) { setErr(e.message || 'Erreur') }
    finally { setBusy(false) }
  }

  async function touchId() {
    setBusy(true); setErr('')
    try {
      if (await unlockTouchId()) setUnlocked(true)
      else setErr('Touch ID refusé.')
    } catch (e) { setErr('Touch ID annulé — utilise le code.') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-[70dvh] flex items-center justify-center p-6">
      <form onSubmit={submit} className="bg-cream-warm border border-line rounded-2xl p-6 w-full max-w-xs text-center shadow-sm">
        <div className="text-[15px] font-bold text-bordeaux mb-1">🔒 {label}</div>

        {canTouchId ? (
          <>
            <div className="text-[12px] text-ink-soft mb-4">Pose ton doigt sur Touch ID — ou entre le code.</div>
            <button type="button" onClick={touchId} disabled={busy}
              className="w-full bg-bordeaux text-cream rounded-lg py-3 text-[15px] font-bold disabled:opacity-50 mb-3">
              {busy ? '…' : '👆 Déverrouiller avec Touch ID'}
            </button>
            <div className="text-[11px] text-ink-mute mb-2">ou avec le code</div>
          </>
        ) : (
          <div className="text-[12px] text-ink-soft mb-4">Entre le code pour ouvrir cet onglet.</div>
        )}

        <input
          autoFocus={!canTouchId}
          type="password"
          inputMode="numeric"
          value={code}
          onChange={e => setCode(e.target.value)}
          className="w-full text-center tracking-[0.4em] text-[20px] px-3 py-2 border border-line rounded-lg mb-3 focus:outline-none focus:border-bordeaux"
          placeholder="••••"
        />
        {err && <div className="text-[12px] text-red-600 mb-2">{err}</div>}
        <button type="submit" disabled={busy || !code}
          className={`w-full rounded-lg py-2.5 text-[14px] font-bold disabled:opacity-50 ${canTouchId ? 'border border-bordeaux text-bordeaux' : 'bg-bordeaux text-cream'}`}>
          {busy ? '…' : 'Déverrouiller'}
        </button>
      </form>
    </div>
  )
}
