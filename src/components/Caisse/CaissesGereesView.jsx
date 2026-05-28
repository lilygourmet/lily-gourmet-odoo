import { useState } from 'react'
import MeriemCaisse from './subviews/MeriemCaisse'
import MeriemHamid from './subviews/MeriemHamid'
import MeriemFactures from './subviews/MeriemFactures'
import MeriemAvances from './subviews/MeriemAvances'
import MeriemCourses from './subviews/MeriemCourses'
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
            <SubBtn active={sub === 'courses'}  onClick={() => setSub('courses')}>🛒 Courses</SubBtn>
          </div>
          {sub === 'caisse'   && <MeriemCaisse user={user} />}
          {sub === 'hamid'    && <MeriemHamid user={user} />}
          {sub === 'factures' && <MeriemFactures user={user} />}
          {sub === 'avances'  && <MeriemAvances user={user} />}
          {sub === 'courses'  && <MeriemCourses user={user} />}
        </>
      )}
      {main === 'layla_lg' && <LaylaLG user={user} />}
    </div>
  )
}

function tabMain(active) {
  return {
    fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999,
    border: active ? '1px solid #993556' : '1px solid #e5d8c3',
    background: active ? '#993556' : 'white',
    color:      active ? '#faf7f2'  : '#1a0f0a',
    cursor: 'pointer',
  }
}
function SubBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
      border: active ? '1px solid #993556' : '1px solid transparent',
      background: active ? '#993556' : 'transparent',
      color:      active ? '#faf7f2' : '#1a0f0a',
    }}>{children}</button>
  )
}
