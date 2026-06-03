import { useState, useEffect, useMemo } from 'react'
import { Landmark, User, ScrollText, Banknote, Calendar, Eye, Upload, ArrowLeftRight, FileText } from 'lucide-react'
import { loadDestinataires, loadEnveloppesForSuivi, updateEnveloppeDate, setEnveloppeProof, uploadPreuve, getPreuveSignedUrl, setEnveloppeReleve, loadConfirmedReleveLines, clearEnveloppeReleve, loadFreeReleveLines, attachReleveLine, loadAllFreeReleveLines } from '../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, fmtDateLongue, COLOR_PALETTE } from './_helpers'
import UploadPreuveModal from './modals/UploadPreuveModal'
import ReleveImportModal from './modals/ReleveImportModal'

export default function SuiviView({ user }) {
  const [subTab, setSubTab] = useState('banque')
  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        <SubTabBtn active={subTab === 'banque'} onClick={() => setSubTab('banque')}><Landmark size={14} /> Banque</SubTabBtn>
        <SubTabBtn active={subTab === 'perso'}  onClick={() => setSubTab('perso')}><User size={14} /> Perso</SubTabBtn>
        <SubTabBtn active={subTab === 'nonlie'} onClick={() => setSubTab('nonlie')}><ArrowLeftRight size={14} /> Reçus banque non liés</SubTabBtn>
      </div>
      {subTab === 'banque' && <BanqueSection user={user} />}
      {subTab === 'perso'  && <PersoSection  user={user} />}
      {subTab === 'nonlie' && <NonLieSection />}
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
  const [confirmEnv, setConfirmEnv] = useState(null)
  const [suggestEnv, setSuggestEnv] = useState(null)
  const [query, setQuery] = useState('')
  const [takenLines, setTakenLines] = useState([])

  useEffect(() => { reload() }, [year, month, statusFilter])

  async function reload() {
    const data = await loadEnveloppesForSuivi({ type: 'banque', month, year, statusFilter })
    setList(data)
    try { setTakenLines(await loadConfirmedReleveLines()) } catch { /* ignore */ }
  }

  // Filtrer par méthode de paiement + recherche texte (montant, client, source)
  const filteredList = useMemo(() => {
    let l = methodFilter === 'all' ? list : list.filter(e => (e.payment_method || 'cash') === methodFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      l = l.filter(e =>
        String(e.amount_cash).includes(q) ||
        (e.virement_client || '').toLowerCase().includes(q) ||
        (e.source || '').toLowerCase().includes(q) ||
        (e.note_proof || '').toLowerCase().includes(q))
    }
    return l
  }, [list, methodFilter, query])

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

  // Confirmer une enveloppe orange en choisissant la bonne ligne du relevé
  async function handlePickLine(envId, choice) {
    await setEnveloppeReleve(envId, {
      status: 'trouve',
      proofDate: choice?.d || undefined,
      libelle: choice ? `${choice.d} · ${choice.l}` : 'Confirmé manuellement',
      candidates: null,
    })
    setConfirmEnv(null)
    reload()
  }

  // Annuler un rapprochement (erreur) → remet en gris
  async function handleClearReleve(envId) {
    await clearEnveloppeReleve(envId)
    reload()
  }

  // Rattacher manuellement une ligne libre du relevé à une enveloppe
  async function handleAttach(env, line) {
    await attachReleveLine(env, line)
    setSuggestEnv(null)
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
        <button onClick={() => setMonth(0)} style={tabBtn(month === 0, '#E6F1FB', '#0C447C', '#378ADD')}>Année</button>
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

      {/* Recherche (montant, client, source) */}
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="🔍 Chercher un montant, un client, une source…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', marginBottom: 12, fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 10 }}
      />

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
              <button onClick={() => setConfirmEnv(env)} style={{ ...btnNormal, background: '#FDF0DF', color: '#a9620a', border: '1px solid #f0d9b8' }}>
                ✓ Confirmer
              </button>
            )}
            {env.releve_status && (
              <button onClick={() => handleClearReleve(env.id)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#99201E' }}>
                ↺ Annuler
              </button>
            )}
            {!env.releve_status && !env.proof_url && (
              <button onClick={() => setSuggestEnv(env)} style={{ ...btnNormal, fontSize: 11, padding: '5px 10px', color: '#5b2a86', border: '1px solid #D6C3EA' }}>
                💡 Suggérer
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

      {confirmEnv && (
        <ConfirmChoiceModal env={confirmEnv} takenLines={takenLines} onClose={() => setConfirmEnv(null)} onPick={handlePickLine} />
      )}

      {suggestEnv && (
        <SuggestModal env={suggestEnv} onClose={() => setSuggestEnv(null)} onAttach={handleAttach} />
      )}
    </div>
  )
}

// Onglet : virements/dépôts reçus en banque (dans les relevés) non liés à une enveloppe Odoo
function NonLieSection() {
  const [lines, setLines] = useState(null)
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // all | cash | cheque | virement
  useEffect(() => { (async () => { try { setLines(await loadAllFreeReleveLines()) } catch { setLines([]) } })() }, [])
  const TYPE_GROUP = { versement: 'cash', cheque_depot: 'cheque', virement_recu: 'virement', autre: 'virement' }
  const count = useMemo(() => {
    const c = { cash: 0, cheque: 0, virement: 0 }
    for (const l of (lines || [])) { const g = TYPE_GROUP[l.type] || 'virement'; c[g]++ }
    return c
  }, [lines])
  const list = useMemo(() => {
    if (!lines) return []
    let l = typeFilter === 'all' ? lines : lines.filter(x => (TYPE_GROUP[x.type] || 'virement') === typeFilter)
    const s = q.trim().toLowerCase()
    if (s) l = l.filter(x => String(x.amount).includes(s) || (x.label || '').toLowerCase().includes(s) || (x.ligne_date || '').includes(s))
    return l
  }, [lines, q, typeFilter])
  const total = useMemo(() => list.reduce((s, l) => s + Number(l.amount || 0), 0), [list])
  return (
    <div>
      <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 10 }}>
        Lignes reçues sur les relevés bancaires qui n'ont <b>pas</b> trouvé d'enveloppe Odoo correspondante.
        Importe tes relevés pour remplir cette liste ; rattache-les via « 💡 Suggérer » sur les enveloppes grises.
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => setTypeFilter('all')} style={methodFilterBtn(typeFilter === 'all')}>Tout ({(lines || []).length})</button>
        <button onClick={() => setTypeFilter('cash')} style={methodFilterBtn(typeFilter === 'cash')}><Banknote size={14} /> Espèces ({count.cash})</button>
        <button onClick={() => setTypeFilter('cheque')} style={methodFilterBtn(typeFilter === 'cheque')}><ScrollText size={14} /> Chèques ({count.cheque})</button>
        <button onClick={() => setTypeFilter('virement')} style={methodFilterBtn(typeFilter === 'virement')}><ArrowLeftRight size={14} /> Virements ({count.virement})</button>
      </div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)}
        placeholder="🔍 montant, nom, date…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', marginBottom: 12, fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 10 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: '#EDE4F6', color: '#5b2a86', fontSize: 13 }}>
        <span>{lines === null ? 'Chargement…' : `${list.length} ligne(s) non liée(s)`}</span>
        <span>{fmtMoney(total)}</span>
      </div>
      {lines !== null && list.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }}>
          Rien ici. (Ré-importe tes relevés pour remplir cette liste.)
        </div>
      )}
      {list.map(l => (
        <div key={l.key} style={{ ...rowCard, gridTemplateColumns: '1fr auto' }}>
          <div>
            <div style={{ fontSize: 11, color: '#8a7a70' }}>{l.ligne_date}</div>
            <div style={{ fontSize: 13, color: '#1a0f0a' }}>{l.label || '—'}</div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#5b2a86' }}>{fmtMoney(l.amount)}</div>
        </div>
      ))}
    </div>
  )
}

