import { useState } from 'react'
import { todayISO, fmtMoney } from '../_helpers'
import { ModalBox } from './AjoutSortieModal'

export default function HamidRendModal({ balance, onClose, onSubmit }) {
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '')
  const [mvtDate, setMvtDate] = useState(todayISO())

  async function submit() {
    const n = Number(amount)
    if (!amount || isNaN(n) || n <= 0) { alert('Montant invalide : entre un nombre positif.'); return }
    await onSubmit({ amount: n, label: 'Hamid rend l\'argent', mvtDate })
  }

  return (
    <ModalBox title="Hamid rend l'argent" titleColor="#1D7A5C" titleIcon="↩" onClose={onClose}>
      <div style={{ background: '#F4F0EA', padding: '10px 12px', borderRadius: 8, fontSize: 12, color: '#4a3a30', marginBottom: 14 }}>
        Solde actuel chez Hamid : <strong style={{ color: balance >= 0 ? '#1D7A5C' : '#99201E' }}>{fmtMoney(balance)}</strong>
      </div>

      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4 }}>Montant rendu (dh)</div>
      <input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} style={ipt} />
      <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 4, marginTop: 10 }}>Date</div>
      <input type="date" value={mvtDate} onChange={e => setMvtDate(e.target.value)} style={ipt} />

      <div style={{ background: '#E1F5EE', padding: '10px 12px', borderRadius: 8, fontSize: 11, color: '#085041', marginTop: 14 }}>
        ✓ Cette action ajoutera <strong>{fmtMoney(Number(amount) || 0)}</strong> en entrée caisse Meriem et débitera ce montant du solde Hamid.
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={btnSlim}>Annuler</button>
        <button onClick={submit} style={btnPrimary}>Encaisser</button>
      </div>
    </ModalBox>
  )
}

const ipt = { width: '100%', padding: '9px 11px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const btnSlim = { flex: 1, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #1D7A5C', background: '#E1F5EE', color: '#085041', cursor: 'pointer', fontWeight: 500 }
