import { useState, useEffect } from 'react'
import { isAdmin, canRecaps, canSync, canSeeCalendar, canPrintLabels, canSeeFreezer, canSeeMessages, canSeeEtiquettes } from '../lib/auth'
import ChangePasswordModal from './ChangePasswordModal'
import AdminUsers from './AdminUsers'
import AdminGmConfig from './AdminGmConfig'
import LabelsButton from './LabelsButton'

// ============================================================
// AppHeader v2.1 : nav epuree, tout sur une ligne
// - Logo Lily Gourmet conserve (Logo_LG.jpg + texte LILY GOURMET / LAYLA)
// - Nav : texte + icone Tabler outline, soulignement bordeaux si actif
// - Nav scrollable horizontalement si manque de place (pas de wrap)
// - Bouton SYNC en outline bordeaux (plus discret)
// - Boutons d'action ronds 36px avec icones Tabler
// Props inchangees : user, activeView, onNavigate, onLogout, onSyncSuccess
// ============================================================

const TABLER_CDN = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.0.0/dist/tabler-icons.min.css'

function useTablerIcons() {
  useEffect(() => {
    if (document.querySelector('link[data-tabler]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = TABLER_CDN
    link.setAttribute('data-tabler', 'true')
    document.head.appendChild(link)
  }, [])
}

export default function AppHeader({ user, activeView, onNavigate, onLogout, onSyncSuccess }) {
  useTablerIcons()

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

  useEffect(() => {
    const t = setInterval(() => setNow(n => n + 1), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!userCanSync) return
    const CHECK_MS = 60 * 1000
    const MIN_INTERVAL_MS = 5 * 60 * 1000

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

  // Nav button : texte + icone Tabler outline, soulignement bordeaux si actif
  function navBtn(view, iconName, label, visible) {
    if (!visible) return null
    const isActive = activeView === view
    return (
      <button
        onClick={() => onNavigate && onNavigate(view)}
        className={`flex items-center gap-1.5 px-1 pb-1 text-[13px] font-normal transition-colors flex-shrink-0 whitespace-nowrap border-b-[1.5px] ${
          isActive
            ? 'text-bordeaux border-bordeaux'
            : 'text-ink border-transparent hover:text-bordeaux'
        }`}
      >
        <i className={`ti ${iconName} text-[15px]`} aria-hidden="true"></i>
        <span>{label}</span>
      </button>
    )
  }

  // Bouton rond d'action a droite (36px, icone Tabler)
  function actionBtn({ iconName, label, onClick, isActive = false }) {
    return (
      <button
        onClick={onClick}
        className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all flex-shrink-0 ${
          isActive
            ? 'bg-bordeaux text-cream border-bordeaux'
            : 'border-bordeaux/25 text-bordeaux hover:bg-bordeaux hover:text-cream hover:border-bordeaux'
        }`}
        title={label}
        aria-label={label}
      >
        <i className={`ti ${iconName} text-[15px]`} aria-hidden="true"></i>
      </button>
    )
  }

  return (
    <>
      <div className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-line px-4 py-2.5 flex items-center gap-4">
        {/* Logo cliquable -> calendrier */}
        <button
          onClick={() => canSeeCalendar(user) && onNavigate && onNavigate('calendar')}
          className={`flex items-center gap-2.5 ${canSeeCalendar(user) ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} flex-shrink-0`}
        >
          <img src="/Logo_LG.jpg" alt="Lily Gourmet" className="w-9 h-9 object-contain" />
          <div className="hidden sm:block text-left">
            <div className="font-sans font-semibold text-[12px] tracking-[0.16em] text-ink leading-tight uppercase">Lily Gourmet</div>
            {user?.full_name && (
              <div className="font-sans text-[9px] tracking-[0.2em] uppercase text-ink-mute mt-0.5">{user.full_name}</div>
            )}
          </div>
        </button>

        {/* Navigation : 1 seule ligne, scrollable horizontalement si manque de place */}
        <nav
          className="flex items-center gap-4 flex-1 min-w-0 overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {navBtn('calendar', 'ti-calendar', 'Calendrier', canSeeCalendar(user))}
          {navBtn('recap', 'ti-chart-bar', 'Récap', canRecaps(user))}
          {navBtn('prod', 'ti-bread', 'Prod', admin || (isProdUser && user.perm_prod))}
          {navBtn('sales', 'ti-salad', 'Salés', admin || (isProdUser && user.perm_sales))}
          {navBtn('patissier', 'ti-cupcake', 'Accessoires', admin || isPatissierUser)}
          {navBtn('freezer', 'ti-snowflake', 'CD Négatif', canSeeFreezer(user))}
          {navBtn('messages', 'ti-message', 'Messages', canSeeMessages(user))}
          {navBtn('etiquettes', 'ti-tag', 'Étiquettes Café', canSeeEtiquettes(user))}
        </nav>

        {/* Actions : labels + sync + roue + logout */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bouton Etiquettes CD (Zebra) */}
          {canPrintLabels(user) && <LabelsButton />}

          {/* Heure derniere sync */}
          {lastSyncAt && !syncing && (
            <span
              className="font-mono text-[10px] text-ink-mute hidden lg:inline"
              title={`Dernière sync : ${lastSyncAt.toLocaleString('fr-FR')}`}
            >
              sync {fmtRelative(lastSyncAt)}
            </span>
          )}

          {/* Sync : outline bordeaux (plus discret) */}
          {userCanSync && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream rounded-full text-[11px] font-medium tracking-wider transition-all flex-shrink-0 disabled:opacity-60 disabled:cursor-wait"
              title={lastSyncAt ? `Dernière synchro : ${lastSyncAt.toLocaleString('fr-FR')}` : 'Synchroniser depuis Odoo'}
            >
              <i className={`ti ti-refresh text-[14px] ${syncing ? 'animate-spin' : ''}`} aria-hidden="true"></i>
              <span className="hidden sm:inline">{syncing ? (syncStatus || 'SYNC...') : 'SYNC'}</span>
            </button>
          )}

          {/* Roue parametres (admin only) */}
          {admin && (
            <div className="relative">
              {actionBtn({
                iconName: 'ti-settings',
                label: 'Paramètres',
                onClick: () => setShowCog(!showCog),
                isActive: showCog,
              })}
              {showCog && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowCog(false)} />
                  <div className="absolute right-0 mt-1 z-50 bg-cream rounded-lg shadow-xl border border-line min-w-[200px] py-1">
                    <CogItem
                      iconName="ti-key"
                      label="Mot de passe"
                      onClick={() => { setShowChangePwd(true); setShowCog(false) }}
                    />
                    <CogItem
                      iconName="ti-users"
                      label="Utilisateurs"
                      onClick={() => { setShowAdminUsers(true); setShowCog(false) }}
                    />
                    <CogItem
                      iconName="ti-palette"
                      label="Palette couleurs"
                      onClick={() => { setShowPalette(true); setShowCog(false) }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Mot de passe (non-admin : direct) */}
          {!admin && actionBtn({
            iconName: 'ti-key',
            label: 'Changer mot de passe',
            onClick: () => setShowChangePwd(true),
          })}

          {/* Logout */}
          {onLogout && actionBtn({
            iconName: 'ti-logout',
            label: 'Se déconnecter',
            onClick: onLogout,
          })}
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

function CogItem({ iconName, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-cream-warm text-[12px] text-ink"
    >
      <i className={`ti ${iconName} text-[14px] text-bordeaux`} aria-hidden="true"></i>
      <span>{label}</span>
    </button>
  )
}
