import { useState, useEffect, useMemo, useCallback } from 'react'

// Hook : retourne true si l'écran est ≤ 640px (mobile)
function useIsMobile(maxWidth = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener?.('change', handler) || mq.addListener(handler)
    return () => mq.removeEventListener?.('change', handler) || mq.removeListener(handler)
  }, [maxWidth])
  return isMobile
}

import { Plus, Check, X, Trash2, Calendar, Palmtree, AlertCircle, Pencil, ChevronRight } from 'lucide-react'
import AppHeader from './AppHeader'
import { supabase } from '../lib/supabase'
import { loadEmployes } from '../lib/hr'
import {
  calculSoldeConges, quotaAnnuel,
  loadCongesByStatuts, createDemandeConge,
  validerConge, rejeterConge, annulerConge,
  loadAllocations, createAllocation, cancelAllocation,
  validerAllocation, rejeterAllocation,
  ALLOC_TYPES,
  updateAllocation, updateConge,
} from '../lib/conges'

const TYPES = [
  { v: 'annuel',           label: 'Congé annuel' },
  { v: 'maladie_courte',   label: 'Congé maladie ≤ 3 j' },
  { v: 'maladie_longue',   label: 'Congé maladie > 3 j' },
  { v: 'mariage',          label: 'Mariage' },
  { v: 'naissance',        label: 'Naissance' },
  { v: 'deces',            label: 'Décès' },
  { v: 'circoncision',     label: 'Circoncision' },
  { v: 'maternite',        label: 'Congé maternité' },
  { v: 'sans solde',       label: 'Sans solde' },
  { v: 'recup',            label: 'Récupération' },
]

// Traduction des libellés Odoo (en anglais) → français pour l'affichage.
function formatTypeConge(t) {
  if (!t) return '—'
  const match = TYPES.find(x => x.v === t)
  if (match) return match.label
  const s = String(t).toLowerCase()
  if (s.includes('paid time off'))    return 'Congé annuel'
  if (s.includes('compensatory days')) return 'Récupération'
  if (s.includes('maternity'))         return 'Congé maternité'
  if (s.includes('sick'))              return 'Congé maladie'
  if (s.includes('unpaid'))            return 'Sans solde'
  return t
}

// Date à partir de laquelle un congé de ce type peut être consommé,
// d'après la date_evt des allocations événementielles. Null si aucune
// contrainte (pas de date_evt, ou type non événementiel).
function debutPossibleType(solde, type) {
  const allocs = (solde?.events?.detail || []).filter(d => {
    if (type === 'recup') return d.type === 'autre'
    return d.type === type
  })
  if (!allocs.length) return null
  const dates = allocs.map(a => a.date_evt).filter(Boolean)
  if (!dates.length) return null   // pas de contrainte de date
  // La PLUS ANCIENNE des dates : dès qu'une allocation devient consommable, c'est OK.
  return dates.sort()[0]
}

// Dispo restant pour un type de congé donné, à partir du solde calculé.
// Renvoie null si aucune limite (sans solde, maladie longue) ou undefined
// si le type n'est pas autorisé (allocation événementielle manquante).
function dispoTypeConge(solde, type) {
  if (!solde) return undefined
  if (type === 'sans solde')      return null
  if (type === 'maladie_longue')  return null
  if (type === 'annuel')          return solde.dispo
  if (type === 'maladie_courte')  return solde.maladie?.dispo ?? 0
  if (type === 'recup') {
    const allocAutre = (solde.events?.detail || [])
      .filter(d => d.type === 'autre' && d.applicable)
      .reduce((s, e) => s + Number(e.jours), 0)
    const total = (solde.recup || 0) + allocAutre
    if (total <= 0) return undefined            // pas d'allocation ni gain
    return Math.max(0, total - (solde.prisType?.autre || 0) - (solde.prisType?.recup || 0))
  }
  // Événements : mariage / naissance / deces / circoncision / maternite
  const alloc = (solde.events?.detail || [])
    .filter(d => d.type === type && d.applicable)
    .reduce((s, e) => s + Number(e.jours), 0)
  if (alloc <= 0) return undefined              // aucune allocation → type non dispo
  const pris = solde.prisType?.[type] || 0
  return Math.max(0, alloc - pris)
}

function fmt(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}
function nbJours(start, end) {
  if (!start || !end) return 0
  return Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1
}

