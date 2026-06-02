import { useState, useEffect, useMemo } from 'react'
import { Landmark, User, ScrollText, Banknote, Calendar, Eye, Upload, ArrowLeftRight, FileText } from 'lucide-react'
import { loadDestinataires, loadEnveloppesForSuivi, updateEnveloppeDate, setEnveloppeProof, uploadPreuve, getPreuveSignedUrl, setEnveloppeReleve } from '../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, fmtDateLongue, COLOR_PALETTE } from './_helpers'
import UploadPreuveModal from './modals/UploadPreuveModal'
import ReleveImportModal from './modals/ReleveImportModal'

export default function SuiviView({ user }) {
  const [subTab, setSubTab] = useState('banque')
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <SubTabBtn active={subTab === 'banque'} onClick={() => setSubTab('banque')}><Landmark size={14} /> Banque</SubTabBtn>
        <SubTabBtn active={subTab === 'perso'}  onClick={() => setSubTab('perso')}><User size={14} /> Perso</SubTabBtn>
      </div>
      {subTab === 'banque' && <BanqueSection user={user} />}
      {subTab === 'perso'  && <PersoSection  user={user} />}
    </div>
  )
}

function SubTabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999,
      background: active ? '#993556' : 'white',
      color:      active ? '#faf7f2' : '#1a0f0a',
      border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  )
}

// Pastille de méthode de paiement (espèces, chèque ou virement)
function MethodPill({ method }) {
  const map = {
    cheque:   { bg: '#DCEBFB', color: '#0C447C', border: '#B5D4F2', icon: <ScrollText size={11} />, label: 'Chèque' },
    virement: { bg: '#EDE4F6', color: '#5b2a86', border: '#D6C3EA', icon: <ArrowLeftRight size={11} />, label: 'Virement' },
    cash:     { bg: '#DCF0E2', color: '#085041', border: '#B6E2C8', icon: <Banknote size={11} />, label: 'Espèces' },
  }
  const m = map[method] || map.cash
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, padding: '3px 8px', borderRadius: 999, fontWeight: 500,
      background: m.bg, color: m.color, border: `0.5px solid ${m.border}`,
    }}>
      {m.icon} {m.label}
    </span>
  )
}

// Étiquette de statut de rapprochement (couleur)
function ReleveStatus({ env }) {
  if (env.releve_status === 'trouve') return <span style={statusTrouve}>✓ Rapprochée</span>
  if (env.releve_status === 'a_confirmer') return <span style={statusConfirmer}>À confirmer</span>
  if (env.proof_url) return <span style={statusDone}>Versée</span>
  return <span style={statusPending}>À verser</span>
}

