import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  User, Users, Calendar, RefreshCw, Clock, Lock, Unlock, Building2,
  Pencil, Trash2, Plus, Download, Save, Hand, Eye, EyeOff, Wallet,
} from 'lucide-react'
import {
  loadMonthData, calculerMois, syncAttendance, syncLeaves,
  setAjustement, removeAjustement, updatePointage, validerMois,
  nomJour, paireOuImpaire,
} from '../../lib/pointage'

// Pour congés annuels d'employés en planning alterné (2 jours off/semaine) :
// le jour off "fixe" (commun aux deux semaines) compte comme congé,
// le jour off "tournant" (qui change paire/impaire) ne compte PAS.
function compteJoursOffTournants(emp, debut, fin) {
  if (emp.planning_type !== 'alt') return 0
  const paireOffs   = [emp.planning_paire_off_1,   emp.planning_paire_off_2  ].filter(Boolean)
  const impaireOffs = [emp.planning_impaire_off_1, emp.planning_impaire_off_2].filter(Boolean)
  const fixedOff = paireOffs.find(d => impaireOffs.includes(d)) || null
  let count = 0
  const d = new Date(debut)
  while (d <= fin) {
    const jour = nomJour(d)
    const offs = paireOuImpaire(d) === 'Paire' ? paireOffs : impaireOffs
    if (offs.includes(jour) && jour !== fixedOff) count++
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
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [selectedEmpId, setSelectedEmpId] = useState(null)
  const [vue, setVue] = useState(isAdmin ? 'single' : 'recup')  // 'single' | 'all' | 'recup' | 'absences'
  const [editingTranches, setEditingTranches] = useState(null)  // { date, sessions } | null
  const [editingEmp, setEditingEmp] = useState(null)  // employé édité dans modal

  // Charger les données du mois
  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const d = await loadMonthData(mois, annee)
      setData(d)
      if (d.employes.length > 0 && !selectedEmpId) {
        setSelectedEmpId(d.employes[0].id)
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [mois, annee, selectedEmpId])

  useEffect(() => { reload() }, [mois, annee])

  // Calculs (mémorisés pour éviter recalcul à chaque render)
  const resultats = useMemo(() => {
    if (!data) return {}
    const out = {}
    for (const emp of data.employes) {
      out[emp.id] = calculerMois(emp, mois, annee, data)
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

  // Sync Odoo
  async function handleSync() {
    if (!confirm(`Synchroniser les pointages + congés depuis Odoo pour ${MOIS_FR[mois - 1]} ${annee} ?`)) return
    setSyncing(true); setError(null); setSuccess(null)
    try {
      const r1 = await syncAttendance(mois, annee)
      const r2 = await syncLeaves(mois, annee)
      console.log('[SYNC ATTENDANCE]', r1)
      console.log('[SYNC LEAVES]', r2)
      let msg = `✅ ${r1.inserted} pointages + ${r2.inserted} congés importés.`
      if (r1.matched_fuzzy && r1.matched_fuzzy.length > 0) {
        msg += `\n🔗 ${r1.matched_fuzzy.length} employé(s) matché(s) par similarité (mémorisés pour les prochaines syncs).`
      }
      if (r1.unmatched > 0) {
        msg += `\n⚠️ ${r1.unmatched_names?.length || 0} employé(s) Odoo non rattaché(s) :\n  • ${(r1.unmatched_names || []).join('\n  • ')}`
      }
      setSuccess(msg)
      await reload()
    } catch (e) {
      setError('Erreur sync : ' + e.message)
    }
    setSyncing(false)
  }

  // Édition d'une cellule (heures_travaillees, sup, manquantes, recup, statut)
  async function handleEditCell(dateJour, champ, valeur) {
    if (!canEdit) {
      alert(isLocked
        ? '🔒 Ce mois est validé. Débloquez-le pour modifier.'
        : '🔒 Modification réservée à l\'admin.')
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
      alert('Erreur : ' + e.message)
    }
  }

  // Édition d'un pointage (arrivee/depart)
  async function handleEditPointage(pointageId, champ, valeur) {
    try {
      await updatePointage(pointageId, { [champ]: valeur }, user.id)
      await reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
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
      alert('Erreur : ' + e.message)
    }
  }

  // ============================================
  // EXPORTS (admin)
  // ============================================

  async function downloadXLSX(filename, rows, sheetName = 'Feuille1') {
    // Charger SheetJS via CDN (pas de dépendance npm requise)
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
    const ws = XLSX.utils.aoa_to_sheet(rows)
    // Largeurs auto
    const colWidths = rows[0].map((_, i) => ({
      wch: Math.min(40, Math.max(...rows.map(r => String(r[i] || '').length)) + 2)
    }))
    ws['!cols'] = colWidths
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
    XLSX.writeFile(wb, filename)
  }

  async function handleExportSup() {
    if (!data) return
    const rows = [['Employé', 'Heures sup du mois']]
    for (const emp of data.employes) {
      const r = resultats[emp.id]
      if (!r) continue
      const sup = emp.heures_sup_mensuelles === false ? 0 : r.synthese.heures_sup
      rows.push([emp.nom, Number(sup.toFixed(2))])
    }
    const monthName = MOIS_FR[mois - 1] + '_' + annee
    await downloadXLSX('heures_sup_' + monthName + '.xlsx', rows, 'Heures sup ' + monthName)
  }

  async function handleExportConges() {
    if (!data) return
    const rows = [['Employé', 'Jours congé', 'Jours maladie (4+)']]
    for (const emp of data.employes) {
      const congesEmp = data.conges.filter(c => c.employe_id === emp.id)
      let joursConge = 0
      let joursMaladie = 0
      for (const c of congesEmp) {
        const debut = new Date(Math.max(new Date(c.date_debut), new Date(annee, mois - 1, 1)))
        const fin = new Date(Math.min(new Date(c.date_fin), new Date(annee, mois, 0)))
        if (fin < debut) continue
        const nbJours = Math.floor((fin - debut) / 86400000) + 1
        const typeLower = (c.type_conge || '').toLowerCase()
        if (typeLower.includes('maladie') || typeLower.includes('malade') || typeLower.includes('sick')) {
          if (nbJours >= 4) joursMaladie += nbJours
        } else if (typeLower.includes('récup') || typeLower.includes('recup')) {
          continue
        } else {
          joursConge += nbJours - compteJoursOffTournants(emp, debut, fin)
        }
      }
      if (joursConge > 0 || joursMaladie > 0) {
        rows.push([emp.nom, joursConge, joursMaladie])
      }
    }
    const monthName = MOIS_FR[mois - 1] + '_' + annee
    await downloadXLSX('conges_' + monthName + '.xlsx', rows, 'Congés ' + monthName)
  }

  // Validation du mois
  // Valider pour TOUS les employés du mois
  async function handleValider() {
    if (!confirm(`Valider le mois de ${MOIS_FR[mois - 1]} ${annee} pour TOUS les employés ?\n\nLes données seront figées et le solde reporté sur le mois suivant.\nUn PDF + CSV récapitulatif seront téléchargés.`)) return
    try {
      for (const emp of data.employes) {
        const r = resultats[emp.id]
        if (r) await validerMois(emp.id, mois, annee, r.synthese, r.journal, user.id)
      }
      // Générer le récap PDF + Excel
      await genererRecapMensuel()
      setSuccess('✅ Mois validé pour tous les employés. PDF + Excel téléchargés.')
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

      // Heures sup (respect toggle heures_sup_mensuelles)
      const sup = emp.heures_sup_mensuelles === false ? 0 : r.synthese.heures_sup

      // Jours congés + maladie (≥ 4 jours)
      const congesEmp = data.conges.filter(c => c.employe_id === emp.id)
      let joursConge = 0
      let joursMaladie = 0
      for (const cg of congesEmp) {
        const debut = new Date(Math.max(new Date(cg.date_debut), new Date(annee, mois - 1, 1)))
        const fin = new Date(Math.min(new Date(cg.date_fin), new Date(annee, mois, 0)))
        if (fin < debut) continue
        const nb = Math.floor((fin - debut) / 86400000) + 1
        const t = (cg.type_conge || '').toLowerCase()
        if (t.includes('maladie') || t.includes('sick')) {
          if (nb >= 4) joursMaladie += nb
        } else if (t.includes('récup') || t.includes('recup')) {
          continue
        } else {
          joursConge += nb - compteJoursOffTournants(emp, debut, fin)
        }
      }
      rows.push({
        nom: emp.nom,
        societe: emp.societe_id,
        sup: sup.toFixed(2),
        manquantes: r.synthese.heures_manquantes.toFixed(2),
        recup: r.synthese.jours_recup.toFixed(2),
        conge: joursConge,
        maladie: joursMaladie,
        solde_mois: r.synthese.solde_mois.toFixed(2),
      })
    }
    rows.sort((a, b) => a.nom.localeCompare(b.nom))

    // 1) Excel xlsx natif via SheetJS (chargé dynamiquement depuis CDN)
    const headers = ['Employé', 'Heures sup', 'Heures manquantes', 'Jours récup', 'Jours congé', 'Jours maladie (4+)', 'Solde mois (h)']
    const xlsxRows = [headers]
    for (const r of rows) {
      xlsxRows.push([r.nom, Number(r.sup), Number(r.manquantes), Number(r.recup), r.conge, r.maladie, Number(r.solde_mois)])
    }
    await downloadXLSX('recap_pointage_' + monthName + '.xlsx', xlsxRows, 'Récap ' + monthName)

    // 2) PDF (simple, via window.print sur une page HTML cachée)
    // ou via jsPDF si disponible. On va générer un HTML imprimable en téléchargement.
    const today = new Date().toLocaleDateString('fr-FR')
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
      <th class="right">Maladie (4+)</th>
      <th class="right">Solde mois</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td><strong>${r.nom}</strong></td>
        <td class="right green">${r.sup}h</td>
        <td class="right red">${r.manquantes}h</td>
        <td class="right purple">${r.recup}j</td>
        <td class="right">${r.conge}</td>
        <td class="right">${r.maladie}</td>
        <td class="right ${Number(r.solde_mois) >= 0 ? 'green' : 'red'}"><strong>${r.solde_mois}h</strong></td>
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
    if (!confirm(`Valider le mois de ${MOIS_FR[mois - 1]} ${annee} pour ${empSelected.nom} uniquement ?\n\nSes données seront figées (pas d'export PDF/CSV).`)) return
    try {
      const r = resultats[empSelected.id]
      if (r) await validerMois(empSelected.id, mois, annee, r.synthese, r.journal, user.id)
      setSuccess(`✅ ${empSelected.nom} validé(e).`)
      await reload()
    } catch (e) {
      setError('Erreur validation : ' + e.message)
    }
  }

  // Débloquer un mois (admin seulement, supprime le flag valide)
  async function handleDebloquer() {
    if (!isAdmin) return
    if (!confirm(`Débloquer le mois de ${MOIS_FR[mois - 1]} ${annee} pour ${empSelected?.nom} ?\n\nLes données redeviennent modifiables mais Sync Odoo restera désactivé.`)) return
    try {
      const { supabase } = await import('../../lib/supabase')
      const { error } = await supabase
        .from('pointages_mois')
        .update({ valide: false })
        .eq('employe_id', selectedEmpId)
        .eq('mois', mois).eq('annee', annee)
      if (error) throw error
      await reload()
      setSuccess('🔓 Mois débloqué pour cet employé.')
    } catch (e) {
      setError('Erreur déblocage : ' + e.message)
    }
  }

  // Forcer un jour "Absent" à "Présent" (statut + heures travaillées)
  async function handleForcerPresent(dateJour) {
    if (!canEdit) return
    if (!confirm(`Marquer le ${dateJour} comme PRÉSENT pour ${empSelected?.nom} ?\n\nLe statut deviendra 'Présent' et les heures prévues seront comptées comme travaillées.`)) return
    try {
      const j = result.journal.find(jj => jj.date === dateJour)
      if (!j) return
      // 1) Forcer heures_travaillees = heures_prevues
      await setAjustement(selectedEmpId, dateJour, 'heures_travaillees', String(j.heures_prevues), user.id)
      // 2) Forcer le statut à 'present' (badge vert au lieu d'Absent rouge)
      await setAjustement(selectedEmpId, dateJour, 'statut', 'present', user.id)
      await reload()
    } catch (e) {
      alert('Erreur : ' + e.message)
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
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap'
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
          <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: 200, alignItems: 'center' }}>
            <button onClick={prevEmp} style={btnNav} title="Employé précédent (←)">◀</button>
            <select value={selectedEmpId || ''} onChange={e => setSelectedEmpId(Number(e.target.value))}
                    style={{ flex: 1, padding: '8px 11px', fontSize: 13, border: '1px solid #e5d8c3', borderRadius: 6, cursor: 'pointer' }}>
              {(data?.employes || []).map(e => (
                <option key={e.id} value={e.id}>{e.nom}{e.poste ? ' · ' + e.poste : ''}</option>
              ))}
            </select>
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
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: '#FCE9E8', color: '#99201E', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '10px 14px', background: '#E8F8F0', color: '#1E7E4F', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          {success}
        </div>
      )}

      {loading && <div style={{ padding: 30, textAlign: 'center', color: '#4a3a30' }}>Chargement…</div>}

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



      {!loading && vue === 'single' && result && isAdmin && (
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
              <User size={14} /> {empSelected?.nom} {empSelected?.poste && <span style={{ fontSize: 12, color: '#4a3a30', fontWeight: 400 }}>· {empSelected.poste}</span>} <Pencil size={12} />
            </button>
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
          </div>

          {isLocked && (
            <div style={{
              padding: '8px 12px', background: '#FCEEE8', color: '#A32D2D',
              borderRadius: 6, fontSize: 12, marginBottom: 12,
              border: '1px solid #F5BFBC',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Lock size={14} /> <strong>Mois validé</strong>
            </div>
          )}

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
            {isAdmin && empSelected?.salaire_net > 0 && (
              <CarteSalaire
                salaire={Number(empSelected.salaire_net)}
                heuresSup={empSelected.heures_sup_mensuelles === false ? 0 : result.synthese.heures_sup}
              />
            )}
          </div>

          {/* Tableau journal */}
          <JournalTable
            journal={result.journal}
            onEditCell={handleEditCell}
            onEditPointage={handleEditPointage}
            onEditTranches={canEdit ? setEditingTranches : () => {}}
            onForcerPresent={handleForcerPresent}
            canEdit={canEdit}
          />

          {/* Légende */}
          <Legende />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            {isAdmin && (
              <>
                <button onClick={handleExportSup} style={btnExport}><Download size={14} /> Export heures sup</button>
                <button onClick={handleExportConges} style={btnExport}><Download size={14} /> Export congés</button>
                {isLocked ? (
                  <button onClick={handleDebloquer} style={{
                    padding: '10px 18px', fontSize: 13, background: '#A32D2D', color: 'white',
                    border: '1px solid #A32D2D', borderRadius: 8, cursor: 'pointer', fontWeight: 500,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    <Unlock size={14} /> Débloquer le mois
                  </button>
                ) : (
                  <>
                    <button onClick={handleValiderEmploye} style={{
                      padding: '10px 16px', fontSize: 13, background: '#3C3489', color: 'white',
                      border: '1px solid #3C3489', borderRadius: 8, cursor: 'pointer',
                    }}>
                      ✓ Valider {empSelected?.nom?.split(' ')[0] || 'cet employé'}
                    </button>
                    <button onClick={handleValider} style={btnPrimaryGreen}>
                      ✓ Tout valider (avec PDF+CSV)
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
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
        const arrivee = s.arrivee_hm ? `${date}T${s.arrivee_hm}:00` : null
        const depart  = s.depart_hm  ? `${date}T${s.depart_hm}:00`  : null
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
    const supPay = emp.heures_sup_mensuelles === false ? 0 : (m.heures_sup || 0)
    return sum + salaireNet + (tauxMajore * supPay)
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
              const supPay = emp.heures_sup_mensuelles === false ? 0 : (m.heures_sup || 0)
              const salaireMois = salaireNet > 0 ? salaireNet + (tauxMajore * supPay) : 0
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

function CarteSalaire({ salaire, heuresSup }) {
  const [revealed, setRevealed] = useState(false)
  // Formule : salaire + (salaire / 26 / 8) × 1.25 × heures_sup
  const tauxHoraire = salaire / 26 / 8
  const tauxMajore = tauxHoraire * 1.25
  const montantSup = tauxMajore * heuresSup
  const total = salaire + montantSup
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

function JournalTable({ journal, onEditCell, onEditPointage, onEditTranches, onForcerPresent, canEdit }) {
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
            <Row key={j.date} j={j} onEditCell={onEditCell} onEditPointage={onEditPointage} onEditTranches={onEditTranches} onForcerPresent={onForcerPresent} canEdit={canEdit} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({ j, onEditCell, onEditPointage, onEditTranches, onForcerPresent, canEdit }) {
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
          <button onClick={() => onForcerPresent(j.date)} title="Marquer présent" style={{
            marginLeft: 4, padding: '2px 6px', fontSize: 10, background: '#EAF3DE', color: '#27500A',
            border: '1px solid #C0DD97', borderRadius: 4, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}><Hand size={12} /> Présent</button>
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

function Td({ children, style = {} }) {
  return <td style={{ padding: '7px 10px', ...style }}>{children}</td>
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
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e5d8c3', overflowX: 'auto', boxShadow: '0 4px 14px rgba(122,42,68,0.05)' }}>
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
        <tbody>
          {data.employes.map(emp => {
            const r = resultats[emp.id]
            if (!r) return null
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
                <td style={{
                  padding: '8px 12px', textAlign: 'right', fontWeight: 600,
                  color: s.solde_mois === 0 ? '#8a7a70' : (s.solde_mois > 0 ? '#27500A' : '#A32D2D'),
                }}>
                  {(s.solde_mois > 0 ? '+' : '') + s.solde_mois.toFixed(2)}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center', color: s.jours_absents > 0 ? '#A32D2D' : '#8a7a70' }}>
                  {s.jours_absents > 0 ? s.jours_absents : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
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
