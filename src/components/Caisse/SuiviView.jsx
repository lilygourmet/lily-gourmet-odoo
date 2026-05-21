import { useState, useEffect, useMemo } from 'react'
import { loadDestinataires, loadEnveloppesForSuivi, updateEnveloppeDate, setEnveloppeProof, uploadPreuve, getPreuveSignedUrl } from '../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, fmtDateLongue, COLOR_PALETTE } from './_helpers'
import UploadPreuveModal from './modals/UploadPreuveModal'

export default function SuiviView({ user }) {
  const [subTab, setSubTab] = useState('banque')
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <SubTabBtn active={subTab === 'banque'} onClick={() => setSubTab('banque')}>🏦 Banque</SubTabBtn>
        <SubTabBtn active={subTab === 'perso'}  onClick={() => setSubTab('perso')}>👤 Perso</SubTabBtn>
      </div>
      {subTab === 'banque' && <BanqueSection user={user} />}
      {subTab === 'perso'  && <PersoSection  user={user} />}
    </div>
  )
}

function SubTabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 14, fontWeight: 500, padding: '10px 18px', borderRadius: 8, border: 'none',
      background: active ? '#993556' : '#F4F0EA',
      color:      active ? 'white'    : '#6F6A60',
      cursor: 'pointer',
    }}>{children}</button>
  )
}

// Pastille de méthode de paiement (cash ou cheque)
function MethodPill({ method }) {
  const isCheque = method === 'cheque'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, padding: '3px 8px', borderRadius: 999, fontWeight: 500,
      background: isCheque ? '#DCEBFB' : '#DCF0E2',
      color:      isCheque ? '#0C447C' : '#085041',
      border: isCheque ? '0.5px solid #B5D4F2' : '0.5px solid #B6E2C8',
    }}>
      {isCheque ? '📑 Chèque' : '💵 Espèces'}
    </span>
  )
}