// Suggestions de lignes LIBRES du relevé (même montant) pour rattacher une enveloppe grise
function SuggestModal({ env, onClose, onAttach }) {
  const [lines, setLines] = useState(null)
  useEffect(() => {
    (async () => {
      let ls
      try { ls = await loadFreeReleveLines(env.amount_cash, env.payment_method) } catch { ls = [] }
      // Auto : une SEULE ligne, "VIR INST RECU", même date que l'enveloppe
      // -> on l'attache et on l'accorde directement (pas de clic).
      if (ls.length === 1) {
        const l = ls[0]
        const instRecu = l.type === 'virement_recu' && /\bINST\b/i.test(l.label || '')
        if (instRecu && l.ligne_date === env.session_date) {
          onAttach(env, l)
          return
        }
      }
      setLines(ls)
    })()
  }, [env.id])
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 16, width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Lignes du relevé de {fmtMoney(env.amount_cash)} encore libres</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 12 }}>
          {env.virement_client ? `${env.virement_client} · ` : ''}{fmtDateCourte(env.session_date)} — choisis la ligne qui correspond :
        </div>
        {lines === null ? (
          <div style={{ fontSize: 13, color: '#8a7a70', padding: 8 }}>Chargement…</div>
        ) : lines.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8a7a70', padding: 8 }}>Aucune ligne libre de ce montant dans les relevés importés.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {lines.map(l => (
              <button key={l.key} onClick={() => onAttach(env, l)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5d8c3', background: '#F9F6F1', cursor: 'pointer', fontSize: 13 }}>
                <b>{l.ligne_date}</b> · {l.label}
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} style={{ ...btnNormal, width: '100%' }}>Fermer</button>
      </div>
    </div>
  )
}

