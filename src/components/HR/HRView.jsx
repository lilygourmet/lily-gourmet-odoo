import { useState } from 'react'
import AttestationsTab from './AttestationsTab'
import EmployesTab from './EmployesTab'
import PointageTab from './PointageTab'

/**
 * Vue principale HR (réservée admin).
 * Onglets : Attestations, Employés, Pointage
 */
export default function HRView({ user }) {
  const [tab, setTab] = useState('attestations')

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1.25rem' }}>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 500, color: '#3A3733' }}>
          🏢 Ressources Humaines
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6F6A60' }}>
          Génération d'attestations, gestion des employés, pointage
        </p>
      </div>

      {/* Onglets */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E8E2D8'
      }}>
        <TabBtn active={tab === 'attestations'} onClick={() => setTab('attestations')}>
          📜 Attestations
        </TabBtn>
        <TabBtn active={tab === 'employes'} onClick={() => setTab('employes')}>
          👥 Employés
        </TabBtn>
        <TabBtn active={tab === 'pointage'} onClick={() => setTab('pointage')}>
          ⏰ Pointage
        </TabBtn>
      </div>

      {tab === 'attestations' && <AttestationsTab user={user} />}
      {tab === 'employes' && <EmployesTab user={user} />}
      {tab === 'pointage' && <PointageTab user={user} />}
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 18px',
      background: 'transparent',
      border: 'none',
      borderBottom: active ? '2px solid #993556' : '2px solid transparent',
      color: active ? '#993556' : '#6F6A60',
      fontSize: 13,
      fontWeight: active ? 500 : 400,
      cursor: 'pointer',
      marginBottom: -1,
    }}>
      {children}
    </button>
  )
}
