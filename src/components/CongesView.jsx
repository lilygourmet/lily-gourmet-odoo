import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { todayISO } from '../lib/dates'
import Skeleton from './Skeleton'
import Avatar from './Avatar'
import { usePersistedState } from '../lib/usePersistedState'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import SearchSelect from './SearchSelect'

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

import { Plus, Check, X, Trash2, Calendar, Palmtree, AlertCircle, Pencil, ChevronRight, Flag, Lock } from 'lucide-react'
import AppHeader from './AppHeader'
import { supabase } from '../lib/supabase'
import { loadEmployes } from '../lib/hr'
import {
  calculSoldeConges, quotaAnnuel,
  loadCongesByStatuts, createDemandeConge,
  validerConge, rejeterConge, annulerConge,
  loadAllocations, createAllocation, cancelAllocation, initAutoAllocationsTous, syncAllocationsAnnuelles,
  validerAllocation, rejeterAllocation,
  ALLOC_TYPES,
  updateAllocation, updateConge, deleteConge,
  uploadJustificatif, getJustificatifUrl,
  dispoTypeConge, debutPossibleType,
} from '../lib/conges'
import {
  loadJoursFeries, createJourFerie, updateJourFerie,
  genererFeriesFixes, compteFeriesHorsOff, feriesListePeriode, joursDecomptesDates,
} from '../lib/joursFeries'
import { imprimerFeuilleConge } from '../lib/feuilleConge'
import ATraiterTab from './HR/ATraiterTab'
import { countATraiter } from '../lib/aTraiter'
import { GROUP_COLORS, groupLabel } from '../lib/presence'
import { CONGE_TYPES as TYPES, formatTypeConge } from '../lib/conges'



// dispoTypeConge / debutPossibleType : déplacés dans lib/conges.js
// (réutilisés par l'onglet « À traiter »).

const MOIS_LABELS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

// Date courte JJ/MM pour les relevés (colonnes étroites)
const fmtCourt = d => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '')

