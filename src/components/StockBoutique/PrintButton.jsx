// src/components/StockBoutique/PrintButton.jsx
// Bouton "Imprimer" partagé pour les modules Stock Boutique.
//
// - Icône imprimante 🖨 seule (compact) en haut à droite du header bordeaux
// - Au clic : modal avec dropdown des 4 dernières dates qui ont des données
// - Sélection d'une date → ouvre une fenêtre imprimable (window.open + window.print)
//
// Usage :
//   <PrintButton mode="vitrine" />
//   <PrintButton mode="reception" />
//   <PrintButton mode="evening" />
//   <PrintButton mode="audit" />

import { useState } from 'react'
import { todayISO } from '../../lib/dates'
import { loadDaySummary, loadStockDay, loadDayItems, buildAuditReport } from '../../lib/stockBoutique'

const MODE_TITLES = {
  vitrine: 'Vitrine — Envoyé au café',
  reception: 'Réception — Reçu en cuisine café',
  evening: 'Fin de journée — Comptage aveugle',
  audit: 'Audit — Écarts uniquement',
}

export default function PrintButton({ mode = 'vitrine' }) {
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedDay, setSelectedDay] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState('')

  async function handleOpen() {
    setOpen(true)
    setError('')
    setLoading(true)
    try {
      // Charge les 4 derniers jours avec activité
      const summary = await loadDaySummary(7) // chercher sur 7 jours, prendre les 4 + récents
      const filtered = (summary || [])
        .filter(d => (d.qty_announced_total || 0) > 0 || (d.qty_received_total || 0) > 0 || (d.qty_counted_total || 0) > 0)
        .slice(0, 4)
      setDays(filtered)
      if (filtered.length > 0) {
        setSelectedDay(filtered[0].day) // pré-selectionne aujourd'hui
      }
    } catch (e) {
      console.error('[PrintButton] load days error:', e)
      setError('Impossible de charger l\'historique')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setOpen(false)
    setSelectedDay(null)
    setError('')
  }

  async function handlePrint() {
    if (!selectedDay) return
    setPrinting(true)
    setError('')
    try {
      // 1) Charger les données du jour
      const sd = await loadStockDay(selectedDay)
      if (!sd) {
        setError('Pas de données pour cette date')
        setPrinting(false)
        return
      }

      let html = ''
      if (mode === 'vitrine') {
        const items = await loadDayItems(sd.id)
        html = renderVitrineHtml(selectedDay, items)
      } else if (mode === 'reception') {
        const items = await loadDayItems(sd.id)
        html = renderReceptionHtml(selectedDay, items)
      } else if (mode === 'evening') {
        const items = await loadDayItems(sd.id)
        html = renderEveningHtml(selectedDay, items)
      } else if (mode === 'audit') {
        const report = await buildAuditReport(sd.id)
        html = renderAuditHtml(selectedDay, report, sd)
      }

      // 2) Ouvrir fenêtre imprimable
      const win = window.open('', '_blank', 'width=900,height=700')
      if (!win) {
        setError('Bloqué par le navigateur (autorise les pop-ups)')
        setPrinting(false)
        return
      }
      win.document.write(html)
      win.document.close()
      // Lancer print automatiquement après chargement
      win.onload = () => {
        setTimeout(() => {
          win.focus()
          win.print()
        }, 200)
      }
      handleClose()
    } catch (e) {
      console.error('[PrintButton] print error:', e)
      setError(e.message || 'Erreur lors de la génération')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Imprimer l'historique"
        aria-label="Imprimer"
        className="px-3 py-1.5 inline-flex items-center gap-1.5 rounded-full bg-cream/10 hover:bg-cream/25 border border-cream/30 hover:border-cream/60 transition-colors text-cream text-[11px] font-medium tracking-wider"
      >
        <i className="ti ti-printer text-[13px]" aria-hidden="true"></i>
        Imprimer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={handleClose}>
          <div
            className="bg-white rounded-lg shadow-2xl max-w-md w-full overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-bordeaux text-cream px-4 py-3">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase opacity-80">
                Impression
              </div>
              <div className="font-semibold text-[13px] mt-0.5">
                {MODE_TITLES[mode] || 'Impression'}
              </div>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="text-center text-[12px] text-ink-mute py-6">Chargement...</div>
              ) : days.length === 0 ? (
                <div className="text-center text-[12px] text-ink-mute py-6">
                  Aucune donnée disponible sur les 7 derniers jours
                </div>
              ) : (
                <>
                  <div className="text-[12px] text-ink-mute mb-2">Choisir la date à imprimer :</div>
                  <select
                    value={selectedDay || ''}
                    onChange={e => setSelectedDay(e.target.value)}
                    className="w-full px-3 py-2 text-[13px] border border-line rounded-md mb-3"
                  >
                    {days.map(d => {
                      const isToday = d.day === todayISO()
                      const label = new Date(d.day).toLocaleDateString('fr-FR', {
                        weekday: 'long', day: 'numeric', month: 'long'
                      })
                      return (
                        <option key={d.day} value={d.day}>
                          {label}{isToday ? ' (aujourd\'hui)' : ''}
                        </option>
                      )
                    })}
                  </select>

                  {error && (
                    <div className="bg-red-50 border border-red-300 rounded-md px-3 py-2 text-[11px] text-red-900 mb-3">
                      ⚠ {error}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-4 py-3 bg-cream-warm border-t border-line flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-3 py-1.5 text-[12px] text-ink-mute hover:text-ink"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!selectedDay || printing || days.length === 0}
                className="px-4 py-1.5 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded-full text-[12px] font-medium tracking-wider disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                <i className={`ti ${printing ? 'ti-loader-2 animate-spin' : 'ti-printer'} text-[13px]`} aria-hidden="true"></i>
                {printing ? 'Génération…' : 'Imprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// =============================================================
// RENDUS HTML IMPRIMABLES
// =============================================================

const PRINT_HEAD = `
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #1a1a1a; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 4px; color: #993556; }
  h2 { font-size: 13px; margin: 0 0 16px; color: #666; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
  thead { background: #f5f0e8; }
  th { text-align: left; padding: 8px; border-bottom: 2px solid #993556; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 6px 8px; border-bottom: 1px solid #e8e4dc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .cat-row td { background: #f5f0e8; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #993556; padding-top: 12px; }
  .gap-pos { color: #b71c1c; font-weight: 600; }
  .gap-neg { color: #0d47a1; font-weight: 600; }
  .gap-ok { color: #1b5e20; }
  .not-counted { color: #ef6c00; font-style: italic; }
  .footer { margin-top: 24px; font-size: 10px; color: #999; text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600; }
  .badge-confirmed { background: #c8e6c9; color: #1b5e20; }
  .badge-discrepancy { background: #ffe0b2; color: #ef6c00; }
  .badge-pending { background: #f8d7da; color: #993556; }
  .badge-surprise { background: #b2dfdb; color: #00695c; }
  @media print {
    body { padding: 12px; }
    @page { margin: 1.5cm; }
  }
</style>
`

function fmtFrenchDate(dayISO) {
  return new Date(dayISO).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

function escapeHtml(s) {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---- VITRINE : somme par article des envois du jour
function renderVitrineHtml(day, items) {
  // Filtrer 'morning' uniquement (envois Hamza) - exclure les leftover
  const morningItems = (items || []).filter(i => i.source === 'morning')

  // Grouper par product_name et sommer qty_announced
  const map = new Map()
  for (const it of morningItems) {
    const key = it.product_name
    if (!map.has(key)) {
      map.set(key, { name: key, total: 0, lines: 0 })
    }
    map.get(key).total += (it.qty_announced || 0)
    map.get(key).lines += 1
  }
  const rows = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)

  let body = ''
  if (rows.length === 0) {
    body = `<p style="color:#999; font-style:italic; margin-top:24px;">Aucun envoi enregistré ce jour-là.</p>`
  } else {
    body = `
      <table>
        <thead>
          <tr>
            <th>Article</th>
            <th class="num" style="width:120px;">Total envoyé</th>
            <th class="num" style="width:100px;">Nb envois</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td class="num"><strong>${r.total}</strong></td>
              <td class="num" style="color:#999;">${r.lines}</td>
            </tr>
          `).join('')}
          <tr style="border-top: 2px solid #993556;">
            <td style="font-weight:600;">TOTAL</td>
            <td class="num" style="font-weight:600; font-size:14px;">${grandTotal}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    `
  }

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Vitrine ${day}</title>${PRINT_HEAD}</head>
    <body>
      <h1>Lily Gourmet — Vitrine</h1>
      <h2>${fmtFrenchDate(day)} · Articles envoyés au café (cumul de la journée)</h2>
      ${body}
      <div class="footer">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
    </body></html>
  `
}

// ---- RÉCEPTION : annoncé / reçu / statut
function renderReceptionHtml(day, items) {
  const receptionItems = (items || [])
    .filter(i => i.source === 'morning')
    .sort((a, b) => (a.product_name || '').localeCompare(b.product_name || '', 'fr'))

  const totalAnnounced = receptionItems.reduce((s, i) => s + (i.qty_announced || 0), 0)
  const totalReceived = receptionItems.reduce((s, i) => s + (i.qty_received || 0), 0)

  function statusBadge(s) {
    if (s === 'confirmed') return '<span class="badge badge-confirmed">✓ Reçu OK</span>'
    if (s === 'discrepancy') return '<span class="badge badge-discrepancy">⚠ Écart</span>'
    if (s === 'pending') return '<span class="badge badge-pending">⏳ Attente</span>'
    return ''
  }

  let body = ''
  if (receptionItems.length === 0) {
    body = `<p style="color:#999; font-style:italic; margin-top:24px;">Aucune réception ce jour-là.</p>`
  } else {
    body = `
      <table>
        <thead>
          <tr>
            <th>Article</th>
            <th class="num" style="width:80px;">Annoncé</th>
            <th class="num" style="width:80px;">Reçu</th>
            <th style="width:110px;">Statut</th>
            <th>Note écart</th>
          </tr>
        </thead>
        <tbody>
          ${receptionItems.map(it => {
            const isSurprise = (it.qty_announced || 0) === 0
            return `
              <tr>
                <td>${escapeHtml(it.product_name)}${isSurprise ? ' <span class="badge badge-surprise">non annoncé</span>' : ''}</td>
                <td class="num">${it.qty_announced || '—'}</td>
                <td class="num"><strong>${it.qty_received ?? '—'}</strong></td>
                <td>${statusBadge(it.reception_status)}</td>
                <td style="font-size:11px; color:#666; font-style:italic;">${escapeHtml(it.reception_note || '')}</td>
              </tr>
            `
          }).join('')}
          <tr style="border-top: 2px solid #993556;">
            <td style="font-weight:600;">TOTAL</td>
            <td class="num" style="font-weight:600;">${totalAnnounced}</td>
            <td class="num" style="font-weight:600;">${totalReceived}</td>
            <td></td><td></td>
          </tr>
        </tbody>
      </table>
    `
  }

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Réception ${day}</title>${PRINT_HEAD}</head>
    <body>
      <h1>Lily Gourmet — Réception</h1>
      <h2>${fmtFrenchDate(day)} · Articles reçus en cuisine café</h2>
      ${body}
      <div class="footer">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
    </body></html>
  `
}

// ---- FIN DE JOURNÉE : comptage aveugle, par article et par fraîcheur
function renderEveningHtml(day, items) {
  // Filtrer 'evening' uniquement (comptage du soir) - exclure morning/leftover/odoo_only
  const eveningItems = (items || []).filter(i => i.source === 'evening')

  // Grouper par article + fraîcheur (Frais/J+1/J+2 peuvent coexister)
  const byArticle = new Map() // name -> { name, fresh, yesterday, twodays, total }
  for (const it of eveningItems) {
    const key = it.product_name
    if (!byArticle.has(key)) {
      byArticle.set(key, { name: key, fresh: 0, yesterday: 0, twodays: 0, total: 0 })
    }
    const entry = byArticle.get(key)
    const qty = it.qty_counted || 0
    if (it.freshness === 'fresh') entry.fresh += qty
    else if (it.freshness === 'yesterday') entry.yesterday += qty
    else if (it.freshness === 'twodays') entry.twodays += qty
    entry.total += qty
  }

  const rows = [...byArticle.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  const grandTotal = rows.reduce((s, r) => s + r.total, 0)
  const totalFresh = rows.reduce((s, r) => s + r.fresh, 0)
  const totalYesterday = rows.reduce((s, r) => s + r.yesterday, 0)
  const totalTwodays = rows.reduce((s, r) => s + r.twodays, 0)

  let body = ''
  if (rows.length === 0) {
    body = `<p style="color:#999; font-style:italic; margin-top:24px;">Aucun comptage enregistré ce jour-là.</p>`
  } else {
    body = `
      <table>
        <thead>
          <tr>
            <th>Article</th>
            <th class="num" style="width:70px;">Frais</th>
            <th class="num" style="width:70px;">J+1</th>
            <th class="num" style="width:70px;">J+2</th>
            <th class="num" style="width:80px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td class="num" style="color:${r.fresh > 0 ? '#1b5e20' : '#bbb'};">${r.fresh || '—'}</td>
              <td class="num" style="color:${r.yesterday > 0 ? '#ef6c00' : '#bbb'};">${r.yesterday || '—'}</td>
              <td class="num" style="color:${r.twodays > 0 ? '#b71c1c' : '#bbb'};">${r.twodays || '—'}</td>
              <td class="num"><strong>${r.total}</strong></td>
            </tr>
          `).join('')}
          <tr style="border-top: 2px solid #993556;">
            <td style="font-weight:600;">TOTAL</td>
            <td class="num" style="font-weight:600;">${totalFresh}</td>
            <td class="num" style="font-weight:600;">${totalYesterday}</td>
            <td class="num" style="font-weight:600;">${totalTwodays}</td>
            <td class="num" style="font-weight:600; font-size:14px;">${grandTotal}</td>
          </tr>
        </tbody>
      </table>
    `
  }

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Fin de journée ${day}</title>${PRINT_HEAD}</head>
    <body>
      <h1>Lily Gourmet — Fin de journée</h1>
      <h2>${fmtFrenchDate(day)} · Comptage aveugle du soir</h2>
      ${body}
      <div class="footer">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
    </body></html>
  `
}

// ---- AUDIT : rapport des ÉCARTS UNIQUEMENT (gap_current ≠ 0 OU non compté)
function renderAuditHtml(day, report, stockDay) {
  // Filtrer : on garde seulement les articles avec écart actuel ≠ 0,
  //          + les articles "non comptés" (qty effective = 0) qui ont un Odoo > 0
  // Note : on traite "non compté" comme "compté = 0" pour calculer l'écart
  function effectiveQty(r) {
    return r.is_counted ? (r.qty_counted || 0) : 0
  }
  function effectiveGapCurrent(r) {
    if (r.qty_odoo_current === null || r.qty_odoo_current === undefined) return null
    return r.qty_odoo_current - effectiveQty(r)
  }
  const filtered = (report || []).filter(r => {
    const gap = effectiveGapCurrent(r)
    if (gap === null) return false
    return gap !== 0
  })

  if (!report || report.length === 0 || filtered.length === 0) {
    const msg = (!report || report.length === 0)
      ? 'Aucun rapport pour cette date.'
      : '✓ Aucun écart à signaler — tous les articles comptés correspondent au stock Odoo actuel.'
    return `
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>Stock ${day}</title>${PRINT_HEAD}</head>
      <body>
        <h1>Lily Gourmet — Stock Boutique (Écarts)</h1>
        <h2>${fmtFrenchDate(day)}</h2>
        <p style="color:${filtered.length === 0 && report && report.length > 0 ? '#1b5e20' : '#999'}; font-style:italic; font-size:13px;">${msg}</p>
        <div class="footer">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
      </body></html>
    `
  }

  function gapCell(value) {
    if (value === null || value === undefined) return '<span style="color:#bbb;">—</span>'
    if (value === 0) return '<span class="gap-ok">✓ 0</span>'
    if (value > 0) return `<span class="gap-pos">+${value}</span>`
    return `<span class="gap-neg">${value}</span>`
  }

  // Regrouper par catégorie (filtered, pas report)
  const rendered = []
  let lastCat = null
  let nbNotCounted = 0
  let nbGapPlus = 0
  let nbGapMinus = 0
  for (const r of filtered) {
    const cat = r.category_label || 'Autres'
    if (cat !== lastCat) {
      rendered.push(`<tr class="cat-row"><td colspan="6">${escapeHtml(cat)}</td></tr>`)
      lastCat = cat
    }
    const hasCurr = r.qty_odoo_current !== null && r.qty_odoo_current !== undefined
    const effQty = effectiveQty(r)
    const effGap = effectiveGapCurrent(r)
    if (!r.is_counted) nbNotCounted++
    else if (effGap > 0) nbGapPlus++
    else if (effGap < 0) nbGapMinus++
    rendered.push(`
      <tr>
        <td>${escapeHtml(r.product_name)}${!r.is_counted ? ' <span style="color:#ef6c00; font-size:10px;">(non compté)</span>' : ''}</td>
        <td class="num" style="color:#888;">${r.qty_morning || '—'}</td>
        <td class="num" style="color:#888;">${r.qty_leftover || '—'}</td>
        <td class="num"><strong>${effQty}</strong></td>
        <td class="num">${hasCurr ? r.qty_odoo_current : '<span style="color:#bbb;">—</span>'}</td>
        <td class="num">${gapCell(effGap)}</td>
      </tr>
    `)
  }

  const statusLabel = {
    open: 'En cours',
    submitted: 'Comptage reçu',
    audited: 'Audité ✓',
  }[stockDay.status] || stockDay.status

  // Bandeau résumé des écarts
  const summary = `
    <div style="margin: 12px 0 20px; padding: 10px 14px; background: #fff3e0; border-left: 3px solid #ef6c00; font-size: 12px;">
      <strong>${filtered.length} ligne${filtered.length > 1 ? 's' : ''} avec anomalie</strong> sur ${report.length} article${report.length > 1 ? 's' : ''} total
      ${nbGapPlus > 0 ? `· <span class="gap-pos">${nbGapPlus} surplus Odoo</span>` : ''}
      ${nbGapMinus > 0 ? `· <span class="gap-neg">${nbGapMinus} manque Odoo</span>` : ''}
      ${nbNotCounted > 0 ? `· <span style="color:#ef6c00;">${nbNotCounted} non compté${nbNotCounted > 1 ? 's' : ''}</span>` : ''}
    </div>
  `

  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Stock ${day} - Écarts</title>${PRINT_HEAD}</head>
    <body>
      <h1>Lily Gourmet — Écarts Stock Boutique</h1>
      <h2>${fmtFrenchDate(day)} · Statut : ${statusLabel}</h2>
      ${summary}
      <table>
        <thead>
          <tr>
            <th>Article</th>
            <th class="num">Apporté</th>
            <th class="num">Reste hier</th>
            <th class="num">Compté</th>
            <th class="num">Odoo actuel</th>
            <th class="num">Écart actuel</th>
          </tr>
        </thead>
        <tbody>
          ${rendered.join('')}
        </tbody>
      </table>
      ${stockDay.audit_notes ? `
        <div style="margin-top:24px; padding:12px; background:#f5f0e8; border-left:3px solid #993556;">
          <div style="font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:#666; margin-bottom:4px;">Notes d'audit</div>
          <div style="font-size:12px; white-space:pre-wrap;">${escapeHtml(stockDay.audit_notes)}</div>
        </div>
      ` : ''}
      <div class="footer">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
    </body></html>
  `
}

