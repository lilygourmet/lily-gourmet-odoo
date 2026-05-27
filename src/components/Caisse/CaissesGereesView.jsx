import { useState } from 'react'
import MeriemCaisse from './subviews/MeriemCaisse'
import MeriemHamid from './subviews/MeriemHamid'
import MeriemFactures from './subviews/MeriemFactures'
import MeriemAvances from './subviews/MeriemAvances'
import LaylaLG from './subviews/LaylaLG'

export default function CaissesGereesView({ user }) {
  const [main, setMain] = useState('meriem')   // 'meriem' | 'layla_lg'
  const [sub, setSub]   = useState('caisse')    // 'caisse' | 'hamid' | 'factures'

  return (
    <div>
      {/* Sous-onglets caisses */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
        <button onClick={() => { setMain('meriem'); setSub('caisse') }} style={tabMain(main === 'meriem')}>💼 Meriem</button>
        <button onClick={() => setMain('layla_lg')} style={tabMain(main === 'layla_lg')}>💼 Layla LG</button>
      </div>

      {main === 'meriem' && (
        <>
          <div style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#F4F0EA', borderRadius: 8, marginBottom: 18 }}>
            <SubBtn active={sub === 'caisse'}   onClick={() => setSub('caisse')}>💰 Caisse</SubBtn>
            <SubBtn active={sub === 'hamid'}    onClick={() => setSub('hamid')}>🚖 Hamid</SubBtn>
            <SubBtn active={sub === 'factures'} onClick={() => setSub('factures')}>📄 Factures</SubBtn>
            <SubBtn active={sub === 'avances'}  onClick={() => setSub('avances')}>💸 Avances</SubBtn>
          </div>
          {sub === 'caisse'   && <MeriemCaisse user={user} />}
          {sub === 'hamid'    && <MeriemHamid user={user} />}
          {sub === 'factures' && <MeriemFactures user={user} />}
          {sub === 'avances'  && <MeriemAvances user={user} />}
        </>
      )}
      {main === 'layla_lg' && <LaylaLG user={user} />}
    </div>
  )
}

function tabMain(active) {
  return {
    fontSize: 14, fontWeight: 500, padding: '10px 18px', borderRadius: 8, border: 'none',
    background: active ? '#993556' : '#F4F0EA',
    color:      active ? 'white'    : '#6F6A60',
    cursor: 'pointer',
  }
}
function SubBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
      background: active ? 'white' : 'transparent',
      color:      active ? '#3A3733' : '#6F6A60',
    }}>{children}</button>
  )
}
