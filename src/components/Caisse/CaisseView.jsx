import { useState, useEffect } from 'react'
import EnveloppesView from './EnveloppesView'
import SuiviView from './SuiviView'
import CaissesGereesView from './CaissesGereesView'
import SalairesView from './SalairesView'
import ParametresView from './ParametresView'
import MeriemUserView from './MeriemUserView'
import MeriemAvances from './subviews/MeriemAvances'
import LogsView from './LogsView'
import AppHeader from '../AppHeader'

const TABS = [
  { key: 'enveloppes', label: 'Enveloppes',  icon: '📊' },
  { key: 'suivi',      label: 'Suivi versements & remboursements', icon: '🏦' },
  { key: 'caisses',    label: 'Caisses gérées', icon: '💼' },
  { key: 'avances',    label: 'Avances Meriem', icon: '💸' },
  { key: 'salaires',   label: 'Salaires',    icon: '💵' },
  { key: 'logs',       label: 'Historique',  icon: '📜' },
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
    try { return localStorage.getItem(STORAGE_KEY) || 'enveloppes' } catch { return 'enveloppes' }
  })
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, tab) } catch {}
  }, [tab])

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

      {tab === 'enveloppes' && <EnveloppesView user={user} />}
      {tab === 'suivi'      && <SuiviView user={user} />}
      {tab === 'caisses'    && <CaissesGereesView user={user} />}
      {tab === 'avances'    && <MeriemAvances user={user} />}
      {tab === 'salaires'   && <SalairesView user={user} />}
      {tab === 'logs'       && <LogsView user={user} />}
      {tab === 'params'     && <ParametresView user={user} />}
      </div>
    </>
  )
}
