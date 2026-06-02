import { useState, useEffect, useMemo } from 'react'
import { Lock, Clock, Archive, Paperclip, X, Image, Pencil, Coins, Trash2, Check, AlertTriangle, Tags, ChevronDown, ChevronUp } from 'lucide-react'
import { loadMouvementsMonth, loadCaisseBalance, loadMonthStats, loadCategories, addMouvement, updateMouvement, deleteMouvement, isMonthClosed, cloturerMois, uploadMouvementProof, declareMouvementNoProof, resetMouvementProof, loadPendingReceptions, validateReception } from '../../../lib/caisse'
import { MOIS_TABS, currentMonth, currentYear, fmtMoney, fmtDateCourte, todayISO } from '../_helpers'
import AjoutSortieModal from '../modals/AjoutSortieModal'
import AjoutEntreeModal from '../modals/AjoutEntreeModal'
import ClotureMoisModal from '../modals/ClotureMoisModal'
import EditMouvementModal from '../modals/EditMouvementModal'
import PreuveMouvementModal from '../modals/PreuveMouvementModal'
import ValiderReceptionsModal from '../modals/ValiderReceptionsModal'
import AuditLogPanel from '../AuditLogPanel'

export default function MeriemCaisse({ user, focus }) {
  return <CaisseGenericView caisseOwner="meriem" user={user} focus={focus} accent={{ bg: '#EAF3DE', text: '#27500A', border: '#97C459' }} />
}

