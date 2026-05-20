import { useState } from 'react'
import { todayISO, fmtMoney, fmtDateLongue } from '../_helpers'
import { ModalBox } from './AjoutSortieModal'

export default function MarquerFactureRecupereeModal({ facture, onClose, onConfirm }) {
  const [date, setDate] = useState(todayISO())

  return (
    <ModalBox title="Marquer la facture comme récupérée" titleColor="#085041" titleIcon="✓" onClose={onClose}>
      <div style={{ background: '#F4F0EA', padding: '12px 14px', borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#6F6A60' }}>{fmtDateLongue(facture.mvt_date)}</div>
        <div style={{ fontSize: 13, marginTop: 2 }}>{facture.label}</div>
        <div style={{ fontSize: 18, fontWeight: 500, marginTop: 6 }}>{fmtMoney(facture.amount)}</div>
      </div>

      <div style={{ fontSize: 11, color: '#6F6A60', marginBottom: 4 }}>Date de récupération</div>
      <input type="date" value={date} onChange={e => setDate(e.target.value)} style={ipt} />

      <div style={{ background: '#E1F5EE', padding: '10px 12px', borderRadius: 8, fontSize: 11, color: '#085041', marginTop: 14 }}>
        ✓ <strong>{fmtMoney(facture.amount)}</strong> sera ajouté en entrée dans la <strong>caisse Layla LG</strong>.
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
        <button onClick={onClose} style={btnSlim}>Annuler</button>
        <button onClick={() => onConfirm(date)} style={btnPrimary}>Valider</button>
      </div>
    </ModalBox>
  )
}

const ipt = { width: '100%', padding: '9px 11px', border: '0.5px solid #C4BFB6', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }
const btnSlim = { flex: 1, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #1D7A5C', background: '#E1F5EE', color: '#085041', cursor: 'pointer', fontWeight: 500 }
