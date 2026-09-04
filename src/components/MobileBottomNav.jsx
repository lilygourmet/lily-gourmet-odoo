import { useState, useEffect, useMemo } from 'react'
import { Calendar, BarChart3, ListTodo, MessageCircle, Banknote, Truck, Scissors, LayoutGrid } from 'lucide-react'
import { isLivreur, isLivreurDefaut, canSeeCalendar, canRecaps, canSeeConversations, canSeeCaisse, canSeeLivraisons, canSeeStockPoly } from '../lib/auth'
import { navTabsForUser } from '../lib/navTabs'
import { countConversationBadges } from '../lib/conversations'
import { countUnreadTasks } from '../lib/tasks'
import { countLivraisonsARelancer } from '../lib/deliveries'

// Barre de navigation en bas, sur téléphone ET tablette (lg:hidden). Au-delà,
// c'est la barre latérale qui prend le relais — avoir les deux en même temps sur
// la tablette n'avait pas de sens (demandé par Layla le 2026-09-04).
// Additive : ne remplace pas le menu du haut. Montée une fois dans App.
// Ces deux « onglets » ouvrent un site, ils n'ont pas d'écran dans l'app : depuis
// ce tiroir ils ne menaient nulle part.
const LIENS_EXTERNES = {
  'ai-gemini': 'https://gemini.google.com/app',
  'ai-chatgpt': 'https://chatgpt.com',
}

