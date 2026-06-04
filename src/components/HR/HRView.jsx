import { useState, useEffect } from 'react'
import { Building2, Users, FileText, Clock, Wallet, Receipt, AlertTriangle } from 'lucide-react'
import AttestationsTab from './AttestationsTab'
import EmployesTab from './EmployesTab'
import PointageTab from './PointageTab'
import SalairesTab from './SalairesTab'
import BulletinsTab from './BulletinsTab'
import ATraiterTab from './ATraiterTab'
import { countATraiter } from '../../lib/aTraiter'

/**
 * Vue principale HR.
 * - admin : accès complet (avec Salaires)
 * - perm_hr : accès limité (pas de Salaires, pas de salaire/RIB visible, attestations limitées)
 */
export default function HRView({ user }) {
  const isAdmin = user?.role === 'admin'
  // Onglet Employés par défaut pour tous
  const [tab, setTab] = useState('employes')
  // Compteur "à traiter" (absences + récup) pour le badge
  const [aTraiter, setATraiter] = useState(0)
  useEffect(() => {
    let cancelled = false
    countATraiter().then(n => { if (!cancelled) setATraiter(n) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.25rem' }}>

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, fontWeight: 400, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Building2 size={22} /> Ressources Humaines {!isAdmin && <span style={{ fontSize: 12, color: '#8a7a70', fontWeight: 400, fontStyle: 'normal', fontFamily: 'Geist, sans-serif' }}>(accès limité)</span>}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#4a3a30' }}>
          {isAdmin
            ? "Génération d'attestations, gestion des employés, pointage, salaires"
            : "Gestion des employés, attestations basiques, récap pointage"}
        </p>
      </div>

      {/* Onglets */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap',
      }}>
        <TabBtn active={tab === 'employes'} onClick={() => setTab('employes')}>
          <Users size={14} /> Employés
        </TabBtn>
        <TabBtn active={tab === 'attestations'} onClick={() => setTab('attestations')}>
          <FileText size={14} /> Attestations
        </TabBtn>
        <TabBtn active={tab === 'pointage'} onClick={() => setTab('pointage')}>
          <Clock size={14} /> Pointage
        </TabBtn>
        <TabBtn active={tab === 'a_traiter'} onClick={() => setTab('a_traiter')}>
          <AlertTriangle size={14} /> À traiter
          {aTraiter > 0 && (
            <span style={{ background: '#A32D2D', color: 'white', borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '1px 7px', marginLeft: 2 }}>{aTraiter}</span>
          )}
        </TabBtn>
        {isAdmin && (
          <TabBtn active={tab === 'salaires'} onClick={() => setTab('salaires')}>
            <Wallet size={14} /> Salaires
          </TabBtn>
        )}
        {isAdmin && (
          <TabBtn active={tab === 'bulletins'} onClick={() => setTab('bulletins')}>
            <Receipt size={14} /> Bulletins de paie
          </TabBtn>
        )}
      </div>

      {tab === 'attestations' && <AttestationsTab user={user} isAdmin={isAdmin} />}
      {tab === 'employes' && <EmployesTab user={user} isAdmin={isAdmin} />}
      {tab === 'pointage' && <PointageTab user={user} isAdmin={isAdmin} />}
      {tab === 'a_traiter' && <ATraiterTab user={user} onChange={setATraiter} />}
      {tab === 'salaires' && isAdmin && <SalairesTab user={user} />}
      {tab === 'bulletins' && isAdmin && <BulletinsTab />}
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: 'pointer',
      background: active ? '#993556' : 'white',
      color:      active ? '#faf7f2' : '#1a0f0a',
      border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {children}
    </button>
  )
}