function BanqueSection({ user }) {
  const [year, setYear]   = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [statusFilter, setStatusFilter] = useState('pending')
  const [methodFilter, setMethodFilter] = useState('all') // 'all' | 'cash' | 'cheque'
  const [list, setList] = useState([])
  const [uploadEnv, setUploadEnv] = useState(null)
  const [editDate, setEditDate] = useState({})

  useEffect(() => { reload() }, [year, month, statusFilter])

  async function reload() {
    const data = await loadEnveloppesForSuivi({ type: 'banque', month, year, statusFilter })
    setList(data)
  }

  // Filtrer par méthode de paiement côté client
  const filteredList = useMemo(() => {
    if (methodFilter === 'all') return list
    return list.filter(e => (e.payment_method || 'cash') === methodFilter)
  }, [list, methodFilter])

  const total = useMemo(() => filteredList.reduce((s, e) => s + Number(e.amount_cash), 0), [filteredList])

  // Comptage par méthode (pour afficher dans le filtre)
  const countCash = useMemo(() => list.filter(e => (e.payment_method || 'cash') === 'cash').length, [list])
  const countCheque = useMemo(() => list.filter(e => e.payment_method === 'cheque').length, [list])

  async function handleSaveDate(envId, newDate) {
    await updateEnveloppeDate(envId, newDate)
    setEditDate(prev => ({ ...prev, [envId]: false }))
    reload()
  }

  async function handleUpload(file, proofDate, amountProof, noteProof) {
    if (!uploadEnv || !file) return
    const url = await uploadPreuve(file, uploadEnv.id)
    await setEnveloppeProof(uploadEnv.id, url, proofDate, amountProof, noteProof)
    setUploadEnv(null)
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto' }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={tabBtn(month === m.idx, '#E6F1FB', '#0C447C', '#378ADD')}>{m.label}</button>
        ))}
      </div>

      {/* Filtre méthode de paiement */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setMethodFilter('all')} style={methodFilterBtn(methodFilter === 'all')}>
          Tout ({list.length})
        </button>
        <button onClick={() => setMethodFilter('cash')} style={methodFilterBtn(methodFilter === 'cash', 'cash')}>
          💵 Espèces ({countCash})
        </button>
        <button onClick={() => setMethodFilter('cheque')} style={methodFilterBtn(methodFilter === 'cheque', 'cheque')}>
          📑 Chèques ({countCheque})
        </button>
      </div>

      {/* Filtre statut */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {['pending', 'done', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: statusFilter === s ? '#3A3733' : '#F4F0EA',
            color:      statusFilter === s ? 'white'   : '#6F6A60',
          }}>{s === 'pending' ? 'En attente' : s === 'done' ? 'Versées' : 'Toutes'}</button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderRadius: 8, marginBottom: 14, background: '#E6F1FB', color: '#0C447C' }}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>🏦 Versements bancaires</div>
        <div style={{ fontSize: 13 }}>{filteredList.length} {statusFilter === 'pending' ? 'en attente' : ''} · {fmtMoney(total)}</div>
      </div>

      {filteredList.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#6F6A60', background: '#F9F6F1', borderRadius: 8 }}>
          Aucune enveloppe banque dans ce filtre.
        </div>
      )}

      {filteredList.map(env => (
        <div key={env.id} style={rowCard}>
          <div>
            <div style={{ fontSize: 11, color: '#6F6A60', display: 'flex', alignItems: 'center', gap: 6 }}>
              Enveloppe <MethodPill method={env.payment_method || 'cash'} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtMoney(env.amount_cash)}</div>
            <div style={{ fontSize: 11, color: '#6F6A60', marginTop: 2 }}>{fmtDateCourte(env.session_date)} · {env.source}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#9B968D' }}>Date du versement</div>
            {editDate[env.id] ? (
              <input type="date" defaultValue={env.proof_date || ''}
                onBlur={(e) => handleSaveDate(env.id, e.target.value)}
                style={{ padding: '4px 8px', fontSize: 13, border: '1px solid #C4BFB6', borderRadius: 6 }} />
            ) : (
              <div onClick={() => setEditDate({ ...editDate, [env.id]: true })} style={{ cursor: 'pointer', borderBottom: '1px dashed #C4BFB6', display: 'inline-block', fontSize: 12, color: '#6F6A60' }}>
                📅 {env.proof_date ? fmtDateLongue(env.proof_date) : 'À définir'}
              </div>
            )}
          </div>
          <div>
            <span style={env.proof_url ? statusDone : statusPending}>{env.proof_url ? 'Versée' : 'À verser'}</span>
          </div>
          <div>
            {env.proof_url ? (
              <button onClick={async () => {
                const url = await getPreuveSignedUrl(env.proof_url); window.open(url, '_blank')
              }} style={btnNormal}>📄 Voir preuve</button>
            ) : (
              <button onClick={() => setUploadEnv(env)} style={btnNormal}>📤 Ajouter preuve</button>
            )}
          </div>
        </div>
      ))}

      {uploadEnv && (
        <UploadPreuveModal env={uploadEnv} kind="banque"
          onClose={() => setUploadEnv(null)} onUpload={handleUpload} />
      )}
    </div>
  )
}

