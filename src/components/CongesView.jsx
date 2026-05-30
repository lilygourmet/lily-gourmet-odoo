import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Check, X, Trash2, Calendar, Palmtree, AlertCircle, Download } from 'lucide-react'
import AppHeader from './AppHeader'
import { loadEmployes } from '../lib/hr'
import {
  calculSoldeConges, quotaAnnuel,
  loadCongesByStatuts, createDemandeConge,
  validerConge, rejeterConge, annulerConge,
  syncCongesAnneeOdoo, listAllocationsOdoo, importAllocationsOdoo,
  loadAllocations, createAllocation, cancelAllocation,
  initAutoAllocationsTous, ALLOC_TYPES,
} from '../lib/conges'

const TYPES = [
  { v: 'annuel',     label: 'Congé annuel' },
  { v: 'maladie',    label: 'Congé maladie' },
  { v: 'sans solde', label: 'Sans solde' },
  { v: 'recup',      label: 'Récupération' },
]

function fmt(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}
function nbJours(start, end) {
  if (!start || !end) return 0
  return Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1
}

export default function CongesView({ user, activeView, onNavigate, onLogout }) {
  const [employes, setEmployes]     = useState([])
  const [conges, setConges]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [soldes, setSoldes]         = useState({})  // empId -> { dispo, ... }
  const [tab, setTab]               = useState('demandes')  // 'demandes' | 'valides' | 'soldes'
  const [importing, setImporting]   = useState(false)
  const [filterEmp, setFilterEmp]   = useState('all')   // 'all' | empId
  const [filterYear, setFilterYear] = useState('all')   // 'all' | YYYY
  const [allocLoading, setAllocLoading] = useState(false)
  const [allocResult, setAllocResult]   = useState(null) // { par_employe, details, ... }
  const [allocations, setAllocations]   = useState([])    // table conges_allocations
  const [showAllocForm, setShowAllocForm] = useState(false)
  const [initAllocBusy, setInitAllocBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const annee = new Date().getFullYear()
      const [emps, all, allocs] = await Promise.all([
        loadEmployes(true),
        loadCongesByStatuts(['demande', 'valide', 'rejete', 'annule']),
        loadAllocations({ annee, statut: 'valide' }),
      ])
      const empsActifs = emps.filter(e => e.actif !== false)
      setEmployes(empsActifs)
      setConges(all)
      setAllocations(allocs)
      // Calcule les soldes en parallèle.
      const validesParEmp = new Map()
      for (const c of all) {
        if (c.statut !== 'valide') continue
        if (!validesParEmp.has(c.employe_id)) validesParEmp.set(c.employe_id, [])
        validesParEmp.get(c.employe_id).push(c)
      }
      const out = {}
      for (const emp of empsActifs) {
        out[emp.id] = await calculSoldeConges(emp, validesParEmp.get(emp.id) || [])
      }
      setSoldes(out)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const demandes = useMemo(() => conges.filter(c => c.statut === 'demande').sort((a, b) => a.date_debut.localeCompare(b.date_debut)), [conges])
  const valides  = useMemo(() => conges.filter(c => c.statut === 'valide').sort((a, b) => b.date_debut.localeCompare(a.date_debut)), [conges])

  // Liste des années présentes dans les congés validés (pour le filtre)
  const annees = useMemo(() => {
    const ys = new Set()
    for (const c of valides) ys.add(c.date_debut.slice(0, 4))
    return Array.from(ys).sort((a, b) => b.localeCompare(a))
  }, [valides])

  // Application des filtres + regroupement par mois (clé "YYYY-MM")
  const validesGroupedByMonth = useMemo(() => {
    const filtered = valides.filter(c => {
      if (filterEmp !== 'all' && String(c.employe_id) !== String(filterEmp)) return false
      if (filterYear !== 'all' && c.date_debut.slice(0, 4) !== String(filterYear)) return false
      return true
    })
    const map = new Map() // YYYY-MM -> [c]
    for (const c of filtered) {
      const key = c.date_debut.slice(0, 7)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(c)
    }
    // Tri descendant (mois le plus récent en premier)
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [valides, filterEmp, filterYear])

  function fmtMonthLabel(key) {
    const [y, m] = key.split('-')
    const moisLong = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
    return `${moisLong[parseInt(m, 10) - 1]} ${y}`
  }

  const empById = useMemo(() => Object.fromEntries(employes.map(e => [e.id, e])), [employes])

  async function handleValider(c) {
    if (!confirm(`Valider le congé de ${empById[c.employe_id]?.nom || '?'} du ${fmt(c.date_debut)} au ${fmt(c.date_fin)} ?\n\nUne notification WhatsApp sera envoyée à l'employé.`)) return
    try { await validerConge(c.id, user.id); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }
  async function handleRejeter(c) {
    if (!confirm(`Rejeter cette demande ?\n\nUne notification WhatsApp sera envoyée à l'employé.`)) return
    try { await rejeterConge(c.id, user.id); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }
  async function handleAnnuler(c) {
    if (!confirm(`Annuler ce congé validé ?\n\nUne notification WhatsApp sera envoyée à l'employé.`)) return
    try { await annulerConge(c.id, user.id); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleVoirAllocations() {
    setAllocLoading(true)
    try {
      const r = await listAllocationsOdoo()
      setAllocResult(r)
    } catch (e) {
      alert('Erreur : ' + e.message)
    } finally {
      setAllocLoading(false)
    }
  }

  async function handleInitAllocations() {
    const annee = new Date().getFullYear()
    if (!confirm(`Créer les allocations auto manquantes (Annuel + Maladie ≤ 3 j) pour ${employes.length} employé(s) actifs en ${annee} ?`)) return
    setInitAllocBusy(true)
    try {
      const added = await initAutoAllocationsTous(employes, annee, user.id)
      alert(`${added} allocation(s) auto créée(s).`)
      await reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
    } finally {
      setInitAllocBusy(false)
    }
  }

  async function handleImportAllocations() {
    const annee = new Date().getFullYear()
    if (!confirm(`Importer les allocations Odoo de ${annee} ?\n\nLes lignes Odoo déjà importées seront remplacées ; les allocations manuelles ou auto ne sont pas touchées.`)) return
    setInitAllocBusy(true)
    try {
      const r = await importAllocationsOdoo(annee)
      alert(`Import terminé.\n\n${r.inserted} allocation(s) importée(s)\n${r.total_odoo} trouvée(s) côté Odoo\n${r.unmatched} sans correspondance d'employé`)
      await reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
    } finally {
      setInitAllocBusy(false)
    }
  }

  async function handleAddAllocation(payload) {
    try {
      await createAllocation({ ...payload, created_by: user.id })
      setShowAllocForm(false)
      await reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  async function handleCancelAllocation(a) {
    const lbl = (ALLOC_TYPES.find(t => t.v === a.type)?.label) || a.type
    if (!confirm(`Annuler cette allocation ?\n\n${lbl} · ${a.jours} j${a.raison ? ` · ${a.raison}` : ''}`)) return
    try { await cancelAllocation(a.id); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleImportOdoo() {
    const annee = new Date().getFullYear()
    if (!confirm(`Importer les congés validés depuis Odoo (du 1er janvier ${annee} à aujourd'hui) ?\n\nLes congés Odoo déjà importés seront remplacés ; les congés saisis dans l'app ne seront pas touchés.`)) return
    setImporting(true)
    try {
      const r = await syncCongesAnneeOdoo(annee)
      alert(`Import terminé.\n\n${r.inserted} congé(s) importé(s)\n${r.total_odoo} trouvé(s) côté Odoo\n${r.unmatched} sans correspondance d'employé`)
      await reload()
    } catch (e) {
      alert('Erreur import : ' + e.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 72px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, margin: 0, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Palmtree size={22} /> Congés
          </h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {user?.role === 'admin' && (
              <>
                <button onClick={handleVoirAllocations} disabled={allocLoading} style={{ ...btnSlim, opacity: allocLoading ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Download size={14} /> {allocLoading ? 'Chargement…' : 'Voir allocations Odoo'}
                </button>
                <button onClick={handleImportOdoo} disabled={importing} style={{ ...btnSlim, opacity: importing ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Download size={14} /> {importing ? 'Import…' : 'Importer Odoo (année)'}
                </button>
              </>
            )}
            <button onClick={() => setShowForm(true)} style={btnPrimary}>
              <Plus size={14} /> Nouvelle demande
            </button>
          </div>
        </div>

        {/* Onglets */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <Tab active={tab === 'demandes'} onClick={() => setTab('demandes')}>
            Demandes en attente {demandes.length > 0 && <span style={badge}>{demandes.length}</span>}
          </Tab>
          <Tab active={tab === 'valides'} onClick={() => setTab('valides')}>Congés validés</Tab>
          <Tab active={tab === 'allocations'} onClick={() => setTab('allocations')}>Allocations</Tab>
          <Tab active={tab === 'soldes'} onClick={() => setTab('soldes')}>Soldes employés</Tab>
        </div>

        {error && <div style={errBox}>{error}</div>}
        {loading && <div style={{ color: '#4a3a30', padding: 12 }}>Chargement…</div>}

        {!loading && tab === 'demandes' && (
          demandes.length === 0
            ? <div style={emptyBox}>Aucune demande en attente.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {demandes.map(c => (
                  <CongeCard
                    key={c.id} c={c} emp={empById[c.employe_id]}
                    actions={
                      <>
                        <button onClick={() => handleValider(c)} style={btnValider}><Check size={14} /> Valider</button>
                        <button onClick={() => handleRejeter(c)} style={btnRejeter}><X size={14} /> Rejeter</button>
                      </>
                    }
                  />
                ))}
              </div>
        )}

        {!loading && tab === 'valides' && (
          <>
            {/* Barre de filtres */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Employé</div>
                <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={{ ...ipt, width: 'auto', minWidth: 180 }}>
                  <option value="all">— Tous les employés —</option>
                  {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Année</div>
                <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ ...ipt, width: 'auto', minWidth: 110 }}>
                  <option value="all">Toutes</option>
                  {annees.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              {(filterEmp !== 'all' || filterYear !== 'all') && (
                <button onClick={() => { setFilterEmp('all'); setFilterYear('all') }}
                  style={{ ...btnSlim, alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <X size={12} /> Réinitialiser
                </button>
              )}
            </div>

            {validesGroupedByMonth.length === 0
              ? <div style={emptyBox}>Aucun congé validé pour ces filtres.</div>
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {validesGroupedByMonth.map(([monthKey, list]) => {
                    // Total jours du mois (somme calendrier)
                    const totalJ = list.reduce((s, c) => s + nbJours(c.date_debut, c.date_fin), 0)
                    return (
                      <div key={monthKey}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '6px 10px', background: '#F4F0EA', borderRadius: 8 }}>
                          <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 15, color: '#1a0f0a' }}>
                            {fmtMonthLabel(monthKey)}
                          </div>
                          <div style={{ fontSize: 11, color: '#4a3a30' }}>
                            {list.length} congé{list.length > 1 ? 's' : ''} · {totalJ} j cumulé{totalJ > 1 ? 's' : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {list.map(c => (
                            <CongeCard
                              key={c.id} c={c} emp={empById[c.employe_id]}
                              actions={<button onClick={() => handleAnnuler(c)} style={btnRejeter}><Trash2 size={14} /> Annuler</button>}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            }
          </>
        )}

        {!loading && tab === 'allocations' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <button onClick={() => setShowAllocForm(true)} style={btnPrimary}>
                <Plus size={14} /> Allouer des jours
              </button>
              {user?.role === 'admin' && (
                <>
                  <button onClick={handleInitAllocations} disabled={initAllocBusy} style={{ ...btnSlim, opacity: initAllocBusy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Plus size={14} /> Init allocations auto {new Date().getFullYear()}
                  </button>
                  <button onClick={handleImportAllocations} disabled={initAllocBusy} style={{ ...btnSlim, opacity: initAllocBusy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Download size={14} /> Importer allocations Odoo {new Date().getFullYear()}
                  </button>
                </>
              )}
              <div style={{ flex: 1 }} />
              <div>
                <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Filtrer employé</div>
                <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={{ ...ipt, width: 'auto', minWidth: 180 }}>
                  <option value="all">— Tous les employés —</option>
                  {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
            </div>

            {(() => {
              const filtered = allocations.filter(a => filterEmp === 'all' || String(a.employe_id) === String(filterEmp))
              if (filtered.length === 0) return <div style={emptyBox}>Aucune allocation pour ces filtres.</div>
              // Regroupement par employé pour affichage
              const byEmp = new Map()
              for (const a of filtered) {
                if (!byEmp.has(a.employe_id)) byEmp.set(a.employe_id, [])
                byEmp.get(a.employe_id).push(a)
              }
              const empsTriees = Array.from(byEmp.entries())
                .map(([id, allocs]) => ({ emp: empById[id], allocs }))
                .filter(x => x.emp)
                .sort((a, b) => (a.emp.nom || '').localeCompare(b.emp.nom || ''))
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {empsTriees.map(({ emp, allocs }) => {
                    const total = allocs.reduce((s, a) => s + Number(a.jours), 0)
                    return (
                      <div key={emp.id} style={{ background: 'white', border: '0.5px solid #e5d8c3', borderRadius: 14, padding: '12px 16px', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{emp.nom}{emp.poste ? <span style={{ fontWeight: 400, fontSize: 12, color: '#8a7a70' }}> · {emp.poste}</span> : null}</div>
                          <div style={{ fontSize: 13, color: '#085041', fontWeight: 600 }}>{total} j alloués</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {allocs.map(a => {
                            const t = ALLOC_TYPES.find(t => t.v === a.type)
                            return (
                              <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '160px 70px 1fr auto', gap: 8, fontSize: 12, padding: '6px 8px', borderTop: '0.5px solid #f0e8d5', alignItems: 'center' }}>
                                <div style={{ color: '#1a0f0a' }}>
                                  {t?.label || a.type}
                                  {a.source === 'auto' && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 999, background: '#E1F5EE', color: '#085041' }}>auto</span>}
                                </div>
                                <div style={{ color: '#085041', fontWeight: 600 }}>{a.jours} j</div>
                                <div style={{ color: '#8a7a70', fontStyle: a.raison ? 'normal' : 'italic' }}>
                                  {a.raison || (a.date_evt ? `(${a.date_evt})` : '—')}
                                </div>
                                <button onClick={() => handleCancelAllocation(a)} title="Annuler cette allocation"
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#A32D2D', padding: 4 }}>
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </>
        )}

        {!loading && tab === 'soldes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 90px 110px', gap: 8, padding: '10px 14px', fontSize: 11, fontWeight: 600, color: '#4a3a30', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <div>Employé</div><div>Quota/an</div><div>Acquis</div><div>Reliquat</div><div>Pris</div><div style={{ textAlign: 'right' }}>Dispo</div>
            </div>
            {employes.map(e => {
              const s = soldes[e.id]
              if (!s) return null
              return (
                <div key={e.id} style={soldeRow}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{e.nom}</div>
                    <div style={{ fontSize: 11, color: '#8a7a70' }}>
                      {e.poste || '—'}{!s.peutPrendre && ` · ⚠ pas encore éligible (< 6 mois)`}
                    </div>
                  </div>
                  <div style={cellNum}>{s.quotaAnnuel}</div>
                  <div style={cellNum}>{s.acquis.toFixed(1)}</div>
                  <div style={cellNum}>{s.reliquatN1 > 0 ? s.reliquatN1 : '—'}</div>
                  <div style={cellNum}>{s.pris.toFixed(1)}</div>
                  <div style={{ ...cellNum, textAlign: 'right', fontWeight: 600, color: s.dispo > 0 ? '#085041' : '#A32D2D' }}>
                    {s.dispo.toFixed(1)} j
                  </div>
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 8, padding: '0 4px' }}>
              Calcul : (reliquat N-1 si avant 30 mai) + (quota_annuel × mois écoulés / 12) + (récup gagnés) − (jours pris).
              Quota = 18 j/an + 1,5 j à 5 ans d'ancienneté + 1,5 j à 10 ans.
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <NouvelleDemandeModal
          employes={employes}
          soldes={soldes}
          user={user}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload() }}
        />
      )}

      {allocResult && (
        <AllocationsModal result={allocResult} onClose={() => setAllocResult(null)} />
      )}

      {showAllocForm && (
        <NouvelleAllocationModal
          employes={employes}
          onClose={() => setShowAllocForm(false)}
          onSubmit={handleAddAllocation}
        />
      )}
    </>
  )
}

function NouvelleAllocationModal({ employes, onClose, onSubmit }) {
  const [employeId, setEmployeId] = useState(employes[0]?.id || '')
  const [type, setType]           = useState('mariage')
  const [jours, setJours]         = useState('')
  const [raison, setRaison]       = useState('')
  const [dateEvt, setDateEvt]     = useState('')
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState('')

  // Suggère le nombre de jours par défaut selon le type
  function onChangeType(newType) {
    setType(newType)
    const def = ALLOC_TYPES.find(t => t.v === newType)?.defaultJours
    if (def && !jours) setJours(String(def))
  }

  async function submit() {
    setErr('')
    if (!employeId) { setErr('Choisis un employé.'); return }
    if (!type)      { setErr('Choisis un type.'); return }
    const j = Number(jours)
    if (!j || j <= 0) { setErr('Nombre de jours requis (> 0).'); return }
    setBusy(true)
    try {
      await onSubmit({
        employe_id: Number(employeId),
        annee: new Date().getFullYear(),
        type,
        jours: j,
        raison: raison.trim() || null,
        date_evt: dateEvt || null,
        source: 'manuel',
      })
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Plus size={18} /> Allouer des jours
        </div>

        <label style={lbl}>Employé</label>
        <select value={employeId} onChange={e => setEmployeId(e.target.value)} style={ipt}>
          {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
        </select>

        <label style={{ ...lbl, marginTop: 10 }}>Type d'allocation</label>
        <select value={type} onChange={e => onChangeType(e.target.value)} style={ipt}>
          {ALLOC_TYPES.filter(t => !t.isAuto).map(t => (
            <option key={t.v} value={t.v}>{t.label}{t.defaultJours ? ` (par défaut ${t.defaultJours} j)` : ''}</option>
          ))}
        </select>

        <label style={{ ...lbl, marginTop: 10 }}>Nombre de jours</label>
        <input type="number" step="0.5" value={jours} onChange={e => setJours(e.target.value)} placeholder="ex : 3" style={ipt} />

        <label style={{ ...lbl, marginTop: 10 }}>Date de l'événement (optionnel)</label>
        <input type="date" value={dateEvt} onChange={e => setDateEvt(e.target.value)} style={ipt} />

        <label style={{ ...lbl, marginTop: 10 }}>Raison / détail (optionnel)</label>
        <input type="text" value={raison} onChange={e => setRaison(e.target.value)} placeholder="ex : mariage de sa fille" style={ipt} />

        {err && <div style={errBox}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={busy} style={btnSlim}>Annuler</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? '…' : 'Allouer'}</button>
        </div>
      </div>
    </div>
  )
}

function AllocationsModal({ result, onClose }) {
  const totalGlobal = result.par_employe.reduce((s, e) => s + e.total_jours, 0)
  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            Allocations Odoo · {result.year}
          </div>
          <button onClick={onClose} style={btnSlim}>Fermer</button>
        </div>
        <div style={{ fontSize: 12, color: '#4a3a30', marginBottom: 12 }}>
          {result.par_employe.length} employé{result.par_employe.length > 1 ? 's' : ''} ·
          {' '}{totalGlobal.toFixed(1)} jours alloués au total ·
          {' '}{result.unmatched > 0 && <span style={{ color: '#A32D2D' }}>{result.unmatched} allocation(s) sans correspondance d'employé</span>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, padding: '8px 12px', fontSize: 11, fontWeight: 600, color: '#4a3a30', textTransform: 'uppercase', letterSpacing: 0.5, background: '#F4F0EA', borderRadius: 8 }}>
          <div>Employé</div>
          <div style={{ textAlign: 'right' }}>Jours alloués</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {result.par_employe.map(e => (
            <details key={e.employe_id} style={{ background: 'white', border: '0.5px solid #e5d8c3', borderRadius: 10, padding: '8px 12px' }}>
              <summary style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, cursor: 'pointer', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{e.nom}</div>
                <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#085041' }}>{e.total_jours.toFixed(1)} j</div>
              </summary>
              <div style={{ marginTop: 8, fontSize: 11, color: '#4a3a30' }}>
                {e.lignes.map((l, i) => (
                  <div key={i} style={{ padding: '4px 0', borderTop: i > 0 ? '0.5px solid #f0e8d5' : 'none' }}>
                    <strong>{l.jours} j</strong> · {l.type || '(type ?)'} ·
                    {' '}{l.date_from || '?'} → {l.date_to || '?'}
                    {l.name && <div style={{ color: '#8a7a70' }}>{l.name}</div>}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>

        {result.unmatched > 0 && (
          <details style={{ marginTop: 12, background: '#FCEEE8', borderRadius: 8, padding: '8px 12px' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: '#99201E', fontWeight: 500 }}>
              {result.unmatched} allocation(s) sans correspondance — voir les noms Odoo
            </summary>
            <div style={{ marginTop: 6, fontSize: 11, color: '#4a3a30' }}>
              {result.details.filter(d => !d.match_employe_id).map((d, i) => (
                <div key={i} style={{ padding: '3px 0', borderTop: i > 0 ? '0.5px solid #f0e8d5' : 'none' }}>
                  <strong>{d.odoo_employee || '?'}</strong> · {d.jours} j · {d.type || '?'}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

function CongeCard({ c, emp, actions }) {
  const nb = nbJours(c.date_debut, c.date_fin)
  const typeLabel = TYPES.find(t => t.v === c.type_conge)?.label || c.type_conge || 'Congé'
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a0f0a' }}>{emp?.nom || `Employé #${c.employe_id}`}</div>
          <div style={{ fontSize: 12, color: '#4a3a30', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} /> du <strong>{fmt(c.date_debut)}</strong> au <strong>{fmt(c.date_fin)}</strong> · {nb} jour{nb > 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>
            {typeLabel}{c.motif ? ` · ${c.motif}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>{actions}</div>
      </div>
    </div>
  )
}

function NouvelleDemandeModal({ employes, soldes, user, onClose, onSaved }) {
  const [employeId, setEmployeId] = useState(employes[0]?.id || '')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin]     = useState('')
  const [typeConge, setTypeConge] = useState('annuel')
  const [motif, setMotif]         = useState('')
  const [busy, setBusy]           = useState(false)
  const [errMsg, setErrMsg]       = useState('')

  const emp   = employes.find(e => e.id === Number(employeId))
  const solde = emp ? soldes[emp.id] : null
  const nbDemande = nbJours(dateDebut, dateFin)
  const depassement = typeConge === 'annuel' && solde && nbDemande > 0 && nbDemande > solde.dispo

  async function submit() {
    setErrMsg('')
    if (!employeId)               { setErrMsg('Choisis un employé.'); return }
    if (!dateDebut || !dateFin)   { setErrMsg('Indique les dates.'); return }
    if (dateFin < dateDebut)      { setErrMsg('La date de fin est avant la date de début.'); return }
    if (solde && !solde.peutPrendre && typeConge === 'annuel') {
      setErrMsg('Cet employé n\'a pas encore 6 mois d\'ancienneté.'); return
    }
    setBusy(true)
    try {
      await createDemandeConge({
        employe_id: Number(employeId),
        date_debut: dateDebut,
        date_fin:   dateFin,
        type_conge: typeConge,
        motif: motif.trim() || null,
        demande_par: user.id,
      })
      onSaved()
    } catch (e) {
      setErrMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Plus size={18} /> Nouvelle demande de congé
        </div>

        <label style={lbl}>Employé</label>
        <select value={employeId} onChange={e => setEmployeId(e.target.value)} style={ipt}>
          {employes.map(e => <option key={e.id} value={e.id}>{e.nom}{e.poste ? ` · ${e.poste}` : ''}</option>)}
        </select>

        {solde && (
          <div style={{ background: '#FAF6F0', padding: '8px 10px', borderRadius: 8, marginTop: 8, fontSize: 12, color: '#4a3a30', display: 'flex', justifyContent: 'space-between' }}>
            <span>Solde dispo</span>
            <strong style={{ color: solde.dispo > 0 ? '#085041' : '#A32D2D' }}>{solde.dispo.toFixed(1)} jour{solde.dispo > 1 ? 's' : ''}</strong>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
          <div>
            <label style={lbl}>Date début</label>
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={ipt} />
          </div>
          <div>
            <label style={lbl}>Date fin</label>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} style={ipt} />
          </div>
        </div>
        {nbDemande > 0 && (
          <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 4 }}>{nbDemande} jour{nbDemande > 1 ? 's' : ''} demandé{nbDemande > 1 ? 's' : ''}</div>
        )}
        {depassement && (
          <div style={{ background: '#FCE9E8', color: '#99201E', padding: '8px 10px', borderRadius: 8, marginTop: 8, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={13} /> Le nombre demandé dépasse le solde dispo.
          </div>
        )}

        <label style={{ ...lbl, marginTop: 10 }}>Type</label>
        <select value={typeConge} onChange={e => setTypeConge(e.target.value)} style={ipt}>
          {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>

        <label style={{ ...lbl, marginTop: 10 }}>Motif (optionnel)</label>
        <input type="text" value={motif} onChange={e => setMotif(e.target.value)} placeholder="ex : voyage familial" style={ipt} />

        {errMsg && <div style={errBox}>{errMsg}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={busy} style={btnSlim}>Annuler</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? '…' : 'Enregistrer la demande'}</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Styles
// ============================================================
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
const modal   = { background: 'white', borderRadius: 16, padding: 22, maxWidth: 460, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)', maxHeight: '92vh', overflowY: 'auto' }
const card    = { background: 'white', border: '0.5px solid #e5d8c3', borderRadius: 14, padding: '13px 16px', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }
const soldeRow = { display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 90px 110px', gap: 8, padding: '12px 14px', borderRadius: 12, background: 'white', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)', alignItems: 'center' }
const cellNum = { fontSize: 12, color: '#4a3a30', textAlign: 'center', alignSelf: 'center' }
const emptyBox = { padding: 28, textAlign: 'center', color: '#4a3a30', background: '#F9F6F1', borderRadius: 16 }
const errBox = { background: '#FCE9E8', color: '#99201E', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginTop: 10 }
const badge = { background: '#A32D2D', color: 'white', padding: '0 6px', borderRadius: 999, fontSize: 10, fontWeight: 700, marginLeft: 6 }
const ipt = { width: '100%', padding: '9px 11px', fontSize: 13, border: '1px solid #C4BFB6', borderRadius: 8, boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 11, fontWeight: 500, color: '#4a3a30', marginBottom: 4 }
const btnSlim = { fontSize: 13, padding: '8px 14px', borderRadius: 10, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', color: '#4a3a30' }
const btnPrimary = { fontSize: 13, padding: '8px 14px', borderRadius: 10, border: '1px solid #993556', background: '#993556', color: 'white', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }
const btnValider = { fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #1D9E75', background: '#E1F5EE', color: '#085041', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }
const btnRejeter = { fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #E5BFB6', background: '#FCE9E8', color: '#99201E', cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }

function Tab({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
      background: active ? '#993556' : 'white',
      color:      active ? '#faf7f2' : '#1a0f0a',
      border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  )
}
