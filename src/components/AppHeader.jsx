import { isAdmin, canRecaps } from '../lib/auth'

// ============================================================
// AppHeader : header de navigation unifie
// Props :
//   user : objet user
//   activeView : 'calendar' | 'recap' | 'patissier' | 'prod' | 'sales'
//   onNavigate : (view) => void
//   onLogout : () => void
//   children : contenu additionnel a droite (date picker, sync, etc.)
// ============================================================
export default function AppHeader({ user, activeView, onNavigate, onLogout, children }) {
  const admin = isAdmin(user)
  const isProdUser = !admin && user?.prod_category
  const isPatissierUser = !admin && user?.perm_patissier

  function btn(view, emoji, label, visible) {
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
    <div className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-line px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
      {/* Logo cliquable -> retour calendrier (si admin) */}
      <button
        onClick={() => admin && onNavigate && onNavigate('calendar')}
        className={`flex items-center gap-2 ${admin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} flex-shrink-0`}
      >
        <span className="font-fraunces italic text-[20px] text-bordeaux font-medium">G+L</span>
        <span className="font-mono text-[10px] tracking-[0.2em] text-ink-mute uppercase hidden sm:inline">Lily Gourmet</span>
      </button>

      {/* Navigation */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {btn('calendar', '📅', 'Calendrier', admin)}
        {btn('recap', '📊', 'Récap', canRecaps(user))}
        {btn('prod', '🥐', 'Prod', admin || (isProdUser && user.prod_category === 'prod'))}
        {btn('sales', '🥪', 'Salés', admin || (isProdUser && user.prod_category === 'sales'))}
        {btn('patissier', '🧁', 'Accessoires', admin || isPatissierUser)}
      </div>

      {/* Slot enfants (date picker, sync, search...) */}
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}

      {/* User + logout */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {user?.full_name && (
          <span className="font-mono text-[10px] text-ink-mute hidden sm:inline">{user.full_name}</span>
        )}
        {onLogout && (
          <button
            onClick={onLogout}
            className="px-3 py-1.5 border border-line text-ink-soft rounded-full text-[10px] hover:bg-bordeaux hover:text-cream hover:border-bordeaux"
          >
            Déconnexion
          </button>
        )}
      </div>
    </div>
  )
}