export default function CongesView({ user, activeView, onNavigate, onLogout }) {
  const isAdmin = user?.role === 'admin'
  const [employes, setEmployes]     = useState([])
  const [conges, setConges]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [soldes, setSoldes]         = useState({})  // empId -> { dispo, ... }
  const [tab, setTab]               = useState('demandes')  // 'demandes' | 'valides' | 'soldes'
  const [filterEmp, setFilterEmp]   = useState('all')   // 'all' | empId
  const [filterYear, setFilterYear] = useState('all')   // 'all' | YYYY
  const [allocations, setAllocations]   = useState([])    // table conges_allocations
  const [showAllocForm, setShowAllocForm] = useState(false)
  const [detailEmp, setDetailEmp]         = useState(null)  // employé sélectionné pour voir le détail
  const [editAlloc, setEditAlloc]         = useState(null)  // allocation en cours d'édition
  const [editConge, setEditConge]         = useState(null)  // congé en cours d'édition
  const isMobile = useIsMobile()

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const annee = new Date().getFullYear()
      // 4 requêtes batchées au lieu de 2 par employé.
      const [emps, all, allocs, recupRows] = await Promise.all([
        loadEmployes(true),
        loadCongesByStatuts(['demande', 'valide', 'rejete', 'annule']),
        loadAllocations({ annee, statut: ['valide', 'attente'] }),
        supabase.from('pointages_mois').select('employe_id, jours_recup').eq('annee', annee),
      ])
      const empsActifs = emps.filter(e => e.actif !== false)
      setEmployes(empsActifs)
      setConges(all)
      setAllocations(allocs)

      // Backfill : on calcule jours_decomptes en mémoire IMMÉDIATEMENT (utilisé
      // pour le rendu), puis on persiste en BDD en arrière-plan (non bloquant).
      const empMap = new Map(empsActifs.map(e => [e.id, e]))
      const aFigerPayload = []
      for (const c of all) {
        if (c.statut !== 'valide') continue
        if (c.jours_decomptes !== null && c.jours_decomptes !== undefined) continue
        const emp = empMap.get(c.employe_id)
        if (!emp) continue
        const jd = joursDecomptesCalcul(c, emp)
        c.jours_decomptes = jd                        // immédiat en mémoire
        aFigerPayload.push({ id: c.id, jd })
      }
      // Persistence en arrière-plan (par chunks de 20 en parallèle)
      if (aFigerPayload.length > 0) {
        (async () => {
          const chunkSize = 20
          for (let i = 0; i < aFigerPayload.length; i += chunkSize) {
            const chunk = aFigerPayload.slice(i, i + chunkSize)
            await Promise.all(chunk.map(({ id, jd }) =>
              supabase.from('conges').update({ jours_decomptes: jd }).eq('id', id)
                .then(() => {})
                .catch(e => console.warn('[backfill jours_decomptes]', e?.message || e))
            ))
          }
        })()
      }

      // Indexation des données pré-chargées (évite N requêtes serial)
      const validesParEmp = new Map()
      for (const c of all) {
        if (c.statut !== 'valide') continue
        if (!validesParEmp.has(c.employe_id)) validesParEmp.set(c.employe_id, [])
        validesParEmp.get(c.employe_id).push(c)
      }
      const allocsByEmp = new Map()
      for (const a of allocs) {
        if (!allocsByEmp.has(a.employe_id)) allocsByEmp.set(a.employe_id, [])
        allocsByEmp.get(a.employe_id).push(a)
      }
      const recupByEmp = new Map()
      for (const r of (recupRows?.data || [])) {
        recupByEmp.set(r.employe_id, (recupByEmp.get(r.employe_id) || 0) + Number(r.jours_recup || 0))
      }
      const prefetched = { allocsByEmp, recupByEmp }

      // Calcul des soldes en parallèle (toutes les données déjà en mémoire)
      const soldesArr = await Promise.all(empsActifs.map(emp =>
        calculSoldeConges(emp, validesParEmp.get(emp.id) || [], undefined, prefetched)
      ))
      const out = {}
      empsActifs.forEach((emp, i) => { out[emp.id] = soldesArr[i] })
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
    try {
      const jd = joursDecomptesCalcul(c, empById[c.employe_id])
      await validerConge(c.id, user.id, jd); await reload()
    }
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

  async function handleAddAllocation(payload) {
    try {
      // RH (non-admin) : l'allocation passe en 'attente' jusqu'à validation admin.
      const statut = isAdmin ? 'valide' : 'attente'
      await createAllocation({ ...payload, created_by: user.id, statut })
      setShowAllocForm(false)
      await reload()
      if (!isAdmin) alert('Allocation enregistrée. Elle sera visible une fois validée par un admin.')
    } catch (e) {
      alert('Erreur : ' + e.message)
    }
  }

  async function handleValiderAlloc(a) {
    if (!confirm(`Valider l'allocation de ${empById[a.employe_id]?.nom || '?'} (${a.jours} j · ${a.type}) ?`)) return
    try { await validerAllocation(a.id, user.id); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }
  async function handleRejeterAlloc(a) {
    if (!confirm(`Rejeter l'allocation de ${empById[a.employe_id]?.nom || '?'} (${a.jours} j · ${a.type}) ?`)) return
    try { await rejeterAllocation(a.id, user.id); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleUpdateAllocation(id, patch) {
    try { await updateAllocation(id, patch); setEditAlloc(null); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleUpdateConge(id, patch) {
    try { await updateConge(id, patch); setEditConge(null); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  async function handleCancelAllocation(a) {
    const lbl = (ALLOC_TYPES.find(t => t.v === a.type)?.label) || a.type
    if (!confirm(`Annuler cette allocation ?\n\n${lbl} · ${a.jours} j${a.raison ? ` · ${a.raison}` : ''}`)) return
    try { await cancelAllocation(a.id); await reload() }
    catch (e) { alert('Erreur : ' + e.message) }
  }

  return (
    <>
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '14px 10px 80px' : '20px 16px 72px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, margin: 0, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <Palmtree size={22} /> Congés
          </h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setShowForm(true)} style={btnPrimary}>
              <Plus size={14} /> Nouvelle demande
            </button>
          </div>
        </div>

        {/* Onglets — scrollables horizontalement sur mobile */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: isMobile ? 'nowrap' : 'wrap', overflowX: isMobile ? 'auto' : 'visible', paddingBottom: isMobile ? 4 : 0 }}>
          <Tab active={tab === 'demandes'} onClick={() => setTab('demandes')}>
            Demandes en attente {demandes.length > 0 && <span style={badge}>{demandes.length}</span>}
          </Tab>
          <Tab active={tab === 'valides'} onClick={() => setTab('valides')}>Congés validés</Tab>
          <Tab active={tab === 'allocations'} onClick={() => setTab('allocations')}>
            Allocations {allocations.filter(a => a.statut === 'attente').length > 0 && <span style={badge}>{allocations.filter(a => a.statut === 'attente').length}</span>}
          </Tab>
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
                    actions={isAdmin ? (
                      <>
                        <button onClick={() => handleValider(c)} style={btnValider}><Check size={14} /> Valider</button>
                        <button onClick={() => handleRejeter(c)} style={btnRejeter}><X size={14} /> Rejeter</button>
                      </>
                    ) : null}
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
                    // Total jours décomptés du mois (= ce qui sera décompté du quota)
                    const totalJ = list.reduce((s, c) => s + joursDecomptesConge(c, empById[c.employe_id]), 0)
                    return (
                      <div key={monthKey}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '6px 10px', background: '#F4F0EA', borderRadius: 8 }}>
                          <div style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 15, color: '#1a0f0a' }}>
                            {fmtMonthLabel(monthKey)}
                          </div>
                          <div style={{ fontSize: 11, color: '#4a3a30' }}>
                            {list.length} congé{list.length > 1 ? 's' : ''} · {totalJ} j décompté{totalJ > 1 ? 's' : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {list.map(c => (
                            <CongeCard
                              key={c.id} c={c} emp={empById[c.employe_id]}
                              actions={isAdmin ? <>
                      <button onClick={() => setEditConge(c)} style={btnSlim} title="Modifier ce congé"><Pencil size={13} /></button>
                      <button onClick={() => handleAnnuler(c)} style={btnRejeter}><Trash2 size={14} /> Annuler</button>
                    </> : null}
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
              <div style={{ flex: 1 }} />
              <div>
                <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Filtrer employé</div>
                <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} style={{ ...ipt, width: 'auto', minWidth: 180 }}>
                  <option value="all">— Tous les employés —</option>
                  {employes.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
            </div>

            {/* Allocations en ATTENTE de validation (visibles seulement pour admin) */}
            {isAdmin && allocations.some(a => a.statut === 'attente') && (
              <div style={{ background: '#FFF7E0', border: '0.5px solid #F0D89A', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#854F0B', marginBottom: 8 }}>
                  ⏳ Allocations en attente de validation
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allocations.filter(a => a.statut === 'attente').map(a => {
                    const emp = empById[a.employe_id]
                    const t = ALLOC_TYPES.find(x => x.v === a.type)
                    return (
                      <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, background: 'white', padding: '6px 10px', borderRadius: 8 }}>
                        <strong>{emp?.nom || `#${a.employe_id}`}</strong>
                        <span>· {t?.label || a.type}</span>
                        <span style={{ color: '#085041', fontWeight: 600 }}>{a.jours} j</span>
                        {a.raison && <span style={{ color: '#8a7a70' }}>· {a.raison}</span>}
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                          <button onClick={() => handleValiderAlloc(a)} style={{ ...btnValider, padding: '4px 10px', fontSize: 11 }}><Check size={12} /> Valider</button>
                          <button onClick={() => handleRejeterAlloc(a)} style={{ ...btnRejeter, padding: '4px 10px', fontSize: 11 }}><X size={12} /> Rejeter</button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {(() => {
              // Liste principale : on n'affiche que les allocations validées.
              const filtered = allocations
                .filter(a => a.statut === 'valide')
                .filter(a => filterEmp === 'all' || String(a.employe_id) === String(filterEmp))
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
                    // Maladie courte = pool séparé (6 j/an), pas compté dans le total alloué.
                    const allocsMaladie = allocs.filter(a => a.type === 'maladie_courte')
                    const allocsAutres  = allocs.filter(a => a.type !== 'maladie_courte')
                    const totalAlloue   = allocsAutres.reduce((s, a) => s + Number(a.jours), 0)
                    const totalMaladie  = allocsMaladie.reduce((s, a) => s + Number(a.jours), 0)
                    return (
                      <div key={emp.id} style={{ background: 'white', border: '0.5px solid #e5d8c3', borderRadius: 14, padding: '12px 16px', boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{emp.nom}{emp.poste ? <span style={{ fontWeight: 400, fontSize: 12, color: '#8a7a70' }}> · {emp.poste}</span> : null}</div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ fontSize: 13, color: '#085041', fontWeight: 600 }}>{totalAlloue} j alloués</div>
                            {totalMaladie > 0 && (
                              <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: '#E6F1FB', color: '#0C447C', fontWeight: 500 }}>
                                Maladie ≤ 3 j : {totalMaladie} j (pool séparé)
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {allocs.map(a => {
                            const t = ALLOC_TYPES.find(t => t.v === a.type)
                            const debutAlloc = a.date_evt || `${a.annee}-01-01`
                            const finAlloc   = `${a.annee}-12-31`
                            return (
                              <div key={a.id} style={{
                                display: 'grid',
                                gridTemplateColumns: isMobile ? '1fr auto' : '160px 70px 180px 1fr auto auto',
                                gap: 8,
                                fontSize: 12,
                                padding: '6px 8px',
                                borderTop: '0.5px solid #f0e8d5',
                                alignItems: 'center',
                              }}>
                                {isMobile ? (
                                  <>
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ color: '#1a0f0a', fontWeight: 500 }}>
                                        {t?.label || a.type}
                                        {' · '}
                                        <span style={{ color: '#085041', fontWeight: 600 }}>{a.jours} j</span>
                                        {a.source === 'auto' && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 999, background: '#E1F5EE', color: '#085041' }}>auto</span>}
                                      </div>
                                      <div style={{ color: '#4a3a30', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                        <Calendar size={10} />
                                        {debutAlloc.slice(8,10)}/{debutAlloc.slice(5,7)}/{debutAlloc.slice(0,4)} → {finAlloc.slice(8,10)}/{finAlloc.slice(5,7)}/{finAlloc.slice(0,4)}
                                      </div>
                                      {a.raison && <div style={{ color: '#8a7a70', fontSize: 11, marginTop: 2 }}>{a.raison}</div>}
                                    </div>
                                    {isAdmin && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                        <button onClick={() => setEditAlloc(a)} title="Modifier"
                                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4a3a30', padding: 4 }}>
                                          <Pencil size={14} />
                                        </button>
                                        <button onClick={() => handleCancelAllocation(a)} title="Annuler"
                                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#A32D2D', padding: 4 }}>
                                          <Trash2 size={14} />
                                        </button>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div style={{ color: '#1a0f0a' }}>
                                      {t?.label || a.type}
                                      {a.source === 'auto' && <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 999, background: '#E1F5EE', color: '#085041' }}>auto</span>}
                                    </div>
                                    <div style={{ color: '#085041', fontWeight: 600 }}>{a.jours} j</div>
                                    <div style={{ color: '#4a3a30', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <Calendar size={11} />
                                      du {debutAlloc.slice(8,10)}/{debutAlloc.slice(5,7)}/{debutAlloc.slice(0,4)} au {finAlloc.slice(8,10)}/{finAlloc.slice(5,7)}/{finAlloc.slice(0,4)}
                                    </div>
                                    <div style={{ color: '#8a7a70', fontStyle: a.raison ? 'normal' : 'italic' }}>
                                      {a.raison || '—'}
                                    </div>
                                    {isAdmin && (
                                      <>
                                        <button onClick={() => setEditAlloc(a)} title="Modifier cette allocation"
                                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4a3a30', padding: 4 }}>
                                          <Pencil size={13} />
                                        </button>
                                        <button onClick={() => handleCancelAllocation(a)} title="Annuler cette allocation"
                                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#A32D2D', padding: 4 }}>
                                          <Trash2 size={13} />
                                        </button>
                                      </>
                                    )}
                                  </>
                                )}
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
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 90px 90px 110px', gap: 8, padding: '10px 14px', fontSize: 10, fontWeight: 600, color: '#4a3a30', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <div>Employé</div>
                <div title="Annuel permis + reliquat + événements applicables (hors maladie ≤ 3 j)">Total allocations</div>
                <div title="Report N-1 (expire le 30 mai)">Reliquat</div>
                <div title="Jours déjà pris (annuel + événements)">Pris</div>
                <div style={{ textAlign: 'right' }} title="Allocations accumulé + récup − pris">Dispo</div>
              </div>
            )}
            {employes.map(e => {
              const s = soldes[e.id]
              if (!s) return null
              if (isMobile) {
                // Vue compacte : carte empilée, dispo en gros à droite
                return (
                  <div key={e.id} onClick={() => setDetailEmp(e)} style={{ padding: '12px 14px', borderRadius: 12, background: 'white', border: '0.5px solid #e5d8c3', boxShadow: '0 2px 8px rgba(122,42,68,0.05)', cursor: 'pointer' }} title="Cliquer pour voir le résumé">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {e.nom} <ChevronRight size={14} style={{ color: '#993556' }} />
                        </div>
                        <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 2 }}>
                          {e.poste || '—'}
                          {!s.peutPrendre && <span style={{ color: '#A32D2D' }}> · ⚠ &lt; 6 mois</span>}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 4, color: '#0C447C' }}>
                          Maladie ≤ 3 j : {s.maladie.pris}/{s.maladie.alloue || 6}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5 }}>Dispo</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.dispo > 0 ? '#085041' : '#A32D2D', lineHeight: 1 }}>
                          {s.dispo.toFixed(1)}<span style={{ fontSize: 12 }}> j</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11, paddingTop: 8, borderTop: '0.5px solid #f0e8d5' }}>
                      <div>
                        <div style={{ fontSize: 9, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.3 }}>Total alloc.</div>
                        <div style={{ fontWeight: 600 }}>{s.totalAllocations.toFixed(1)} j</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.3 }}>Reliquat</div>
                        <div style={{ fontWeight: 600 }}>{s.reliquatN1 > 0 ? `${s.reliquatN1} j` : '—'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.3 }}>Pris</div>
                        <div style={{ fontWeight: 600 }}>{s.pris.toFixed(1)} j</div>
                      </div>
                    </div>
                  </div>
                )
              }
              return (
                <div key={e.id} onClick={() => setDetailEmp(e)} style={{ ...soldeRow, gridTemplateColumns: '1fr 140px 90px 90px 110px', cursor: 'pointer' }} title="Cliquer pour voir le résumé">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {e.nom} <ChevronRight size={13} style={{ color: '#993556' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#8a7a70' }}>
                      {e.poste || '—'}
                      {' · '}
                      <span title="Maladie courte ≤ 3 j : pool séparé de 6 j/an" style={{ color: '#0C447C' }}>
                        Maladie {s.maladie.pris}/{s.maladie.alloue || 6}
                      </span>
                    </div>
                  </div>
                  <div style={cellNum}>{s.totalAllocations.toFixed(1)} j</div>
                  <div style={cellNum}>{s.reliquatN1 > 0 ? s.reliquatN1 : '—'}</div>
                  <div style={cellNum}>{s.pris.toFixed(1)}</div>
                  <div style={{ ...cellNum, textAlign: 'right', fontWeight: 600, color: s.dispo > 0 ? '#085041' : '#A32D2D' }}>
                    {s.dispo.toFixed(1)} j
                  </div>
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 8, padding: '0 4px' }}>
              <strong>Total allocations</strong> = annuel permis + reliquat valide + événements applicables (hors maladie ≤ 3 j).<br />
              <strong>Dispo</strong> = Total allocations + récup − jours pris.<br />
              <strong>Reliquat</strong> = report de l'année précédente. <em>Expire le 30 mai.</em><br />
              <strong>Maladie ≤ 3 j</strong> = pool séparé (6 j/an).
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

      {detailEmp && (
        <DetailEmployeModal
          emp={detailEmp}
          conges={conges.filter(c => c.employe_id === detailEmp.id)}
          solde={soldes[detailEmp.id]}
          onClose={() => setDetailEmp(null)}
        />
      )}

      {showAllocForm && (
        <NouvelleAllocationModal
          employes={employes}
          onClose={() => setShowAllocForm(false)}
          onSubmit={handleAddAllocation}
        />
      )}

      {editAlloc && (
        <EditAllocationModal
          alloc={editAlloc}
          emp={empById[editAlloc.employe_id]}
          onClose={() => setEditAlloc(null)}
          onSave={patch => handleUpdateAllocation(editAlloc.id, patch)}
        />
      )}

      {editConge && (
        <EditCongeModal
          conge={editConge}
          emp={empById[editConge.employe_id]}
          onClose={() => setEditConge(null)}
          onSave={patch => handleUpdateConge(editConge.id, patch)}
        />
      )}
    </>
  )
}

function EditAllocationModal({ alloc, emp, onClose, onSave }) {
  const [type, setType]       = useState(alloc.type)
  const [jours, setJours]     = useState(String(alloc.jours))
  const [raison, setRaison]   = useState(alloc.raison || '')
  const [dateEvt, setDateEvt] = useState(alloc.date_evt || '')
  const [annee, setAnnee]     = useState(String(alloc.annee))
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')

  async function submit() {
    setErr('')
    const j = Number(jours)
    if (!j || j <= 0) { setErr('Nombre de jours requis (> 0).'); return }
    const a = Number(annee)
    if (!a || a < 2020 || a > 2100) { setErr('Année invalide.'); return }
    setBusy(true)
    try {
      await onSave({ type, jours: j, raison: raison.trim() || null, date_evt: dateEvt || null, annee: a })
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Pencil size={18} /> Modifier allocation
        </div>
        {emp && <div style={{ fontSize: 12, color: '#8a7a70', marginBottom: 10 }}>{emp.nom}</div>}

        <label style={lbl}>Type</label>
        <select value={type} onChange={e => setType(e.target.value)} style={ipt}>
          {ALLOC_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>

        <label style={{ ...lbl, marginTop: 10 }}>Nombre de jours</label>
        <input type="number" step="0.5" value={jours} onChange={e => setJours(e.target.value)} style={ipt} />

        <label style={{ ...lbl, marginTop: 10 }}>Année</label>
        <input type="number" value={annee} onChange={e => setAnnee(e.target.value)} style={ipt} />

        <label style={{ ...lbl, marginTop: 10 }}>Date de début (consommable à partir de)</label>
        <input type="date" value={dateEvt} onChange={e => setDateEvt(e.target.value)} style={ipt} />
        <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>
          {dateEvt
            ? `Consommable du ${new Date(dateEvt + 'T00:00:00').toLocaleDateString('fr-FR')} au 31/12/${annee || new Date().getFullYear()}.`
            : `Si vide : consommable immédiatement, jusqu'au 31/12/${annee || new Date().getFullYear()}.`}
        </div>

        <label style={{ ...lbl, marginTop: 10 }}>Raison (optionnel)</label>
        <input type="text" value={raison} onChange={e => setRaison(e.target.value)} style={ipt} />

        {err && <div style={errBox}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} disabled={busy} style={btnSlim}>Annuler</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

function EditCongeModal({ conge, emp, onClose, onSave }) {
  const [dateDebut, setDateDebut] = useState(conge.date_debut)
  const [dateFin, setDateFin]     = useState(conge.date_fin)
  const [typeConge, setTypeConge] = useState(conge.type_conge || 'annuel')
  const [motif, setMotif]         = useState(conge.motif || '')
  const [statut, setStatut]       = useState(conge.statut)
  const [joursDecomptes, setJoursDecomptes] = useState(
    conge.jours_decomptes !== null && conge.jours_decomptes !== undefined
      ? String(conge.jours_decomptes)
      : ''
  )
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState('')

  async function submit() {
    setErr('')
    if (!dateDebut || !dateFin) { setErr('Dates requises.'); return }
    if (dateFin < dateDebut) { setErr('La date de fin est avant la date de début.'); return }
    setBusy(true)
    try {
      await onSave({
        date_debut: dateDebut,
        date_fin: dateFin,
        type_conge: typeConge,
        motif: motif.trim() || null,
        statut,
        jours_decomptes: joursDecomptes === '' ? null : Number(joursDecomptes),
      })
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Pencil size={18} /> Modifier congé
        </div>
        {emp && <div style={{ fontSize: 12, color: '#8a7a70', marginBottom: 10 }}>{emp.nom}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>Date début</label>
            <input type="date" value={dateDebut} onChange={e => setDateDebut(e.target.value)} style={ipt} />
          </div>
          <div>
            <label style={lbl}>Date fin</label>
            <input type="date" value={dateFin} onChange={e => setDateFin(e.target.value)} style={ipt} />
          </div>
        </div>

        <label style={{ ...lbl, marginTop: 10 }}>Type</label>
        <input type="text" value={typeConge || ''} onChange={e => setTypeConge(e.target.value)} placeholder="ex : annuel / maladie / mariage…" style={ipt} />
        <div style={{ fontSize: 10, color: '#8a7a70', marginTop: 2 }}>
          Le calcul détecte « annuel » par défaut, sauf si le texte contient
          maladie / mariage / naissance / décès / circoncision / récup / sans solde.
        </div>

        <label style={{ ...lbl, marginTop: 10 }}>Statut</label>
        <select value={statut} onChange={e => setStatut(e.target.value)} style={ipt}>
          <option value="demande">Demande</option>
          <option value="valide">Validé</option>
          <option value="rejete">Rejeté</option>
          <option value="annule">Annulé</option>
        </select>

        <label style={{ ...lbl, marginTop: 10 }}>Jours décomptés (laisser vide = calcul auto)</label>
        <input type="number" step="0.5" value={joursDecomptes} onChange={e => setJoursDecomptes(e.target.value)} placeholder="ex : 4" style={ipt} />
        <div style={{ fontSize: 10, color: '#8a7a70', marginTop: 2 }}>
          Si vide, l'app calcule selon les jours off de l'employé. Si rempli, cette valeur est figée
          (ne change pas si tu modifies le planning de l'employé plus tard).
        </div>

        <label style={{ ...lbl, marginTop: 10 }}>Motif (optionnel)</label>
        <input type="text" value={motif} onChange={e => setMotif(e.target.value)} style={ipt} />

        {err && <div style={errBox}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onClose} disabled={busy} style={btnSlim}>Annuler</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}

// ----- Détail employé : vue d'audit des congés pris en N -----
function classifierConge(c) {
  const t = (c.type_conge || '').toLowerCase()
  if (t === 'maladie_courte') return 'maladie_courte'
  if (t === 'maladie_longue') return 'maladie_longue'
  if (t.includes('maternit')) return 'maternite'
  if (t.includes('récup') || t.includes('recup')) return 'recup'
  if (t.includes('maladie') || t.includes('sick') || t.includes('malade')) {
    const duree = (new Date(c.date_fin + 'T00:00:00') - new Date(c.date_debut + 'T00:00:00')) / 86400000 + 1
    return duree <= 3 ? 'maladie_courte' : 'maladie_longue'
  }
  if (t.includes('mariage'))       return 'mariage'
  if (t.includes('naissance'))     return 'naissance'
  if (t.includes('deces') || t.includes('décès')) return 'deces'
  if (t.includes('circoncis'))     return 'circoncision'
  if (t.includes('sans solde') || t.includes('unpaid')) return 'autre'
  return 'annuel'
}
function compteJoursOffFixesPeriode(emp, debutYMD, finYMD) {
  let jourFixe = null
  if (emp.planning_type === 'fixe') jourFixe = emp.planning_jour_off || null
  else if (emp.planning_type === 'alt') {
    const paireOffs   = [emp.planning_paire_off_1,   emp.planning_paire_off_2  ].filter(Boolean)
    const impaireOffs = [emp.planning_impaire_off_1, emp.planning_impaire_off_2].filter(Boolean)
    jourFixe = paireOffs.find(d => impaireOffs.includes(d)) || null
  }
  if (!jourFixe) return 0
  const J = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi']
  let n = 0
  const d = new Date(debutYMD + 'T00:00:00')
  const f = new Date(finYMD + 'T00:00:00')
  while (d <= f) {
    if (J[d.getDay()] === jourFixe) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

function DetailEmployeModal({ emp, conges, solde, onClose }) {
  const annee = new Date().getFullYear()
  const yearStart = `${annee}-01-01`
  const today = new Date().toISOString().slice(0, 10)
  const congesAnnee = (conges || []).filter(c => c.statut === 'valide' && !(c.date_fin < yearStart || c.date_debut > today))
    .sort((a, b) => a.date_debut.localeCompare(b.date_debut))

  // Pour chaque congé, calcule le nb de jours décomptés et la catégorie
  const lignes = congesAnnee.map(c => {
    const debut = c.date_debut < yearStart ? yearStart : c.date_debut
    const fin   = c.date_fin   > today     ? today     : c.date_fin
    const nbCal = Math.round((new Date(fin + 'T00:00:00') - new Date(debut + 'T00:00:00')) / 86400000) + 1
    const cat   = classifierConge(c)
    let offFixes = 0
    if (cat === 'annuel') offFixes = compteJoursOffFixesPeriode(emp, debut, fin)
    const compte = cat === 'recup' ? 0 : (cat === 'annuel' ? nbCal - offFixes : nbCal)
    const dansPris = ['annuel','mariage','naissance','deces','circoncision','maternite','autre'].includes(cat)
    return { c, debut, fin, nbCal, cat, offFixes, compte, dansPris }
  })

  const totalPris = lignes.filter(l => l.dansPris).reduce((s, l) => s + l.compte, 0)
  const totalMaladieCourte = lignes.filter(l => l.cat === 'maladie_courte').reduce((s, l) => s + l.compte, 0)
  const totalMaladieLongue = lignes.filter(l => l.cat === 'maladie_longue').reduce((s, l) => s + l.compte, 0)
  const totalRecup = lignes.filter(l => l.cat === 'recup').length

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: 780 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{emp.nom}</div>
            <div style={{ fontSize: 11, color: '#8a7a70' }}>Détail des congés validés en {annee}</div>
          </div>
          <button onClick={onClose} style={btnSlim}>Fermer</button>
        </div>

        {solde && (
          <div style={{ background: '#F4F0EA', padding: '10px 12px', borderRadius: 10, marginBottom: 12, fontSize: 12 }}>
            <div><strong>Total allocations</strong> : {solde.totalAllocations.toFixed(1)} j · <strong>Reliquat</strong> : {solde.reliquatN1 || 0} · <strong>Récup gagnés</strong> : {solde.recup}</div>
            <div><strong>Pris (annuel + événements)</strong> : {solde.pris.toFixed(1)} j · <strong>Dispo</strong> : {solde.dispo.toFixed(1)} j</div>
            <div style={{ color: '#0C447C', marginTop: 4 }}>Maladie ≤ 3 j : {solde.maladie.pris}/{solde.maladie.alloue} (pool séparé)</div>
          </div>
        )}

        {lignes.length === 0
          ? <div style={emptyBox}>Aucun congé validé en {annee}.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 90px 130px 60px 50px 60px 80px', gap: 6, fontSize: 10, fontWeight: 600, color: '#4a3a30', textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 10px', background: '#F4F0EA', borderRadius: 8 }}>
                <div>Période</div>
                <div>Cat.</div>
                <div title="Type tel qu'il est dans la base">Type Odoo</div>
                <div title="Jours calendaires (date_fin − date_debut + 1)">Cal.</div>
                <div title="Jours off fixes exclus (annuel uniquement)">−Off</div>
                <div style={{ fontWeight: 700 }} title="Jours décomptés du quota">=&nbsp;Compté</div>
                <div>Dans "Pris"?</div>
              </div>
              {lignes.map((l, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 90px 130px 60px 50px 60px 80px', gap: 6, fontSize: 11, padding: '6px 10px', borderRadius: 8, background: 'white', border: '0.5px solid #e5d8c3', alignItems: 'center' }}>
                  <div>{l.debut.slice(8,10)}/{l.debut.slice(5,7)} → {l.fin.slice(8,10)}/{l.fin.slice(5,7)}</div>
                  <div style={{ fontWeight: 500, color: catColor(l.cat) }}>{catLabel(l.cat)}</div>
                  <div style={{ color: '#8a7a70', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.c.type_conge || '—'}>{formatTypeConge(l.c.type_conge)}</div>
                  <div>{l.nbCal}</div>
                  <div style={{ color: l.offFixes > 0 ? '#A32D2D' : '#8a7a70' }}>{l.offFixes > 0 ? `−${l.offFixes}` : '—'}</div>
                  <div style={{ fontWeight: 600 }}>{l.compte}</div>
                  <div style={{ color: l.dansPris ? '#085041' : '#8a7a70' }}>{l.dansPris ? '✓' : '—'}</div>
                </div>
              ))}
            </div>
          )
        }

        <div style={{ marginTop: 12, padding: '10px 12px', background: '#FAF6F0', borderRadius: 10, fontSize: 12, color: '#4a3a30' }}>
          <strong>Total qui apparaît dans la colonne « Pris »</strong> : {totalPris.toFixed(1)} j<br />
          <span style={{ color: '#0C447C' }}>Maladie courte (pool séparé) : {totalMaladieCourte}</span>{' · '}
          <span>Maladie longue (non payée, non décomptée) : {totalMaladieLongue}</span>{' · '}
          <span>Récup (ignoré, s'ajoute au solde) : {totalRecup}</span>
        </div>
      </div>
    </div>
  )
}
function catLabel(c) {
  return ({
    annuel: 'Annuel',
    maladie_courte: 'Maladie ≤3j',
    maladie_longue: 'Maladie >3j',
    mariage: 'Mariage',
    naissance: 'Naissance',
    deces: 'Décès',
    circoncision: 'Circoncision',
    autre: 'Autre',
    recup: 'Récup',
  })[c] || c
}
function catColor(c) {
  return ({
    annuel: '#1a0f0a',
    maladie_courte: '#0C447C',
    maladie_longue: '#A32D2D',
    mariage: '#993556',
    naissance: '#993556',
    deces: '#993556',
    circoncision: '#993556',
    autre: '#4a3a30',
    recup: '#8a7a70',
  })[c] || '#4a3a30'
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

        <label style={{ ...lbl, marginTop: 10 }}>Date de début (consommable à partir de)</label>
        <input type="date" value={dateEvt} onChange={e => setDateEvt(e.target.value)} style={ipt} />
        <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>
          {dateEvt
            ? `Consommable du ${new Date(dateEvt + 'T00:00:00').toLocaleDateString('fr-FR')} au 31/12/${new Date().getFullYear()}.`
            : `Si vide : consommable immédiatement, jusqu'au 31/12/${new Date().getFullYear()}.`}
        </div>

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


// Renvoie le nb de jours réellement décomptés.
// Si c.jours_decomptes est défini (figé à la validation ou édité manuellement),
// on le respecte. Sinon, recalcul dynamique (annuel : exclut jour off fixe ;
// récup : 0 ; maladie/événement : calendaire).
function joursDecomptesConge(c, emp) {
  if (c.jours_decomptes !== null && c.jours_decomptes !== undefined) {
    return Number(c.jours_decomptes)
  }
  return joursDecomptesCalcul(c, emp)
}

function joursDecomptesCalcul(c, emp) {
  const nbCal = nbJours(c.date_debut, c.date_fin)
  if (!emp) return nbCal
  const cat = classifierConge(c)
  if (cat === 'annuel' || cat === 'recup') return Math.max(0, nbCal - compteJoursOffFixesPeriode(emp, c.date_debut, c.date_fin))
  return nbCal
}

function CongeCard({ c, emp, actions }) {
  const nbCal = nbJours(c.date_debut, c.date_fin)
  const nbDec = joursDecomptesConge(c, emp)
  const typeLabel = formatTypeConge(c.type_conge) || 'Congé'
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a0f0a' }}>{emp?.nom || `Employé #${c.employe_id}`}</div>
          <div style={{ fontSize: 12, color: '#4a3a30', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Calendar size={13} /> du <strong>{fmt(c.date_debut)}</strong> au <strong>{fmt(c.date_fin)}</strong>
            {' · '}
            <strong style={{ color: '#993556' }}>{nbDec} jour{nbDec > 1 ? 's' : ''} décompté{nbDec > 1 ? 's' : ''}</strong>
            {nbCal !== nbDec && (
              <span style={{ fontSize: 11, color: '#8a7a70' }} title={`Calendaire = ${nbCal} j, dont ${nbCal - nbDec} jour(s) off non décompté(s)`}>
                ({nbCal} cal.)
              </span>
            )}
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

  // Types disponibles : on filtre ceux qui ont une allocation événementielle
  // (mariage / naissance / deces / circoncision / maternite / recup).
  const typesAffiches = TYPES.filter(t => {
    if (['annuel','maladie_courte','maladie_longue','sans solde'].includes(t.v)) return true
    const d = dispoTypeConge(solde, t.v)
    return d !== undefined   // undefined = pas d'allocation → on masque
  })
  // Si le type sélectionné disparaît du filtre, on retombe sur 'annuel'.
  useEffect(() => {
    if (!typesAffiches.find(t => t.v === typeConge)) setTypeConge('annuel')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeId])

  const dispoType = dispoTypeConge(solde, typeConge)   // null = illimité, number = limite
  const depassement = typeof dispoType === 'number' && nbDemande > 0 && nbDemande > dispoType

  async function submit() {
    setErrMsg('')
    if (!employeId)               { setErrMsg('Choisis un employé.'); return }
    if (!dateDebut || !dateFin)   { setErrMsg('Indique les dates.'); return }
    if (dateFin < dateDebut)      { setErrMsg('La date de fin est avant la date de début.'); return }
    if (solde && !solde.peutPrendre && typeConge === 'annuel') {
      setErrMsg('Cet employé n\'a pas encore 6 mois d\'ancienneté.'); return
    }
    if (depassement) {
      const label = TYPES.find(t => t.v === typeConge)?.label || typeConge
      setErrMsg(`Le nombre demandé (${nbDemande} j) dépasse le solde « ${label} » (${dispoType} j).`); return
    }
    const debutAlloc = debutPossibleType(solde, typeConge)
    if (debutAlloc && dateDebut < debutAlloc) {
      const label = TYPES.find(t => t.v === typeConge)?.label || typeConge
      setErrMsg(`L'allocation « ${label} » n'est consommable qu'à partir du ${fmt(debutAlloc)}.`); return
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
            <AlertCircle size={13} /> Dépasse le solde « {TYPES.find(t => t.v === typeConge)?.label} » ({dispoType} j dispo).
          </div>
        )}

        <label style={{ ...lbl, marginTop: 10 }}>Type</label>
        <select value={typeConge} onChange={e => setTypeConge(e.target.value)} style={ipt}>
          {typesAffiches.map(t => {
            const d = dispoTypeConge(solde, t.v)
            const suffix = typeof d === 'number' ? ` (${d} j dispo)` : ''
            return <option key={t.v} value={t.v}>{t.label}{suffix}</option>
          })}
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
