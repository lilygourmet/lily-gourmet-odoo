import { Archive, AlertTriangle } from 'lucide-react'
import { fmtMoney, MOIS_TABS } from '../_helpers'
import { ModalBox } from './AjoutSortieModal'

export default function ClotureMoisModal({ balance, year, month, caisseOwner, onClose, onConfirm }) {
  return (
    <ModalBox title={`Clôturer ${MOIS_TABS[month - 1].label} ${year}`} titleColor="#1a0f0a" titleIcon={<Archive size={18} />} onClose={onClose}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FAEEDA', border: '0.5px solid #EF9F27', color: '#633806', padding: '12px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
        <AlertTriangle size={14} /> Une fois clôturé, vous ne pourrez plus modifier les mouvements de ce mois.
      </div>

      <div style={{ background: '#F4F0EA', padding: '14px 16px', borderRadius: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: '#4a3a30' }}>Solde de clôture (sera reporté sur {MOIS_TABS[month % 12].label})</div>
        <div style={{ fontSize: 28, fontWeight: 500, marginTop: 6 }}>{fmtMoney(balance)}</div>
      </div>

      <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 16 }}>
        Caisse : <strong>{caisseOwner === 'meriem' ? 'Meriem' : 'Layla LG'}</strong>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onClose} style={btnSlim}>Annuler</button>
        <button onClick={onConfirm} style={btnPrimary}>✓ Clôturer définitivement</button>
      </div>
    </ModalBox>
  )
}

const btnSlim = { flex: 1, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { flex: 2, fontSize: 13, padding: 10, borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500 }