export default function MobileBottomNav({ user, activeView, onNavigate }) {
  // Chiffres rouges de notification (comme le menu du haut).
  const [convCount, setConvCount] = useState(0)
  const [tasksCount, setTasksCount] = useState(0)
  const [livrCount, setLivrCount] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const [cherche, setCherche] = useState('')
  // La barre se retire quand on descend dans la page (elle mangeait le bas de
  // l'ecran, signale plusieurs fois) et revient des qu'on remonte, ou en haut
  // de page. Tiroir ouvert = elle reste, sinon il flotterait tout seul.
  const [barreVisible, setBarreVisible] = useState(true)

  useEffect(() => {
    let dernier = window.scrollY
    function onScroll() {
      const y = window.scrollY
      const delta = y - dernier
      if (y < 60) setBarreVisible(true)
      else if (delta > 8) setBarreVisible(false)
      else if (delta < -8) setBarreVisible(true)
      if (Math.abs(delta) > 8 || y < 60) dernier = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function refresh() {
      try { const b = await countConversationBadges(user.last_visited_conversations); if (!cancelled) setConvCount((b.unassigned || 0) + (b.unread || 0)) } catch { /* ignore */ }
      try { const t = await countUnreadTasks(user.id); if (!cancelled) setTasksCount(t || 0) } catch { /* ignore */ }
      try { const l = await countLivraisonsARelancer(); if (!cancelled) setLivrCount(l || 0) } catch { /* ignore */ }
    }
    refresh()
    function onVis() { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    const iv = setInterval(refresh, 5 * 60 * 1000)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); clearInterval(iv) }
  }, [user?.id, user?.last_visited_conversations])

  // ⚠️ Ces deux calculs sont des hooks : ils doivent être appelés AVANT tout
  // `return`, sinon React change leur ordre d'un rendu à l'autre et casse.
  // Tous les onglets autorisés, RANGÉS PAR NOM : avec 55 onglets, l'ordre du
  // code ne veut plus rien dire — on cherche un nom, on le trouve à sa lettre.
  const allTabs = useMemo(
    () => (user ? [...navTabsForUser(user)].sort((a, b) => a.label.localeCompare(b.label, 'fr')) : []),
    [user],
  )
  const trouves = useMemo(() => {
    const sansAccents = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const q = sansAccents(cherche.trim())
    return q ? allTabs.filter(t => sansAccents(t.label).includes(q)) : allTabs
  }, [allTabs, cherche])

  if (!user) return null

  const badgeFor = { conversations: convCount, tasks: tasksCount, livraisons: livrCount }

  const dest = []
  if (canSeeCalendar(user)) dest.push({ view: 'calendar', label: 'Agenda', Icon: Calendar })
  if (canSeeLivraisons(user)) dest.push({ view: 'livraisons', label: 'Livr.', Icon: Truck })
  if (isLivreurDefaut(user)) dest.push({ view: 'caisse-livreur', label: 'Caisse', Icon: Banknote })
  if (canSeeStockPoly(user)) dest.push({ view: 'decoupe-poly', label: 'Découpe', Icon: Scissors })
  if (canRecaps(user)) dest.push({ view: 'recap', label: 'Récap', Icon: BarChart3 })
  if (canSeeConversations(user)) dest.push({ view: 'conversations', label: 'Chat', Icon: MessageCircle })
  if (canSeeCaisse(user)) dest.push({ view: 'caisse', label: 'Caisse', Icon: Banknote })
  if (!isLivreur(user)) dest.push({ view: 'tasks', label: 'Tâches', Icon: ListTodo })

  // On garde 4 raccourcis + un bouton « Plus » dès qu'il existe d'autres onglets.
  const primary = dest.slice(0, 4)
  const showMore = allTabs.length > primary.length
  const items = showMore ? primary : dest.slice(0, 5)
  if (items.length < 2 && !showMore) return null // pas la peine d'une barre pour 1 onglet

  return (
    <>
      <nav className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-cream border-t border-line flex shadow-[0_-2px_8px_rgba(0,0,0,0.06)] transition-transform duration-200 ${
        (barreVisible || moreOpen) ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {items.map(it => {
          const active = activeView === it.view
          const n = badgeFor[it.view] || 0
          return (
            <button key={it.view} onClick={() => onNavigate(it.view)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? 'text-bordeaux' : 'text-ink-mute'}`}>
              <span className="relative">
                <it.Icon size={20} strokeWidth={1.8} />
                {n > 0 && (
                  <span className="absolute -top-2 -right-3 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[9px] font-bold bg-red-600 text-white rounded-full">
                    {n > 99 ? '99+' : n}
                  </span>
                )}
              </span>
              {it.label}
            </button>
          )
        })}
        {showMore && (
          <button onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-ink-mute">
            <LayoutGrid size={20} strokeWidth={1.8} />
            Plus
          </button>
        )}
      </nav>

      {/* ⚠️ Hauteur en VH, jamais en dvh : la tablette 11" de l'annexe ignore
          `dvh`, la fenêtre déborde alors en haut ET en bas et PLUS RIEN NE
          DÉFILE — piège déjà vécu trois fois (Économat, fiche Fabrication
          Annexe, et ici le 2026-09-04). Structure en 3 zones : en-tête figé,
          liste qui défile, rien en dessous. Le défilement porte sur la LISTE,
          pas sur le tiroir entier. */}
      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setMoreOpen(false)}>
          <div className="w-full bg-cream rounded-t-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-line bg-cream flex-shrink-0">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[14px] font-medium text-ink">Tous les onglets <span className="text-ink-mute">({allTabs.length})</span></span>
                <button onClick={() => setMoreOpen(false)} className="text-[13px] text-ink-mute px-2 py-1">Fermer</button>
              </div>
              {/* Pas d'autoFocus : sur tablette le clavier sortait aussitôt,
                  recouvrait la liste et empêchait de la faire défiler. On tape
                  dans le champ quand on VEUT chercher. */}
              <input value={cherche} onChange={e => setCherche(e.target.value)}
                type="search" inputMode="search" placeholder="Chercher un onglet…"
                className="w-full bg-white border border-line rounded-xl px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-bordeaux" />
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-2"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
              {!trouves.length && (
                <p className="text-center text-[13px] text-ink-mute py-8">Aucun onglet ne porte ce nom.</p>
              )}
              {trouves.map(t => {
                const active = activeView === t.view
                const url = LIENS_EXTERNES[t.view]
                return (
                  <button key={t.view}
                    onClick={() => {
                      if (url) window.open(url, '_blank', 'noopener,noreferrer')
                      else onNavigate(t.view)
                      setMoreOpen(false); setCherche('')
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border mb-1.5 text-left text-[15px] ${active ? 'bg-bordeaux text-white border-bordeaux font-bold' : 'bg-white border-line text-ink'}`}>
                    <span className="text-[19px] leading-none w-6 text-center flex-shrink-0">{t.emoji}</span>
                    <span className="flex-1 min-w-0 truncate">{t.label}</span>
                    {url && <span className={`text-[11px] ${active ? 'text-white/70' : 'text-ink-mute'}`}>↗</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