function fmt(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// Couleur d'une pastille selon le type de congé.
function typeCongeCouleur(t) {
  const s = String(t || '').toLowerCase()
  if (s.includes('maladie')) return { bg: '#FCEBEB', fg: '#A32D2D' }
  if (s.includes('recup') || s.includes('récup')) return { bg: '#E6F1FB', fg: '#1456a0' }
  if (s.includes('annuel')) return { bg: '#F7E3EA', fg: '#993556' }
  if (s.includes('sans')) return { bg: '#ECECEC', fg: '#555' }
  return { bg: '#E3F3E4', fg: '#2E7D32' }   // événements (mariage, naissance…)
}

// Calendrier d'équipe : vue mois, qui est en congé (lecture seule).
const TEAMS_CONGES = Object.keys(GROUP_COLORS).filter(g => g !== 'Aucun')

function CalendrierEquipe({ valides, empById, nameById = {}, isMobile }) {
  const now = new Date()
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() }) // m : 0-11
  const [filterGroup, setFilterGroup] = useState(null)
  const { y, m } = cur
  const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
  const pad = n => String(n).padStart(2, '0')
  const nbJoursMois = new Date(y, m + 1, 0).getDate()
  const premierJour = (new Date(y, m, 1).getDay() + 6) % 7   // 0 = Lundi
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const prev = () => setCur(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const next = () => setCur(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })
  const congesJour = d => {
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`
    return valides.filter(c => c.date_debut <= ds && c.date_fin >= ds
      && (!filterGroup || empById[c.employe_id]?.groupe === filterGroup))
  }

  const cellules = []
  for (let i = 0; i < premierJour; i++) cellules.push(null)
  for (let d = 1; d <= nbJoursMois; d++) cellules.push(d)

  const btn = { padding: '6px 12px', borderRadius: 8, border: '1px solid #e5d8c3', background: 'white', cursor: 'pointer', color: '#4a3a30', fontSize: 14 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
        <button onClick={prev} style={btn}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#1a0f0a', minWidth: 180, textAlign: 'center' }}>{MOIS[m]} {y}</div>
        <button onClick={next} style={btn}>›</button>
      </div>

      {/* Filtre par groupe — mêmes couleurs et libellés que l'onglet Présence */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 14 }}>
        <button onClick={() => setFilterGroup(null)}
          style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (filterGroup ? '#e4dad0' : '#993556'),
            background: filterGroup ? '#fff' : '#993556', color: filterGroup ? '#4a3a30' : '#fff' }}>
          Toutes
        </button>
        {TEAMS_CONGES.map(g => {
          const on = filterGroup === g
          return (
            <button key={g} onClick={() => setFilterGroup(on ? null : g)}
              style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: '1px solid ' + (on ? GROUP_COLORS[g] : '#e4dad0'),
                background: on ? GROUP_COLORS[g] : '#fff', color: on ? '#fff' : '#4a3a30' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: on ? '#fff' : GROUP_COLORS[g] }} />
              {groupLabel(g)}
            </button>
          )
        })}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: isMobile ? 680 : 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {JOURS.map(j => <div key={j} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#8a7a70', padding: '4px 0' }}>{j}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cellules.map((d, i) => {
              if (d === null) return <div key={`v${i}`} />
              const ds = `${y}-${pad(m + 1)}-${pad(d)}`
              const list = congesJour(d)
              const isToday = ds === todayStr
              // clash = 2+ absents du MÊME groupe le même jour (un seul groupe en sous-effectif)
              const byGroupe = {}
              for (const c of list) {
                const g = empById[c.employe_id]?.groupe || '—'
                byGroupe[g] = (byGroupe[g] || 0) + 1
              }
              const clashEntry = Object.entries(byGroupe).find(([, n]) => n >= 2)
              const clash = !!clashEntry
              const borderCol = isToday ? '#993556' : (clash ? '#d97706' : '#eee4d4')
              const bgCol = isToday ? '#fdf6f0' : (clash ? '#fff7ed' : 'white')
              return (
                <div key={d} style={{ minHeight: 84, border: (clash ? '2px' : '1px') + ' solid ' + borderCol, borderRadius: 8, padding: 5, background: bgCol, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isToday ? '#993556' : '#8a7a70' }}>{d}</span>
                    {clash && <span title={`${clashEntry[1]} absents du groupe « ${clashEntry[0]} »`} style={{ fontSize: 9, fontWeight: 700, color: '#b45309', background: '#fde68a', borderRadius: 6, padding: '1px 5px' }}>⚠ {clashEntry[1]}</span>}
                  </div>
                  {list.slice(0, 4).map(c => {
                    const col = typeCongeCouleur(c.type_conge)
                    const nom = empById[c.employe_id]?.nom || nameById[c.employe_id] || '?'
                    return (
                      <div key={c.id} title={`${nom} · ${c.type_conge}`} style={{ background: col.bg, color: col.fg, fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
                    )
                  })}
                  {list.length > 4 && <div style={{ fontSize: 9, color: '#8a7a70' }}>+{list.length - 4}</div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, fontSize: 11, color: '#4a3a30' }}>
        {[['annuel', 'Annuel'], ['maladie', 'Maladie'], ['recup', 'Récup'], ['mariage', 'Événement'], ['sans', 'Sans solde']].map(([t, lab]) => {
          const col = typeCongeCouleur(t)
          return <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: col.bg, border: '1px solid ' + col.fg }} /> {lab}</span>
        })}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fde68a', borderRadius: 6, padding: '1px 5px' }}>⚠ 2</span> 2+ absents du même groupe</span>
      </div>
    </div>
  )
}
function nbJours(start, end) {
  if (!start || !end) return 0
  return Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1
}
function jourSemaine(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long' }) : ''
}

export default function CongesView({ user, activeView, onNavigate, onLogout, embedded = false, congesTab = null }) {
  const isAdmin = user?.role === 'admin'
  // RH (perm_hr) : peut voir et IMPRIMER les congés, mais pas modifier/supprimer/valider.
  const canImprimerFeuille = isAdmin || !!user?.perm_hr
  // RH (perm_hr) : peut modifier/supprimer un congé TANT QU'IL N'EST PAS VALIDÉ.
  const canManagePending = isAdmin || !!user?.perm_hr
  const [aTraiterCount, setATraiterCount] = useState(0)
  const [employes, setEmployes]     = useState([])
  const [nomsTous, setNomsTous]     = useState([])  // id->nom de TOUS les employés (même partis/fantômes), pour afficher le nom
  const [conges, setConges]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [soldes, setSoldes]         = useState({})  // empId -> { dispo, ... }
  const [tab, setTab]               = usePersistedState('lily.conges.tab', 'demandes')  // 'demandes' | 'valides' | 'soldes'
  useEffect(() => { if (congesTab) setTab(congesTab) }, [congesTab])  // ouverture d'un sous-onglet depuis le menu de gauche
  const [soldeSearch, setSoldeSearch] = useState('')  // recherche dans « Soldes employés »
  const [filterEmp, setFilterEmp]   = useState('all')   // 'all' | empId
  const [filterYear, setFilterYear] = useState('all')   // 'all' | YYYY
  const [onlyUnsigned, setOnlyUnsigned] = useState(false)  // n'afficher que les congés pas encore signés
  const [allocations, setAllocations]   = useState([])    // table conges_allocations
  const [showAllocForm, setShowAllocForm] = useState(false)
  const [detailEmp, setDetailEmp]         = useState(null)  // employé sélectionné pour voir le détail
  const [editAlloc, setEditAlloc]         = useState(null)  // allocation en cours d'édition
  const [editConge, setEditConge]         = useState(null)  // congé en cours d'édition
  const [selDem, setSelDem]               = useState(() => new Set())  // demandes cochées (validation groupée)
  const [selAlloc, setSelAlloc]           = useState(() => new Set())  // allocations cochées (validation groupée)
  const [joursFeries, setJoursFeries]     = useState([])    // table jours_feries
  const [feriesYear, setFeriesYear]       = useState(new Date().getFullYear())
  const [showFerieForm, setShowFerieForm] = useState(false)
  const [editFerie, setEditFerie]         = useState(null)  // jour férié en cours d'édition
  const isMobile = useIsMobile()
  const allocsSyncRef = useRef(false)   // la remise à jour des allocations ne tourne qu'une fois
  const [conversions, setConversions] = useState([])   // heures converties en jours

  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const annee = new Date().getFullYear()
      // 4 requêtes batchées au lieu de 2 par employé.
      const [emps, all, allocs, recupRows, feries, noms, convRows] = await Promise.all([
        loadEmployes(true, true),   // exclut les employés fantômes des congés/soldes
        loadCongesByStatuts(['demande', 'valide', 'rejete', 'annule'], `${annee - 1}-01-01`),
        loadAllocations({ annee, statut: ['valide', 'attente'] }),
        supabase.from('pointages_mois').select('employe_id, jours_recup').eq('annee', annee),
        loadJoursFeries(),
        supabase.from('employes').select('id, nom'),   // TOUS les noms (partis/fantômes inclus) pour l'affichage
        // Conversions d'heures en jours : celles passées en SANS SOLDE ne créent
        // aucune allocation, il faut les lire ici pour les montrer dans le récap.
        supabase.from('heures_conversions').select('*').eq('annee', annee),
      ])
      const empsActifs = emps.filter(e => e.actif !== false)

      // L'annuel accumulé grandit chaque mois : on remet les allocations AUTO à
      // jour une fois par ouverture d'écran, sinon elles restent figées à leur
      // valeur de création (et les nouvelles recrues n'en ont aucune).
      // Admin uniquement, et une seule fois : ce sont des écritures.
      if (isAdmin && !allocsSyncRef.current) {
        allocsSyncRef.current = true
        try {
          const { maj, cree } = await syncAllocationsAnnuelles(empsActifs, annee, user.id)
          if (maj + cree > 0) {
            const fresh = await loadAllocations({ annee, statut: ['valide', 'attente'] })
            allocs.length = 0
            allocs.push(...fresh)
          }
        } catch (e) { console.warn('[syncAllocationsAnnuelles]', e?.message || e) }
      }

      setEmployes(empsActifs)
      setNomsTous(noms?.data || [])
      setConversions(convRows?.data || [])
      setConges(all)
      setAllocations(allocs)
      setJoursFeries(feries)
      const feriesSetLocal = new Set(feries.map(f => f.date))

      // Backfill : on calcule jours_decomptes en mémoire IMMÉDIATEMENT (utilisé
      // pour le rendu), puis on persiste en BDD en arrière-plan (non bloquant).
      const empMap = new Map(empsActifs.map(e => [e.id, e]))
      const aFigerPayload = []
      for (const c of all) {
        if (c.statut !== 'valide') continue
        if (c.jours_decomptes !== null && c.jours_decomptes !== undefined) continue
        const emp = empMap.get(c.employe_id)
        if (!emp) continue
        const jd = joursDecomptesCalcul(c, emp, feriesSetLocal)
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
      const prefetched = { allocsByEmp, recupByEmp, feriesSet: feriesSetLocal }

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
  useEffect(() => { if (canManagePending) countATraiter().then(setATraiterCount).catch(() => {}) }, [canManagePending])

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
      if (onlyUnsigned && c.signe) return false
      return true
    })
    const map = new Map() // YYYY-MM -> [c]
    for (const c of filtered) {
      // Rattaché au mois de sa DATE DE DÉBUT (compté en entier là, pas recompté le mois suivant).
      const key = c.date_debut.slice(0, 7)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(c)
    }
    // Tri descendant (mois le plus récent en premier)
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [valides, filterEmp, filterYear, onlyUnsigned])

  function fmtMonthLabel(key) {
    const [y, m] = key.split('-')
    const moisLong = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
    return `${moisLong[parseInt(m, 10) - 1]} ${y}`
  }

  const empById = useMemo(() => Object.fromEntries(employes.map(e => [e.id, e])), [employes])
  // Noms de TOUS les employés (même partis/fantômes), pour ne jamais afficher « Employé #x ».
  const nameById = useMemo(() => Object.fromEntries(nomsTous.map(e => [e.id, e.nom])), [nomsTous])
  const feriesSet = useMemo(() => new Set(joursFeries.map(f => f.date)), [joursFeries])

  // Imprime la feuille de congé : calcule les allocations de récup de l'employé
  // et la récup déjà consommée par ses congés récup ANTÉRIEURS (FIFO).
  function imprimerFeuille(c) {
    const emp = empById[c.employe_id]
    const recupAllocs = allocations.filter(a => a.employe_id === c.employe_id && (a.type === 'autre' || a.type === 'recup') && a.statut === 'valide')
    const yearStart = c.date_debut.slice(0, 4) + '-01-01'
    const recupDejaConsomme = conges
      .filter(x => x.employe_id === c.employe_id && x.statut === 'valide' && classifierConge(x) === 'recup'
        && x.date_debut >= yearStart && x.date_debut < c.date_debut)
      .reduce((s, x) => s + joursDecomptesConge(x, emp, feriesSet), 0)
    imprimerFeuilleConge({ conge: c, emp, solde: soldes[c.employe_id], joursFeries, recupAllocs, recupDejaConsomme })
  }

  // Le solde ne compte QUE les congés validés : plusieurs demandes peuvent donc
  // passer le contrôle de création alors qu'ensemble elles dépassent le solde.
  // On avertit ici, au dernier moment — sans bloquer : un congé peut être accordé
  // exceptionnellement au-delà du solde, c'est la décision de l'admin.
  function alerteSolde(list) {
    const parEmp = new Map()
    for (const c of list) {
      const jd = (c.jours_decomptes != null) ? Number(c.jours_decomptes) : joursDecomptesCalcul(c, empById[c.employe_id], feriesSet)
      const e = parEmp.get(c.employe_id) || { jours: 0 }
      e.jours += jd
      parEmp.set(c.employe_id, e)
    }
    const negatifs = []
    for (const [empId, { jours }] of parEmp) {
      const dispo = soldes[empId]?.dispo
      if (typeof dispo !== 'number') continue
      const apres = dispo - jours
      if (apres < 0) negatifs.push(`${empById[empId]?.nom || '?'} : ${dispo.toFixed(1)} j dispo − ${jours} j → ${apres.toFixed(1)} j`)
    }
    if (!negatifs.length) return ''
    return `\n\n⚠️ SOLDE DÉPASSÉ\n${negatifs.join('\n')}\n\nValider quand même ?`
  }

  async function handleValider(c) {
    if (!await confirmDialog(`Valider le congé de ${empById[c.employe_id]?.nom || '?'} du ${fmt(c.date_debut)} au ${fmt(c.date_fin)} ?\n\nUne notification WhatsApp sera envoyée à l'employé.${alerteSolde([c])}`, { confirmLabel: 'Valider' })) return
    try {
      const jd = (c.jours_decomptes != null) ? Number(c.jours_decomptes) : joursDecomptesCalcul(c, empById[c.employe_id], feriesSet)
      await validerConge(c.id, user.id, jd); await reload()
    }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  // Validation SILENCIEUSE : aucun WhatsApp (validation interne / rattrapage).
  async function handleValiderSilencieux(c) {
    if (!await confirmDialog(`Valider ce congé SANS prévenir l'employé ?\n\nAucun WhatsApp ne sera envoyé (validation interne).${alerteSolde([c])}`, { confirmLabel: 'Valider sans notif' })) return
    try {
      const jd = (c.jours_decomptes != null) ? Number(c.jours_decomptes) : joursDecomptesCalcul(c, empById[c.employe_id], feriesSet)
      await validerConge(c.id, user.id, jd, true); await reload()
    }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  // Début d'une allocation sans date d'événement : le 1er janvier, sauf pour
  // quelqu'un entré en cours d'année — afficher « du 01/01 » n'a alors aucun
  // sens, on part de sa date d'entrée.
  const debutAllocation = (a, emp) => {
    if (a.date_evt) return a.date_evt
    const janvier = `${a.annee}-01-01`
    const entree = emp?.date_anciennete || emp?.date_entree
    return entree && entree > janvier && entree <= `${a.annee}-12-31` ? entree : janvier
  }

  const toggleSel = (set, setter, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n) }
  // validation GROUPÉE des demandes de congé cochées
  async function handleValiderLot() {
    const list = demandes.filter(c => selDem.has(c.id))
    if (!list.length) return
    if (!await confirmDialog(`Valider ${list.length} demande(s) de congé ?\n\nUne notification WhatsApp sera envoyée à chaque employé.${alerteSolde(list)}`, { confirmLabel: 'Tout valider' })) return
    try {
      for (const c of list) { const jd = (c.jours_decomptes != null) ? Number(c.jours_decomptes) : joursDecomptesCalcul(c, empById[c.employe_id], feriesSet); await validerConge(c.id, user.id, jd) }
      setSelDem(new Set()); await reload(); toast.success(`${list.length} congé(s) validé(s).`)
    } catch (e) { toast.error('Erreur : ' + e.message); await reload() }
  }
  async function handleRejeter(c) {
    if (!await confirmDialog(`Rejeter cette demande ?\n\nUne notification WhatsApp sera envoyée à l'employé.`, { danger: true, confirmLabel: 'Rejeter' })) return
    try { await rejeterConge(c.id, user.id); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function handleAnnuler(c) {
    if (!await confirmDialog(`Annuler ce congé validé ?\n\nUne notification WhatsApp sera envoyée à l'employé.`, { danger: true, confirmLabel: 'Annuler le congé' })) return
    try { await annulerConge(c.id, user.id); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  // Annulation SILENCIEUSE : aucun WhatsApp (pour corriger une saisie interne).
  async function handleAnnulerSilencieux(c) {
    if (!await confirmDialog(`Annuler ce congé SANS prévenir l'employé ?\n\nAucun WhatsApp ne sera envoyé (correction interne). Les jours reviennent au solde.`, { danger: true, confirmLabel: 'Annuler sans notif' })) return
    try { await annulerConge(c.id, user.id, true); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  // Supprime une demande NON validée (perm_hr ou admin).
  async function handleDeletePending(c) {
    if (!await confirmDialog(`Supprimer cette demande de congé ?\n\n${empById[c.employe_id]?.nom || ''} · du ${fmt(c.date_debut)} au ${fmt(c.date_fin)}`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteConge(c.id); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleAddAllocation(payload) {
    try {
      // RH (non-admin) : l'allocation passe en 'attente' jusqu'à validation admin.
      const statut = isAdmin ? 'valide' : 'attente'
      await createAllocation({ ...payload, created_by: user.id, statut })
      setShowAllocForm(false)
      await reload()
      if (!isAdmin) toast.success('Allocation enregistrée. Elle sera visible une fois validée par un admin.')
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  async function handleValiderAlloc(a) {
    if (!await confirmDialog(`Valider l'allocation de ${empById[a.employe_id]?.nom || '?'} (${a.jours} j · ${a.type}) ?`, { confirmLabel: 'Valider' })) return
    try { await validerAllocation(a.id, user.id); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  // validation GROUPÉE des allocations cochées
  // Employés actifs sans aucune allocation « annuel » : arrivés après la dernière
  // génération en lot (rien ne les crée automatiquement avant ce jour).
  const sansAlloc = employes.filter(e =>
    !allocations.some(a => a.employe_id === e.id && a.type === 'annuel' && a.statut !== 'annule'))

  async function handleCreerAllocsManquantes() {
    if (!await confirmDialog(`Créer les allocations de congé pour ${sansAlloc.length} employé(s) sans allocation annuelle ?\n\n${sansAlloc.map(e => e.nom).join(', ')}\n\nLe nombre de jours est calculé selon leur ancienneté : 1,5 j par mois écoulé.`, { confirmLabel: 'Créer' })) return
    try {
      const n = await initAutoAllocationsTous(sansAlloc, new Date().getFullYear(), user.id)
      toast.success(`${n} allocation(s) créée(s).`)
      await reload()
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleValiderAllocLot() {
    const list = allocations.filter(a => a.statut === 'attente' && selAlloc.has(a.id))
    if (!list.length) return
    if (!await confirmDialog(`Valider ${list.length} allocation(s) ?`, { confirmLabel: 'Tout valider' })) return
    try { for (const a of list) await validerAllocation(a.id, user.id); setSelAlloc(new Set()); await reload(); toast.success(`${list.length} allocation(s) validée(s).`) }
    catch (e) { toast.error('Erreur : ' + e.message); await reload() }
  }
  async function handleRejeterAlloc(a) {
    if (!await confirmDialog(`Rejeter l'allocation de ${empById[a.employe_id]?.nom || '?'} (${a.jours} j · ${a.type}) ?`, { danger: true, confirmLabel: 'Rejeter' })) return
    try { await rejeterAllocation(a.id, user.id); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleUpdateAllocation(id, patch) {
    try { await updateAllocation(id, patch); setEditAlloc(null); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleUpdateConge(id, patch) {
    try { await updateConge(id, patch); setEditConge(null); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  // Marque/démarque un congé comme « signé par l'employé » (feuille de congé).
  async function handleToggleSigne(c) {
    try { await updateConge(c.id, { signe: !c.signe }); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleCancelAllocation(a) {
    const lbl = (ALLOC_TYPES.find(t => t.v === a.type)?.label) || a.type
    if (!await confirmDialog(`Annuler cette allocation ?\n\n${lbl} · ${a.jours} j${a.raison ? ` · ${a.raison}` : ''}`, { danger: true, confirmLabel: 'Annuler' })) return
    try { await cancelAllocation(a.id); await reload() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function handleSaveFerie(payload) {
    try {
      if (editFerie) await updateJourFerie(editFerie.id, payload)
      else           await createJourFerie(payload)
      setShowFerieForm(false); setEditFerie(null); await reload()
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function handleGenererFixes() {
    try {
      const n = await genererFeriesFixes(feriesYear)
      await reload()
      toast.success(n > 0
        ? `${n} jour(s) férié(s) fixe(s) ajouté(s) pour ${feriesYear}.`
        : `Tous les fériés fixes de ${feriesYear} sont déjà présents.`)
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  return (
    <>
      {!embedded && <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: embedded ? 0 : (isMobile ? '14px 10px 80px' : '20px 16px 72px') }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          {embedded ? <div /> : (
            <h1 style={{ fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontSize: 26, margin: 0, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Palmtree size={22} /> Congés
            </h1>
          )}
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
          <Tab active={tab === 'recap'} onClick={() => setTab('recap')}>Récap annuel</Tab>
          <Tab active={tab === 'equipe'} onClick={() => setTab('equipe')}><Calendar size={13} /> Calendrier équipe</Tab>
          {canManagePending && (
            <Tab active={tab === 'a_traiter'} onClick={() => setTab('a_traiter')}>
              <AlertCircle size={13} /> À traiter {aTraiterCount > 0 && <span style={badge}>{aTraiterCount}</span>}
            </Tab>
          )}
          {isAdmin && (
            <Tab active={tab === 'feries'} onClick={() => setTab('feries')}>
              <Flag size={13} /> Jours fériés
            </Tab>
          )}
        </div>

        {error && <div style={errBox}>{error}</div>}
        {loading && <Skeleton rows={5} />}

        {!loading && tab === 'demandes' && (
          demandes.length === 0
            ? <div style={emptyBox}>Aucune demande en attente.</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {isAdmin && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '4px 2px' }}>
                    <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer', color: '#4a3a30' }}>
                      <input type="checkbox" checked={selDem.size === demandes.length && demandes.length > 0} onChange={e => setSelDem(e.target.checked ? new Set(demandes.map(c => c.id)) : new Set())} style={{ width: 16, height: 16 }} />
                      Tout cocher
                    </label>
                    <button onClick={handleValiderLot} disabled={!selDem.size} style={{ ...btnValider, opacity: selDem.size ? 1 : 0.45, cursor: selDem.size ? 'pointer' : 'default' }}><Check size={14} /> Valider la sélection ({selDem.size})</button>
                  </div>
                )}
                {demandes.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    {isAdmin && <input type="checkbox" checked={selDem.has(c.id)} onChange={() => toggleSel(selDem, setSelDem, c.id)} style={{ width: 18, height: 18, marginTop: 14, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <CongeCard
                        c={c} emp={empById[c.employe_id]} nameById={nameById} joursFeries={joursFeries}
                        actions={canImprimerFeuille ? (
                          <>
                            <button onClick={() => imprimerFeuille(c)} style={btnSlim} title="Imprimer la feuille de congé">📄 Feuille</button>
                            {canManagePending && <button onClick={() => setEditConge(c)} style={btnSlim} title="Modifier (non validé)"><Pencil size={13} /></button>}
                            {isAdmin && <button onClick={() => handleValider(c)} style={btnValider}><Check size={14} /> Valider</button>}
                            {isAdmin && <button onClick={() => handleValiderSilencieux(c)} style={btnSlim} title="Valider sans envoyer de WhatsApp à l'employé"><Check size={13} /> Sans notif</button>}
                            {isAdmin && <button onClick={() => handleRejeter(c)} style={btnRejeter}><X size={14} /> Rejeter</button>}
                            {canManagePending && <button onClick={() => handleDeletePending(c)} style={btnRejeter} title="Supprimer la demande"><Trash2 size={14} /></button>}
                          </>
                        ) : null}
                      />
                    </div>
                  </div>
                ))}
              </div>
        )}

        {!loading && tab === 'valides' && (
          <>
            {/* Barre de filtres */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Employé</div>
                <SearchSelect value={filterEmp} onChange={v => setFilterEmp(v)} placeholder="Tous les employés" inputStyle={{ ...ipt, minWidth: 180 }}
                  options={[{ value: 'all', label: 'Tous les employés' }, ...employes.map(e => ({ value: String(e.id), label: e.nom }))]} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Année</div>
                <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{ ...ipt, width: 'auto', minWidth: 110 }}>
                  <option value="all">Toutes</option>
                  {annees.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button onClick={() => setOnlyUnsigned(v => !v)}
                style={{ ...btnSlim, alignSelf: 'flex-end', display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: onlyUnsigned ? '#7a1f3d' : '#fff', color: onlyUnsigned ? '#fff' : '#4a3a30', borderColor: onlyUnsigned ? '#7a1f3d' : undefined }}>
                ✍️ Non signés seulement
              </button>
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
                    // Total jours décomptés du mois (congé entier rattaché à son mois de début)
                    const totalJ = list.reduce((s, c) => s + joursDecomptesConge(c, empById[c.employe_id], feriesSet), 0)
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
                              key={c.id} c={c} emp={empById[c.employe_id]} nameById={nameById} joursFeries={joursFeries}
                              actions={canImprimerFeuille ? <>
                      <button onClick={() => imprimerFeuille(c)} style={btnSlim} title="Imprimer la feuille de congé">📄 Feuille</button>
                      <button onClick={() => handleToggleSigne(c)}
                        style={c.signe
                          ? { ...btnSlim, background: '#DCF0E2', color: '#085041', borderColor: '#B6E2C8' }
                          : { ...btnSlim, color: '#a9620a', borderColor: '#f0d9b8' }}
                        title={c.signe ? 'Feuille signée par l\'employé — cliquer pour annuler' : 'Marquer la feuille comme signée par l\'employé'}>
                        {c.signe ? '✓ Signé' : '☐ À signer'}
                      </button>
                      {isAdmin && <button onClick={() => setEditConge(c)} style={btnSlim} title="Modifier ce congé"><Pencil size={13} /></button>}
                      {isAdmin && <button onClick={() => handleAnnuler(c)} style={btnRejeter}><Trash2 size={14} /> Annuler</button>}
                      {isAdmin && <button onClick={() => handleAnnulerSilencieux(c)} style={btnSlim} title="Annuler sans envoyer de WhatsApp à l'employé (correction interne)"><Trash2 size={13} /> Sans notif</button>}
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
              {isAdmin && sansAlloc.length > 0 && (
                <button onClick={handleCreerAllocsManquantes}
                  style={{ ...btnPrimary, background: '#854F0B' }}
                  title={sansAlloc.map(e => e.nom).join(', ')}>
                  <AlertCircle size={14} /> {sansAlloc.length} sans allocation annuelle
                </button>
              )}
              <div style={{ flex: 1 }} />
              <div>
                <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Filtrer employé</div>
                <SearchSelect value={filterEmp} onChange={v => setFilterEmp(v)} placeholder="Tous les employés" inputStyle={{ ...ipt, minWidth: 180 }}
                  options={[{ value: 'all', label: 'Tous les employés' }, ...employes.map(e => ({ value: String(e.id), label: e.nom }))]} />
              </div>
            </div>

            {/* Allocations en ATTENTE de validation (visibles seulement pour admin) */}
            {isAdmin && allocations.some(a => a.statut === 'attente') && (
              <div style={{ background: '#FFF7E0', border: '0.5px solid #F0D89A', borderRadius: 12, padding: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#854F0B', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  ⏳ Allocations en attente de validation
                  {(() => { const pend = allocations.filter(a => a.statut === 'attente'); return (
                    <>
                      <label style={{ fontSize: 11, fontWeight: 500, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selAlloc.size === pend.length && pend.length > 0} onChange={e => setSelAlloc(e.target.checked ? new Set(pend.map(a => a.id)) : new Set())} /> Tout
                      </label>
                      <button onClick={handleValiderAllocLot} disabled={!selAlloc.size} style={{ ...btnValider, padding: '4px 10px', fontSize: 11, opacity: selAlloc.size ? 1 : 0.45, cursor: selAlloc.size ? 'pointer' : 'default' }}><Check size={12} /> Valider la sélection ({selAlloc.size})</button>
                    </>
                  ) })()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {allocations.filter(a => a.statut === 'attente').sort((x, y) => (y.date_evt || `${y.annee}-01-01`).localeCompare(x.date_evt || `${x.annee}-01-01`)).map(a => {
                    const emp = empById[a.employe_id]
                    const t = ALLOC_TYPES.find(x => x.v === a.type)
                    const debutAlloc = debutAllocation(a, emp)
                    const finAlloc   = `${a.annee}-12-31`
                    return (
                      <div key={a.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, background: 'white', padding: '6px 10px', borderRadius: 8 }}>
                        <input type="checkbox" checked={selAlloc.has(a.id)} onChange={() => toggleSel(selAlloc, setSelAlloc, a.id)} style={{ width: 16, height: 16 }} />
                        <strong>{emp?.nom || nameById[a.employe_id] || `#${a.employe_id}`}</strong>
                        <span>· {t?.label || a.type}</span>
                        <span style={{ color: Number(a.jours) < 0 ? '#A32D2D' : '#085041', fontWeight: 600 }}>{Number(a.jours) > 0 ? '+' : ''}{a.jours} j</span>
                        <span style={{ color: '#4a3a30', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} />
                          du {debutAlloc.slice(8,10)}/{debutAlloc.slice(5,7)}/{debutAlloc.slice(0,4)} au {finAlloc.slice(8,10)}/{finAlloc.slice(5,7)}/{finAlloc.slice(0,4)}
                        </span>
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
                          <div style={{ fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10 }}><Avatar emp={emp} size={56} style={{ objectPosition: '50% 22%' }} />{emp.nom}{emp.poste ? <span style={{ fontWeight: 400, fontSize: 12, color: '#8a7a70' }}> · {emp.poste}</span> : null}</div>
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
                          {allocs.slice().sort((x, y) => (y.date_evt || `${y.annee}-01-01`).localeCompare(x.date_evt || `${x.annee}-01-01`)).map(a => {
                            const t = ALLOC_TYPES.find(t => t.v === a.type)
                            const debutAlloc = debutAllocation(a, emp)
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
                                        <span style={{ color: Number(a.jours) < 0 ? '#A32D2D' : '#085041', fontWeight: 600 }}>{Number(a.jours) > 0 ? '+' : ''}{a.jours} j</span>
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
                                    <div style={{ color: Number(a.jours) < 0 ? '#A32D2D' : '#085041', fontWeight: 600 }}>{Number(a.jours) > 0 ? '+' : ''}{a.jours} j</div>
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
            <input
              type="text"
              value={soldeSearch}
              onChange={e => setSoldeSearch(e.target.value)}
              placeholder="🔍 Chercher un employé…"
              style={{ width: '100%', maxWidth: 360, padding: '9px 12px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 8, boxSizing: 'border-box', marginBottom: 6 }}
            />
            {!isMobile && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 90px 90px 110px', gap: 8, padding: '10px 14px', fontSize: 10, fontWeight: 600, color: '#4a3a30', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <div>Employé</div>
                <div title="Annuel permis + reliquat + événements applicables (hors maladie ≤ 3 j)">Total allocations</div>
                <div title="Report N-1 (expire le 30 mai)">Reliquat</div>
                <div title="Jours déjà pris (annuel + événements)">Pris</div>
                <div style={{ textAlign: 'right' }} title="Allocations accumulé + récup − pris">Dispo</div>
              </div>
            )}
            {employes.filter(e => !soldeSearch.trim() || String(e.nom).toLowerCase().includes(soldeSearch.trim().toLowerCase())).map(e => {
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

        {!loading && tab === 'feries' && isAdmin && (() => {
          const nowY = new Date().getFullYear()
          const yearsRange = Array.from(new Set([
            nowY - 1, nowY, nowY + 1, nowY + 2,
            ...joursFeries.map(f => Number(f.date.slice(0, 4))),
          ])).sort((a, b) => a - b)
          const feriesOfYear = joursFeries
            .filter(f => f.date.slice(0, 4) === String(feriesYear))
            .sort((a, b) => a.date.localeCompare(b.date))
          return (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Année</div>
                  <select value={feriesYear} onChange={e => setFeriesYear(Number(e.target.value))} style={{ ...ipt, width: 'auto', minWidth: 100 }}>
                    {yearsRange.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={handleGenererFixes} style={btnSlim}>Générer les fériés fixes {feriesYear}</button>
                <button onClick={() => { setEditFerie(null); setShowFerieForm(true) }} style={btnPrimary}><Plus size={14} /> Ajouter</button>
              </div>

              {feriesOfYear.length === 0
                ? <div style={emptyBox}>Aucun jour férié pour {feriesYear}. Clique « Générer les fériés fixes » pour ajouter les fériés officiels, ou « Ajouter » pour un férié lunaire (Aïd, Mouloud…).</div>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {feriesOfYear.map(f => (
                      <div key={f.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr auto' : '210px 1fr 90px auto', gap: 10, alignItems: 'center', padding: '9px 14px', background: 'white', border: '0.5px solid #e5d8c3', borderRadius: 12, boxShadow: '0 2px 8px rgba(122,42,68,0.05)' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a0f0a' }}>
                          {fmt(f.date)} <span style={{ fontWeight: 400, color: '#8a7a70' }}>({jourSemaine(f.date)})</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#1a0f0a' }}>
                          {f.nom}
                          {isMobile && (
                            <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', borderRadius: 999, background: f.type === 'lunaire' ? '#FFF3D6' : '#E6F1FB', color: f.type === 'lunaire' ? '#8a6d00' : '#0C447C' }}>
                              {f.type === 'lunaire' ? 'Lunaire' : 'Fixe'}
                            </span>
                          )}
                        </div>
                        {!isMobile && (
                          <div>
                            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, background: f.type === 'lunaire' ? '#FFF3D6' : '#E6F1FB', color: f.type === 'lunaire' ? '#8a6d00' : '#0C447C', fontWeight: 500 }}>
                              {f.type === 'lunaire' ? 'Lunaire' : 'Fixe'}
                            </span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                          {f.type === 'lunaire' ? (
                            <button onClick={() => { setEditFerie(f); setShowFerieForm(true) }} title="Modifier"
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4a3a30', padding: 4 }}>
                              <Pencil size={14} />
                            </button>
                          ) : (
                            <span title="Férié fixe (verrouillé)" style={{ color: '#b8ad9e', display: 'inline-flex', padding: 4 }}>
                              <Lock size={14} />
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              <div style={{ marginTop: 14, padding: '10px 12px', background: '#FAF6F0', borderRadius: 10, fontSize: 12, color: '#4a3a30' }}>
                <strong>Fixe</strong> = même date chaque année (Fête du Trône, 1er mai…). Le bouton « Générer » les ajoute d'un coup.<br />
                <strong>Lunaire</strong> = dépend de la lune (Aïd, Mouloud, 1er Moharram) : les dates changent chaque année, <strong>à confirmer / ajuster manuellement</strong>.
              </div>
            </>
          )
        })()}

        {!loading && tab === 'a_traiter' && canManagePending && (
          <ATraiterTab user={user} onChange={setATraiterCount} />
        )}

        {!loading && tab === 'recap' && (
          <RecapAnnuel
            employes={employes} conges={conges} allocations={allocations}
            conversions={conversions} feriesSet={feriesSet} isMobile={isMobile}
          />
        )}

        {!loading && tab === 'equipe' && (
          <CalendrierEquipe valides={valides} empById={empById} nameById={nameById} isMobile={isMobile} />
        )}
      </div>

      {showForm && (
        <NouvelleDemandeModal
          employes={employes}
          soldes={soldes}
          user={user}
          joursFeries={joursFeries}
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
          joursFeries={joursFeries}
          canEditStatut={isAdmin}
          recupAllocs={allocations.filter(a => a.employe_id === editConge.employe_id && a.type === 'autre' && a.statut === 'valide')}
          onClose={() => setEditConge(null)}
          onSave={patch => handleUpdateConge(editConge.id, patch)}
        />
      )}

      {showFerieForm && (
        <FerieModal
          ferie={editFerie}
          onClose={() => { setShowFerieForm(false); setEditFerie(null) }}
          onSave={handleSaveFerie}
        />
      )}
    </>
  )
}

function FerieModal({ ferie, onClose, onSave }) {
  const [date, setDate] = useState(ferie?.date || '')
  const [nom, setNom]   = useState(ferie?.nom || '')
  const [type, setType] = useState(ferie?.type || 'fixe')
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  async function submit() {
    setErr('')
    if (!date)        { setErr('Indique la date.'); return }
    if (!nom.trim())  { setErr('Indique le nom du jour férié.'); return }
    setBusy(true)
    try { await onSave({ date, nom: nom.trim(), type }) }
    catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Flag size={18} /> {ferie ? 'Modifier le jour férié' : 'Ajouter un jour férié'}
        </div>

        <label style={lbl}>Date</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={ipt} />
        {date && <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>{jourSemaine(date)}</div>}

        <label style={{ ...lbl, marginTop: 10 }}>Nom</label>
        <input type="text" value={nom} onChange={e => setNom(e.target.value)} placeholder="ex : Aïd al-Fitr, Fête du Trône…" style={ipt} />

        <label style={{ ...lbl, marginTop: 10 }}>Type</label>
        <select value={type} onChange={e => setType(e.target.value)} style={ipt}>
          <option value="fixe">Fixe (même date chaque année)</option>
          <option value="lunaire">Lunaire (date variable : Aïd, Mouloud…)</option>
        </select>

        {err && <div style={errBox}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={busy} style={btnSlim}>Annuler</button>
          <button onClick={submit} disabled={busy} style={btnPrimary}>{busy ? '…' : (ferie ? 'Enregistrer' : 'Ajouter')}</button>
        </div>
      </div>
    </div>
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

// Déplie les allocations de récup en une liste de dates « jour travaillé/férié »
// (date_evt), de la plus ancienne à la plus récente, une entrée par jour gagné.
function buildRecupSourceDates(recupAllocs) {
  const out = []
  const sorted = (recupAllocs || []).filter(a => a.date_evt).slice().sort((a, b) => a.date_evt.localeCompare(b.date_evt))
  for (const a of sorted) {
    const n = Math.max(1, Math.round(Number(a.jours) || 0))
    for (let k = 0; k < n; k++) out.push(a.date_evt)
  }
  return out
}

function EditCongeModal({ conge, emp, onClose, onSave, joursFeries = [], recupAllocs = [], canEditStatut = true }) {
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
  const existingRecup = Array.isArray(conge.recup_detail) ? conge.recup_detail : []
  // Pour un congé de type récup sans détail saisi, on pré-remplit tous les jours
  // (par défaut « jour travaillé ») pour que l'admin n'ait qu'à ajuster la raison.
  // Dates « jour travaillé/férié » déduites des allocations de récup (auto-remplissage).
  const sourceDates = buildRecupSourceDates(recupAllocs)
  const feriesDatesSet = new Set((joursFeries || []).map(f => f.date))
  // Nature auto : si la date source est un jour férié → 'ferie', sinon 'travaille'.
  const autoRaison = src => (src && feriesDatesSet.has(src) ? 'ferie' : 'travaille')

  const initData = (() => {
    if (existingRecup.length) return existingRecup.map(r => ({ raison: r.raison || 'travaille', source: r.date_source || '' }))
    if (classifierConge(conge) === 'recup') {
      return joursDecomptesDates(emp, feriesDatesSet, conge.date_debut, conge.date_fin).map((d, i) => {
        const source = sourceDates[i] || ''
        return { raison: autoRaison(source), source }
      })
    }
    return []
  })()
  const [recupCount, setRecupCount]     = useState(initData.length)
  const [recupRaisons, setRecupRaisons] = useState(initData.map(x => x.raison))
  const [recupSources, setRecupSources] = useState(initData.map(x => x.source))
  const [busy, setBusy]           = useState(false)
  const [err, setErr]             = useState('')

  const feriesSet      = feriesDatesSet
  const decomptedDates = useMemo(() => joursDecomptesDates(emp, feriesSet, dateDebut, dateFin), [emp, feriesSet, dateDebut, dateFin])
  const maxRecup = decomptedDates.length
  const recupEff = Math.min(recupCount, maxRecup)

  function setCount(n) {
    n = Math.max(0, Math.min(maxRecup, Math.floor(Number(n) || 0)))
    setRecupCount(n)
    setRecupSources(prev => { const a = prev.slice(0, n); for (let i = a.length; i < n; i++) a.push(sourceDates[i] || ''); return a })
    setRecupRaisons(prev => { const a = prev.slice(0, n); for (let i = a.length; i < n; i++) a.push(autoRaison(sourceDates[i] || '')); return a })
  }
  function setRaison(i, v) { setRecupRaisons(prev => { const a = [...prev]; a[i] = v; return a }) }
  function setSource(i, v) { setRecupSources(prev => { const a = [...prev]; a[i] = v; return a }) }

  async function submit() {
    setErr('')
    if (!dateDebut || !dateFin) { setErr('Dates requises.'); return }
    if (dateFin < dateDebut) { setErr('La date de fin est avant la date de début.'); return }
    setBusy(true)
    try {
      const recup_detail = recupEff > 0
        ? decomptedDates.slice(0, recupEff).map((d, i) => ({ date: d, raison: recupRaisons[i] || 'travaille', date_source: recupSources[i] || null }))
        : null
      await onSave({
        date_debut: dateDebut,
        date_fin: dateFin,
        type_conge: typeConge,
        motif: motif.trim() || null,
        statut: canEditStatut ? statut : conge.statut,
        jours_decomptes: joursDecomptes === '' ? null : Number(joursDecomptes),
        recup_detail,
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

        {canEditStatut && (
          <>
            <label style={{ ...lbl, marginTop: 10 }}>Statut</label>
            <select value={statut} onChange={e => setStatut(e.target.value)} style={ipt}>
              <option value="demande">Demande</option>
              <option value="valide">Validé</option>
              <option value="rejete">Rejeté</option>
              <option value="annule">Annulé</option>
            </select>
          </>
        )}

        <label style={{ ...lbl, marginTop: 10 }}>Jours décomptés (laisser vide = calcul auto)</label>
        <input type="number" step="0.5" value={joursDecomptes} onChange={e => setJoursDecomptes(e.target.value)} placeholder="ex : 4" style={ipt} />
        <div style={{ fontSize: 10, color: '#8a7a70', marginTop: 2 }}>
          Si vide, l'app calcule selon les jours off de l'employé. Si rempli, cette valeur est figée
          (ne change pas si tu modifies le planning de l'employé plus tard).
        </div>

        <label style={{ ...lbl, marginTop: 10 }}>Motif (optionnel)</label>
        <input type="text" value={motif} onChange={e => setMotif(e.target.value)} style={ipt} />

        {maxRecup > 0 && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#F1F8F3', border: '0.5px solid #cfe8d6', borderRadius: 10 }}>
            <label style={{ ...lbl, color: '#1c7a35' }}>Jours de récupération compris (au début du congé)</label>
            <input type="number" min="0" max={maxRecup} value={recupCount} onChange={e => setCount(e.target.value)} style={ipt} />
            <div style={{ fontSize: 10, color: '#5a7a60', marginTop: 2 }}>
              Sur {maxRecup} jour{maxRecup > 1 ? 's' : ''} décompté{maxRecup > 1 ? 's' : ''}. Le reste = congé annuel. Les dates « jour travaillé/férié » sont <strong>pré-remplies</strong> depuis les allocations de récup (modifiables).
            </div>
            {recupEff > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {decomptedDates.slice(0, recupEff).map((d, i) => (
                  <div key={d} style={{ padding: '8px 10px', background: 'white', border: '0.5px solid #cfe8d6', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: '#1c7a35', fontWeight: 600, marginBottom: 6 }}>
                      Récup prise le {fmt(d)} <span style={{ fontWeight: 400, color: '#8a7a70' }}>({jourSemaine(d)})</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#5a7a60', marginBottom: 2 }}>Nature</div>
                        <select value={recupRaisons[i] || 'travaille'} onChange={e => setRaison(i, e.target.value)} style={{ ...ipt, padding: '6px 8px' }}>
                          <option value="travaille">Jour travaillé</option>
                          <option value="ferie">Jour férié</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#5a7a60', marginBottom: 2 }}>Date du jour {recupRaisons[i] === 'ferie' ? 'férié' : 'travaillé'} (auto, modifiable)</div>
                        <input type="date" value={recupSources[i] || ''} onChange={e => setSource(i, e.target.value)} style={{ ...ipt, padding: '6px 8px' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
  if (t.includes('récup') || t.includes('recup') || t.includes('compensatory')) return 'recup'
  if (t.includes('maladie') || t.includes('sick') || t.includes('malade')) {
    const duree = (new Date(c.date_fin + 'T00:00:00') - new Date(c.date_debut + 'T00:00:00')) / 86400000 + 1
    return duree <= 3 ? 'maladie_courte' : 'maladie_longue'
  }
  if (t.includes('mariage'))       return 'mariage'
  if (t.includes('naissance'))     return 'naissance'
  if (t.includes('deces') || t.includes('décès')) return 'deces'
  if (t.includes('circoncis'))     return 'circoncision'
  if (t.includes('sans solde') || t.includes('unpaid')) return 'sans_solde'
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
  const today = todayISO()
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
  const totalSansSolde = lignes.filter(l => l.cat === 'sans_solde').reduce((s, l) => s + l.compte, 0)
  const totalRecup = lignes.filter(l => l.cat === 'recup').length

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modal, maxWidth: 780 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar emp={emp} size={64} style={{ objectPosition: '50% 22%' }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>{emp.nom}</div>
              <div style={{ fontSize: 11, color: '#8a7a70' }}>Détail des congés validés en {annee}</div>
            </div>
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
          <span>Sans solde (non payé, non décompté) : {totalSansSolde}</span>{' · '}
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
    sans_solde: 'Sans solde',
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
    sans_solde: '#A32D2D',
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
        <SearchSelect value={employeId ? String(employeId) : ''} onChange={v => setEmployeId(v)} placeholder="Chercher un employé…" inputStyle={ipt}
          options={employes.map(e => ({ value: String(e.id), label: e.nom }))} />

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
function joursDecomptesConge(c, emp, feriesSet = null) {
  if (c.jours_decomptes !== null && c.jours_decomptes !== undefined) {
    return Number(c.jours_decomptes)
  }
  return joursDecomptesCalcul(c, emp, feriesSet)
}

// ============================================================
// Récap annuel : le relevé de compte d'un employé — tout ce qui a été
// ACQUIS (droit annuel, récups, conversions) et tout ce qui a été PRIS,
// dans l'ordre des dates, avec le solde recalculé à chaque ligne.
// ============================================================
function RecapAnnuel({ employes, conges, allocations, conversions = [], feriesSet, isMobile }) {
  const annee = new Date().getFullYear()
  const [selId, setSelId] = useState(() => employes[0]?.id ?? null)
  const [q, setQ] = useState('')
  const [filterGroup, setFilterGroup] = useState(null)

  const emp = employes.find(e => e.id === selId) || employes[0]
  const ql = q.trim().toLowerCase()
  const visibles = employes.filter(e =>
    (!filterGroup || (e.groupe || 'Aucun') === filterGroup) &&
    (!ql || (e.nom || '').toLowerCase().includes(ql)))

  // Employés groupés par équipe, dans l'ordre d'affichage habituel
  const groupes = useMemo(() => {
    const by = new Map()
    for (const e of visibles) {
      const g = e.groupe || 'Aucun'
      if (!by.has(g)) by.set(g, [])
      by.get(g).push(e)
    }
    const ordre = Object.keys(GROUP_COLORS)
    return [...by.keys()]
      .sort((a, b) => (ordre.indexOf(a) === -1 ? 99 : ordre.indexOf(a)) - (ordre.indexOf(b) === -1 ? 99 : ordre.indexOf(b)))
      .map(g => [g, by.get(g)])
  }, [visibles])

  const debutAn = `${annee}-01-01`, finAn = `${annee}-12-31`

  const { mvts, totAcquis, totRecup, totPris, solde, hors } = useMemo(() => {
    if (!emp) return { mvts: [], totAcquis: 0, totRecup: 0, totPris: 0, solde: 0, hors: {} }
    const out = []
    const entree = emp.date_anciennete || emp.date_entree
    for (const a of allocations) {
      if (a.employe_id !== emp.id || a.statut !== 'valide') continue
      if (a.type === 'maladie_courte') continue          // pool séparé
      const d = a.date_evt || (entree && entree > debutAn && entree <= finAn ? entree : debutAn)
      const estDroit = a.type === 'annuel' || a.type === 'reliquat'
      const lib = a.type === 'annuel' ? 'Droit annuel'
        : a.type === 'reliquat' ? 'Reliquat année précédente'
        : (a.raison || (ALLOC_TYPES.find(x => x.v === a.type)?.label || 'Récupération'))
      // Une allocation NÉGATIVE (conversion d'heures manquantes, régularisation)
      // est un retrait : elle ne doit pas s'afficher comme un acquis.
      const j = Number(a.jours)
      out.push({ key: 'a' + a.id, date: d, lib, j, cat: j < 0 ? 'retrait' : 'acquis', droit: estDroit })
    }
    const h = { maladieCourte: 0, maladieLongue: 0, sansSolde: 0 }
    for (const c of conges) {
      if (c.employe_id !== emp.id || c.statut !== 'valide') continue
      if (c.date_debut > finAn || c.date_fin < debutAn) continue
      const cat = classifierConge(c)
      const n = (c.jours_decomptes != null) ? Number(c.jours_decomptes) : joursDecomptesCalcul(c, emp, feriesSet)
      const meme0 = c.date_debut === c.date_fin
      const periode = meme0 ? '' : ` (${fmtCourt(c.date_debut)} → ${fmtCourt(c.date_fin)})`
      // Maladie et sans solde : hors compteur (ils ne bougent pas le solde),
      // mais ils doivent apparaître dans le relevé avec leurs dates.
      if (cat === 'maladie_courte' || cat === 'maladie_longue' || cat === 'sans_solde') {
        if (cat === 'maladie_courte') h.maladieCourte += n
        else if (cat === 'maladie_longue') h.maladieLongue += n
        else h.sansSolde += n
        const etiq = cat === 'sans_solde' ? 'sans solde' : (cat === 'maladie_courte' ? 'maladie ≤ 3 j' : 'maladie > 3 j')
        out.push({
          key: 'c' + c.id, date: c.date_debut, cat: 'hors', etiq,
          lib: `${formatTypeConge(c.type_conge)}${periode} — ${n} j`, j: 0,
        })
        continue
      }
      const meme = c.date_debut === c.date_fin
      const lib = (cat === 'recup' ? 'Récup prise' : (formatTypeConge(c.type_conge) || 'Congé'))
        + (meme ? '' : ` (${fmtCourt(c.date_debut)} → ${fmtCourt(c.date_fin)})`)
      out.push({ key: 'c' + c.id, date: c.date_debut, lib, j: -n, cat: 'pris' })
    }
    // Heures passées en SANS SOLDE : aucune allocation créée (alloc_manq_id vide),
    // elles n'apparaîtraient nulle part sans ça. Hors compteur, mais affichées.
    for (const c of conversions) {
      if (String(c.employe_id) !== String(emp.id)) continue
      const manq = Number(c.manq_heures) || 0
      if (manq > 0 && !c.alloc_manq_id) {
        const jrsSS = Math.round(manq / 8 * 100) / 100
        h.sansSolde += jrsSS
        out.push({
          key: 'k' + c.id,
          date: `${c.annee}-${String(c.mois).padStart(2, '0')}-01`,
          lib: `Conversion solde ${MOIS_LABELS[c.mois - 1]} : ${manq} h → ${jrsSS} j`,
          j: 0, cat: 'hors', etiq: 'sans solde',
        })
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date) || (b.cat === 'acquis' ? 1 : -1))
    let cum = 0
    for (const m of out) { cum = Math.round((cum + m.j) * 100) / 100; m.cum = cum }
    const r2 = n => Math.round(n * 100) / 100
    const ta = r2(out.filter(m => m.droit).reduce((s, m) => s + m.j, 0))
    const tr = r2(out.filter(m => (m.cat === 'acquis' || m.cat === 'retrait') && !m.droit).reduce((s, m) => s + m.j, 0))
    const tp = r2(-out.filter(m => m.cat === 'pris').reduce((s, m) => s + m.j, 0))
    return { mvts: out, totAcquis: ta, totRecup: tr, totPris: tp, solde: r2(ta + tr - tp), hors: h }
  }, [emp, conges, allocations, conversions, feriesSet, debutAn, finAn])

  if (!employes.length) return <div style={emptyBox}>Aucun employé.</div>

  const tot = (k, v, color) => (
    <div style={{ minWidth: 96 }}>
      <div style={{ fontSize: 11, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: .5 }}>{k}</div>
      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 21, fontWeight: 600, marginTop: 2, color: color || '#1a0f0a' }}>{v}</div>
    </div>
  )

  return (
    <div>
      {/* Choix de l'employé : par équipe, avec photo, + recherche */}
      <div style={{ ...card, marginBottom: 16 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Rechercher un nom…"
          style={{ ...ipt, width: '100%', marginBottom: 10 }} />

        {/* Filtre par équipe — mêmes pastilles que l'onglet Présence */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          <button onClick={() => setFilterGroup(null)}
            style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: '1px solid ' + (filterGroup ? '#e4dad0' : '#993556'),
              background: filterGroup ? '#fff' : '#993556', color: filterGroup ? '#4a3a30' : '#fff' }}>
            Toutes
          </button>
          {TEAMS_CONGES.map(g => {
            const on = filterGroup === g
            return (
              <button key={g} onClick={() => setFilterGroup(on ? null : g)}
                style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  border: '1px solid ' + (on ? GROUP_COLORS[g] : '#e4dad0'),
                  background: on ? GROUP_COLORS[g] : '#fff', color: on ? '#fff' : '#4a3a30' }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: on ? '#fff' : GROUP_COLORS[g] }} />
                {groupLabel(g)}
              </button>
            )
          })}
        </div>
        {groupes.length === 0 && <div style={{ fontSize: 12, color: '#8a7a70' }}>Aucun employé pour cette recherche.</div>}
        {groupes.map(([g, list]) => {
          const c = GROUP_COLORS[g] || '#95a5a6'
          return (
            <div key={g} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .8, color: '#4a3a30', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />
                {groupLabel(g)} <span style={{ color: '#b8ada4', fontWeight: 400 }}>{list.length}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {list.map(e => {
                  const on = e.id === emp?.id
                  return (
                    <button key={e.id} onClick={() => setSelId(e.id)} title={e.nom}
                      style={{ width: 58, textAlign: 'center', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, opacity: on ? 1 : .55 }}>
                      <div style={{ width: 38, height: 38, margin: '0 auto', borderRadius: 999, overflow: 'hidden', background: c, color: '#fff', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', outline: on ? '2.5px solid #993556' : 'none', outlineOffset: 2 }}>
                        {e.photo_url ? <img src={e.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (e.nom || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                      </div>
                      <div style={{ fontSize: 10, marginTop: 5, lineHeight: 1.15, color: on ? '#1a0f0a' : '#4a3a30', fontWeight: on ? 600 : 400 }}>
                        {(e.nom || '').split(' ')[0]}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {emp && (
        <div style={card}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{emp.nom}</div>
          <div style={{ fontSize: 12.5, color: '#8a7a70', marginBottom: 14 }}>
            Année {annee}{(emp.date_anciennete || emp.date_entree) ? ` — entrée le ${fmt(emp.date_anciennete || emp.date_entree)}` : ''}
          </div>

          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', padding: '14px 0', borderTop: '1px solid #e5d8c3', borderBottom: '1px solid #e5d8c3', marginBottom: 8 }}>
            {tot('Droit annuel', `${totAcquis} j`)}
            {tot('Récup gagnée', `${totRecup > 0 ? '+' : ''}${totRecup} j`)}
            {tot('Pris', `−${totPris} j`)}
            {tot('Restant', `${solde} j`, solde < 0 ? '#A32D2D' : '#085041')}
          </div>

          <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: '#4a3a30', marginBottom: 12, flexWrap: 'wrap' }}>
            {[['#85B84F', 'acquis'], ['#D9954F', 'retiré'], ['#D98A8A', 'pris'], ['#A9A4D6', 'hors compteur']].map(([c, l]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 11, height: 11, borderRadius: 3, background: c, display: 'inline-block' }} /> {l}
              </span>
            ))}
          </div>

          {mvts.length === 0 ? (
            <div style={emptyBox}>Aucun mouvement en {annee}.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: isMobile ? 420 : 0 }}>
                <thead>
                  <tr style={{ fontSize: 11, color: '#8a7a70', textTransform: 'uppercase', letterSpacing: .5 }}>
                    <th style={{ textAlign: 'left', fontWeight: 500, padding: '0 8px 8px' }}>Date</th>
                    <th style={{ textAlign: 'left', fontWeight: 500, padding: '0 8px 8px' }}>Mouvement</th>
                    <th style={{ textAlign: 'right', fontWeight: 500, padding: '0 8px 8px' }}>Jours</th>
                    <th style={{ textAlign: 'right', fontWeight: 500, padding: '0 8px 8px' }}>Solde</th>
                  </tr>
                </thead>
                <tbody>
                  {mvts.map(m => {
                    const st = {
                      acquis:  { bg: '#F2F8EC', bar: '#85B84F', tagBg: '#DCEBCB', tagFg: '#3F6B12', tag: 'acquis' },
                      retrait: { bg: '#FDF3EC', bar: '#D9954F', tagBg: '#F6E2CD', tagFg: '#854F0B', tag: 'retiré' },
                      pris:    { bg: '#FBF1F1', bar: '#D98A8A', tagBg: '#F4DADA', tagFg: '#A32D2D', tag: 'pris' },
                      hors:    { bg: '#F6F5FC', bar: '#A9A4D6', tagBg: '#E6E4F5', tagFg: '#3C3489', tag: m.etiq || 'hors compteur' },
                    }[m.cat] || {}
                    return (
                      <tr key={m.key} style={{ background: st.bg }}>
                        <td style={{ padding: '7px 8px', borderTop: '1px solid #f3ece1', color: '#8a7a70', width: 58, boxShadow: `inset 3px 0 0 ${st.bar}` }}>{fmtCourt(m.date)}</td>
                        <td style={{ padding: '7px 8px', borderTop: '1px solid #f3ece1' }}>
                          <span style={{ display: 'inline-block', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: .6, padding: '1px 6px', borderRadius: 999, marginRight: 8, fontWeight: 600, background: st.tagBg, color: st.tagFg }}>
                            {st.tag}
                          </span>
                          {m.lib}
                        </td>
                        <td style={{ padding: '7px 8px', borderTop: '1px solid #f3ece1', textAlign: 'right', width: 64, fontWeight: 500, color: m.j < 0 ? '#A32D2D' : (m.j > 0 ? '#085041' : '#8a7a70') }}>
                          {m.j === 0 ? '—' : (m.j > 0 ? '+' : '') + m.j}
                        </td>
                        <td style={{ padding: '7px 8px', borderTop: '1px solid #f3ece1', textAlign: 'right', width: 64, fontWeight: 600, color: '#4a3a30' }}>{m.cum}</td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td />
                    <td style={{ padding: '10px 8px', borderTop: '1.5px solid #1a0f0a', fontWeight: 600 }}>Solde aujourd'hui</td>
                    <td style={{ borderTop: '1.5px solid #1a0f0a' }} />
                    <td style={{ padding: '10px 8px', borderTop: '1.5px solid #1a0f0a', textAlign: 'right', fontWeight: 600, color: solde < 0 ? '#A32D2D' : '#085041' }}>{solde} j</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 15, fontWeight: 600, margin: '22px 0 6px' }}>Hors compteur</div>
          <div style={{ fontSize: 12.5, color: '#4a3a30' }}>
            {[['Maladie ≤ 3 j', hors.maladieCourte, 'pool 6 j/an'],
              ['Maladie > 3 j', hors.maladieLongue, 'non payée'],
              ['Sans solde', hors.sansSolde, '']].map(([k, v, note]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', borderTop: '1px solid #f3ece1' }}>
                <span>{k} {note && <span style={{ color: '#8a7a70' }}>({note})</span>}</span>
                <b>{Math.round((v || 0) * 100) / 100} j</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function joursDecomptesCalcul(c, emp, feriesSet = null) {
  const nbCal = nbJours(c.date_debut, c.date_fin)
  if (!emp) return nbCal
  const cat = classifierConge(c)
  if (cat === 'annuel' || cat === 'recup') {
    const off   = compteJoursOffFixesPeriode(emp, c.date_debut, c.date_fin)
    const feries = compteFeriesHorsOff(emp, feriesSet, c.date_debut, c.date_fin)
    return Math.max(0, nbCal - off - feries)
  }
  return nbCal
}

function CongeCard({ c, emp, actions, joursFeries = [], nameById = {} }) {
  const nbCal = nbJours(c.date_debut, c.date_fin)
  const feriesSet = useMemo(() => new Set((joursFeries || []).map(f => f.date)), [joursFeries])
  const nbDec = joursDecomptesConge(c, emp, feriesSet)
  const feriesPeriode = feriesListePeriode(joursFeries, c.date_debut, c.date_fin)
  const typeLabel = formatTypeConge(c.type_conge) || 'Congé'
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 8 }}><Avatar emp={emp} size={26} />{emp?.nom || nameById[c.employe_id] || `Employé #${c.employe_id}`}</div>
          <div style={{ fontSize: 12, color: '#4a3a30', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Calendar size={13} /> du <strong>{fmt(c.date_debut)}</strong> au <strong>{fmt(c.date_fin)}</strong>
            {' · '}
            <strong style={{ color: '#993556' }}>{nbDec} jour{nbDec > 1 ? 's' : ''} décompté{nbDec > 1 ? 's' : ''}</strong>
            {nbCal !== nbDec && (
              <span style={{ fontSize: 11, color: '#8a7a70' }} title={`Calendaire = ${nbCal} j, dont ${nbCal - nbDec} jour(s) non décompté(s) (repos + férié)`}>
                ({nbCal} cal.)
              </span>
            )}
          </div>
          {feriesPeriode.length > 0 && (
            <div style={{ fontSize: 11, color: '#0C447C', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <Flag size={11} /> Jour férié non décompté : {feriesPeriode.map(f => `${fmt(f.date)} (${f.nom})`).join(' · ')}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#8a7a70', marginTop: 4 }}>
            {typeLabel}{c.motif ? ` · ${c.motif}` : ''}
          </div>
          {c.justificatif_path && (
            <button onClick={async () => { const u = await getJustificatifUrl(c.justificatif_path); if (u) window.open(u, '_blank') }}
              style={{ marginTop: 4, fontSize: 11, color: '#993556', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
              📎 Voir le justificatif
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>{actions}</div>
      </div>
    </div>
  )
}

function NouvelleDemandeModal({ employes, soldes, user, onClose, onSaved, joursFeries = [] }) {
  const [employeId, setEmployeId] = useState(employes[0]?.id || '')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin]     = useState('')
  const [typeConge, setTypeConge] = useState('annuel')
  const [motif, setMotif]         = useState('')
  const [justif, setJustif]       = useState(null)
  const [demi, setDemi]           = useState(false)
  const [busy, setBusy]           = useState(false)
  const [errMsg, setErrMsg]       = useState('')

  const emp   = employes.find(e => e.id === Number(employeId))
  const solde = emp ? soldes[emp.id] : null
  const nbCal = nbJours(dateDebut, dateFin)
  // Ni le jour de repos ni un jour férié ne se décomptent (comme pour le solde).
  const excludeOff = !!emp && !!dateDebut && !!dateFin && (typeConge === 'annuel' || typeConge === 'recup')
  const feriesSet = useMemo(() => new Set((joursFeries || []).map(f => f.date)), [joursFeries])
  const offDemande   = excludeOff ? compteJoursOffFixesPeriode(emp, dateDebut, dateFin) : 0
  const ferieDemande = excludeOff ? compteFeriesHorsOff(emp, feriesSet, dateDebut, dateFin) : 0
  const feriesPeriode = (dateDebut && dateFin) ? feriesListePeriode(joursFeries, dateDebut, dateFin) : []
  const nbDemandeBrut = excludeOff ? Math.max(0, nbCal - offDemande - ferieDemande) : nbCal
  // ½ journée : uniquement sur une seule journée. Décompte 0,5 j au lieu de 1.
  const journeeUnique = !!dateDebut && !!dateFin && dateDebut === dateFin
  const nbDemande = (demi && journeeUnique) ? 0.5 : nbDemandeBrut

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
      let justificatif_path = null
      if (justif) justificatif_path = await uploadJustificatif(justif, user.id)
      await createDemandeConge({
        employe_id: Number(employeId),
        date_debut: dateDebut,
        date_fin:   dateFin,
        type_conge: typeConge,
        motif: motif.trim() || null,
        demande_par: user.id,
        justificatif_path,
        jours_decomptes: (demi && journeeUnique) ? 0.5 : null,
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
        <SearchSelect value={employeId ? String(employeId) : ''} onChange={v => setEmployeId(v)} placeholder="Chercher un employé…" inputStyle={ipt}
          options={employes.map(e => ({ value: String(e.id), label: `${e.nom}${e.poste ? ' · ' + e.poste : ''}` }))} />

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
        {journeeUnique && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 13, color: '#4a3a30', cursor: 'pointer' }}>
            <input type="checkbox" checked={demi} onChange={e => setDemi(e.target.checked)} />
            ½ journée (0,5 j)
          </label>
        )}
        {nbCal > 0 && (
          <div style={{ fontSize: 11, color: '#4a3a30', marginTop: 4 }}>
            {nbDemande} jour{nbDemande > 1 ? 's' : ''} décompté{nbDemande > 1 ? 's' : ''}
            {nbCal !== nbDemande ? ` (${nbCal} calendaires${offDemande > 0 ? ` · ${offDemande} repos` : ''}${ferieDemande > 0 ? ` · ${ferieDemande} férié` : ''} non décompté${nbCal - nbDemande > 1 ? 's' : ''})` : ''}
          </div>
        )}
        {feriesPeriode.length > 0 && excludeOff && (
          <div style={{ fontSize: 11, color: '#0C447C', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Flag size={11} /> Jour férié non décompté : {feriesPeriode.map(f => `${fmt(f.date)} (${f.nom})`).join(' · ')}
          </div>
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

        <label style={{ ...lbl, marginTop: 10 }}>Justificatif / certificat médical (optionnel)</label>
        <input type="file" accept="image/*,.pdf" onChange={e => setJustif(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />

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
  const ref = useRef(null)
  // Quand l'onglet devient actif, on le recentre à l'écran (barre qui défile sur mobile).
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [active])
  return (
    <button ref={ref} onClick={onClick} style={{
      fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 999, cursor: 'pointer',
      background: active ? '#993556' : 'white',
      color:      active ? '#faf7f2' : '#1a0f0a',
      border:     active ? '1px solid #993556' : '1px solid #e5d8c3',
      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
    }}>{children}</button>
  )
}
