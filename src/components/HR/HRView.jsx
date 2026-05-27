import { useState } from 'react'
import AttestationsTab from './AttestationsTab'
import EmployesTab from './EmployesTab'
import PointageTab from './PointageTab'
import SalairesTab from './SalairesTab'
import BulletinsTab from './BulletinsTab'

/**
 * Vue principale HR.
 * - admin : accès complet (avec Salaires)
 * - perm_hr : accès limité (pas de Salaires, pas de salaire/RIB visible, attestations limitées)
 */
export default function HRView({ user }) {
  const isAdmin = user?.role === 'admin'
  // Onglet Employés par défaut pour tous
  const [tab, setTab] = useState('employes')

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem' }}>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: '#1a0f0a' }}>
          🏢 Ressources Humaines {!isAdmin && <span style={{ fontSize: 12, color: '#8a7a70', fontWeight: 400, fontStyle: 'normal', fontFamily: 'Geist, sans-serif' }}>(accès limité)</span>}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4a3a30' }}>
          {isAdmin
            ? "Génération d'attestations, gestion des employés, pointage, salaires"
            : "Gestion des employés, attestations basiques, récap pointage"}
        </p>
      </div>

      {/* Onglets */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #e5d8c3', flexWrap: 'wrap',
      }}>
        <TabBtn active={tab === 'employes'} onClick={() => setTab('employes')}>
          👥 Employés
        </TabBtn>
        <TabBtn active={tab === 'attestations'} onClick={() => setTab('attestations')}>
          📜 Attestations
        </TabBtn>
        <TabBtn active={tab === 'pointage'} onClick={() => setTab('pointage')}>
          ⏰ Pointage
        </TabBtn>
        {isAdmin && (
          <TabBtn active={tab === 'salaires'} onClick={() => setTab('salaires')}>
            💰 Salaires
          </TabBtn>
        )}
        {isAdmin && (
          <TabBtn active={tab === 'bulletins'} onClick={() => setTab('bulletins')}>
            🧾 Bulletins de paie
          </TabBtn>
        )}
      </div>

      {tab === 'attestations' && <AttestationsTab user={user} isAdmin={isAdmin} />}
      {tab === 'employes' && <EmployesTab user={user} isAdmin={isAdmin} />}
      {tab === 'pointage' && <PointageTab user={user} isAdmin={isAdmin} />}
      {tab === 'salaires' && isAdmin && <SalairesTab user={user} />}
      {tab === 'bulletins' && isAdmin && <BulletinsTab />}
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
      color: active ? '#993556' : '#4a3a30',
      fontSize: 13,
      fontWeight: active ? 500 : 400,
      cursor: 'pointer',
      marginBottom: -1,
    }}>
      {children}
    </button>
  )
}