// Choix de la bonne ligne du relevé pour une enveloppe « à confirmer »
function ConfirmChoiceModal({ env, takenLines = [], onClose, onPick }) {
  const normLine = s => (s || '').replace(/\s+/g, ' ').trim().toUpperCase()
  const taken = takenLines.map(normLine)
  let candidates = []
  try { candidates = JSON.parse(env.releve_candidates || '[]') } catch { candidates = [] }
  // Retire les lignes déjà attribuées à une enveloppe verte
  candidates = candidates.filter(c => {
    const key = normLine(`${c.d} · ${c.l}`)
    return !taken.some(t => t.startsWith(key.slice(0, 40)) || key.startsWith(t.slice(0, 40)))
  })
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'white', borderRadius: 16, padding: 16, width: '100%', maxWidth: 460, maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Quelle ligne du relevé ?</div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 12 }}>
          {fmtMoney(env.amount_cash)}{env.virement_client ? ` · ${env.virement_client}` : ''} — choisis la ligne qui correspond :
        </div>
        {candidates.length === 0 ? (
          <div style={{ fontSize: 13, color: '#8a7a70', marginBottom: 12 }}>Aucune ligne mémorisée. Tu peux confirmer sans choisir.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {candidates.map((c, i) => (
              <button key={i} onClick={() => onPick(env.id, c)}
                style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5d8c3', background: '#F9F6F1', cursor: 'pointer', fontSize: 13 }}>
                <b>{c.d}</b> · {c.l}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onPick(env.id, null)} style={{ ...btnNormal, flex: 1 }}>Confirmer sans choisir</button>
          <button onClick={onClose} style={{ ...btnNormal, flex: 1 }}>Annuler</button>
        </div>
      </div>
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
        <button onClick={() => setMonth(0)} style={tabBtn(month === 0, '#993556', 'white', '#993556')}>Année</button>
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