function BanqueSection({ user }) {
  const [year, setYear]   = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [statusFilter, setStatusFilter] = useState('pending')
  const [methodFilter, setMethodFilter] = useState('all') // 'all' | 'cash' | 'cheque' | 'virement'
  const [list, setList] = useState([])
  const [uploadEnv, setUploadEnv] = useState(null)
  const [editDate, setEditDate] = useState({})
  const [showImport, setShowImport] = useState(false)

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
  const countVirement = useMemo(() => list.filter(e => e.payment_method === 'virement').length, [list])

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

  async function handleConfirm(envId) {
    await setEnveloppeReleve(envId, { status: 'trouve' })
    reload()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => Math.max(2026, y - 1))} disabled={year <= 2026} style={{ ...btnSlim, opacity: year <= 2026 ? 0.4 : 1 }}>←</button>
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
          <Banknote size={14} /> Espèces ({countCash})
        </button>
        <button onClick={() => setMethodFilter('cheque')} style={methodFilterBtn(methodFilter === 'cheque', 'cheque')}>
          <ScrollText size={14} /> Chèques ({countCheque})
        </button>
        <button onClick={() => setMethodFilter('virement')} style={methodFilterBtn(methodFilter === 'virement', 'virement')}>
          <ArrowLeftRight size={14} /> Virements ({countVirement})
        </button>
      </div>

      {/* Filtre statut */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {['pending', 'done', 'all'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: statusFilter === s ? '#1a0f0a' : '#F4F0EA',
            color:      statusFilter === s ? 'white'   : '#4a3a30',
          }}>{s === 'pending' ? 'En attente' : s === 'done' ? 'Versées' : 'Toutes'}</button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button onClick={() => setShowImport(true)} style={{ ...btnNormal, background: '#993556', color: 'white', border: 'none' }}>
          <FileText size={14} /> Importer relevé bancaire
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderRadius: 8, marginBottom: 14, background: '#E6F1FB', color: '#0C447C' }}>
        <div style={{ fontSize: 15, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Landmark size={16} /> Versements bancaires</div>
        <div style={{ fontSize: 13 }}>{filteredList.length} {statusFilter === 'pending' ? 'en attente' : ''} · {fmtMoney(total)}</div>
      </div>

      {filteredList.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }}>
          Aucune enveloppe banque dans ce filtre.
        </div>
      )}

      {filteredList.map(env => (
        <div key={env.id} style={rowCard}>
          <div>
            <div style={{ fontSize: 11, color: '#4a3a30', display: 'flex', alignItems: 'center', gap: 6 }}>
              Enveloppe <MethodPill method={env.payment_method || 'cash'} />
            </div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtMoney(env.amount_cash)}</div>
            {env.virement_client && <div style={{ fontSize: 11, color: '#5b2a86', marginTop: 2 }}>{env.virement_client}</div>}
            <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 2 }}>{fmtDateCourte(env.session_date)} · {env.source}</div>
            {env.releve_status && env.note_proof && (
              <div style={{ fontSize: 10, color: env.releve_status === 'trouve' ? '#0a7d3d' : '#a9620a', marginTop: 4, lineHeight: 1.3 }}>
                {env.releve_status === 'a_confirmer' ? 'Lignes possibles : ' : 'Relevé : '}{env.note_proof}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#8a7a70' }}>Date du versement</div>
            {editDate[env.id] ? (
              <input type="date" defaultValue={env.proof_date || ''}
                onBlur={(e) => handleSaveDate(env.id, e.target.value)}
                style={{ padding: '4px 8px', fontSize: 13, border: '1px solid #C4BFB6', borderRadius: 6 }} />
            ) : (
              <div onClick={() => setEditDate({ ...editDate, [env.id]: true })} style={{ cursor: 'pointer', borderBottom: '1px dashed #C4BFB6', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4a3a30' }}>
                <Calendar size={12} /> {env.proof_date ? fmtDateLongue(env.proof_date) : 'À définir'}
              </div>
            )}
          </div>
          <div>
            <ReleveStatus env={env} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {env.proof_url ? (
              <button onClick={async () => {
                const url = await getPreuveSignedUrl(env.proof_url); window.open(url, '_blank')
              }} style={btnNormal}><Eye size={14} /> Voir preuve</button>
            ) : (
              <button onClick={() => setUploadEnv(env)} style={btnNormal}><Upload size={14} /> Ajouter preuve</button>
            )}
            {env.releve_status === 'a_confirmer' && (
              <button onClick={() => handleConfirm(env.id)} style={{ ...btnNormal, background: '#FDF0DF', color: '#a9620a', border: '1px solid #f0d9b8' }}>
                ✓ Confirmer
              </button>
            )}
          </div>
        </div>
      ))}

      {uploadEnv && (
        <UploadPreuveModal env={uploadEnv} kind="banque"
          onClose={() => setUploadEnv(null)} onUpload={handleUpload} />
      )}

      {showImport && (
        <ReleveImportModal onClose={() => setShowImport(false)} onDone={reload} />
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
        <button onClick={() => setYear(y => Math.max(2026, y - 1))} disabled={year <= 2026} style={{ ...btnSlim, opacity: year <= 2026 ? 0.4 : 1 }}>←</button>
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
            background: statusFilter === s ? '#1a0f0a' : '#F4F0EA',
            color:      statusFilter === s ? 'white'   : '#4a3a30',
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
                <div style={{ fontSize: 14, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}><User size={14} /> {dest.name}</div>
                <div style={{ fontSize: 12 }}>{items.length} · {fmtMoney(totalAttente)}</div>
              </div>
              {items.length === 0 && <div style={{ fontSize: 12, color: '#8a7a70', padding: 8 }}>Aucune enveloppe</div>}
              {items.map(env => (
                <div key={env.id} style={{ padding: '14px 16px', borderRadius: 14, marginBottom: 8, background: 'white', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>{fmtMoney(env.amount_cash)}</div>
                    <span style={env.proof_url ? statusDone : statusPending}>{env.proof_url ? 'Remboursée' : 'À rembourser'}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#4a3a30', marginBottom: 8 }}>{fmtDateCourte(env.session_date)} · {env.source}</div>
                  <div style={{ fontSize: 10, color: '#8a7a70' }}>Date de prise</div>
                  {editDate[env.id] ? (
                    <input type="date" defaultValue={env.proof_date || ''}
                      onBlur={(e) => handleSaveDate(env.id, e.target.value)}
                      style={{ padding: '3px 8px', fontSize: 12, border: '1px solid #C4BFB6', borderRadius: 6, marginBottom: 8 }} />
                  ) : (
                    <div onClick={() => setEditDate({ ...editDate, [env.id]: true })} style={{ cursor: 'pointer', borderBottom: '1px dashed #C4BFB6', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#4a3a30', marginBottom: 8 }}>
                      <Calendar size={12} /> {env.proof_date ? fmtDateLongue(env.proof_date) : 'À définir'}
                    </div>
                  )}
                  <div>
                    {env.proof_url ? (
                      <button onClick={async () => { const url = await getPreuveSignedUrl(env.proof_url); window.open(url, '_blank') }} style={{ ...btnNormal, width: '100%' }}><Eye size={14} /> Voir preuve</button>
                    ) : (
                      <button onClick={() => setUploadEnv(env)} style={{ ...btnNormal, width: '100%' }}><Upload size={14} /> Preuve remboursement</button>
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

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '8px 14px', borderRadius: 10, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
const rowCard = {
  display: 'grid', gridTemplateColumns: '1fr 1fr 130px 1fr', gap: 14, alignItems: 'center',
  padding: '14px 16px', borderRadius: 14, marginBottom: 8, background: 'white', border: '0.5px solid #e5d8c3',
  boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
}
const statusPending   = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#FCE9E8', color: '#99201E' }
const statusDone      = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 500, background: '#E1F5EE', color: '#085041' }
const statusTrouve    = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 600, background: '#E6F6EC', color: '#0a7d3d' }
const statusConfirmer = { fontSize: 11, padding: '4px 10px', borderRadius: 999, fontWeight: 600, background: '#FDF0DF', color: '#a9620a' }

function tabBtn(active) {
  return {
    padding: '8px 16px', borderRadius: 999,
    border: active ? '1px solid #993556' : '1px solid #e5d8c3',
    background: active ? '#993556' : 'white',
    color:      active ? '#faf7f2' : '#1a0f0a',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

function methodFilterBtn(active) {
  return {
    fontSize: 13, padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontWeight: 500,
    border: active ? '1px solid #993556' : '1px solid #e5d8c3',
    background: active ? '#993556' : 'white',
    color:      active ? '#faf7f2' : '#1a0f0a',
  }
}
