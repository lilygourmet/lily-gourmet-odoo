import { useState, useEffect } from 'react'
import { usePersistedState } from '../../lib/usePersistedState'
import { BarChart3, Briefcase, Banknote, Search, Settings, Landmark, Scale } from 'lucide-react'
import EnveloppesView from './EnveloppesView'
import SuiviView from './SuiviView'
import CaissesGereesView from './CaissesGereesView'
import SalairesView from './SalairesView'
import ParametresView from './ParametresView'
import MeriemUserView from './MeriemUserView'
import RechercheView from './RechercheView'
import RapprochementView from './RapprochementView'
import AppHeader from '../AppHeader'

const TABS = [
  { key: 'enveloppes',    label: 'Enveloppes',     Icon: BarChart3 },
  { key: 'caisses',       label: 'Caisses gérées', Icon: Briefcase },
  { key: 'salaires',      label: 'Salaires',       Icon: Banknote },
  { key: 'recherche',     label: 'Recherche',      Icon: Search },
  { key: 'params',        label: 'Paramètres',     Icon: Settings },
]

const STORAGE_KEY = 'caisse_active_tab'

export default function CaisseView({ user, activeView, onNavigate, onLogout, initialSub, deepTab }) {
  const isAdmin = !!(user?.perm_caisse_admin || user?.role === 'admin')

  if (!isAdmin && user?.perm_caisse) {
    return (
      <>
        <AppHeader user={user} activeView="caisse" onNavigate={onNavigate} onLogout={onLogout} />
        <MeriemUserView user={user} initialSub={initialSub} />
      </>
    )
  }

  const [tab, setTab] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return TABS.some(t => t.key === saved) ? saved : 'enveloppes'
    } catch { return 'enveloppes' }
  })
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, tab) } catch {}
  }, [tab])
  // Ouverture d'un onglet précis depuis le menu de gauche.
  useEffect(() => { if (deepTab?.tab) setTab(deepTab.tab) }, [deepTab])
  const [envSub, setEnvSub] = usePersistedState('lily.caisse.envSub', 'affectation') // sous-onglet d'Enveloppes
  const [focusMvt, setFocusMvt] = useState(null)      // cible de navigation depuis la recherche

  // Mobile : la colonne gauche devient une rangée horizontale en haut.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const h = e => setIsMobile(e.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])
  // Sur ordi/tablette (≥768px) la bande de gauche gère la navigation → on cache le menu interne.
  const [sidebarActive, setSidebarActive] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const h = e => setSidebarActive(e.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])

  return (
    <>
      <AppHeader user={user} activeView="caisse" onNavigate={onNavigate} onLogout={onLogout} />
      <div className="caisse-root" style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '1rem 0.75rem' : '1.25rem' }}>
      <div style={{ display: (isMobile && !sidebarActive) ? 'block' : 'grid', gridTemplateColumns: sidebarActive ? '1fr' : (isMobile ? undefined : '210px 1fr'), gap: isMobile ? 0 : 20, alignItems: 'start' }}>

        {/* Menu vignettes (colonne gauche) — caché sur ordi (la bande de gauche gère la nav) */}
        {!sidebarActive && (
        <div style={{
          display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 6,
          overflowX: isMobile ? 'auto' : 'visible',
          marginBottom: isMobile ? 16 : 0,
          padding: isMobile ? '0 0 4px' : 12,
          background: isMobile ? 'transparent' : '#F7F2EA',
          border: isMobile ? 'none' : '0.5px solid #e5d8c3',
          borderRadius: isMobile ? 0 : 14,
          position: isMobile ? 'static' : 'sticky', top: 12,
        }}>
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                padding: '11px 13px', borderRadius: 10, fontSize: 13, fontWeight: 500,
                whiteSpace: 'nowrap', flexShrink: 0, border: '1px solid transparent',
                background: active ? '#993556' : (isMobile ? 'white' : 'transparent'),
                color: active ? '#faf7f2' : '#4a3a30',
                borderColor: active ? '#993556' : (isMobile ? '#e5d8c3' : 'transparent'),
              }}>
                <t.Icon size={17} strokeWidth={1.8} /><span>{t.label}</span>
              </button>
            )
          })}
        </div>
        )}

        {/* Contenu (colonne droite) */}
        <div style={{ minWidth: 0 }}>

      {tab === 'enveloppes' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            {[
              { k: 'affectation', Icon: BarChart3, label: 'Affectation' },
              { k: 'suivi', Icon: Landmark, label: 'Suivi versements & remboursements' },
              { k: 'tpe', Icon: Scale, label: '💳 TPE (rapprochement)' },
            ].map(s => (
              <button key={s.k} onClick={() => setEnvSub(s.k)} style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                background: envSub === s.k ? '#1a0f0a' : '#F4F0EA',
                color:      envSub === s.k ? 'white'   : '#4a3a30',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}><s.Icon size={14} /> {s.label}</button>
            ))}
          </div>
          {envSub === 'affectation' && <EnveloppesView user={user} />}
          {envSub === 'suivi'       && <SuiviView user={user} />}
          {envSub === 'tpe'         && <RapprochementView user={user} />}
        </>
      )}
      {tab === 'caisses'      && <CaissesGereesView user={user} focus={focusMvt} />}
      {tab === 'salaires'     && <SalairesView user={user} />}
      {tab === 'recherche'    && <RechercheView user={user} onGoToSource={(r) => {
        if (r.kind === 'mouvement') {
          const d = String(r.date || '')
          setFocusMvt({ owner: r.raw?.caisse_owner || 'meriem', year: +d.slice(0, 4), month: +d.slice(5, 7), id: r.raw?.id, ts: Date.now() })
          setTab('caisses')
          return
        }
        const map = { enveloppe: 'enveloppes', salaire: 'salaires', avance: 'caisses' }
        const target = map[r.kind]
        if (target) setTab(target)
      }} />}
      {tab === 'params'       && <ParametresView user={user} />}
        </div>
      </div>
      </div>
    </>
  )
}
