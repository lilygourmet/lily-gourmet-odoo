import { useState, useEffect } from 'react'
import MeriemCaisse from './subviews/MeriemCaisse'
import MeriemHamid from './subviews/MeriemHamid'
import MeriemFactures from './subviews/MeriemFactures'
import { loadHamidBalance, loadFacturesStats } from '../../lib/caisse'
import { fmtMoney, currentYear } from './_helpers'

export default function MeriemUserView({ user }) {
  const [sub, setSub] = useState('caisse')
  const [hamidBal, setHamidBal] = useState(0)
  const [factStats, setFactStats] = useState({ countPending: 0 })

  useEffect(() => { (async () => {
    setHamidBal(await loadHamidBalance())
    setFactStats(await loadFacturesStats(currentYear()))
  })() }, [sub])

  return (
    <div style={{ padding: '1rem 1.25rem' }}>
      <div style={{ background: 'linear-gradient(135deg, #993556 0%, #B14A6F 100%)', color: 'white', padding: '1.5rem 1.25rem 1.25rem', borderRadius: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 14, opacity: 0.85 }}>Bienvenue,</div>
        <div style={{ fontSize: 18, fontWeight: 500, marginTop: 2 }}>👤 {user?.username || 'Meriem'}</div>
      </div>

      <div style={{ display: 'inline-flex', gap: 6, padding: 4, background: '#F4F0EA', borderRadius: 8, marginBottom: 20 }}>
        <PillTab active={sub === 'caisse'}   onClick={() => setSub('caisse')}>💰 Caisse</PillTab>
        <PillTab active={sub === 'hamid'}    onClick={() => setSub('hamid')}>
          🚖 Hamid {hamidBal !== 0 && (<span style={{ fontSize: 10, background: hamidBal >= 0 ? '#FAEEDA' : '#FCE9E8', color: hamidBal >= 0 ? '#633806' : '#99201E', padding: '1px 6px', borderRadius: 999, marginLeft: 3 }}>{hamidBal >= 0 ? '+' : ''}{fmtMoney(hamidBal).replace(' dh', '')}</span>)}
        </PillTab>
        <PillTab active={sub === 'factures'} onClick={() => setSub('factures')}>
          📄 Factures {factStats.countPending > 0 && (<span style={{ fontSize: 10, background: '#FCE9E8', color: '#99201E', padding: '1px 6px', borderRadius: 999, marginLeft: 3 }}>{factStats.countPending}</span>)}
        </PillTab>
      </div>

      {sub === 'caisse'   && <MeriemCaisse   user={user} />}
      {sub === 'hamid'    && <MeriemHamid    user={user} />}
      {sub === 'factures' && <MeriemFactures user={user} />}
    </div>
  )
}

function PillTab({ active, onClick, children }) {
  return <button onClick={onClick} style={{
    fontSize: 13, fontWeight: 500, padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: active ? 'white' : 'transparent',
    color:      active ? '#3A3733' : '#6F6A60',
  }}>{children}</button>
}
