import { Delete } from 'lucide-react'
import { fmtMoney } from './_helpers'

// Gros clavier numérique (style calculatrice) pour saisir un montant sur téléphone.
// value = chaîne de chiffres ('' au départ) ; onChange(nouvelle chaîne).
export default function MontantPad({ value, onChange, accent = '#993556' }) {
  function press(k) {
    if (k === 'del') return onChange(value.slice(0, -1))
    if (k === '00') return onChange(value ? value + '00' : '')
    onChange((value === '0' ? '' : value) + k)
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del']
  const display = value ? fmtMoney(Number(value)) : '0 dh'

  return (
    <div>
      <div style={{ textAlign: 'center', fontSize: 40, fontWeight: 600, color: accent, padding: '10px 0 16px', letterSpacing: 0.5 }}>
        {display}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {keys.map(k => (
          <button key={k} type="button" onClick={() => press(k)} style={{
            padding: '18px 0', borderRadius: 12, border: '1px solid #e5d8c3',
            background: k === 'del' ? '#FCEEE8' : 'white', color: k === 'del' ? '#99201E' : '#1a0f0a',
            fontSize: 22, fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {k === 'del' ? <Delete size={22} /> : k}
          </button>
        ))}
      </div>
    </div>
  )
}
