import { useState, useEffect } from 'react'
import { isAdmin, canRecaps, canSync, canSeeCalendar, canPrintLabels, canSeeFreezer, canSeeMessages, canSeeEtiquettes } from '../lib/auth'
import ChangePasswordModal from './ChangePasswordModal'
import AdminUsers from './AdminUsers'
import AdminGmConfig from './AdminGmConfig'
import LabelsButton from './LabelsButton'

// ============================================================
// AppHeader : header de navigation unifie
// Props :
//   user, activeView, onNavigate, onLogout
//   onSyncSuccess : callback apres sync (pour refresh la vue active)
// ============================================================
export default function AppHeader({ user, activeView, onNavigate, onLogout, onSyncSuccess }) {
  const admin = isAdmin(user)
  const isProdUser = !admin && (user?.perm_prod || user?.perm_sales)
  const isPatissierUser = !admin && user?.perm_patissier
  const userCanSync = canSync(user)

  const [showCog, setShowCog] = useState(false)
  const [showChangePwd, setShowChangePwd] = useState(false)
  const [showAdminUsers, setShowAdminUsers] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [lastSyncAt, setLastSyncAt] = useState(() => {
    const v = localStorage.getItem('lastSyncAt')
    return v ? new Date(v) : null
  })
  const [, setNow] = useState(0)

  // Refresh affichage relatif chaque minute
  useEffect(() => {
    const t = setInterval(() => setNow(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  // Auto-sync toutes les 5 min (si user a la perm + dernier sync > 4 min)
  useEffect(() => {
    if (!userCanSync) return
    const CHECK_MS = 60 * 1000              // verifie chaque minute
    const MIN_INTERVAL_MS = 5 * 60 * 1000   // sync si dernier > 5 min

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

    // Tick imm\u00e9diat puis chaque minute
    tryAutoSync()
    const t = setInterval(tryAutoSync, CHECK_MS)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userCanSync])

  function fmtRelative(d) {
    if (!d) return ''
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return 'à l\'instant'
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)}min`
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

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
      alert(`Erreur sync : ${e.message}`)
      setTimeout(() => setSyncStatus(''), 2500)
    } finally {
      setSyncing(false)
    }
  }

  function navBtn(view, emoji, label, visible) {
    if (!visible) return null
    const isActive = activeView === view
    return (
      <button
        onClick={() => onNavigate && onNavigate(view)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 ${
          isActive
            ? 'bg-bordeaux text-cream border border-bordeaux'
            : 'border border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream hover:border-bordeaux'
        }`}
      >
        <span>{emoji}</span>
        <span>{label}</span>
      </button>
    )
  }

  return (
    <>
      <div className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-line px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
        {/* Logo cliquable -> calendrier */}
        <button
          onClick={() => canSeeCalendar(user) && onNavigate && onNavigate('calendar')}
          className={`flex items-center gap-2.5 ${canSeeCalendar(user) ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} flex-shrink-0`}
        >
          <img src="/Logo_LG.jpg" alt="Lily Gourmet" className="w-8 h-8 object-contain" />
          <div className="hidden sm:block text-left">
            <div className="font-sans font-semibold text-[12px] tracking-[0.12em] text-ink leading-tight">LILY GOURMET</div>
            {user?.full_name && (
              <div className="font-mono text-[8px] tracking-[0.2em] uppercase text-bordeaux mt-0.5">{user.full_name}</div>
            )}
          </div>
        </button>

        {/* Navigation */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {navBtn('calendar', '📅', 'Calendrier', canSeeCalendar(user))}
          {navBtn('recap', '📊', 'Récap', canRecaps(user))}
          {navBtn('prod', '🥐', 'Prod', admin || (isProdUser && user.perm_prod))}
          {navBtn('sales', '🥪', 'Salés', admin || (isProdUser && user.perm_sales))}
          {navBtn('patissier', '🧁', 'Accessoires', admin || isPatissierUser)}
          {navBtn('freezer', '❄️', 'CD Négatif', canSeeFreezer(user))}
          {navBtn('messages', '', 'Messages', canSeeMessages(user))}
          {navBtn('etiquettes', '🏷', 'Étiquettes Café', canSeeEtiquettes(user))}
        </div>

        {/* Actions : sync + roue + logout */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Bouton Etiquettes Zebra (admin ou perm_labels) */}
          {canPrintLabels(user) && <LabelsButton />}

          {/* Heure derniere sync : visible pour tous */}
          {lastSyncAt && !syncing && (
            <span className="font-mono text-[9px] text-ink-mute hidden md:inline" title={`Dernière sync : ${lastSyncAt.toLocaleString('fr-FR')}`}>
              sync {fmtRelative(lastSyncAt)}
            </span>
          )}

          {/* Sync (bouton) seulement si user a la perm */}
          {userCanSync && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[10px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-60 disabled:cursor-wait"
              title={lastSyncAt ? `Dernière synchro : ${lastSyncAt.toLocaleString('fr-FR')}` : 'Synchroniser depuis Odoo'}
            >
              {syncing ? (
                <>
                  <span>⏳</span>
                  <span className="hidden sm:inline">{syncStatus || 'SYNC...'}</span>
                </>
              ) : (
                <>
                  <span>🔄</span>
                  <span className="hidden sm:inline">SYNC</span>
                </>
              )}
            </button>
          )}

          {/* Roue (admin only) */}
          {admin && (
            <div className="relative">
              <button
                onClick={() => setShowCog(!showCog)}
                className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
                title="Paramètres"
              >
                ⚙️
              </button>
              {showCog && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCog(false)} />
                  <div className="absolute right-0 mt-1 z-50 bg-cream rounded-lg shadow-xl border border-line min-w-[200px] py-1">
                    <CogItem
                      icon="🔑"
                      label="Mot de passe"
                      onClick={() => { setShowChangePwd(true); setShowCog(false) }}
                    />
                    <CogItem
                      icon="👥"
                      label="Utilisateurs"
                      onClick={() => { setShowAdminUsers(true); setShowCog(false) }}
                    />
                    <CogItem
                      icon="🎨"
                      label="Palette couleurs"
                      onClick={() => { setShowPalette(true); setShowCog(false) }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mot de passe (non-admin : direct) */}
          {!admin && (
            <button
              onClick={() => setShowChangePwd(true)}
              className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Changer mot de passe"
            >
              🔑
            </button>
          )}

          {/* Logout */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="w-9 h-9 rounded-full border border-line hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all"
              title="Se déconnecter"
            >
              ↩
            </button>
          )}
        </div>
      </div>

      {/* Modals */}
      {showChangePwd && (
        <ChangePasswordModal
          user={user}
          onClose={() => setShowChangePwd(false)}
        />
      )}
      {showAdminUsers && (
        <AdminUsers
          currentUser={user}
          onClose={() => setShowAdminUsers(false)}
        />
      )}
      {showPalette && (
        <AdminGmConfig onClose={() => setShowPalette(false)} />
      )}
    </>
  )
}

function CogItem({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream-warm text-[12px] text-ink"
    >
      <span className="text-[14px]">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
