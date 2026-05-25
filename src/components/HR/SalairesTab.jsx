import { useState, useEffect, useMemo } from 'react'
import { loadEmployes } from '../../lib/hr'
import { supabase } from '../../lib/supabase'

const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

export default function SalairesTab({ user }) {
  const today = new Date()
  const [mois, setMois] = useState(today.getMonth() + 1)
  const [annee, setAnnee] = useState(today.getFullYear())
  const [employes, setEmployes] = useState([])
  const [societes, setSocietes] = useState([])
  const [montants, setMontants] = useState({})  // { empId: montant }
  const [notes, setNotes] = useState({})        // { empId: note }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [societeFilter, setSocieteFilter] = useState('LN')  // 'LG' | 'LN' (le doc à générer)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        // Charger employés actifs + déclarés
        const all = await loadEmployes(true)
        const declares = all.filter(e => e.declare === true)
        setEmployes(declares)

        // Charger sociétés
        const { data: socs } = await supabase.from('societes').select('*').order('code')
        setSocietes(socs || [])

        // Charger les salaires déjà saisis pour ce mois
        const { data: salaires } = await supabase
          .from('salaires_mois')
          .select('employe_id, montant, note')
          .eq('mois', mois)
          .eq('annee', annee)
        const mObj = {}, nObj = {}
        if (salaires) {
          for (const s of salaires) {
            mObj[s.employe_id] = String(s.montant)
            if (s.note) nObj[s.employe_id] = s.note
          }
        }
        // Pour les employés sans saisie, pré-remplir avec salaire_net
        for (const e of declares) {
          if (!mObj[e.id] && e.salaire_net) {
            mObj[e.id] = String(e.salaire_net)
          }
        }
        setMontants(mObj)
        setNotes(nObj)
      } catch (e) {
        setError(e.message)
      }
      setLoading(false)
    })()
  }, [mois, annee])

  function prevMonth() {
    if (mois === 1) { setMois(12); setAnnee(annee - 1) }
    else setMois(mois - 1)
  }
  function nextMonth() {
    if (mois === 12) { setMois(1); setAnnee(annee + 1) }
    else setMois(mois + 1)
  }

  // Filtrer employés selon société (pour le doc à générer)
  const employesSociete = useMemo(() => {
    return employes.filter(e => e.societe?.code === societeFilter)
  }, [employes, societeFilter])

  // Total à virer
  const totalMontants = useMemo(() => {
    return employesSociete.reduce((sum, e) => sum + (parseFloat(montants[e.id]) || 0), 0)
  }, [employesSociete, montants])

  async function handleSauvegarder() {
    setSaving(true); setError(null); setSuccess(null)
    try {
      // Upsert tous les montants saisis pour le mois (toutes sociétés confondues)
      const rows = []
      for (const e of employes) {
        const m = parseFloat(montants[e.id])
        if (m > 0) {
          rows.push({
            employe_id: e.id,
            mois,
            annee,
            montant: m,
            note: notes[e.id] || null,
            created_by: user.id,
          })
        }
      }
      if (rows.length === 0) {
        setError('Aucun montant à sauvegarder')
        setSaving(false); return
      }
      const { error: err } = await supabase
        .from('salaires_mois')
        .upsert(rows, { onConflict: 'employe_id,mois,annee' })
      if (err) throw err
      setSuccess(`✅ ${rows.length} salaire(s) sauvegardé(s) pour ${MOIS_FR[mois - 1]} ${annee}`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError('Erreur sauvegarde : ' + e.message)
    }
    setSaving(false)
  }

  // Convertit un nombre en lettres (français) — pour montants
  function nombreEnLettres(n) {
    const UNITES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
                    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
                    'dix-sept', 'dix-huit', 'dix-neuf']
    const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']
    n = Math.floor(n)
    if (n === 0) return 'zéro'
    if (n < 0) return 'moins ' + nombreEnLettres(-n)
    if (n < 20) return UNITES[n]
    if (n < 100) {
      const d = Math.floor(n / 10), u = n % 10
      if (d === 7 || d === 9) return DIZAINES[d] + '-' + UNITES[10 + u]
      if (u === 0) return DIZAINES[d] + (d === 8 ? 's' : '')
      if (u === 1 && d < 8) return DIZAINES[d] + ' et un'
      return DIZAINES[d] + '-' + UNITES[u]
    }
    if (n < 1000) {
      const c = Math.floor(n / 100), r = n % 100
      const prefix = c === 1 ? '' : UNITES[c] + ' '
      let result = prefix + 'cent' + (c > 1 && r === 0 ? 's' : '')
      if (r > 0) result += ' ' + nombreEnLettres(r)
      return result
    }
    if (n < 1000000) {
      const m = Math.floor(n / 1000), r = n % 1000
      const prefix = m === 1 ? 'mille' : nombreEnLettres(m) + ' mille'
      if (r > 0) return prefix + ' ' + nombreEnLettres(r)
      return prefix
    }
    return String(n)
  }

  async function handleGenererExcel() {
    if (employesSociete.length === 0) { setError('Aucun employé déclaré pour cette société'); return }
    const validEmp = employesSociete.filter(e => parseFloat(montants[e.id]) > 0)
    if (validEmp.length === 0) { setError('Aucun montant saisi'); return }
    setGenerating(true); setError(null)
    try {
      await handleSauvegarder()

      // Charger SheetJS via CDN
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

      const societe = societes.find(s => s.code === societeFilter)
      const societeNom = societe?.nom || (societeFilter === 'LG' ? 'LG TRAITEUR SARL' : 'L&N Gourmet SARL')
      const compteSource = societe?.compte_bancaire || ''
      const banqueSource = societe?.banque_source || ''
      const total = validEmp.reduce((s, e) => s + (parseFloat(montants[e.id]) || 0), 0)
      const dateStr = new Date().toLocaleDateString('fr-FR')

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Construction de la matrice avec mise en forme
      // Colonnes : A (Banque/Label) | B | C (Nom/RIB/Montant) | D | E | F (DIRHAMS) | G (1)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      const matrice = []
      const merges = []      // fusions de cellules
      const styles = {}      // styles par coordonnée

      let row = 0
      // Ligne 1-4 : zone logo (vide, image insérée séparément)
      matrice.push(['', '', '', '', '', '', '']); row++
      matrice.push(['', '', '', '', '', '', '']); row++
      matrice.push(['', '', '', '', '', 'À RABAT LE', dateStr]); row++
      matrice.push(['', '', '', '', '', '', '']); row++

      // Objet
      matrice.push(['Objet : Ordre de virement', '', '', '', '', '', '']); row++
      const objetRow = row
      matrice.push(['', '', '', '', '', '', '']); row++
      matrice.push(['Merci de bien vouloir réaliser les virements des salaires suivants,', '', '', '', '', '', '']); row++
      matrice.push([`À partir de notre compte numéro ${compteSource || '____________________________________'}${banqueSource ? '  (' + banqueSource + ')' : ''}`, '', '', '', '', '', '']); row++
      matrice.push(['', '', '', '', '', '', '']); row++

      // Tableau employés
      const empStartRow = row + 1   // 1-indexed pour Excel
      for (const e of validEmp) {
        const m = parseFloat(montants[e.id])
        const montantLettres = nombreEnLettres(m).toUpperCase() + ' DIRHAMS'
        // Ligne 1 : Nom | | Montant | | | DIRHAMS | 1
        matrice.push([e.nom, '', m, '', '', 'DIRHAMS', 1]); row++
        // Ligne 2 : Banque | | RIB
        matrice.push([e.banque || '', '', e.rib || '', '', '', '', '']); row++
        // Ligne 3 : montant en lettres (fusionnée C:G)
        matrice.push(['', '', montantLettres, '', '', '', '']); row++
        merges.push({ s: { r: row - 1, c: 2 }, e: { r: row - 1, c: 6 } })
        // Ligne vide de séparation
        matrice.push(['', '', '', '', '', '', '']); row++
      }
      const empEndRow = row

      // TOTAL
      matrice.push(['', '', '', '', '', '', '']); row++
      matrice.push(['TOTAL', '', total, '', '', 'DIRHAMS', validEmp.length]); row++
      const totalRow = row
      matrice.push(['', '', nombreEnLettres(total).toUpperCase() + ' DIRHAMS', '', '', '', '']); row++
      merges.push({ s: { r: row - 1, c: 2 }, e: { r: row - 1, c: 6 } })
      const totalLettresRow = row

      matrice.push(['', '', '', '', '', '', '']); row++
      matrice.push(['', '', '', '', '', '', '']); row++
      matrice.push(['Cordialement,', '', '', '', '', '', '']); row++
      matrice.push(['La direction', '', '', '', '', '', '']); row++
      matrice.push(['', '', '', '', '', '', '']); row++
      matrice.push(['', '', '', '', '', '', '']); row++

      // Pied de page société
      const footerStart = row + 1
      if (societe) {
        matrice.push([`${societeNom} au capital de ${Number(societe.capital_dh).toLocaleString('fr-FR')} DH`, '', '', '', '', '', '']); row++
        matrice.push([societe.adresse, '', '', '', '', '', '']); row++
        matrice.push([`RC : ${societe.rc} · Patente : ${societe.patente} · IF : ${societe.if_num} · CNSS : ${societe.cnss}`, '', '', '', '', '', '']); row++
        matrice.push([`ICE : ${societe.ice}`, '', '', '', '', '', '']); row++
      }
      const footerEnd = row

      // Créer la feuille
      const ws = XLSX.utils.aoa_to_sheet(matrice)
      ws['!cols'] = [
        { wch: 32 },   // A - Nom / Banque / Footer
        { wch: 3 },    // B
        { wch: 32 },   // C - RIB / Montant lettres
        { wch: 3 },    // D
        { wch: 3 },    // E
        { wch: 11 },   // F - DIRHAMS
        { wch: 5 },    // G - Nb
      ]
      // Hauteurs : élargir lignes employé et lignes lettres
      ws['!rows'] = []
      for (let i = 0; i < matrice.length; i++) ws['!rows'][i] = { hpt: 18 }
      // Logo zone plus haute (3 premières lignes fusionnées)
      ws['!rows'][0] = { hpt: 28 }; ws['!rows'][1] = { hpt: 28 }; ws['!rows'][2] = { hpt: 24 }

      // Fusion zone logo (A1:E3) pour image
      merges.push({ s: { r: 0, c: 0 }, e: { r: 2, c: 4 } })

      // Appliquer les fusions
      ws['!merges'] = merges

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Application des styles (police, bordures, alignement)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

      const fontDefault = { name: 'Arial', sz: 10 }
      const borderThin = { style: 'thin', color: { rgb: '993556' } }
      const borderAll = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin }
      const bordeauxRgb = '993556'
      const fillBordeaux = { patternType: 'solid', fgColor: { rgb: bordeauxRgb } }

      // Style helper
      function setStyle(cellAddr, style) {
        if (!ws[cellAddr]) ws[cellAddr] = { t: 's', v: '' }
        ws[cellAddr].s = { ...(ws[cellAddr].s || {}), ...style }
      }

      // Date en haut à droite
      setStyle(XLSX.utils.encode_cell({ r: 2, c: 5 }), {
        font: { ...fontDefault, italic: true, sz: 9 },
        alignment: { horizontal: 'right' }
      })
      setStyle(XLSX.utils.encode_cell({ r: 2, c: 6 }), {
        font: { ...fontDefault, italic: true, sz: 9 },
        alignment: { horizontal: 'left' }
      })

      // "Objet" en gras
      setStyle(XLSX.utils.encode_cell({ r: objetRow - 1, c: 0 }), {
        font: { ...fontDefault, bold: true, sz: 11 }
      })

      // Encadrement des blocs employés (3 lignes par employé)
      for (let idx = 0; idx < validEmp.length; idx++) {
        const r1 = empStartRow + idx * 4 - 1  // 0-indexed
        const r2 = r1 + 1
        const r3 = r1 + 2

        // Ligne 1 (nom + montant + devise + nb) - bold
        for (let c = 0; c < 7; c++) {
          const addr = XLSX.utils.encode_cell({ r: r1, c })
          if (!ws[addr]) ws[addr] = { t: 's', v: '' }
          ws[addr].s = {
            font: { ...fontDefault, bold: c === 0, sz: c === 0 ? 11 : 10 },
            border: {
              top: borderThin,
              bottom: { style: 'thin', color: { rgb: 'E8E2D8' } },
              left: c === 0 ? borderThin : undefined,
              right: c === 6 ? borderThin : undefined,
            },
            alignment: { horizontal: c === 2 ? 'right' : c >= 5 ? 'center' : 'left', vertical: 'center' },
            fill: { patternType: 'solid', fgColor: { rgb: 'FAF6F0' } },
          }
          // Format nombre pour la colonne C (montant)
          if (c === 2 && typeof ws[addr].v === 'number') {
            ws[addr].z = '#,##0.00'
          }
        }
        // Ligne 2 (banque + RIB) - italic gris
        for (let c = 0; c < 7; c++) {
          const addr = XLSX.utils.encode_cell({ r: r2, c })
          if (!ws[addr]) ws[addr] = { t: 's', v: '' }
          ws[addr].s = {
            font: { ...fontDefault, italic: true, color: { rgb: '6F6A60' }, sz: 9 },
            border: {
              left: c === 0 ? borderThin : undefined,
              right: c === 6 ? borderThin : undefined,
            },
            alignment: { horizontal: 'left' },
          }
        }
        // Ligne 3 (montant en lettres fusionnée C:G) - italic centré
        const addrL = XLSX.utils.encode_cell({ r: r3, c: 2 })
        if (!ws[addrL]) ws[addrL] = { t: 's', v: '' }
        ws[addrL].s = {
          font: { ...fontDefault, italic: true, color: { rgb: '993556' }, sz: 9 },
          alignment: { horizontal: 'right', vertical: 'center' },
          border: {
            bottom: borderThin,
            right: borderThin,
          },
        }
        // Bordures gauche et bas pour les colonnes vides à gauche
        for (let c = 0; c < 2; c++) {
          const addr = XLSX.utils.encode_cell({ r: r3, c })
          if (!ws[addr]) ws[addr] = { t: 's', v: '' }
          ws[addr].s = {
            border: {
              left: c === 0 ? borderThin : undefined,
              bottom: borderThin,
            },
          }
        }
      }

      // Ligne TOTAL (bordeaux)
      for (let c = 0; c < 7; c++) {
        const addr = XLSX.utils.encode_cell({ r: totalRow - 1, c })
        if (!ws[addr]) ws[addr] = { t: 's', v: '' }
        ws[addr].s = {
          font: { ...fontDefault, bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          fill: fillBordeaux,
          border: borderAll,
          alignment: { horizontal: c === 0 ? 'left' : c === 2 ? 'right' : 'center', vertical: 'center' },
        }
        if (c === 2 && typeof ws[addr].v === 'number') ws[addr].z = '#,##0.00'
      }
      // Ligne total en lettres
      const addrTL = XLSX.utils.encode_cell({ r: totalLettresRow - 1, c: 2 })
      if (!ws[addrTL]) ws[addrTL] = { t: 's', v: '' }
      ws[addrTL].s = {
        font: { ...fontDefault, italic: true, bold: true, color: { rgb: '993556' }, sz: 10 },
        alignment: { horizontal: 'right' },
      }

      // Pied de page
      if (societe) {
        for (let r = footerStart - 1; r <= footerEnd - 1; r++) {
          for (let c = 0; c < 7; c++) {
            const addr = XLSX.utils.encode_cell({ r, c })
            if (!ws[addr]) ws[addr] = { t: 's', v: '' }
            ws[addr].s = {
              font: { ...fontDefault, sz: 8, color: { rgb: '6F6A60' } },
              alignment: { horizontal: 'center' },
            }
          }
        }
        // Première ligne pied : nom + capital en gras
        const addrFooter = XLSX.utils.encode_cell({ r: footerStart - 1, c: 0 })
        if (!ws[addrFooter]) ws[addrFooter] = { t: 's', v: '' }
        ws[addrFooter].s = {
          font: { ...fontDefault, sz: 9, bold: true, color: { rgb: '993556' } },
          alignment: { horizontal: 'center' },
        }
        // Fusionner pied de page sur toute la largeur (A à G)
        for (let r = footerStart - 1; r <= footerEnd - 1; r++) {
          merges.push({ s: { r, c: 0 }, e: { r, c: 6 } })
        }
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // Insertion du logo
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      try {
        const resp = await fetch('/Logo_LG.jpg')
        if (resp.ok) {
          const blob = await resp.blob()
          const base64 = await new Promise(resolve => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result.split(',')[1])
            reader.readAsDataURL(blob)
          })
          // SheetJS xlsx ne supporte pas les images natives en CE-version.
          // On utilise une astuce : ws['!images'] (extension SheetJS Pro) ne fonctionne pas dans la version free.
          // Plan B : ajouter le logo via openpyxl en post-traitement n'est pas possible côté front.
          // Plan C : utiliser le nom de l'entreprise en gros texte stylisé à la place.
          // → On laisse pour l'instant un nom stylisé.
        }
      } catch (e) {
        console.warn('Logo non chargé', e)
      }
      // Plan C : nom société en gros texte stylisé (fusion A1:E3)
      const addrLogo = XLSX.utils.encode_cell({ r: 0, c: 0 })
      ws[addrLogo] = {
        t: 's',
        v: societeNom,
        s: {
          font: { name: 'Georgia', sz: 22, bold: true, italic: true, color: { rgb: '993556' } },
          alignment: { horizontal: 'left', vertical: 'center' },
        }
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, `Salaires ${MOIS_FR[mois - 1]} ${annee}`.slice(0, 31))
      const filename = `Salaires_${societeFilter}_${MOIS_FR[mois - 1]}_${annee}.xlsx`
      XLSX.writeFile(wb, filename)
      setSuccess(`✅ Excel téléchargé : ${filename}`)
      setTimeout(() => setSuccess(null), 4000)
    } catch (e) {
      setError('Erreur génération : ' + e.message)
    }
    setGenerating(false)
  }

  return (
    <div>
      {/* Header avec sélecteur mois + filtre société */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap',
        padding: '12px 14px', background: '#F4F0EA', borderRadius: 10,
      }}>
        <button onClick={prevMonth} style={btnNav}>◀</button>
        <span style={{ fontSize: 16, fontWeight: 500, minWidth: 140 }}>{MOIS_FR[mois - 1]} {annee}</span>
        <button onClick={nextMonth} style={btnNav}>▶</button>

        <div style={{ flex: 1 }} />

        {/* Filtre société (= société du document à générer) */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'white', borderRadius: 8 }}>
          {[
            { v: 'LN', label: 'L&N Gourmet' },
            { v: 'LG', label: 'LG Traiteur' },
          ].map(t => (
            <button key={t.v} onClick={() => setSocieteFilter(t.v)} style={{
              padding: '6px 12px', fontSize: 12, border: 'none', borderRadius: 6, cursor: 'pointer',
              background: societeFilter === t.v ? '#993556' : 'transparent',
              color: societeFilter === t.v ? 'white' : '#6F6A60',
              fontWeight: societeFilter === t.v ? 500 : 400,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Messages */}
      {success && (
        <div style={{ padding: '10px 14px', background: '#EAF3DE', color: '#27500A', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {success}
        </div>
      )}
      {error && (
        <div style={{ padding: '10px 14px', background: '#FCEEE8', color: '#A32D2D', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Stats top */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 10, marginBottom: 14,
      }}>
        <Carte label={`Employés déclarés ${societeFilter}`} val={employesSociete.length} unit="" />
        <Carte label="Total à virer" val={totalMontants} unit="dh" color="#27500A" />
        <Carte label="Total tous déclarés" val={employes.length} unit="" />
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center', color: '#6F6A60' }}>Chargement…</div>
      ) : employesSociete.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', color: '#6F6A60',
          background: '#F9F6F1', borderRadius: 10, fontSize: 13,
        }}>
          Aucun employé déclaré dans {societeFilter === 'LG' ? 'LG Traiteur' : 'L&N Gourmet'} 🌸<br />
          <span style={{ fontSize: 11, color: '#9B968D' }}>
            Coche "Déclaré" dans la fiche employé pour qu'il apparaisse ici.
          </span>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #E8E2D8', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F4F0EA' }}>
                <th style={thStyle}>Employé</th>
                <th style={thStyle}>Banque</th>
                <th style={thStyle}>RIB</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Montant (dh)</th>
              </tr>
            </thead>
            <tbody>
              {employesSociete.map(e => (
                <tr key={e.id} style={{ borderTop: '1px solid #F4F0EA' }}>
                  <td style={{ padding: '10px 12px' }}><strong>{e.nom}</strong></td>
                  <td style={{ padding: '10px 12px', color: '#6F6A60', fontSize: 12 }}>{e.banque || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6F6A60', fontSize: 11, fontFamily: 'monospace' }}>
                    {e.rib || <span style={{ color: '#A32D2D' }}>⚠️ Manquant</span>}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <input
                      type="number"
                      step="0.01"
                      value={montants[e.id] || ''}
                      onChange={ev => setMontants(m => ({ ...m, [e.id]: ev.target.value }))}
                      placeholder="0"
                      style={{
                        width: 110, padding: '6px 10px', fontSize: 13, textAlign: 'right',
                        border: '1px solid #E8E2D8', borderRadius: 6,
                      }}
                    />
                  </td>
                </tr>
              ))}
              {/* Total */}
              <tr style={{ borderTop: '2px solid #993556', background: '#F9F6F1', fontWeight: 600 }}>
                <td style={{ padding: '12px' }} colSpan={3}>TOTAL {employesSociete.length} employé(s)</td>
                <td style={{ padding: '12px', textAlign: 'right', color: '#27500A' }}>
                  {totalMontants.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} dh
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      {!loading && employesSociete.length > 0 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={handleSauvegarder} disabled={saving} style={{
            padding: '10px 18px', fontSize: 13, background: '#F4F0EA', color: '#3A3733',
            border: '1px solid #E8E2D8', borderRadius: 8, cursor: saving ? 'wait' : 'pointer',
          }}>
            {saving ? '⏳ ...' : '💾 Sauvegarder'}
          </button>
          <button onClick={handleGenererExcel} disabled={generating} style={{
            padding: '10px 18px', fontSize: 13, background: '#27500A', color: 'white',
            border: '1px solid #27500A', borderRadius: 8, cursor: generating ? 'wait' : 'pointer',
            fontWeight: 500,
          }}>
            {generating ? '⏳ Génération...' : '📥 Générer ordre de virement (.xlsx)'}
          </button>
        </div>
      )}
    </div>
  )
}

function Carte({ label, val, unit, color = '#3A3733' }) {
  return (
    <div style={{ background: 'white', padding: 10, borderRadius: 8, border: '1px solid #E8E2D8' }}>
      <p style={{ fontSize: 11, color: '#6F6A60', margin: 0, marginBottom: 3 }}>{label}</p>
      <p style={{ fontSize: 18, fontWeight: 600, color, margin: 0 }}>
        {typeof val === 'number' ? val.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : val}
        {unit && <span style={{ fontSize: 11, color: '#9B968D', marginLeft: 4 }}>{unit}</span>}
      </p>
    </div>
  )
}

const thStyle = { padding: '10px 12px', textAlign: 'left', fontWeight: 500, fontSize: 12, color: '#6F6A60' }
const btnNav = { padding: '6px 12px', fontSize: 14, background: 'white', border: '1px solid #E8E2D8', borderRadius: 6, cursor: 'pointer' }
