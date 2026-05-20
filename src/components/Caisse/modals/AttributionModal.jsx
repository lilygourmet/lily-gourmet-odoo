import { fmtMoney, fmtDateLongue, COLOR_PALETTE } from '../_helpers'

export default function AttributionModal({ env, destinataires, onClose, onAssign }) {
  // Trier : caisse-gérée puis perso puis banque
  const sorted = [...destinataires].sort((a, b) => {
    const order = { caisse_geree: 1, perso: 2, banque: 3 }
    return (order[a.type] || 99) - (order[b.type] || 99) || a.position - b.position
  })

  return (
    <Modal onClose={onClose} title="Affecter cette enveloppe">
      <div style={{ background: '#F4F0EA', padding: '14px 16px', borderRadius: 8, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#6F6A60' }}>{fmtDateLongue(env.session_date)} · {env.source}</div>
        <div style={{ fontSize: 28, fontWeight: 500, lineHeight: 1, marginTop: 4 }}>{fmtMoney(env.amount_cash)}</div>
      </div>
      <div style={{ fontSize: 13, color: '#6F6A60', marginBottom: 10 }}>Choisir le destinataire :</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {sorted.map(d => {
          const c = COLOR_PALETTE[d.color_key] || COLOR_PALETTE.gris
          const fullWidth = d.type === 'banque' && sorted.filter(x => x.type === 'banque').length === 1
          return (
            <button key={d.id} onClick={() => onAssign(d.id)} style={{
              background: c.bg, color: c.text, border: `0.5px solid ${c.border}`,
              fontSize: 14, fontWeight: 500, padding: '16px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              gridColumn: fullWidth ? 'span 2' : 'auto',
            }}>
              {d.type === 'banque' ? '🏦' : d.type === 'perso' ? '👤' : '💼'} {d.name}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'white', borderRadius: 12, padding: 28, maxWidth: 460, width: '100%',
        border: '0.5px solid #E8E2D8',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{title}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9B968D' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
