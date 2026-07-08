import { useState, useEffect } from 'react'
import { Wallet, Receipt, Clock, Check } from 'lucide-react'
import AppHeader from '../AppHeader'
import DeclareDepenseLivreurModal from './modals/DeclareDepenseLivreurModal'
import { loadHamidBalance, loadHamidDepensesMonth, addHamidSession } from '../../lib/caisse'
import { fmtMoney, fmtDateCourte, currentMonth, currentYear } from './_helpers'
import { isLivreurDefaut } from '../../lib/auth'
import { toast } from '../../lib/toast'

// Mini-écran « caisse » pour Hamid (le livreur par défaut). Il déclare SES
// dépenses depuis son téléphone ; elles arrivent « en attente » et ne comptent
// dans le solde qu'une fois confirmées par Meriem. Les entrées (avances) sont
// données par Meriem et alimentent le solde directement (pas géré ici).
export default function CaisseLivreur({ user, onNavigate, onLogout }) {
  const canUse = isLivreurDefaut(user) || user?.role === 'admin' || user?.perm_caisse_admin
  const [balance, setBalance] = useState(0)
  const [depenses, setDepenses] = useState([])
  const [showDepense, setShowDepense] = useState(false)

  async function reload() {
    const [bal, dep] = await Promise.all([
      loadHamidBalance(),
      loadHamidDepensesMonth(currentYear(), currentMonth()),
    ])
    setBalance(bal)
    setDepenses(dep)
  }

  useEffect(() => { if (canUse) reload() }, [canUse])

  async function handleDepense({ sessionDate, lignes, proofFile }) {
    await addHamidSession({ sessionDate, lignes, userId: user.id, proofFile, confirmStatus: 'pending' })
    setShowDepense(false)
    toast.success('Dépense envoyée à Meriem pour confirmation')
    reload()
  }

  const pending = depenses.filter(d => d.confirm_status === 'pending')
  const pendingTotal = pending.reduce((s, d) => s + Number(d.amount), 0)

  return (
    <div style={{ minHeight: '100vh', background: '#fcfbf8' }}>
      <AppHeader user={user} activeView="livraisons" onNavigate={onNavigate} onLogout={onLogout} />

      {!canUse ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#4a3a30' }}>Accès réservé.</div>
      ) : (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '1.25rem 1rem 2.5rem' }}>
        {/* Solde */}
        <div style={{ background: balance < 0 ? 'linear-gradient(135deg, #99201E 0%, #C0392B 100%)' : 'linear-gradient(135deg, #B97A14 0%, #EF9F27 100%)', color: 'white', padding: '22px 20px', borderRadius: 16, marginBottom: 22 }}>
          <div style={{ fontSize: 13, opacity: 0.9, display: 'flex', alignItems: 'center', gap: 6 }}><Wallet size={15} /> {balance < 0 ? 'Lily te doit' : 'Argent de Lily chez toi'}</div>
          <div style={{ fontSize: 40, fontWeight: 500, marginTop: 6 }}>{fmtMoney(Math.abs(balance))}</div>
        </div>

        {/* Dépenses en attente de confirmation */}
        {pending.length > 0 && (
          <div style={{ padding: '11px 14px', background: '#FFF6E5', border: '1px solid #F5C46B', borderRadius: 10, marginBottom: 18, fontSize: 13, color: '#7A5510', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={16} style={{ flexShrink: 0 }} />
            <span><strong>{pending.length}</strong> dépense{pending.length > 1 ? 's' : ''} en attente de confirmation par Meriem ({fmtMoney(pendingTotal)})</span>
          </div>
        )}

        {/* Gros bouton */}
        <button onClick={() => setShowDepense(true)} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '26px 12px', borderRadius: 16, cursor: 'pointer', background: '#FCE9E8', border: '1px solid #C0392B', color: '#99201E', fontSize: 19, fontWeight: 600, marginBottom: 26 }}>
          <Receipt size={34} />
          <span>Déclarer une dépense</span>
          <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}>argent que tu as dépensé</span>
        </button>

        {/* Mes dépenses du mois */}
        <div style={{ fontSize: 13, color: '#4a3a30', marginBottom: 8, fontWeight: 500 }}>Mes dépenses ce mois</div>
        {depenses.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8a7a70', background: '#F9F6F1', borderRadius: 12, fontSize: 13 }}>Aucune dépense ce mois.</div>}
        {depenses.map(d => {
          const isPending = d.confirm_status === 'pending'
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, marginBottom: 6, background: 'white', border: '0.5px solid #e5d8c3', borderLeft: '3px solid #E5C0B6' }}>
              <div style={{ fontSize: 11, color: '#8a7a70', width: 52, flexShrink: 0 }}>{fmtDateCourte(d.depense_date)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label || d.category || 'Dépense'}</div>
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: isPending ? '#FFF6E5' : '#E6F4E6', color: isPending ? '#7A5510' : '#27500A', display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  {isPending ? <><Clock size={11} /> En attente</> : <><Check size={11} /> Confirmée</>}
                </span>
              </div>
              <div style={{ fontWeight: 500, fontSize: 14, color: '#99201E', whiteSpace: 'nowrap' }}>− {fmtMoney(d.amount).replace(' dh', '')}</div>
            </div>
          )
        })}
      </div>
      )}

      {showDepense && (
        <DeclareDepenseLivreurModal onClose={() => setShowDepense(false)} onSubmit={handleDepense} />
      )}
    </div>
  )
}
