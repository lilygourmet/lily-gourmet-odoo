import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react'
import SearchSelect from '../SearchSelect'
import {
  User, Users, Calendar, RefreshCw, Clock, Lock, Unlock, Building2,
  Pencil, Trash2, Plus, Download, Save, Hand, Eye, EyeOff, Wallet, Fingerprint,
} from 'lucide-react'
import PointeuseModal from './PointeuseModal'
import Avatar from '../Avatar'
import {
  loadMonthData, calculerMois, syncAttendance, syncLeaves,
  setAjustement, removeAjustement, updatePointage, validerMois,
  nomJour, convertirHeuresEnJours,
} from '../../lib/pointage'
import { createDemandeConge, validerConge, classifierConge, CONGE_EVENEMENT, calculSoldeConges, dispoTypeConge } from '../../lib/conges'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'
import { groupLabel } from '../../lib/presence'

// Congés annuels : le jour off "fixe" (jour complet de repos chaque semaine)
// ne compte PAS dans le décompte des jours de congé pris.
// - planning fixe : c'est planning_jour_off (le demi-off n'est PAS exclu →
//   un demi-off tombé en congé compte comme un jour de congé pris).
// - planning alterné : c'est le jour commun aux semaines paire et impaire.
//   Le jour off "tournant" (qui change d'une semaine à l'autre) compte
//   comme un jour de congé pris.
function compteJoursOffFixesDansPeriode(emp, debut, fin) {
  let jourFixe = null
  if (emp.planning_type === 'fixe') {
    jourFixe = emp.planning_jour_off || null
  } else if (emp.planning_type === 'alt') {
    const paireOffs   = [emp.planning_paire_off_1,   emp.planning_paire_off_2  ].filter(Boolean)
    const impaireOffs = [emp.planning_impaire_off_1, emp.planning_impaire_off_2].filter(Boolean)
    jourFixe = paireOffs.find(d => impaireOffs.includes(d)) || null
  }
  if (!jourFixe) return 0
  let count = 0
  const d = new Date(debut)
  while (d <= fin) {
    if (nomJour(d) === jourFixe) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}
import EmployeEditModal from './EmployeEditModal'

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

const COULEUR_STATUT = {
  normal:           { bg: 'white',   text: '#1a0f0a' },
  present:          { bg: '#EAF3DE', text: '#27500A' },  // Forcé présent (au lieu d'absent)
  demi:             { bg: '#FFF7E0', text: '#854F0B' },
  off:              { bg: '#F5EFE7', text: '#4a3a30' },
  off_travaille:    { bg: '#EEEDFE', text: '#3C3489' },
  ferie:            { bg: '#EAF3DE', text: '#27500A' },
  ferie_travaille:  { bg: '#C0DD97', text: '#173404' },
  conge:            { bg: '#E6F1FB', text: '#0C447C' },
  conge_travaille:  { bg: '#85B7EB', text: '#042C53' },
  absent:           { bg: '#FCEBEB', text: '#A32D2D' },
}

export default function PointageTab({ user, isAdmin }) {
  const today = new Date()
  // Charger le dernier mois consulté depuis localStorage
  const [mois, setMois] = useState(() => {
    const saved = localStorage.getItem('pointage_last_mois')
    return saved ? parseInt(saved, 10) : today.getMonth() + 1
  })
  const [annee, setAnnee] = useState(() => {
    const saved = localStorage.getItem('pointage_last_annee')
    return saved ? parseInt(saved, 10) : today.getFullYear()
  })

  // Sauvegarder à chaque changement
  useEffect(() => {
    localStorage.setItem('pointage_last_mois', String(mois))
    localStorage.setItem('pointage_last_annee', String(annee))
  }, [mois, annee])
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)  // spinner au 1er chargement seulement
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [selectedEmpId, setSelectedEmpId] = useState(null)
  const [vue, setVue] = useState(isAdmin ? 'single' : 'recup')  // 'single' | 'all' | 'recup' | 'absences'
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const h = e => setIsMobile(e.matches)
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [])
  const [editingTranches, setEditingTranches] = useState(null)  // { date, sessions } | null
  const [editingEmp, setEditingEmp] = useState(null)  // employé édité dans modal
  const [showPointeuse, setShowPointeuse] = useState(false)  // écran correspondance pointeuse
  const [showConvert, setShowConvert] = useState(false)  // fenêtre conversion heures → jours

  // Charger les données du mois
  // Rechargement SILENCIEUX : on ne rebascule pas sur « Chargement… » (sinon le
  // tableau disparaît/réapparaît → la page remonte en haut à chaque modif). Le
  // spinner ne s'affiche qu'au tout premier chargement (loading initial = true).
  const reload = useCallback(async () => {
    setError(null)
    try {
      const d = await loadMonthData(mois, annee)
      setData(d)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [mois, annee])

  useEffect(() => {
    // Affichage INSTANTANÉ depuis les données déjà enregistrées (Supabase), PUIS
    // synchro Odoo en arrière-plan au 1er affichage du mois (l'écran se met à jour
    // tout seul quand elle finit). Plus rapide à l'ouverture.
    reload()
    if (!syncedRef.current.has(`${mois}-${annee}`)) doSync({ confirmFirst: false, silent: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mois, annee])

  // Rafraîchissement auto (silencieux) : la vue se met à jour toute seule quand
  // quelqu'un pointe, sans avoir à recharger la page.
  useEffect(() => {
    const id = setInterval(() => {
      loadMonthData(mois, annee).then(setData).catch(() => {})
    }, 30000)
    return () => clearInterval(id)
  }, [mois, annee])

  // Calculs (mémorisés pour éviter recalcul à chaque render).
  // ⚠️ Un mois VALIDÉ est FIGÉ : on réaffiche la photo enregistrée à la validation
  // (solde, heures…) au lieu de recalculer en direct. Il ne se recalcule que si on
  // le débloque (= à la demande). Les mois non validés se calculent normalement.
  const resultats = useMemo(() => {
    if (!data) return {}
    const out = {}
    const synthByEmp = new Map((data.synthese || []).map(s => [s.employe_id, s]))
    for (const emp of data.employes) {
      const stored = synthByEmp.get(emp.id)
      if (stored?.valide) {
        out[emp.id] = {
          employe: emp,
          journal: Array.isArray(stored.journal_jsonb) && stored.journal_jsonb.length
            ? stored.journal_jsonb
            : calculerMois(emp, mois, annee, data).journal,
          synthese: {
            heures_prevues: stored.heures_prevues,
            heures_travaillees: stored.heures_travaillees,
            heures_sup: stored.heures_sup,
            heures_manquantes: stored.heures_manquantes,
            jours_recup: stored.jours_recuperation,
            jours_absents: stored.jours_absents,
            jours_travailles: stored.jours_travailles,
            solde_reporte_precedent: stored.solde_reporte_precedent,
            solde_mois: stored.solde_mois,
            valide: true,
          },
        }
      } else {
        out[emp.id] = calculerMois(emp, mois, annee, data)
      }
    }
    return out
  }, [data, mois, annee])

  const empSelected = data?.employes.find(e => e.id === selectedEmpId)
  const result = empSelected ? resultats[selectedEmpId] : null

  // Mois verrouillé pour cet employé (synthese.valide === true)
  const synthEmp = data?.synthese?.find(s => s.employe_id === selectedEmpId)
  const isLocked = !!synthEmp?.valide
  // Tableau éditable uniquement si admin + mois non verrouillé
  const canEdit = isAdmin && !isLocked
  // Edition globale du mois (pour Tous, Récup)
  const monthAllLocked = (data?.synthese || []).every(s => s.valide)

  // Sync Odoo (cœur réutilisé par le bouton manuel ET la synchro auto à l'ouverture)
  const syncedRef = useRef(new Set())  // mois déjà synchronisés dans cette session
  const doSync = useCallback(async ({ confirmFirst, silent }) => {
    if (confirmFirst && !await confirmDialog(`Synchroniser les pointages + congés depuis Odoo pour ${MOIS_FR[mois - 1]} ${annee} ?`, { confirmLabel: 'Synchroniser' })) return
    setSyncing(true); setError(null); if (!silent) setSuccess(null)
    try {
      const r1 = await syncAttendance(mois, annee)
      const r2 = await syncLeaves(mois, annee)
      syncedRef.current.add(`${mois}-${annee}`)
    } catch (e) {
      setError('Erreur sync : ' + e.message)
    }
    await reload()
    setSyncing(false)
  }, [mois, annee, reload])

  function handleSync() { doSync({ confirmFirst: true, silent: false }) }

  // Édition d'une cellule (heures_travaillees, sup, manquantes, recup, statut)
  async function handleEditCell(dateJour, champ, valeur) {
    if (!canEdit) {
      toast.error(isLocked
        ? 'Ce mois est validé. Débloquez-le pour modifier.'
        : 'Modification réservée à l\'admin.')
      return
    }
    try {
      if (valeur === '' || valeur === null) {
        await removeAjustement(selectedEmpId, dateJour, champ)
      } else {
        await setAjustement(selectedEmpId, dateJour, champ, valeur, user.id)
      }
      await reload()
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  // Édition d'un pointage (arrivee/depart)
  async function handleEditPointage(pointageId, champ, valeur) {
    try {
      await updatePointage(pointageId, { [champ]: valeur }, user.id)
      await reload()
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  // Sauvegarder les sessions modifiées d'un jour
  async function handleSaveTranches(date, sessions) {
    if (!canEdit) return
    try {
      const { upsertPointagesDuJour } = await import('../../lib/pointage')
      await upsertPointagesDuJour(selectedEmpId, date, sessions, user.id)
      setEditingTranches(null)
      await reload()
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  // ============================================
  // EXPORTS (admin)
  // ============================================

  async function downloadXLSX(filename, rows, sheetName = 'Feuille1') {
    await downloadXLSXMulti(filename, [{ name: sheetName, rows }])
  }

  // Variante multi-onglets : sheets = [{ name, rows }, ...]
  async function downloadXLSXMulti(filename, sheets) {
    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
    }
    const XLSX = window.XLSX
    const wb = XLSX.utils.book_new()
    for (const sh of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(sh.rows)
      const colWidths = (sh.rows[0] || []).map((_, i) => ({
        wch: Math.min(40, Math.max(...sh.rows.map(r => String(r[i] || '').length)) + 2)
      }))
      ws['!cols'] = colWidths
      XLSX.utils.book_append_sheet(wb, ws, String(sh.name).slice(0, 31))
    }
    XLSX.writeFile(wb, filename)
  }

  async function handleExportSup() {
    if (!data) return
    const monthName = MOIS_FR[mois - 1] + '_' + annee
    await downloadXLSX('heures_sup_' + monthName + '.xlsx', exportRowsHeuresSup(), 'Heures sup ' + monthName)
  }

  // Jours de congé par catégorie pour un employé, rattachés au mois de leur DATE DE DÉBUT
  // et comptés EN ENTIER (la partie qui déborde sur le mois suivant est incluse ici, et
  // n'est PAS recomptée le mois d'après). Catégorie décidée sur la durée totale.
  // Retourne { annuel, evenement, maladieLongue, sansSolde }.
  function congesParTypeDuMois(emp) {
    let annuel = 0, recup = 0, maladieLongue = 0, sansSolde = 0
    const events = {}   // { deces: n, mariage: n, … } — détaillé par type d'événement
    const monthKey = `${annee}-${String(mois).padStart(2, '0')}`
    const congesEmp = data.conges.filter(c => c.employe_id === emp.id)
    for (const c of congesEmp) {
      if ((c.date_debut || '').slice(0, 7) !== monthKey) continue   // rattaché au mois de début
      const debut = new Date(c.date_debut + 'T00:00:00')
      const fin   = new Date(c.date_fin + 'T00:00:00')
      const nb = Math.round((fin - debut) / 86400000) + 1           // durée TOTALE (continuité incluse)
      const cat = classifierConge(c)
      if (cat === 'maladie_courte') continue   // ≤ 3 j : non payé au bulletin
      if (cat === 'recup')          { recup += nb - compteJoursOffFixesDansPeriode(emp, debut, fin); continue }
      if (cat === 'maladie_longue') { maladieLongue += nb; continue }
      if (cat === 'sans_solde')     { sansSolde += nb; continue }
      if (CONGE_EVENEMENT.has(cat)) { events[cat] = (events[cat] || 0) + (nb - compteJoursOffFixesDansPeriode(emp, debut, fin)); continue }
      annuel += nb - compteJoursOffFixesDansPeriode(emp, debut, fin)   // congé annuel
    }
    return { annuel, recup, events, maladieLongue, sansSolde }
  }

  function exportRowsConges() {
    const EVENT_LABELS = { deces: 'Décès', mariage: 'Mariage', naissance: 'Naissance', circoncision: 'Circoncision', maternite: 'Maternité' }
    const EVENT_ORDER = ['deces', 'mariage', 'naissance', 'circoncision', 'maternite']
    const z = n => (Number(n) > 0 ? Number(n) : '')   // case vide au lieu de 0 (lecture plus facile)

    // 1) Calcul par employé + total par type d'événement (pour savoir quelles colonnes afficher).
    const lignes = []
    const eventTotals = {}
    for (const emp of data.employes) {
      if (!emp.declare) continue
      const r = congesParTypeDuMois(emp)
      for (const k of Object.keys(r.events)) eventTotals[k] = (eventTotals[k] || 0) + r.events[k]
      lignes.push({ nom: emp.nom, ...r })
    }
    // 2) Colonnes d'événement : UNIQUEMENT celles qui ont au moins 1 jour ce mois-ci.
    const eventCols = EVENT_ORDER.filter(k => eventTotals[k] > 0)

    const rows = [
      [`Congés — ${MOIS_FR[mois - 1]} ${annee}`],
      [],
      ['Employé', 'Congé annuel', 'Récup', ...eventCols.map(k => EVENT_LABELS[k]), 'Maladie > 3 j', 'Sans solde', 'Total jours'],
    ]
    for (const l of lignes) {
      const evSum = Object.values(l.events).reduce((s, n) => s + n, 0)
      const total = l.annuel + l.recup + evSum + l.maladieLongue + l.sansSolde
      rows.push([
        l.nom,
        z(l.annuel), z(l.recup),
        ...eventCols.map(k => z(l.events[k] || 0)),
        z(l.maladieLongue), z(l.sansSolde), z(total),
      ])
    }
    return rows
  }

  function exportRowsHeuresSup() {
    const rows = [
      [`Heures sup — ${MOIS_FR[mois - 1]} ${annee}`],
      [],
      ['Employé', 'Solde heures sup du mois'],
    ]
    for (const emp of data.employes) {
      if (!emp.declare) continue
      const r = resultats[emp.id]
      if (!r) continue
      const solde = emp.heures_sup_mensuelles === false
        ? 0
        : (r.synthese.heures_sup - r.synthese.heures_manquantes)
      rows.push([emp.nom, Number(solde.toFixed(2))])
    }
    return rows
  }

  async function handleExportConges() {
    if (!data) return
    const monthName = MOIS_FR[mois - 1] + '_' + annee
    await downloadXLSX('conges_' + monthName + '.xlsx', exportRowsConges(), 'Congés ' + monthName)
  }

  async function handleExportCongesEtSup() {
    if (!data) return
    const monthName = MOIS_FR[mois - 1] + '_' + annee
    await downloadXLSXMulti('conges_heures_sup_' + monthName + '.xlsx', [
      { name: 'Congés ' + monthName,    rows: exportRowsConges() },
      { name: 'Heures sup ' + monthName, rows: exportRowsHeuresSup() },
    ])
  }

  // Validation du mois
  // Valider pour TOUS les employés du mois
  async function handleValider() {
    if (!await confirmDialog(`Valider le mois de ${MOIS_FR[mois - 1]} ${annee} pour TOUS les employés ?\n\nLes données seront figées et le solde reporté sur le mois suivant.\nUn PDF + CSV récapitulatif seront téléchargés.`, { confirmLabel: 'Valider' })) return
    try {
      for (const emp of data.employes) {
        const r = resultats[emp.id]
        if (r) await validerMois(emp.id, mois, annee, r.synthese, r.journal, user.id)
      }
      // Générer le récap PDF + Excel
      await genererRecapMensuel()
      setSuccess('Mois validé pour tous les employés. PDF + Excel téléchargés.')
      await reload()
    } catch (e) {
      setError('Erreur validation : ' + e.message)
    }
  }

  // Générer PDF + Excel récap mensuel
  async function genererRecapMensuel() {
    const monthName = MOIS_FR[mois - 1] + '_' + annee
    // Données récap : heures sup + congés
    const rows = []
    for (const emp of data.employes) {
      const r = resultats[emp.id]
      if (!r) continue

      // Heures sup : employés dont on ne compte PAS les heures sup → tout le bloc heures à 0
      // (heures sup, heures manquantes ET solde du mois), pas seulement les heures sup.
      const noSup = emp.heures_sup_mensuelles === false
      const sup = noSup ? 0 : r.synthese.heures_sup
      const manquantes = noSup ? 0 : r.synthese.heures_manquantes
      const soldeMois = noSup ? 0 : r.synthese.solde_mois

      // Jours congés + maladie (≥ 4 jours)
      const congesEmp = data.conges.filter(c => c.employe_id === emp.id)
      let joursConge = 0
      let joursEvenement = 0
      let joursMaladie = 0
      const monthKeyRecap = `${annee}-${String(mois).padStart(2, '0')}`
      for (const cg of congesEmp) {
        if ((cg.date_debut || '').slice(0, 7) !== monthKeyRecap) continue   // rattaché au mois de début, compté en entier
        const debut = new Date(cg.date_debut + 'T00:00:00')
        const fin = new Date(cg.date_fin + 'T00:00:00')
        const nb = Math.round((fin - debut) / 86400000) + 1
        const cat = classifierConge(cg)   // catégorie décidée sur la durée totale
        if (cat === 'recup' || cat === 'maladie_courte') continue
        if (cat === 'maladie_longue') { joursMaladie += nb; continue }
        if (CONGE_EVENEMENT.has(cat)) { joursEvenement += nb - compteJoursOffFixesDansPeriode(emp, debut, fin); continue }
        joursConge += nb - compteJoursOffFixesDansPeriode(emp, debut, fin)   // annuel + sans solde
      }
      rows.push({
        nom: emp.nom,
        societe: emp.societe_id,
        sup: sup.toFixed(2),
        manquantes: manquantes.toFixed(2),
        recup: r.synthese.jours_recup.toFixed(2),
        conge: joursConge,
        evenement: joursEvenement,
        maladie: joursMaladie,
        solde_mois: soldeMois.toFixed(2),
      })
    }
    rows.sort((a, b) => a.nom.localeCompare(b.nom))

    // 1) Excel xlsx natif via SheetJS (chargé dynamiquement depuis CDN)
    const zn = v => (Number(v) === 0 ? '' : Number(v))   // case vide au lieu de 0
    const headers = ['Employé', 'Heures sup', 'Heures manquantes', 'Jours récup', 'Jours congé', 'Événement', 'Jours maladie (4+)', 'Solde mois (h)']
    const xlsxRows = [headers]
    for (const r of rows) {
      xlsxRows.push([r.nom, zn(r.sup), zn(r.manquantes), zn(r.recup), zn(r.conge), zn(r.evenement), zn(r.maladie), zn(r.solde_mois)])
    }
    await downloadXLSX('recap_pointage_' + monthName + '.xlsx', xlsxRows, 'Récap ' + monthName)

    // 2) PDF (simple, via window.print sur une page HTML cachée)
    // ou via jsPDF si disponible. On va générer un HTML imprimable en téléchargement.
    const today = new Date().toLocaleDateString('fr-FR')
    const zt = (v, u = '') => (Number(v) === 0 ? '' : `${v}${u}`)   // case vide au lieu de 0
    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Récap pointage ${MOIS_FR[mois - 1]} ${annee}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 30px; color: #1a0f0a; }
  h1 { color: #993556; margin: 0 0 8px; }
  .sub { color: #4a3a30; margin: 0 0 24px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #F4F0EA; padding: 8px 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #993556; }
  td { padding: 7px 10px; border-bottom: 1px solid #F4F0EA; }
  .right { text-align: right; }
  .green { color: #27500A; }
  .red { color: #A32D2D; }
  .purple { color: #3C3489; }
  .footer { margin-top: 30px; font-size: 11px; color: #8a7a70; }
  @media print { body { padding: 15px; } }
</style></head>
<body>
  <h1>Récapitulatif Pointage</h1>
  <p class="sub">${MOIS_FR[mois - 1]} ${annee} · ${rows.length} employés · Généré le ${today}</p>
  <table>
    <thead><tr>
      <th>Employé</th>
      <th class="right">Heures sup</th>
      <th class="right">Manquantes</th>
      <th class="right">Récup</th>
      <th class="right">Jours congé</th>
      <th class="right">Événement</th>
      <th class="right">Maladie (4+)</th>
      <th class="right">Solde mois</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td><strong>${r.nom}</strong></td>
        <td class="right green">${zt(r.sup, 'h')}</td>
        <td class="right red">${zt(r.manquantes, 'h')}</td>
        <td class="right purple">${zt(r.recup, 'j')}</td>
        <td class="right">${zt(r.conge)}</td>
        <td class="right">${zt(r.evenement)}</td>
        <td class="right">${zt(r.maladie)}</td>
        <td class="right ${Number(r.solde_mois) >= 0 ? 'green' : 'red'}"><strong>${zt(r.solde_mois, 'h')}</strong></td>
      </tr>`).join('')}
    </tbody>
  </table>
  <p class="footer">Document figé pour la paie · Lily Gourmet</p>
  <script>setTimeout(() => window.print(), 500);</script>
</body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    // Ouvrir dans nouvel onglet pour impression PDF
    const win = window.open(url, '_blank')
    if (!win) {
      // Fallback : téléchargement HTML
      const a = document.createElement('a')
      a.href = url; a.download = 'recap_pointage_' + monthName + '.html'; a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }

  // Valider seulement l'employé sélectionné
  async function handleValiderEmploye() {
    if (!isAdmin || !empSelected) return
    if (!await confirmDialog(`Valider le mois de ${MOIS_FR[mois - 1]} ${annee} pour ${empSelected.nom} uniquement ?\n\nSes données seront figées (pas d'export PDF/CSV).`, { confirmLabel: 'Valider' })) return
    try {
      const r = resultats[empSelected.id]
      if (r) await validerMois(empSelected.id, mois, annee, r.synthese, r.journal, user.id)
      toast.success(`${empSelected.nom} validé(e).`)
      await reload()
    } catch (e) {
      setError('Erreur validation : ' + e.message)
    }
  }

  // Débloquer un mois (admin seulement, supprime le flag valide)
  async function handleDebloquer() {
    if (!isAdmin) return
    if (!await confirmDialog(`Débloquer le mois de ${MOIS_FR[mois - 1]} ${annee} pour ${empSelected?.nom} ?\n\nLes données redeviennent modifiables mais Sync Odoo restera désactivé.`, { confirmLabel: 'Débloquer' })) return
    try {
      const { supabase } = await import('../../lib/supabase')
      const { error } = await supabase
        .from('pointages_mois')
        .update({ valide: false })
        .eq('employe_id', selectedEmpId)
        .eq('mois', mois).eq('annee', annee)
      if (error) throw error
      await reload()
      setSuccess('Mois débloqué pour cet employé.')
    } catch (e) {
      setError('Erreur déblocage : ' + e.message)
    }
  }

  // Forcer un jour "Absent" à "Présent" (statut + heures travaillées)
  async function handleForcerPresent(dateJour) {
    if (!canEdit) return
    if (!await confirmDialog(`Marquer le ${dateJour} comme PRÉSENT pour ${empSelected?.nom} ?\n\nLe statut deviendra 'Présent' et les heures prévues seront comptées comme travaillées.`, { confirmLabel: 'Confirmer' })) return
    try {
      const j = result.journal.find(jj => jj.date === dateJour)
      if (!j) return
      // 1) Forcer heures_travaillees = heures_prevues
      await setAjustement(selectedEmpId, dateJour, 'heures_travaillees', String(j.heures_prevues), user.id)
      // 2) Forcer le statut à 'present' (badge vert au lieu d'Absent rouge)
      await setAjustement(selectedEmpId, dateJour, 'statut', 'present', user.id)
      await reload()
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  // Enlever les heures sup du mois affiché (sup → 0 sur chaque jour qui en a ;
  // les heures manquantes restent). Réversible. = l'édition par ligne, mais en 1 clic.
  async function handleEnleverSupMois() {
    if (!canEdit) { toast.error(isLocked ? 'Ce mois est validé. Débloquez-le pour modifier.' : 'Modification réservée à l\'admin.'); return }
    const jours = (result?.journal || []).filter(j => Number(j.heures_sup) > 0)
    if (jours.length === 0) { toast('Aucune heure sup à enlever ce mois.'); return }
    if (!await confirmDialog(`Enlever les heures sup de ${empSelected?.nom} pour ${MOIS_FR[mois - 1]} ${annee} ?\n\n${result.synthese.heures_sup}h sup → 0 (les heures manquantes restent). Réversible.`, { confirmLabel: 'Enlever' })) return
    try {
      await Promise.all(jours.map(j => setAjustement(selectedEmpId, j.date, 'heures_sup', '0', user.id)))
      await reload()
      toast.success('Heures sup retirées pour ce mois.')
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }
  // Remettre les heures sup calculées (annule les mises à 0 du mois pour cet employé).
  async function handleRemettreSupMois() {
    if (!canEdit) return
    if (!await confirmDialog(`Remettre les heures sup calculées pour ${empSelected?.nom} (${MOIS_FR[mois - 1]} ${annee}) ?`, { confirmLabel: 'Remettre' })) return
    try {
      const aves = (data?.ajustements || []).filter(a => Number(a.employe_id) === Number(selectedEmpId) && a.champ === 'heures_sup')
      await Promise.all(aves.map(a => removeAjustement(selectedEmpId, a.date_jour, 'heures_sup')))
      await reload()
      toast.success('Heures sup remises.')
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  // Modal pour transformer une absence en congé : on demande le type
  const [congeModalDate, setCongeModalDate] = useState(null)
  async function handleCreateConge(dateJour, typeConge, demi = false) {
    try {
      const jours = demi ? 0.5 : 1
      // Plafond au solde : on ne crée pas un congé qui dépasse le disponible.
      // Types illimités (maladie longue, sans solde) → dispo = null → jamais bloqués.
      const solde = await calculSoldeConges(empSelected)
      const dispo = dispoTypeConge(solde, typeConge)
      if (dispo !== null && (dispo === undefined || dispo < jours)) {
        const reste = dispo === undefined ? 0 : dispo
        toast.error(`Solde insuffisant pour ${empSelected?.nom} : il reste ${reste} jour(s). Congé non créé. (Choisis « Sans solde » si tu veux quand même.)`)
        return
      }
      const c = await createDemandeConge({
        employe_id: selectedEmpId,
        date_debut: dateJour,
        date_fin:   dateJour,
        type_conge: typeConge,
        motif: 'Créé depuis pointage' + (demi ? ' (½ journée)' : ''),
        demande_par: user.id,
      })
      // Validation immédiate : le congé devient effectif tout de suite
      await validerConge(c.id, user.id, jours)
      setCongeModalDate(null)
      await reload()
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }



  // Anciens / nouveaux mois
  function prevMonth() {
    if (mois === 1) { setMois(12); setAnnee(annee - 1) }
    else setMois(mois - 1)
  }
  function nextMonth() {
    if (mois === 12) { setMois(1); setAnnee(annee + 1) }
    else setMois(mois + 1)
  }

  // Navigation employé précédent / suivant
  function prevEmp() {
    if (!data?.employes || !selectedEmpId) return
    const idx = data.employes.findIndex(e => e.id === selectedEmpId)
    if (idx > 0) setSelectedEmpId(data.employes[idx - 1].id)
    else setSelectedEmpId(data.employes[data.employes.length - 1].id)  // wrap
  }
  function nextEmp() {
    if (!data?.employes || !selectedEmpId) return
    const idx = data.employes.findIndex(e => e.id === selectedEmpId)
    if (idx < data.employes.length - 1) setSelectedEmpId(data.employes[idx + 1].id)
    else setSelectedEmpId(data.employes[0].id)  // wrap
  }

  // Raccourcis clavier ← → pour navigation employé (uniquement en vue single)
  useEffect(() => {
    if (vue !== 'single') return
    function onKey(e) {
      // Ignorer si focus dans un input/select
      const tag = (e.target.tagName || '').toLowerCase()
      if (['input', 'select', 'textarea'].includes(tag)) return
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prevEmp() }
      if (e.key === 'ArrowRight') { e.preventDefault(); nextEmp() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [vue, selectedEmpId, data])

  return (
    <div>
      {/* Toolbar (figée en haut au défilement) */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap',
        position: 'sticky', top: 52, zIndex: 20, background: '#fcfbf8', padding: '10px 0',
      }}>
        <button onClick={prevMonth} style={btnNav}>◀</button>
        <div style={{ minWidth: 160, textAlign: 'center', fontSize: 15, fontWeight: 500, color: '#1a0f0a' }}>
          {MOIS_FR[mois - 1]} {annee}
        </div>
        <button onClick={nextMonth} style={btnNav}>▶</button>

        <div style={{ display: 'flex', gap: 4, padding: 3, background: '#F4F0EA', borderRadius: 8, flexWrap: 'wrap' }}>
          {(isAdmin
            ? [
                { v: 'single', label: 'Un employé', Icon: User },
                { v: 'annee', label: 'Année', Icon: Calendar },
                { v: 'all', label: 'Tous', Icon: Users },
                { v: 'recup', label: 'Récup & Absences', dot: '#9333EA' },
              ]
            : [
                { v: 'recup', label: 'Récup & Absences', dot: '#9333EA' },
              ]
          ).map(t => (
            <button key={t.v} onClick={() => setVue(t.v)} style={{
              padding: '6px 12px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: vue === t.v ? 'white' : 'transparent',
              color: vue === t.v ? '#1a0f0a' : '#4a3a30',
              fontWeight: vue === t.v ? 500 : 400,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.Icon ? <t.Icon size={14} /> : (
                <span style={{ width: 8, height: 8, borderRadius: 999, background: t.dot, display: 'inline-block' }} />
              )}
              {t.label}
            </button>
          ))}
        </div>

        {(vue === 'single' || vue === 'annee') && (
          <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: 200, alignItems: 'center', justifyContent: 'center' }}>
            <button onClick={prevEmp} style={btnNav} title="Employé précédent (←)">◀</button>
            <div style={{ flex: 1, maxWidth: 360 }}>
              <SearchSelect
                value={selectedEmpId ? String(selectedEmpId) : ''}
                onChange={v => setSelectedEmpId(Number(v))}
                placeholder="Chercher un employé…"
                inputStyle={{ width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6, boxSizing: 'border-box', background: 'white' }}
                options={(data?.employes || []).map(e => ({ value: String(e.id), label: `${e.nom}${e.poste ? ' · ' + e.poste : ''}` }))}
              />
            </div>
            <button onClick={nextEmp} style={btnNav} title="Employé suivant (→)">▶</button>
          </div>
        )}

        {isAdmin && !monthAllLocked && (
          <button onClick={handleSync} disabled={syncing} style={{
            padding: '9px 14px', fontSize: 13, background: '#0C447C', color: 'white',
            border: '1px solid #0C447C', borderRadius: 8,
            cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            {syncing
              ? <><Clock size={14} /> Sync...</>
              : <><RefreshCw size={14} /> Sync Odoo</>}
          </button>
        )}

        {isAdmin && (
          <button onClick={() => setShowPointeuse(true)} style={{
            padding: '9px 14px', fontSize: 13, background: 'white', color: '#993556',
            border: '1px solid #e5d8c3', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Fingerprint size={14} /> Pointeuse
          </button>
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {loading &&<div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>}

      {!loading && vue === 'annee' && data && isAdmin && result && (
        <VueAnnee
          empId={selectedEmpId}
          emp={empSelected}
          annee={annee}
          isAdmin={isAdmin}
        />
      )}

      {!loading && vue === 'all' && data && isAdmin && (
        <>
          <VueGlobale data={data} resultats={resultats} mois={mois} annee={annee} isAdmin={isAdmin} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={handleExportSup} style={btnExport}><Download size={14} /> Export heures sup</button>
            <button onClick={handleExportConges} style={btnExport}><Download size={14} /> Export congés</button>
            <button onClick={handleExportCongesEtSup} style={btnExport}><Download size={14} /> Export congés + h. sup</button>
            <button onClick={handleValider} style={btnPrimaryGreen}>✓ Valider le mois</button>
          </div>
        </>
      )}

      {!loading && vue === 'recup' && data && (
        <>
          <VueRecup data={data} resultats={resultats} mois={mois} annee={annee} />
          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={handleExportSup} style={btnExport}><Download size={14} /> Export heures sup</button>
              <button onClick={handleExportConges} style={btnExport}><Download size={14} /> Export congés</button>
            </div>
          )}
        </>
      )}



      {!loading && vue === 'single' && isAdmin && data && (
        <div style={{ display: isMobile ? 'block' : 'flex', gap: 16, alignItems: isMobile ? 'flex-start' : 'stretch', height: isMobile ? undefined : 'calc(100vh - 175px)' }}>
          <div style={{ width: isMobile ? '100%' : 240, flexShrink: 0, display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 4, overflowX: isMobile ? 'auto' : 'visible', overflowY: isMobile ? 'visible' : 'auto', marginBottom: isMobile ? 12 : 0, paddingRight: isMobile ? 0 : 4 }}>
            {(data.employes || []).map(e => (
              <button key={e.id} onClick={() => setSelectedEmpId(e.id)} title={e.nom} style={{
                padding: '9px 12px', fontSize: 13, textAlign: 'left', cursor: 'pointer',
                background: e.id === selectedEmpId ? '#993556' : 'white',
                color: e.id === selectedEmpId ? '#faf7f2' : '#1a0f0a',
                border: '1px solid ' + (e.id === selectedEmpId ? '#993556' : '#e5d8c3'), borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                <Avatar emp={e} size={22} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nom}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, overflowY: isMobile ? 'visible' : 'auto', height: isMobile ? undefined : '100%', paddingRight: isMobile ? 0 : 4 }}>
          {!result && (<div style={{ padding: 40, textAlign: 'center', color: '#8a7a70', fontSize: 14 }}>← Choisis un employé dans la liste</div>)}
          {result && (
        <>
          {/* Nom employé cliquable → ouvre modal */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10, padding: '8px 12px',
            background: '#F4F0EA', borderRadius: 12, gap: 8, flexWrap: 'wrap',
            boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
          }}>
            <button onClick={() => setEditingEmp(empSelected)} style={{
              padding: '4px 8px', fontSize: 14, fontWeight: 500, color: '#993556',
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }} title="Cliquer pour éditer la fiche employé">
              <Avatar emp={empSelected} size={22} /> {empSelected?.nom} {empSelected?.poste && <span style={{ fontSize: 12, color: '#4a3a30', fontWeight: 400 }}>· {empSelected.poste}</span>} <Pencil size={12} />
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {empSelected?.societe?.code && (
                <span style={{
                  fontSize: 11, padding: '3px 8px', borderRadius: 999,
                  background: empSelected.societe.code === 'LG' ? '#FCEEE8' : '#EAF3DE',
                  color: empSelected.societe.code === 'LG' ? '#993556' : '#27500A',
                  fontWeight: 500,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <Building2 size={12} /> {empSelected.societe.nom}
                </span>
              )}
              {isAdmin && (
                <>
                  <button onClick={handleExportSup} style={btnExport}><Download size={14} /> Export heures sup</button>
                  <button onClick={handleExportConges} style={btnExport}><Download size={14} /> Export congés</button>
                  {isLocked && (
                    <button onClick={handleDebloquer} style={{
                      padding: '8px 14px', fontSize: 13, background: '#A32D2D', color: 'white',
                      border: '1px solid #A32D2D', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}><Unlock size={14} /> Débloquer le mois</button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Cartes synthèse */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 10, marginBottom: 18
          }}>
            <Carte label="Heures prévues"      val={result.synthese.heures_prevues} />
            <Carte label="Heures travaillées"  val={result.synthese.heures_travaillees} />
            <Carte label="Heures sup"          val={result.synthese.heures_sup}      color="#27500A" sign="+" />
            <Carte label="Heures manquantes"   val={result.synthese.heures_manquantes} color="#A32D2D" sign="-" />
            <Carte label="Jours récup"         val={result.synthese.jours_recup}      color="#3C3489" unit="j" />
            <Carte label="Solde reporté"       val={result.synthese.solde_reporte_precedent} color={result.synthese.solde_reporte_precedent < 0 ? '#A32D2D' : '#27500A'} signed />
            <Carte label="Solde du mois"       val={result.synthese.solde_mois}        color={result.synthese.solde_mois < 0 ? '#A32D2D' : '#27500A'} signed bold />
            {isAdmin && empSelected?.salaire_net > 0 && !empSelected?.declare && (
              <CarteSalaire
                salaire={Number(empSelected.salaire_net)}
                heuresSup={empSelected.heures_sup_mensuelles === false ? 0 : result.synthese.heures_sup}
                heuresManquantes={empSelected.heures_sup_mensuelles === false ? 0 : result.synthese.heures_manquantes}
              />
            )}
          </div>

          {/* Convertir les heures (sup / manquantes) en jours */}
          {canEdit && (result.synthese.heures_sup > 0 || result.synthese.heures_manquantes > 0) && (
            <button onClick={() => setShowConvert(true)} style={{
              padding: '9px 14px', fontSize: 13, background: '#3C3489', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12,
            }}>
              <RefreshCw size={14} /> Convertir les heures en jours
            </button>
          )}

          {/* Enlever / remettre les heures sup du mois (admin, mois non verrouillé) */}
          {canEdit && (() => {
            const supRetireesCeMois = (data?.ajustements || []).some(a => Number(a.employe_id) === Number(selectedEmpId) && a.champ === 'heures_sup')
            if (result.synthese.heures_sup > 0) {
              return (
                <button onClick={handleEnleverSupMois} style={btnSupOff} title="Met les heures sup de ce mois à 0 (les heures manquantes restent). Réversible.">
                  ✕ Enlever les heures sup de ce mois
                </button>
              )
            }
            if (supRetireesCeMois) {
              return (
                <button onClick={handleRemettreSupMois} style={btnSupOn} title="Remettre les heures sup calculées">
                  ↺ Remettre les heures sup
                </button>
              )
            }
            return null
          })()}

          {/* Tableau journal */}
          <JournalTable
            journal={result.journal}
            onEditCell={handleEditCell}
            onEditPointage={handleEditPointage}
            onEditTranches={canEdit ? setEditingTranches : () => {}}
            onForcerPresent={handleForcerPresent}
            onMarquerConge={(d) => setCongeModalDate(d)}
            canEdit={canEdit}
          />

          {/* Légende */}
          <Legende />

          {isAdmin && !isLocked && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
              <button onClick={handleValiderEmploye} style={{
                padding: '10px 16px', fontSize: 13, background: '#3C3489', color: 'white',
                border: '1px solid #3C3489', borderRadius: 8, cursor: 'pointer',
              }}>
                ✓ Valider {empSelected?.nom?.split(' ')[0] || 'cet employé'}
              </button>
              <button onClick={handleValider} style={btnPrimaryGreen}>
                ✓ Tout valider (avec PDF+CSV)
              </button>
            </div>
          )}
        </>
          )}
          </div>
        </div>
      )}

      {editingTranches && (
        <TranchesEditModal
          data={editingTranches}
          onClose={() => setEditingTranches(null)}
          onSave={handleSaveTranches}
        />
      )}

      {editingEmp && (
        <EmployeEditModal
          employe={editingEmp}
          user={user}
          isAdmin={isAdmin}
          onClose={() => setEditingEmp(null)}
          onSaved={() => { setEditingEmp(null); reload() }}
        />
      )}

      {showPointeuse && (
        <PointeuseModal onClose={() => setShowPointeuse(false)} />
      )}

      {showConvert && result && (
        <ConversionModal
          empNom={empSelected?.nom || ''}
          moisLabel={`${MOIS_FR[mois - 1]} ${annee}`}
          supMax={result.synthese.heures_sup}
          manqMax={result.synthese.heures_manquantes}
          onClose={() => setShowConvert(false)}
          onConfirm={async (supH, manqH) => {
            try {
              await convertirHeuresEnJours({
                employe: empSelected, mois, annee,
                supHeures: supH, manqHeures: manqH,
                moisLabel: `${MOIS_FR[mois - 1]} ${annee}`, userId: user.id,
              })
              setShowConvert(false)
              await reload()
              toast.success('Conversion enregistrée.')
            } catch (e) { toast.error('Erreur : ' + e.message) }
          }}
        />
      )}

      {congeModalDate && (
        <CongeAbsenceModal
          date={congeModalDate}
          empNom={empSelected?.nom || ''}
          onClose={() => setCongeModalDate(null)}
          onConfirm={(type, demi) => handleCreateConge(congeModalDate, type, demi)}
        />
      )}
    </div>
  )
}

// Mini modal pour transformer une absence en congé : choix du type.
function CongeAbsenceModal({ date, empNom, onClose, onConfirm }) {
  const [type, setType] = useState('annuel')
  const [demi, setDemi] = useState(false)
  const [busy, setBusy] = useState(false)
  const TYPES = [
    { v: 'annuel',         label: 'Congé annuel' },
    { v: 'maladie_courte', label: 'Congé maladie ≤ 3 j' },
    { v: 'maladie_longue', label: 'Congé maladie > 3 j' },
    { v: 'sans solde',     label: 'Sans solde' },
    { v: 'recup',          label: 'Récupération' },
  ]
  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
  const modal   = { background: 'white', borderRadius: 16, padding: 22, maxWidth: 360, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }
  const ipt     = { width: '100%', padding: '8px 10px', border: '1px solid #E5D8C3', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Marquer comme congé</div>
        <div style={{ fontSize: 12, color: '#8a7a70', marginBottom: 12 }}>{empNom} · {date}</div>

        <label style={{ fontSize: 12, color: '#4a3a30', marginBottom: 4, display: 'block' }}>Type d'absence</label>
        <select value={type} onChange={e => setType(e.target.value)} style={ipt}>
          {TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#4a3a30', cursor: 'pointer' }}>
          <input type="checkbox" checked={demi} onChange={e => setDemi(e.target.checked)} />
          ½ journée (0,5 j)
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={busy} style={{ padding: '6px 12px', border: '1px solid #E5D8C3', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 12 }}>Annuler</button>
          <button onClick={async () => { setBusy(true); await onConfirm(type, demi); setBusy(false) }} disabled={busy} style={{ padding: '6px 12px', border: 'none', borderRadius: 8, background: '#993556', color: 'white', cursor: 'pointer', fontSize: 12 }}>{busy ? '…' : 'Créer & valider'}</button>
        </div>
      </div>
    </div>
  )
}

// Fenêtre : convertir des heures (sup / manquantes) en jours. 8 h = 1 jour.
function ConversionModal({ empNom, moisLabel, supMax, manqMax, onClose, onConfirm }) {
  const [supH, setSupH]   = useState(supMax > 0 ? String(supMax) : '0')
  const [manqH, setManqH] = useState(manqMax > 0 ? String(manqMax) : '0')
  const [busy, setBusy]   = useState(false)
  const clamp = (v, max) => Math.max(0, Math.min(max, Number(String(v).replace(',', '.')) || 0))
  const supVal  = clamp(supH, supMax)
  const manqVal = clamp(manqH, manqMax)
  const r2 = n => Math.round(n / 8 * 100) / 100
  const rien = supVal <= 0 && manqVal <= 0

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }
  const modal   = { background: 'white', borderRadius: 16, padding: 22, maxWidth: 460, width: '100%', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }
  const hin     = { width: 64, padding: '6px 8px', border: '1px solid #d9b9c4', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'center', color: '#993556' }
  const row     = (bg) => ({ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, marginBottom: 10, background: bg })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>Convertir les heures en jours</div>
        <div style={{ fontSize: 12, color: '#8a7a70', marginBottom: 16 }}>{empNom} · {moisLabel} — 8 h = 1 jour</div>

        {supMax > 0 && (
          <div style={row('#EAF3DE')}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Heures sup
              <div style={{ fontWeight: 400, fontSize: 11.5, color: '#4a3a30' }}>disponible : +{supMax} h</div>
            </div>
            <input style={hin} value={supH} onChange={e => setSupH(e.target.value)} inputMode="decimal" /> <span style={{ fontSize: 12, color: '#4a3a30' }}>h</span>
            <span style={{ color: '#8a7a70' }}>→</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#3C3489', minWidth: 92 }}>{r2(supVal)} j récup</div>
          </div>
        )}

        {manqMax > 0 && (
          <div style={row('#FCEBEB')}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Heures manquantes
              <div style={{ fontWeight: 400, fontSize: 11.5, color: '#4a3a30' }}>disponible : −{manqMax} h</div>
            </div>
            <input style={hin} value={manqH} onChange={e => setManqH(e.target.value)} inputMode="decimal" /> <span style={{ fontSize: 12, color: '#4a3a30' }}>h</span>
            <span style={{ color: '#8a7a70' }}>→</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0C447C', minWidth: 92 }}>{r2(manqVal)} j décompté</div>
          </div>
        )}

        <div style={{ fontSize: 12, color: '#4a3a30', background: '#F4F0EA', padding: '9px 12px', borderRadius: 10, margin: '4px 0 16px' }}>
          Les heures converties seront <b>retirées du solde du mois</b> (pas de double comptage). Traçable dans <b>Congés → Allocations</b>, et réversible.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={busy} style={{ padding: '8px 14px', border: '1px solid #E5D8C3', borderRadius: 8, background: 'white', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
          <button onClick={async () => { setBusy(true); await onConfirm(supVal, manqVal); setBusy(false) }} disabled={busy || rien} style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: rien ? '#c9b8c0' : '#3C3489', color: 'white', cursor: rien ? 'default' : 'pointer', fontSize: 13, fontWeight: 500 }}>{busy ? '…' : 'Convertir'}</button>
        </div>
      </div>
    </div>
  )
}

// Modal pour éditer les tranches horaires d'un jour
function TranchesEditModal({ data, onClose, onSave }) {
  const { date, sessions: initSessions } = data
  // Convertir sessions en format éditable : [{ arrivee_hm, depart_hm }, ...]
  const [sessions, setSessions] = useState(() => {
    if (!initSessions || initSessions.length === 0) return [{ arrivee_hm: '', depart_hm: '' }]
    return initSessions.map(s => ({
      id: s.id,
      arrivee_hm: s.arrivee ? new Date(s.arrivee).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
      depart_hm:  s.depart  ? new Date(s.depart).toLocaleTimeString('fr-FR',  { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
    }))
  })

  function update(i, field, value) {
    setSessions(s => s.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }
  function add() {
    setSessions(s => [...s, { arrivee_hm: '', depart_hm: '' }])
  }
  function remove(i) {
    setSessions(s => s.filter((_, idx) => idx !== i))
  }

  function save() {
    // Convertir hm en datetime (date du jour + heure)
    const final = sessions
      .filter(s => s.arrivee_hm || s.depart_hm)
      .map(s => {
        // new Date(...).toISOString() convertit l'heure locale saisie (Maroc) en UTC,
        // comme sont stockés les autres pointages → pas de décalage d'1 h à la sauvegarde.
        const arrivee = s.arrivee_hm ? new Date(`${date}T${s.arrivee_hm}:00`).toISOString() : null
        const depart  = s.depart_hm  ? new Date(`${date}T${s.depart_hm}:00`).toISOString()  : null
        return { id: s.id, arrivee, depart }
      })
    onSave(date, final)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: 16, padding: 20, maxWidth: 500, width: '100%' }}>
        <h3 style={{ margin: 0, marginBottom: 12, fontSize: 15, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Pencil size={16} /> Modifier les pointages du {date}
        </h3>
        <p style={{ fontSize: 12, color: '#4a3a30', marginTop: 0, marginBottom: 14 }}>
          Chaque ligne = 1 session (arrivée → départ). Format HH:MM.
        </p>

        {sessions.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
            <input type="time" value={s.arrivee_hm} onChange={e => update(i, 'arrivee_hm', e.target.value)}
                   placeholder="Arrivée" style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6 }} />
            <input type="time" value={s.depart_hm} onChange={e => update(i, 'depart_hm', e.target.value)}
                   placeholder="Départ" style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6 }} />
            <button onClick={() => remove(i)} style={{ padding: '7px 10px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#A32D2D', display: 'inline-flex', alignItems: 'center' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}

        <button onClick={add} style={{ marginTop: 4, padding: '7px 14px', fontSize: 12, background: '#F4F0EA', border: '1px solid #e5d8c3', borderRadius: 6, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Ajouter une session
        </button>

        <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 16px', fontSize: 13, background: 'white', border: '1px solid #e5d8c3', borderRadius: 8, cursor: 'pointer' }}>Annuler</button>
          <button onClick={save} style={{ padding: '9px 16px', fontSize: 13, background: '#993556', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Save size={14} /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}



function VueAnnee({ empId, emp, annee, isAdmin }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const MOIS_FR_LOCAL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

  useEffect(() => {
    (async () => {
      if (!empId) return
      setLoading(true)
      try {
        // Charger les 12 mois de l'année en parallèle
        const promises = []
        for (let m = 1; m <= 12; m++) {
          promises.push(loadMonthData(m, annee))
        }
        const results = await Promise.all(promises)
        // Pour chaque mois, calculer pour l'employé
        const yearData = results.map((monthData, idx) => {
          const empData = monthData.employes.find(e => e.id === empId)
          if (!empData) return { mois: idx + 1, vide: true }
          const r = calculerMois(empData, idx + 1, annee, monthData)
          return { mois: idx + 1, ...r.synthese, valide: monthData.synthese?.find(s => s.employe_id === empId)?.valide || false }
        })
        setData(yearData)
      } catch (e) {
        console.error('Erreur chargement année :', e)
      }
      setLoading(false)
    })()
  }, [empId, annee])

  if (loading) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Chargement des 12 mois…</div>
  }
  if (!data || !emp) {
    return <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Sélectionnez un employé.</div>
  }

  // Totaux annuels
  const total = data.reduce((acc, m) => {
    if (m.vide) return acc
    acc.prevues += m.heures_prevues || 0
    acc.travaillees += m.heures_travaillees || 0
    acc.sup += m.heures_sup || 0
    acc.manquantes += m.heures_manquantes || 0
    acc.recup += m.jours_recup || 0
    return acc
  }, { prevues: 0, travaillees: 0, sup: 0, manquantes: 0, recup: 0 })

  // Salaire annuel
  const salaireNet = Number(emp.salaire_net || 0)
  const tauxHoraire = salaireNet / 26 / 8
  const tauxMajore = tauxHoraire * 1.25
  const salaireAnnuel = data.reduce((sum, m) => {
    if (m.vide) return sum
    const forfait = emp.heures_sup_mensuelles === false
    const supPay = forfait ? 0 : (m.heures_sup || 0)
    const manqPay = forfait ? 0 : (m.heures_manquantes || 0)
    return sum + salaireNet + (tauxMajore * supPay) - (tauxHoraire * manqPay)
  }, 0)

  return (
    <div>
      <div style={{
        background: '#F4F0EA', padding: 12, borderRadius: 12, marginBottom: 12,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
      }}>
        <span style={{ fontSize: 13, color: '#1a0f0a', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} /> <strong>Vue annuelle</strong> · {emp.nom} · {annee}
        </span>
        {salaireNet > 0 && (
          <span style={{ fontSize: 13, color: '#27500A', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Wallet size={14} /> Salaire annuel estimé : {salaireAnnuel.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} dh
          </span>
        )}
      </div>

      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5d8c3', overflowX: 'auto', boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F4F0EA', fontSize: 11, color: '#4a3a30' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500 }}>Mois</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Prévues</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Travail.</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: '#27500A' }}>Sup</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: '#A32D2D' }}>Manq.</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: '#3C3489' }}>Récup</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Solde</th>
              {salaireNet > 0 && <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>Salaire estimé</th>}
              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 500 }}>État</th>
            </tr>
          </thead>
          <tbody>
            {data.map(m => {
              const forfait = emp.heures_sup_mensuelles === false
              const supPay = forfait ? 0 : (m.heures_sup || 0)
              const manqPay = forfait ? 0 : (m.heures_manquantes || 0)
              const salaireMois = salaireNet > 0 ? salaireNet + (tauxMajore * supPay) - (tauxHoraire * manqPay) : 0
              return (
                <tr key={m.mois} style={{ borderTop: '1px solid #F4F0EA', opacity: m.vide ? 0.4 : 1 }}>
                  <td style={{ padding: '8px 12px' }}><strong>{MOIS_FR_LOCAL[m.mois - 1]}</strong></td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{m.vide ? '—' : (m.heures_prevues || 0).toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>{m.vide ? '—' : (m.heures_travaillees || 0).toFixed(2)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#27500A' }}>{m.vide ? '—' : ((m.heures_sup || 0) > 0 ? '+' + m.heures_sup.toFixed(2) : '—')}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#A32D2D' }}>{m.vide ? '—' : ((m.heures_manquantes || 0) > 0 ? '-' + m.heures_manquantes.toFixed(2) : '—')}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#3C3489' }}>{m.vide ? '—' : ((m.jours_recup || 0) > 0 ? m.jours_recup.toFixed(2) + 'j' : '—')}</td>
                  <td style={{
                    padding: '8px 12px', textAlign: 'right', fontWeight: 500,
                    color: (m.solde_mois || 0) >= 0 ? '#27500A' : '#A32D2D',
                  }}>
                    {m.vide ? '—' : ((m.solde_mois || 0) >= 0 ? '+' : '') + (m.solde_mois || 0).toFixed(2)}
                  </td>
                  {salaireNet > 0 && (
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#27500A', fontWeight: 500 }}>
                      {m.vide ? '—' : salaireMois.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' dh'}
                    </td>
                  )}
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    {m.vide ? '' : m.valide ? <Lock size={14} /> : <Pencil size={14} />}
                  </td>
                </tr>
              )
            })}
            {/* Total annuel */}
            <tr style={{ borderTop: '2px solid #993556', background: '#F9F6F1', fontWeight: 600 }}>
              <td style={{ padding: '10px 12px' }}>TOTAL {annee}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>{total.prevues.toFixed(2)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>{total.travaillees.toFixed(2)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#27500A' }}>+{total.sup.toFixed(2)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#A32D2D' }}>-{total.manquantes.toFixed(2)}</td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#3C3489' }}>{total.recup.toFixed(2)}j</td>
              <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                {(total.sup - total.manquantes).toFixed(2)}
              </td>
              {salaireNet > 0 && (
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#27500A' }}>
                  {salaireAnnuel.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} dh
                </td>
              )}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CarteSalaire({ salaire, heuresSup, heuresManquantes = 0 }) {
  const [revealed, setRevealed] = useState(false)
  // Taux horaire = salaire / 26 jours / 8 h.
  // Heures sup majorées +25% (ajoutées), heures manquantes au taux normal (déduites).
  const tauxHoraire = salaire / 26 / 8
  const montantSup = tauxHoraire * 1.25 * heuresSup
  const montantManq = tauxHoraire * heuresManquantes
  const total = salaire + montantSup - montantManq
  return (
    <div style={{ background: '#EAF3DE', padding: 12, borderRadius: 12, border: '1px solid #C0DD97', boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
      <p style={{ fontSize: 11, color: '#27500A', margin: 0, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Wallet size={14} /> Salaire estimé</span>
        <button onClick={() => setRevealed(!revealed)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
          display: 'inline-flex', alignItems: 'center',
        }} title={revealed ? 'Masquer' : 'Révéler'}>
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </p>
      <p style={{ fontSize: 18, fontWeight: 600, color: '#27500A', margin: 0 }}>
        {revealed
          ? total.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' dh'
          : '••••• dh'}
      </p>
      {revealed && (heuresSup > 0 || heuresManquantes > 0) && (
        <p style={{ fontSize: 10, color: '#4a3a30', margin: '4px 0 0' }}>
          base {salaire.toLocaleString('fr-FR')}
          {heuresSup > 0 && <span style={{ color: '#27500A' }}> + {montantSup.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} (sup ×1,25)</span>}
          {heuresManquantes > 0 && <span style={{ color: '#A32D2D' }}> − {montantManq.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} (manq.)</span>}
        </p>
      )}
    </div>
  )
}

function Carte({ label, val, color = '#1a0f0a', sign = '', unit = 'h', signed = false, bold = false }) {
  let displayVal = ''
  if (signed) displayVal = (val > 0 ? '+' : '') + val.toFixed(2) + unit
  else if (sign && val > 0) displayVal = sign + val.toFixed(2) + unit
  else displayVal = val.toFixed(unit === 'j' ? 2 : 2) + unit

  return (
    <div style={{ background: '#F4F0EA', padding: 12, borderRadius: 12, boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
      <p style={{ fontSize: 11, color: '#4a3a30', margin: 0, marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: bold ? 600 : 500, color, margin: 0 }}>{displayVal}</p>
    </div>
  )
}

function JournalTable({ journal, onEditCell, onEditPointage, onEditTranches, onForcerPresent, onMarquerConge, canEdit }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12, border: '1px solid #e5d8c3',
      overflowX: 'auto', marginBottom: 16, boxShadow: '0 4px 14px rgba(122,42,68,0.05)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F4F0EA', fontSize: 11, color: '#4a3a30' }}>
            <Th w={70}>Jour</Th>
            <Th>Tranches horaires</Th>
            <Th w={70} align="right">Prévu</Th>
            <Th w={70} align="right">Travail.</Th>
            <Th w={70} align="right">Sup</Th>
            <Th w={70} align="right">Manq.</Th>
            <Th w={70} align="right">Récup</Th>
            <Th w={100}>Statut</Th>
          </tr>
        </thead>
        <tbody>
          {journal.map(j => (
            <Row key={j.date} j={j} onEditCell={onEditCell} onEditPointage={onEditPointage} onEditTranches={onEditTranches} onForcerPresent={onForcerPresent} onMarquerConge={onMarquerConge} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ j, onEditCell, onEditPointage, onEditTranches, onForcerPresent, onMarquerConge, canEdit }) {
  const c = COULEUR_STATUT[j.statut] || COULEUR_STATUT.normal
  return (
    <tr style={{ borderTop: '1px solid #F4F0EA', background: c.bg }}>
      <Td>{j.jour_semaine} {String(j.jour_num).padStart(2, '0')}</Td>
      <Td onClick={() => canEdit && onEditTranches({ date: j.date, sessions: j.sessions || [], statut: j.statut })} style={{ fontFamily: 'monospace', fontSize: 11, color: c.text, cursor: canEdit ? 'pointer' : 'default' }} title={canEdit ? 'Cliquer pour modifier les pointages' : ''}>{j.tranches}</Td>
      <EditableCell value={j.heures_prevues} onChange={v => onEditCell(j.date, 'heures_prevues', v)} align="right" canEdit={canEdit} />
      <EditableCell value={j.heures_travaillees} onChange={v => onEditCell(j.date, 'heures_travaillees', v)} align="right" canEdit={canEdit} />
      <EditableCell value={j.heures_sup} onChange={v => onEditCell(j.date, 'heures_sup', v)} align="right" color="#27500A" canEdit={canEdit} />
      <EditableCell value={j.heures_manquantes} onChange={v => onEditCell(j.date, 'heures_manquantes', v)} align="right" color="#A32D2D" canEdit={canEdit} />
      <EditableCell value={j.jours_recup} onChange={v => onEditCell(j.date, 'jours_recup', v)} align="right" color="#3C3489" canEdit={canEdit} />
      <Td>
        <span style={{
          fontSize: 10, padding: '2px 6px', borderRadius: 6,
          background: c.text, color: 'white'
        }}>{j.label}</span>
        {j.statut === 'absent' && canEdit && (
          <>
            <button onClick={() => onForcerPresent(j.date)} title="Marquer présent" style={{
              marginLeft: 4, padding: '2px 6px', fontSize: 10, background: '#EAF3DE', color: '#27500A',
              border: '1px solid #C0DD97', borderRadius: 4, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}><Hand size={12} /> Présent</button>
            <button onClick={() => onMarquerConge(j.date)} title="Marquer comme congé / absence" style={{
              marginLeft: 4, padding: '2px 6px', fontSize: 10, background: '#FDF1F5', color: '#993556',
              border: '1px solid #E8B6C7', borderRadius: 4, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>Congé</button>
          </>
        )}
      </Td>
    </tr>
  )
}

function EditableCell({ value, onChange, align = 'left', color = '#1a0f0a', canEdit = true }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])

  function commit() {
    setEditing(false)
    if (Number(v) !== Number(value)) onChange(v)
  }

  if (editing) {
    return (
      <td style={{ padding: '5px 8px', textAlign: align }}>
        <input
          type="number" step="0.25" value={v}
          onChange={e => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setV(value); setEditing(false) } }}
          autoFocus
          style={{
            width: 60, padding: 2, textAlign: align,
            fontSize: 12, border: '1px solid #993556', borderRadius: 4,
          }}
        />
      </td>
    )
  }

  const display = (value === 0 || value == null) ? '—' : Number(value).toFixed(2)
  return (
    <td onClick={() => canEdit && setEditing(true)} style={{
      padding: '7px 10px', textAlign: align, color: value > 0 ? color : '#8a7a70',
      cursor: canEdit ? 'pointer' : 'default',
    }}>
      {display}
    </td>
  )
}

function Th({ children, w, align = 'left' }) {
  return (
    <th style={{
      padding: '8px 10px', textAlign: align, fontWeight: 500,
      width: w ? w + 'px' : 'auto',
    }}>
      {children}
    </th>
  )
}

function Td({ children, style = {}, ...rest }) {
  return <td style={{ padding: '7px 10px', ...style }} {...rest}>{children}</td>
}

function Legende() {
  const items = [
    { c: 'white',   border: '#e5d8c3', label: 'Journée normale' },
    { c: '#FFF7E0', label: 'Demi-journée' },
    { c: '#F5EFE7', label: 'OFF' },
    { c: '#EEEDFE', label: 'OFF travaillé (récup)' },
    { c: '#EAF3DE', label: 'Férié' },
    { c: '#C0DD97', label: 'Férié travaillé (récup)' },
    { c: '#E6F1FB', label: 'Congé' },
    { c: '#FCEBEB', label: 'Absent / anomalie' },
  ]
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#4a3a30', marginBottom: 16 }}>
      <span style={{ fontWeight: 500 }}>Légende :</span>
      {items.map(i => (
        <span key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 12, height: 12, background: i.c, borderRadius: 3,
            border: '1px solid ' + (i.border || '#e5d8c3'),
          }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}







function VueRecup({ data, resultats, mois, annee }) {
  // Pour chaque employé, collecter ses jours de récup + absences (triés chronologiquement)
  const lignes = []
  for (const emp of data.employes) {
    const r = resultats[emp.id]
    if (!r) continue
    const jours = r.journal.filter(j => j.jours_recup > 0 || j.statut === 'absent')
    if (jours.length === 0) continue
    // Tri chronologique
    jours.sort((a, b) => a.date.localeCompare(b.date))
    const totalRecup = jours.filter(j => j.jours_recup > 0).reduce((s, j) => s + j.jours_recup, 0)
    const nbAbsents = jours.filter(j => j.statut === 'absent').length
    lignes.push({ emp, jours, totalRecup, nbAbsents })
  }

  if (lignes.length === 0) {
    return (
      <div style={{
        padding: 40, textAlign: 'center', color: '#4a3a30',
        background: '#F9F6F1', borderRadius: 10, fontSize: 13,
      }}>
        Aucune récup ni absence ce mois-ci 🌸
      </div>
    )
  }

  // Stats résumé global
  const totalJoursRecup = lignes.reduce((s, l) => s + l.totalRecup, 0)
  const totalAbsences = lignes.reduce((s, l) => s + l.nbAbsents, 0)
  const nbEmpRecup = lignes.filter(l => l.totalRecup > 0).length
  const nbEmpAbsents = lignes.filter(l => l.nbAbsents > 0).length

  const joursFR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const moisFR  = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

  return (
    <div>
      {/* Bandeaux de résumé global */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div style={{
          background: '#EEEDFE', padding: 12, borderRadius: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 4px 14px rgba(122,42,68,0.05)',
        }}>
          <span style={{ fontSize: 12, color: '#3C3489', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#9333EA', display: 'inline-block' }} />
            Récup · {nbEmpRecup} employé{nbEmpRecup > 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#3C3489' }}>{totalJoursRecup.toFixed(2)} j</span>
        </div>
        <div style={{
          background: '#FCEBEB', padding: 12, borderRadius: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          boxShadow: '0 4px 14px rgba(122,42,68,0.05)',
        }}>
          <span style={{ fontSize: 12, color: '#A32D2D', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: '#A32D2D', display: 'inline-block' }} />
            Absences · {nbEmpAbsents} employé{nbEmpAbsents > 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#A32D2D' }}>{totalAbsences} jour{totalAbsences > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Liste groupée par personnel */}
      {lignes.map(({ emp, jours, totalRecup, nbAbsents }) => (
        <div key={emp.id} style={{
          background: 'white', borderRadius: 12, border: '1px solid #e5d8c3',
          marginBottom: 12, overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(122,42,68,0.05)',
        }}>
          {/* Header employé */}
          <div style={{
            padding: '10px 14px', background: '#F4F0EA',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <div>
              <strong style={{ fontSize: 13 }}>{emp.nom}</strong>
              {emp.poste && <span style={{ fontSize: 11, color: '#8a7a70', marginLeft: 8 }}>· {emp.poste}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {totalRecup > 0 && (
                <span style={{
                  fontSize: 12, fontWeight: 500, color: '#3C3489',
                  background: '#EEEDFE', padding: '4px 10px', borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: '#9333EA', display: 'inline-block' }} />
                  {totalRecup.toFixed(2)} j récup
                </span>
              )}
              {nbAbsents > 0 && (
                <span style={{
                  fontSize: 12, fontWeight: 500, color: '#A32D2D',
                  background: '#FCEBEB', padding: '4px 10px', borderRadius: 999,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: '#A32D2D', display: 'inline-block' }} />
                  {nbAbsents} absent{nbAbsents > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Liste des jours triée chronologiquement */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {jours.map((j, i) => {
                const isRecup = j.jours_recup > 0
                const d = new Date(j.date)
                const dateLabel = `${joursFR[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${moisFR[d.getMonth()]}`
                const bgRow = isRecup ? '#FBFAFE' : '#FFF8F7'
                return (
                  <tr key={j.date} style={{ background: bgRow, borderTop: i > 0 ? '1px solid #F4F0EA' : 'none' }}>
                    <td style={{ padding: '7px 14px', width: 30 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 999, background: isRecup ? '#9333EA' : '#A32D2D', display: 'inline-block' }} />
                    </td>
                    <td style={{ padding: '7px 8px', minWidth: 110, fontSize: 12 }}>
                      {dateLabel}
                    </td>
                    <td style={{ padding: '7px 8px', fontFamily: 'monospace', fontSize: 11, color: '#4a3a30' }}>
                      {isRecup ? j.tranches : '—'}
                    </td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', fontSize: 11, color: '#4a3a30' }}>
                      {isRecup
                        ? `${j.heures_travaillees.toFixed(2)}h travaillées`
                        : `${j.heures_prevues.toFixed(2)}h prévues`}
                    </td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', width: 130 }}>
                      {isRecup ? (
                        <span style={{ fontSize: 11, fontWeight: 500, color: '#3C3489', background: '#EEEDFE', padding: '3px 8px', borderRadius: 999 }}>
                          +{j.jours_recup.toFixed(2)} j
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 500, color: '#A32D2D', background: '#FCEBEB', padding: '3px 8px', borderRadius: 999 }}>
                          -{j.heures_manquantes.toFixed(2)}h
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function VueGlobale({ data, resultats, mois, annee }) {
  const [byEquipe, setByEquipe] = useState(() => { try { return localStorage.getItem('lily.pointage.byEquipe') === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem('lily.pointage.byEquipe', byEquipe ? '1' : '0') } catch {} }, [byEquipe])

  const list = data.employes.map(emp => [emp, resultats[emp.id]]).filter(([, r]) => r)

  const empRow = (emp, r) => {
    const s = r.synthese
    return (
      <tr key={emp.id} style={{ borderTop: '1px solid #F4F0EA' }}>
        <td style={{ padding: '8px 12px' }}>
          <strong style={{ fontSize: 12 }}>{emp.nom}</strong>
          {emp.poste && <div style={{ fontSize: 10, color: '#8a7a70' }}>{emp.poste}</div>}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.heures_prevues.toFixed(2)}</td>
        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{s.heures_travaillees.toFixed(2)}</td>
        <td style={{ padding: '8px 12px', textAlign: 'right', color: s.heures_sup > 0 ? '#27500A' : '#8a7a70', fontWeight: s.heures_sup > 0 ? 500 : 400 }}>
          {s.heures_sup > 0 ? '+' + s.heures_sup.toFixed(2) : '—'}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right', color: s.heures_manquantes > 0 ? '#A32D2D' : '#8a7a70', fontWeight: s.heures_manquantes > 0 ? 500 : 400 }}>
          {s.heures_manquantes > 0 ? '-' + s.heures_manquantes.toFixed(2) : '—'}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right', color: s.jours_recup > 0 ? '#3C3489' : '#8a7a70' }}>
          {s.jours_recup > 0 ? s.jours_recup.toFixed(2) + ' j' : '—'}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right', color: s.solde_reporte_precedent === 0 ? '#8a7a70' : (s.solde_reporte_precedent > 0 ? '#27500A' : '#A32D2D') }}>
          {s.solde_reporte_precedent === 0 ? '—' : (s.solde_reporte_precedent > 0 ? '+' : '') + s.solde_reporte_precedent.toFixed(2)}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, color: s.solde_mois === 0 ? '#8a7a70' : (s.solde_mois > 0 ? '#27500A' : '#A32D2D') }}>
          {(s.solde_mois > 0 ? '+' : '') + s.solde_mois.toFixed(2)}
        </td>
        <td style={{ padding: '8px 12px', textAlign: 'center', color: s.jours_absents > 0 ? '#A32D2D' : '#8a7a70' }}>
          {s.jours_absents > 0 ? s.jours_absents : '—'}
        </td>
      </tr>
    )
  }

  const sousTotal = (team, items) => {
    const sum = k => items.reduce((a, [, r]) => a + (Number(r.synthese[k]) || 0), 0)
    return (
      <tr key={'st-' + team} style={{ borderTop: '1px solid #e5d8c3', background: '#FBF7F0', fontWeight: 600 }}>
        <td style={{ padding: '7px 12px', fontSize: 11, color: '#4a3a30' }}>Total {team}</td>
        <td /><td />
        <td style={{ padding: '7px 12px', textAlign: 'right', color: '#27500A' }}>+{sum('heures_sup').toFixed(2)}</td>
        <td style={{ padding: '7px 12px', textAlign: 'right', color: '#A32D2D' }}>-{sum('heures_manquantes').toFixed(2)}</td>
        <td style={{ padding: '7px 12px', textAlign: 'right', color: '#3C3489' }}>{sum('jours_recup').toFixed(2)} j</td>
        <td />
        <td style={{ padding: '7px 12px', textAlign: 'right' }}>{sum('solde_mois').toFixed(2)}</td>
        <td style={{ padding: '7px 12px', textAlign: 'center', color: '#A32D2D' }}>{sum('jours_absents') || '—'}</td>
      </tr>
    )
  }

  let body
  if (byEquipe) {
    const groups = new Map()
    for (const [emp, r] of list) {
      const k = emp.groupe || '__none__'
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push([emp, r])
    }
    const label = k => k === '__none__' ? 'Sans groupe' : groupLabel(k)
    body = [...groups.entries()].sort((a, b) => label(a[0]).localeCompare(label(b[0]))).map(([team, items]) => (
      <Fragment key={team}>
        <tr style={{ background: '#EFE7DA' }}>
          <td colSpan={9} style={{ padding: '8px 12px', fontWeight: 600, fontSize: 12, color: '#1a0f0a' }}>👥 {label(team)} <span style={{ color: '#8a7a70', fontWeight: 400 }}>({items.length})</span></td>
        </tr>
        {items.map(([emp, r]) => empRow(emp, r))}
        {sousTotal(label(team), items)}
      </Fragment>
    ))
  } else {
    body = list.map(([emp, r]) => empRow(emp, r))
  }

  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5d8c3', overflowX: 'auto', boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 12px', borderBottom: '1px solid #F4F0EA' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#4a3a30', cursor: 'pointer' }}>
          <input type="checkbox" checked={byEquipe} onChange={e => setByEquipe(e.target.checked)} /> Regrouper par groupe
        </label>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F4F0EA', fontSize: 11, color: '#4a3a30' }}>
            <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 500 }}>Employé</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>Prévues</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>Travail.</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: '#27500A' }}>Sup</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: '#A32D2D' }}>Manq.</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500, color: '#3C3489' }}>Récup</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>Reporté</th>
            <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }}>Solde mois</th>
            <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 500 }}>Abs.</th>
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  )
}

const btnNav = {
  padding: '7px 12px', fontSize: 14, background: 'white',
  border: '1px solid #e5d8c3', borderRadius: 6, cursor: 'pointer', color: '#1a0f0a',
}

const btnExport = {
  padding: '10px 16px', fontSize: 13, background: '#F4F0EA', color: '#1a0f0a',
  border: '1px solid #e5d8c3', borderRadius: 8, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

const btnPrimaryGreen = {
  padding: '10px 18px', fontSize: 13, background: '#27500A', color: 'white',
  border: '1px solid #27500A', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
  display: 'inline-flex', alignItems: 'center', gap: 6,
}

const btnSupOff = {
  marginBottom: 18, padding: '9px 16px', fontSize: 13, background: '#FCE9E8', color: '#A32D2D',
  border: '1px solid #E5B8B8', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
}
const btnSupOn = {
  marginBottom: 18, padding: '9px 16px', fontSize: 13, background: '#EAF3DE', color: '#27500A',
  border: '1px solid #A9CE86', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
}