function PersoSection({ user }) {
  const [year, setYear]   = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [statusFilter, setStatusFilter] = useState('pending')
  const [persoDests, setPersoDests] = useState([])
  const [list, setList] = useState([])
  const [uploadEnv, setUploadEnv] = useState(null)
  const [editDate, setEditDate] = useState({})

  useEffect(() => { (async () => {
    const all = await loadDestinataires()
    setPersoDests(all.filter(d => d.type === 'perso'))
  })() }, [])

  useEffect(() => { reload() }, [year, month, statusFilter])

  async function reload() {
    const data = await loadEnveloppesForSuivi({ type: 'perso', month, year, statusFilter })
    setList(data)
  }

  async function handleSaveDate(envId, newDate) {
    await updateEnveloppeDate(envId, newDate); setEditDate(p => ({ ...p, [envId]: false })); reload()
  }

  async function handleUpload(file, proofDate, amountProof, noteProof) {
    if (!uploadEnv || !file) return
    const url = await uploadPreuve(file, uploadEnv.id)
    await setEnveloppeProof(uploadEnv.id, url, proofDate, amountProof, noteProof)
    setUploadEnv(null); reload()
  }

  // Perso = espèces uniquement (les chèques vont tous à la Banque)
  const cashOnly = useMemo(() => list.filter(e => (e.payment_method || 'cash') === 'cash'), [list])

  const byPerson = useMemo(() => {
    const map = {}
    persoDests.forEach(d => { map[d.id] = { dest: d, list: [] } })
    cashOnly.forEach(e => {
      if (e.destinataire_id && map[e.destinataire_id]) map[e.destinataire_id].list.push(e)
    })
    return map
  }, [cashOnly, persoDests])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 14, overflowX: 'auto' }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={tabBtn(month === m.idx, '#993556', 'white', '#993556')}>{m.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {['pending', 'done', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: statusFilter === s ? '#3A3733' : '#F4F0EA',
            color:      statusFilter === s ? 'white'   : '#6F6A60',
          }}>{s === 'pending' ? 'En attente' : s === 'done' ? 'Remboursées' : 'Toutes'}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {Object.values(byPerson).map(({ dest, list: items }) => {
          const c = COLOR_PALETTE[dest.color_key] || COLOR_PALETTE.gris
          const totalAttente = items.reduce((s, e) => s + Number(e.amount_cash), 0)
          return (
            <div key={dest.id}>
              <div style={{ background: c.bg, color: c.text, padding: '12px 16px', borderRadius: 8, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>👤 {dest.name}</div>
                <div style={{ fontSize: 12 }}>{items.length} · {fmtMoney(totalAttente)}</div>
              </div>
              {items.length === 0 && <div style={{ fontSize: 12, color: '#9B968D', padding: 8 }}>Aucune enveloppe</div>}
              {items.map(env => (
                <div key={env.id} style={{ padding: '12px 14px', borderRadius: 8, marginBottom: 6, background: 'white', border: '0.5px solid #E8E2D8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtMoney(env.amount_cash)}</div>
                    <span style={env.proof_url ? statusDone : statusPending}>{env.proof_url ? 'Remboursée' : 'À rembourser'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6F6A60', marginBottom: 8 }}>{fmtDateCourte(env.session_date)} · {env.source}</div>
                  <div style={{ fontSize: 10, color: '#9B968D' }}>Date de prise</div>
                  {editDate[env.id] ? (
                    <input type="date" defaultValue={env.proof_date || ''}
                      onBlur={(e) => handleSaveDate(env.id, e.target.value)}
                      style={{ padding: '3px 8px', fontSize: 12, border: '1px solid #C4BFB6', borderRadius: 6, marginBottom: 8 }} />
                  ) : (
                    <div onClick={() => setEditDate({ ...editDate, [env.id]: true })} style={{ cursor: 'pointer', borderBottom: '1px dashed #C4BFB6', display: 'inline-block', fontSize: 12, color: '#6F6A60', marginBottom: 8 }}>
                      📅 {env.proof_date ? fmtDateLongue(env.proof_date) : 'À définir'}
                    </div>
                  )}
                  <div>
                    {env.proof_url ? (
                      <button onClick={async () => { const url = await getPreuveSignedUrl(env.proof_url); window.open(url, '_blank') }} style={{ ...btnNormal, width: '100%' }}>📄 Voir preuve</button>
                    ) : (
                      <button onClick={() => setUploadEnv(env)} style={{ ...btnNormal, width: '100%' }}>📤 Preuve remboursement</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {uploadEnv && (
        <UploadPreuveModal env={uploadEnv} kind="perso"
          onClose={() => setUploadEnv(null)} onUpload={handleUpload} />
      )}
    </div>
  )
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '8px 14px', borderRadius: 8, border: '1px solid #E8E2D8', background: 'white', cursor: 'pointer' }
const rowCard = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 130px 1fr', gap: 14, alignItems: 'center',
  padding: '12px 16px', borderRadius: 8, marginBottom: 6, background: 'white', border: '0.5px solid #E8E2D8',
}
const statusPending = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#FCE9E8', color: '#99201E' }
const statusDone    = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#E1F5EE', color: '#085041' }

function tabBtn(active, bg, txt, brd) {
  return {
    padding: '8px 16px', borderRadius: 8, border: active ? `0.5px solid ${brd}` : 'none',
    background: active ? bg    : '#F4F0EA',
    color:      active ? txt   : '#6F6A60',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

function methodFilterBtn(active, method) {
  const cashActive = active && method === 'cash'
  const chequeActive = active && method === 'cheque'
  const allActive = active && !method
  return {
    fontSize: 12, padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 500,
    border: active ? '0.5px solid' : 'none',
    borderColor: cashActive ? '#085041' : chequeActive ? '#0C447C' : '#3A3733',
    background: cashActive ? '#DCF0E2' : chequeActive ? '#DCEBFB' : allActive ? '#3A3733' : '#F4F0EA',
    color:      cashActive ? '#085041' : chequeActive ? '#0C447C' : allActive ? 'white' : '#6F6A60',
  }
}
