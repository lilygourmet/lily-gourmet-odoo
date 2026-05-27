import { useState, useEffect } from 'react'
import EnveloppesView from './EnveloppesView'
import SuiviView from './SuiviView'
import CaissesGereesView from './CaissesGereesView'
import SalairesView from './SalairesView'
import ParametresView from './ParametresView'
import MeriemUserView from './MeriemUserView'
import RechercheView from './RechercheView'
import AppHeader from '../AppHeader'

const TABS = [
  { key: 'enveloppes', label: 'Enveloppes',  icon: '📊' },
  { key: 'caisses',    label: 'Caisses gérées', icon: '💼' },
  { key: 'salaires',   label: 'Salaires',    icon: '💵' },
  { key: 'recherche',  label: 'Recherche',   icon: '🔍' },
  { key: 'params',     label: 'Paramètres',  icon: '⚙️' },
]

const STORAGE_KEY = 'caisse_active_tab'

export default function CaisseView({ user, activeView, onNavigate, onLogout }) {
  const isAdmin = !!(user?.perm_caisse_admin || user?.role === 'admin')

  if (!isAdmin && user?.perm_caisse) {
    return (
      <>
        <AppHeader user={user} activeView="caisse" onNavigate={onNavigate} onLogout={onLogout} />
        <MeriemUserView user={user} />
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
  const [envSub, setEnvSub] = useState('affectation') // sous-onglet d'Enveloppes

  return (
    <>
      <AppHeader user={user} activeView="caisse" onNavigate={onNavigate} onLogout={onLogout} />
      <div className="caisse-root" style={{ padding: '1rem 1.25rem' }}>
      <div style={{
        display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap',
        borderBottom: '1px solid #E8E2D8', paddingBottom: 12,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid transparent',
              background: tab === t.key ? '#993556' : '#F4F0EA',
              color:      tab === t.key ? 'white'   : '#3A3733',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'enveloppes' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            {[
              { k: 'affectation', icon: '📊', label: 'Affectation' },
              { k: 'suivi', icon: '🏦', label: 'Suivi versements & remboursements' },
            ].map(s => (
              <button key={s.k} onClick={() => setEnvSub(s.k)} style={{
                padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 500,
                background: envSub === s.k ? '#3A3733' : '#F4F0EA',
                color:      envSub === s.k ? 'white'   : '#6F6A60',
              }}>{s.icon} {s.label}</button>
            ))}
          </div>
          {envSub === 'affectation' && <EnveloppesView user={user} />}
          {envSub === 'suivi'       && <SuiviView user={user} />}
        </>
      )}
      {tab === 'caisses'    && <CaissesGereesView user={user} />}
      {tab === 'salaires'   && <SalairesView user={user} />}
      {tab === 'recherche'  && <RechercheView user={user} />}
      {tab === 'params'     && <ParametresView user={user} />}
      </div>
    </>
  )
}