export function CaisseGenericView({ caisseOwner, user, accent, focus }) {
  const isAdmin = !!(user?.perm_caisse_admin || user?.role === 'admin')
  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [mouvements, setMouvements] = useState([])
  const [balance, setBalance] = useState(0)
  const [stats, setStats] = useState({ entrees: 0, sorties: 0, byCat: {} })
  const [filter, setFilter] = useState('all')
  const [categories, setCategories] = useState([])
  const [showSortie, setShowSortie] = useState(false)
  const [showEntree, setShowEntree] = useState(false)
  const [showCloture, setShowCloture] = useState(false)
  const [editingMvt, setEditingMvt] = useState(null)
  const [proofingMvt, setProofingMvt] = useState(null)
  const [closed, setClosed] = useState(false)
  const [pendingReceptions, setPendingReceptions] = useState([])
  const [showReceptionsModal, setShowReceptionsModal] = useState(false)
  const [hasAutoShownReceptions, setHasAutoShownReceptions] = useState(false)
  const [catFilterOpen, setCatFilterOpen] = useState(false)
  const [highlightId, setHighlightId] = useState(null)

  // Navigation depuis la recherche : aller au bon mois et surligner la ligne
  useEffect(() => {
    if (focus && focus.year && focus.month) { setYear(focus.year); setMonth(focus.month); setHighlightId(focus.id) }
  }, [focus])
  useEffect(() => {
    if (highlightId == null) return
    const el = document.getElementById(`mvt-${highlightId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(() => setHighlightId(null), 4500)
    return () => clearTimeout(t)
  }, [mouvements, highlightId])

  useEffect(() => { (async () => {
    setCategories(await loadCategories(caisseOwner))
  })() }, [caisseOwner])

  useEffect(() => { reload() }, [caisseOwner, year, month])

  // Charger les réceptions en attente à chaque chargement de la caisse
  useEffect(() => { (async () => {
    try {
      const r = await loadPendingReceptions(caisseOwner)
      setPendingReceptions(r)
      // Ouvrir le popup automatiquement la PREMIÈRE fois s'il y a des pending
      if (r.length > 0 && !hasAutoShownReceptions) {
        setShowReceptionsModal(true)
        setHasAutoShownReceptions(true)
      }
    } catch (e) {
      console.warn('loadPendingReceptions:', e?.message)
    }
  })() }, [caisseOwner])

  async function reload() {
    const [mvts, bal, st, cls] = await Promise.all([
      loadMouvementsMonth(caisseOwner, year, month),
      loadCaisseBalance(caisseOwner),
      loadMonthStats(caisseOwner, year, month),
      isMonthClosed(caisseOwner, year, month),
    ])
    setMouvements(mvts); setBalance(bal); setStats(st); setClosed(cls)
  }

  async function reloadPendingReceptions() {
    const r = await loadPendingReceptions(caisseOwner)
    setPendingReceptions(r)
    return r
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return mouvements
    if (filter === 'entree') return mouvements.filter(m => m.type === 'entree')
    if (filter === 'sortie') return mouvements.filter(m => m.type === 'sortie')
    if (filter === 'pending_proof') return mouvements.filter(m => m.type === 'sortie' && m.proof_status === 'pending')
    return mouvements.filter(m => m.category === filter)
  }, [mouvements, filter])

  const pendingProofCount = useMemo(() => {
    return mouvements.filter(m => m.type === 'sortie' && m.proof_status === 'pending').length
  }, [mouvements])

  const rankedCats = useMemo(() => {
    return Object.entries(stats.byCat)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  }, [stats])

  async function handleAddSortie({ amount, label, category, mvtDate, hasFacture }) {
    await addMouvement({ caisseOwner, type: 'sortie', sourceType: 'manuelle', amount, label, category, mvtDate, hasFacture, userId: user.id })
    setShowSortie(false); reload()
  }
  async function handleAddEntree({ amount, label, mvtDate }) {
    await addMouvement({ caisseOwner, type: 'entree', sourceType: 'manuelle', amount, label, mvtDate, userId: user.id })
    setShowEntree(false); reload()
  }
  async function handleCloture() {
    await cloturerMois({ caisseOwner, year, month, balance, userId: user.id })
    setShowCloture(false); reload()
  }
  async function handleDeleteMvt(id) {
    if (!confirm('Supprimer ce mouvement ? (l\'action sera enregistrée dans l\'historique)')) return
    await deleteMouvement(id, user.id); reload()
  }
  async function handleEditAmount(mvt) {
    const nv = prompt('Nouveau montant :', mvt.amount)
    if (!nv || isNaN(Number(nv))) return
    await updateMouvement(mvt.id, { amount: Number(nv) }, user.id)
    reload()
  }
  async function handleSaveEdit(updates) {
    if (!editingMvt) return
    await updateMouvement(editingMvt.id, updates, user.id)
    setEditingMvt(null); reload()
  }
  async function handleUploadProof(file) {
    if (!proofingMvt) return
    await uploadMouvementProof(proofingMvt.id, file, user.id)
    setProofingMvt(null); reload()
  }
  async function handleDeclareNoProof(mvt) {
    if (!confirm(`Confirmer "Pas de preuve" pour : ${mvt.label} ?`)) return
    await declareMouvementNoProof(mvt.id, user.id); reload()
  }
  async function handleResetProof(mvt) {
    if (!confirm('Réinitialiser le statut de preuve pour ce mouvement ?')) return
    await resetMouvementProof(mvt.id, user.id); reload()
  }
  async function handleValidateReception(mvtId) {
    await validateReception(mvtId, user.id)
    // Refresh : liste pending + données du mois (le solde change si validé sur le mois affiché)
    const remaining = await reloadPendingReceptions()
    await reload()
    // Si plus rien à valider, fermer le modal
    if (remaining.length === 0) setShowReceptionsModal(false)
  }

  const palette = ['#993556', '#C77B9F', '#EF9F27', '#378ADD', '#7F77DD', '#1D9E75', '#D85A30', '#8a7a70']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={() => setYear(y => y - 1)} style={btnSlim}>←</button>
        <div style={{ fontSize: 18, fontWeight: 500 }}>{year}</div>
        <button onClick={() => setYear(y => y + 1)} style={btnSlim}>→</button>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 18, overflowX: 'auto' }}>
        {MOIS_TABS.map(m => (
          <button key={m.idx} onClick={() => setMonth(m.idx)} style={{
            padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: month === m.idx ? accent.bg : '#F4F0EA',
            color:      month === m.idx ? accent.text : '#4a3a30',
            fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
          }}>{m.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: accent.bg, border: `0.5px solid ${accent.border}`, borderRadius: 16, padding: 24, boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
          <div style={{ fontSize: 12, color: accent.text, opacity: 0.85 }}>Solde actuel · caisse {caisseOwner === 'meriem' ? 'Meriem' : 'Layla LG'}</div>
          <div style={{ fontSize: 36, fontWeight: 500, color: accent.text, margin: '8px 0 4px' }}>{fmtMoney(balance)}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 14, fontSize: 12, color: accent.text }}>
            <div>↓ Entrées : <strong>{fmtMoney(stats.entrees)}</strong></div>
            <div>↑ Sorties : <strong>{fmtMoney(stats.sorties)}</strong></div>
          </div>
          {closed && <div style={{ marginTop: 12, fontSize: 12, padding: '6px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 5, color: accent.text }}><Lock size={13} /> Mois clôturé</div>}
        </div>
        <div style={{ background: '#F4F0EA', borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
          <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 8 }}>Sorties par catégorie</div>
          {rankedCats.length === 0 && <div style={{ fontSize: 11, color: '#8a7a70' }}>Aucune sortie ce mois</div>}
          {rankedCats.map(([cat, amt], i) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '3px 0' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: palette[i % palette.length] }} />
              <span style={{ flex: 1, color: '#4a3a30' }}>{cat}</span>
              <span style={{ fontWeight: 500 }}>{fmtMoney(amt)}</span>
            </div>
          ))}
        </div>
      </div>

      {pendingReceptions.length > 0 && (
        <div style={{
          padding: '10px 14px', background: '#FCEEE8', border: '1px solid #E5C0B6',
          borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#993556',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
        }}>
          <span style={{ display: 'inline-flex' }}><Clock size={16} /></span>
          <span>
            <strong>{pendingReceptions.length}</strong> réception{pendingReceptions.length > 1 ? 's' : ''} en attente de validation
            <span style={{ color: '#4a3a30', marginLeft: 6 }}>
              ({fmtMoney(pendingReceptions.reduce((s, r) => s + Number(r.amount), 0))})
            </span>
          </span>
          <button onClick={() => setShowReceptionsModal(true)} style={{
            marginLeft: 'auto', fontSize: 12, padding: '6px 12px',
            background: '#993556', border: '1px solid #993556', color: 'white',
            borderRadius: 6, cursor: 'pointer', fontWeight: 500
          }}>Valider maintenant</button>
        </div>
      )}

      {pendingProofCount > 0 && (
        <div style={{
          padding: '10px 14px', background: '#FFF6E5', border: '1px solid #F5C46B',
          borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#7A5510',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'
        }}>
          <span style={{ display: 'inline-flex' }}><Clock size={16} /></span>
          <span><strong>{pendingProofCount}</strong> sortie{pendingProofCount > 1 ? 's' : ''} sans état de preuve ce mois.</span>
          <button onClick={() => setFilter('pending_proof')} style={{
            marginLeft: 'auto', fontSize: 11, padding: '4px 10px',
            background: 'white', border: '1px solid #F5C46B', color: '#7A5510',
            borderRadius: 6, cursor: 'pointer'
          }}>Filtrer ces sorties</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button disabled={closed} onClick={() => setShowSortie(true)} style={{ ...btnPrimary, opacity: closed ? 0.4 : 1 }}>↑ Ajouter sortie</button>
        <button disabled={closed} onClick={() => setShowEntree(true)} style={{ ...btnNormal, opacity: closed ? 0.4 : 1 }}>↓ Ajouter entrée manuelle</button>
        <button disabled={closed} onClick={() => setShowCloture(true)} style={{ ...btnNormal, marginLeft: 'auto', opacity: closed ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Archive size={15} /> Clôturer le mois</button>
      </div>

      {(() => { const selectedCat = categories.find(c => c.name === filter); return (
      <>
      <div style={{ display: 'flex', gap: 6, marginBottom: catFilterOpen ? 10 : 16, flexWrap: 'wrap' }}>
        <Chip active={filter === 'all'}    onClick={() => setFilter('all')}>Tout</Chip>
        <Chip active={filter === 'entree'} onClick={() => setFilter('entree')}>Entrées</Chip>
        <Chip active={filter === 'sortie'} onClick={() => setFilter('sortie')}>Sorties</Chip>
        {pendingProofCount > 0 && (
          <Chip active={filter === 'pending_proof'} onClick={() => setFilter('pending_proof')}><Clock size={13} /> Sans preuve décidée</Chip>
        )}
        {categories.length > 0 && (
          <Chip active={!!selectedCat} onClick={() => setCatFilterOpen(o => !o)}>
            <Tags size={13} /> {selectedCat ? `Catégorie : ${selectedCat.name}` : 'Catégorie'} {catFilterOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </Chip>
        )}
      </div>
      {catFilterOpen && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', padding: 12, background: '#FAF6F0', borderRadius: 12, border: '0.5px solid #e5d8c3' }}>
          {categories.map(c => (
            <Chip key={c.id} active={filter === c.name} onClick={() => setFilter(c.name)}>{c.emoji} {c.name}</Chip>
          ))}
        </div>
      )}
      </>
      )})()}

      {filtered.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }}>Aucun mouvement.</div>}
      {filtered.map(mvt => (
        <MouvementRow
          key={mvt.id}
          mvt={mvt}
          highlight={mvt.id === highlightId}
          isAdmin={isAdmin}
          onEdit={() => setEditingMvt(mvt)}
          onEditAmount={() => handleEditAmount(mvt)}
          onDelete={() => handleDeleteMvt(mvt.id)}
          onAddProof={() => setProofingMvt(mvt)}
          onViewProof={() => setProofingMvt(mvt)}
          onNoProof={() => handleDeclareNoProof(mvt)}
          onResetProof={() => handleResetProof(mvt)}
        />
      ))}

      {/* Log déroulable en bas */}
      <AuditLogPanel entityType="mouvement" title="Historique des mouvements caisse" />

      {showSortie && (
        <AjoutSortieModal categories={categories} onClose={() => setShowSortie(false)} onSubmit={handleAddSortie} caisseOwner={caisseOwner} />
      )}
      {showEntree && (
        <AjoutEntreeModal onClose={() => setShowEntree(false)} onSubmit={handleAddEntree} />
      )}
      {showCloture && (
        <ClotureMoisModal balance={balance} year={year} month={month} caisseOwner={caisseOwner}
          onClose={() => setShowCloture(false)} onConfirm={handleCloture} />
      )}
      {editingMvt && (
        <EditMouvementModal
          mvt={editingMvt}
          categories={categories}
          onClose={() => setEditingMvt(null)}
          onSubmit={handleSaveEdit}
        />
      )}
      {proofingMvt && (
        <PreuveMouvementModal
          mvt={proofingMvt}
          onClose={() => setProofingMvt(null)}
          onUpload={handleUploadProof}
          onDeclareNoProof={() => { handleDeclareNoProof(proofingMvt); setProofingMvt(null) }}
          onReset={() => { handleResetProof(proofingMvt); setProofingMvt(null) }}
        />
      )}
      {showReceptionsModal && pendingReceptions.length > 0 && (
        <ValiderReceptionsModal
          receptions={pendingReceptions}
          onValidate={handleValidateReception}
          onClose={() => setShowReceptionsModal(false)}
        />
      )}
    </div>
  )
}

// ============================================================
// Ligne d'un mouvement (avec badge preuve + boutons)
// ============================================================
function MouvementRow({ mvt, isAdmin, highlight, onEdit, onEditAmount, onDelete, onAddProof, onViewProof, onNoProof, onResetProof }) {
  const isSortie = mvt.type === 'sortie'
  const isEntree = mvt.type === 'entree'
  const status = mvt.proof_status || 'legacy'
  const canEdit = !mvt.month_locked
  const isPendingReception = isEntree && mvt.reception_status === 'pending'

  return (
    <div id={`mvt-${mvt.id}`} style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(80px, 90px) 1fr 140px 110px auto',
      gap: 12, alignItems: 'center',
      padding: '12px 14px', borderRadius: 12, marginBottom: 6,
      background: highlight ? '#FFF3D6' : isPendingReception ? '#FAFAF8' : 'white',
      border: highlight ? '2px solid #E0A93B' : '0.5px solid #e5d8c3',
      borderLeft: highlight ? '4px solid #E0A93B' : `3px solid ${mvt.type === 'entree' ? '#97C459' : '#E5C0B6'}`,
      boxShadow: highlight ? '0 0 0 3px rgba(224,169,59,0.2)' : '0 2px 8px rgba(122,42,68,0.05)',
      opacity: isPendingReception ? 0.55 : 1,
      borderStyle: isPendingReception ? 'dashed' : 'solid',
      transition: 'background 0.4s, box-shadow 0.4s',
    }}>
      <div style={{ fontSize: 11, color: '#4a3a30' }}>{fmtDateCourte(mvt.mvt_date)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>{mvt.label}</span>
        {isSortie && <ProofBadge status={status} />}
        {isPendingReception && (
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 999,
            background: '#FCEEE8', color: '#993556', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}><Clock size={11} /> À valider</span>
        )}
      </div>
      <div>{mvt.category && <span style={catTag}>{mvt.category}</span>}</div>
      <div style={{ textAlign: 'right', fontWeight: 500, color: mvt.type === 'entree' ? '#1D7A5C' : '#99201E' }}>
        {mvt.type === 'entree' ? '+ ' : '− '}{fmtMoney(Math.abs(mvt.amount)).replace(' dh', '')} <span style={{ fontSize: 11 }}>dh</span>
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {/* Boutons preuve (sorties) — autorisés MÊME si le mois est clôturé
            (on peut toujours ajouter une facture oubliée) */}
        {isSortie && (status === 'pending' || status === 'legacy') && (
          <>
            <button onClick={onAddProof} title="Ajouter une preuve / facture" style={btnIconGreen}><Paperclip size={14} /></button>
            {status === 'pending' && (
              <button onClick={onNoProof} title="Déclarer : pas de preuve" style={btnIconGray}><X size={14} /></button>
            )}
          </>
        )}
        {isSortie && status === 'with_proof' && (
          <button onClick={onViewProof} title="Voir / changer la preuve" style={btnIconGreen}><Image size={14} /></button>
        )}
        {isSortie && status === 'no_proof_declared' && (
          <button onClick={onAddProof} title="Changer d'avis : ajouter une preuve" style={btnIconGray}><Paperclip size={14} /></button>
        )}

        {/* Modifier intitulé + date (tout le monde, sortie ou entrée) */}
        {canEdit && (
          <button onClick={onEdit} title="Modifier intitulé et date" style={btnIcon}><Pencil size={14} /></button>
        )}

        {/* Modifier montant + supprimer : admin seulement */}
        {canEdit && isAdmin && (
          <>
            <button onClick={onEditAmount} title="Modifier le montant" style={btnIcon}><Coins size={14} /></button>
            <button onClick={onDelete} title="Supprimer ce mouvement" style={btnIconRed}><Trash2 size={14} /></button>
          </>
        )}
      </div>
    </div>
  )
}

function ProofBadge({ status }) {
  if (status === 'legacy') return null
  const cfg = {
    pending:           { bg: '#FFF6E5', col: '#7A5510', Icon: Clock,         txt: 'En attente' },
    with_proof:        { bg: '#E6F4E6', col: '#27500A', Icon: Check,         txt: 'Preuve' },
    no_proof_declared: { bg: '#F0EEEA', col: '#4a3a30', Icon: AlertTriangle, txt: 'Sans preuve' },
  }[status]
  if (!cfg) return null
  return <span style={{
    fontSize: 10, padding: '2px 7px', borderRadius: 999,
    background: cfg.bg, color: cfg.col, fontWeight: 500, whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 4,
  }}><cfg.Icon size={11} /> {cfg.txt}</span>
}

const btnSlim = { fontSize: 13, padding: '4px 10px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnNormal = { fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer' }
const btnPrimary = { fontSize: 13, padding: '10px 14px', borderRadius: 8, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer' }
const btnIcon = { background: 'transparent', border: '1px solid #e5d8c3', cursor: 'pointer', color: '#4a3a30', borderRadius: 8, padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center' }
const btnIconGreen = { background: 'transparent', border: '1px solid #C8E0AC', cursor: 'pointer', color: '#27500A', borderRadius: 8, padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center' }
const btnIconGray = { background: 'transparent', border: '1px solid #E0DDD5', cursor: 'pointer', color: '#4a3a30', borderRadius: 8, padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center' }
const btnIconRed = { background: 'transparent', border: '1px solid #F2D1D0', cursor: 'pointer', color: '#99201E', borderRadius: 8, padding: '5px 8px', fontSize: 11, display: 'inline-flex', alignItems: 'center' }
const catTag = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 8px', borderRadius: 999, background: '#F4F0EA', color: '#4a3a30' }

function Chip({ active, onClick, children }) {
  return <button onClick={onClick} style={{
    fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
    background: active ? '#993556' : 'white',
    color:      active ? '#faf7f2' : '#1a0f0a',
    border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  }}>{children}</button>
}
