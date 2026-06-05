// Génère la feuille de congé (DEMANDE DE CONGÉ) imprimable, FR + AR,
// à partir d'un congé, de l'employé, du solde et des jours fériés.
// Ouvre une nouvelle fenêtre prête à imprimer (bouton Imprimer + Ctrl+P).

import { toast } from './toast'

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const JOURS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

function frDate(ymd) {
  if (!ymd) return ''
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`
}
function weekdayIdx(ymd) {
  return new Date(ymd + 'T00:00:00').getDay()
}
function fmtJours(v) {
  if (v == null || v === '') return '—'
  const n = Number(v)
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1)
  return s.replace('.', ',')
}
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function joursPeriode(deb, fin) {
  const out = []
  const d = new Date(deb + 'T00:00:00')
  const f = new Date(fin + 'T00:00:00')
  while (d <= f) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${j}`)
    d.setDate(d.getDate() + 1)
  }
  return out
}
// Jour de repos fixe de l'employé (exclu du décompte). Null si aucun.
function jourReposNom(emp) {
  if (!emp) return null
  if (emp.planning_type === 'fixe') return emp.planning_jour_off || null
  if (emp.planning_type === 'alt') {
    const p = [emp.planning_paire_off_1, emp.planning_paire_off_2].filter(Boolean)
    const i = [emp.planning_impaire_off_1, emp.planning_impaire_off_2].filter(Boolean)
    return p.find(x => i.includes(x)) || null
  }
  return null
}
function isRecup(t) {
  t = (t || '').toLowerCase()
  return t.includes('récup') || t.includes('recup') || t.includes('compensatory')
}
function estMaladie(t) {
  const s = (t || '').toLowerCase()
  return s.includes('maladie') || s.includes('sick') || s.includes('malade')
}
function estEvenement(t) {
  const s = (t || '').toLowerCase()
  return ['mariage', 'naissance', 'deces', 'décès', 'circoncis', 'maternit', 'sans solde', 'unpaid'].some(k => s.includes(k))
}
function typeLabelFR(t) {
  if (isRecup(t)) return 'Récupération'
  const s = (t || '').toLowerCase()
  if (estMaladie(t))            return 'Congé maladie'
  if (s.includes('maternit'))   return 'Congé maternité'
  if (s.includes('mariage'))    return 'Mariage'
  if (s.includes('naissance'))  return 'Naissance'
  if (s.includes('deces') || s.includes('décès')) return 'Décès'
  if (s.includes('circoncis'))  return 'Circoncision'
  if (s.includes('sans solde') || s.includes('unpaid')) return 'Congé sans solde'
  return 'Congé annuel'
}
function typeLabelAR(t) {
  if (isRecup(t)) return 'استرجاع'
  const s = (t || '').toLowerCase()
  if (estMaladie(t))            return 'إجازة مرضية'
  if (s.includes('maternit'))   return 'إجازة أمومة'
  if (s.includes('mariage'))    return 'زواج'
  if (s.includes('naissance'))  return 'ازدياد مولود'
  if (s.includes('deces') || s.includes('décès')) return 'وفاة'
  if (s.includes('circoncis'))  return 'ختان'
  if (s.includes('sans solde') || s.includes('unpaid')) return 'إجازة بدون أجر'
  return 'إجازة سنوية'
}
function raisonLabelFR(r) {
  if (r === 'travaille') return "Récup d'un jour travaillé"
  if (r === 'ferie')     return "Récup d'un jour férié"
  return 'Récupération'
}
function raisonLabelAR(r) {
  if (r === 'travaille') return 'استرجاع يوم عمل'
  if (r === 'ferie')     return 'استرجاع يوم عطلة'
  return 'استرجاع'
}
function soldeSplitFR(total, annuel, recup) {
  if (total == null) return '—'
  const base = `${fmtJours(total)} jour${Number(total) > 1 ? 's' : ''}`
  if (annuel == null || recup == null) return `${base} <span style="font-weight:400;color:#666;">(récupération incluse)</span>`
  return `${base} <span style="font-weight:400;color:#666;">(annuel ${fmtJours(annuel)} · récup ${fmtJours(recup)})</span>`
}
function soldeSplitAR(total, annuel, recup) {
  if (total == null) return '—'
  if (annuel == null || recup == null) return `${fmtJours(total)} <span style="font-weight:400;color:#666;">(يشمل الاسترجاع)</span>`
  return `${fmtJours(total)} <span style="font-weight:400;color:#666;">(سنوية ${fmtJours(annuel)} · استرجاع ${fmtJours(recup)})</span>`
}

// À partir des allocations de récup (triées par date_evt), des jours déjà
// consommés par les congés récup antérieurs (dejaConsomme) et du besoin de CE
// congé, renvoie la liste des allocations consommées (date + raison + montant)
// + le manque éventuel (récup prise sans allocation).
// Exporté pour les tests internes.
export function buildRecupSource(recupAllocs, dejaConsomme, besoin) {
  const pieces = []
  const sorted = [...(recupAllocs || [])].filter(a => a.date_evt).sort((a, b) => a.date_evt.localeCompare(b.date_evt))
  const start = dejaConsomme || 0
  const end = start + (besoin || 0)
  let cum = 0
  for (const a of sorted) {
    const aStart = cum, aEnd = cum + Number(a.jours || 0)
    cum = aEnd
    const montant = Math.min(aEnd, end) - Math.max(aStart, start)
    if (montant > 0.001) pieces.push({ date: a.date_evt, raison: a.raison || null, montant: Math.round(montant * 100) / 100 })
    if (cum >= end) break
  }
  const couvert = pieces.reduce((s, p) => s + p.montant, 0)
  const manque = Math.round((besoin - couvert) * 100) / 100
  return { pieces, manque: manque > 0.001 ? manque : 0 }
}

// Calcule tout ce qui sert à la feuille à partir des données brutes.
// Exporté pour les tests internes.
export function calcule({ conge, emp, solde, joursFeries, recupAllocs, recupDejaConsomme }) {
  const ferieSet = new Set((joursFeries || []).map(f => f.date))
  const ferieNom = new Map((joursFeries || []).map(f => [f.date, f.nom]))
  const reposNom = jourReposNom(emp)

  const tous = joursPeriode(conge.date_debut, conge.date_fin)
  const offDates   = reposNom ? tous.filter(d => JOURS_FR[weekdayIdx(d)] === reposNom) : []
  const ferieDates = tous.filter(d => ferieSet.has(d))
  const decomptes  = tous.filter(d => !offDates.includes(d) && !ferieDates.includes(d))

  const nbDec = decomptes.length

  // Répartition récup / annuel.
  //  - si recup_detail est saisi (dates+raison) on l'utilise (récup au début) ;
  //  - sinon, repli sur le type : récup → tout récup, autre → tout annuel.
  const recupDetail = Array.isArray(conge.recup_detail) ? conge.recup_detail.filter(r => r && r.date) : []
  let recupList, annuelDates
  if (recupDetail.length > 0) {
    const rset = new Set(recupDetail.map(r => r.date))
    recupList   = recupDetail.map(r => ({ date: r.date, raison: r.raison || null, source: r.date_source || null }))
    annuelDates = decomptes.filter(d => !rset.has(d))
  } else if (isRecup(conge.type_conge)) {
    recupList   = decomptes.map(d => ({ date: d, raison: null, source: null }))
    annuelDates = []
  } else {
    recupList   = []
    annuelDates = decomptes.slice()
  }
  const recupCount  = recupList.length
  const annuelCount = annuelDates.length
  const annuelPlage = annuelCount ? { debut: annuelDates[0], fin: annuelDates[annuelCount - 1] } : null
  // Source des jours de récup : allocations réellement consommées (FIFO).
  const recupSource = buildRecupSource(recupAllocs, recupDejaConsomme, recupCount)
  // Le détail récup/annuel ne s'applique qu'aux congés annuel/récup
  // (la maladie et les événements ne sont pas pris du congé annuel).
  const splitApplicable = !estMaladie(conge.type_conge) && !estEvenement(conge.type_conge)

  // Solde combiné (récup incluse) : "après" = dispo actuel ; "avant" = après + décompté.
  const dispo = solde && solde.dispo != null ? Number(solde.dispo) : null
  const soldeApres = dispo
  const soldeAvant = dispo != null ? dispo + nbDec : null

  // Split annuel / récup du solde restant.
  //  récup gagnée = allocations 'autre' applicables + récup pointage ;
  //  récup restante = gagnée − (récup + autre) pris ;  annuel restant = dispo − récup restante.
  let recupRestApres = null, annuelRestApres = null, recupRestAvant = null, annuelRestAvant = null
  if (solde && dispo != null) {
    const allocAutre = Array.isArray(solde.events?.detail)
      ? solde.events.detail.filter(d => d.type === 'autre' && d.applicable).reduce((s, e) => s + Number(e.jours || 0), 0)
      : 0
    const recupGagne = allocAutre + Number(solde.recup || 0)
    const recupPris  = solde.prisType ? (Number(solde.prisType.recup || 0) + Number(solde.prisType.autre || 0)) : 0
    recupRestApres  = Math.max(0, Math.min(dispo, recupGagne - recupPris))
    annuelRestApres = Math.max(0, dispo - recupRestApres)
    recupRestAvant  = recupRestApres + recupCount
    annuelRestAvant = annuelRestApres + annuelCount
  }

  return {
    tous, offDates, ferieDates, decomptes, ferieNom, reposNom, nbDec,
    recupCount, annuelCount, recupList, recupSource, annuelPlage, splitApplicable,
    soldeAvant, soldeApres,
    recupRestApres, annuelRestApres, recupRestAvant, annuelRestAvant,
  }
}

function ligneOff(dates, JOURS) {
  if (!dates.length) return '— (aucun dans la période)'
  return dates.map(d => `${frDate(d)} (${JOURS[weekdayIdx(d)]})`).join(' · ')
}
function ligneFerie(dates, ferieNom, JOURS) {
  if (!dates.length) return '—'
  return dates.map(d => `${frDate(d)} (${JOURS[weekdayIdx(d)]}) — ${esc(ferieNom.get(d) || 'Férié')}`).join('<br>')
}

function pageFR({ conge, emp, c, dateDoc }) {
  const recupRows = c.recupSource.pieces.map(p =>
    `<div class="r"><span class="d">${frDate(p.date)}</span><span class="ra">${esc(p.raison || 'Récupération')} (${fmtJours(p.montant)} j)</span></div>`).join('')
    + (c.recupSource.manque > 0 ? `<div class="r"><span class="d">—</span><span class="ra" style="color:#a33">${fmtJours(c.recupSource.manque)} j sans allocation de récup</span></div>` : '')
  return `
  <div class="page">
    <div class="contenu">
      <div class="entete">
        <img class="logo" src="/Logo_LG.jpg" alt="Lily Gourmet">
        <div class="marque"><div class="n1">LILY GOURMET</div><div class="n2">L &amp; N Gourmet SARL</div></div>
      </div>
      <h1 class="titre">DEMANDE DE CONGÉ</h1>
      <div class="infos">
        <div><b>Date :</b> Rabat, le ${dateDoc}</div>
        <div><b>Nom et Prénom :</b> ${esc(emp?.nom || '—')}</div>
        <div><b>Numéro CNSS :</b> ${esc(emp?.cnss || '—')}</div>
        <div><b>Fonction :</b> ${esc(emp?.poste || '—')}</div>
      </div>
      <div class="preambule">
        Je soussigné(e), sollicite par la présente l'autorisation de bénéficier d'un congé,
        conformément aux dispositions et procédures en vigueur au sein de l'entreprise.
      </div>
      <table class="recap">
        <tr><td class="lab">Type de congé</td><td class="val">${esc(typeLabelFR(conge.type_conge))}</td></tr>
        <tr><td class="lab">Période demandée</td><td class="val">du ${frDate(conge.date_debut)} au ${frDate(conge.date_fin)}</td></tr>
        <tr><td class="lab">Jour de repos non décompté</td><td class="val">${ligneOff(c.offDates, JOURS_FR)}</td></tr>
        <tr><td class="lab">Jour férié non décompté</td><td class="val">${ligneFerie(c.ferieDates, c.ferieNom, JOURS_FR)}</td></tr>
        <tr><td class="lab">Nombre de jours décomptés</td><td class="val">${c.nbDec} jour${c.nbDec > 1 ? 's' : ''}</td></tr>
        ${c.splitApplicable ? `<tr><td class="lab"><span class="tag-recup">Dont récupération</span></td><td class="val">${c.recupCount} jour${c.recupCount > 1 ? 's' : ''}${c.recupCount > 0 ? `<div class="sous-recup">${recupRows}</div>` : ''}</td></tr>
        <tr><td class="lab"><span class="tag-annuel">Dont congé annuel</span></td><td class="val">${c.annuelCount} jour${c.annuelCount > 1 ? 's' : ''}${c.annuelPlage ? ` &nbsp;·&nbsp; du ${frDate(c.annuelPlage.debut)} au ${frDate(c.annuelPlage.fin)}` : ''}</td></tr>` : ''}
        <tr><td class="lab">Solde avant congé</td><td class="val">${soldeSplitFR(c.soldeAvant, c.annuelRestAvant, c.recupRestAvant)}</td></tr>
        <tr><td class="lab">Solde après congé</td><td class="val">${soldeSplitFR(c.soldeApres, c.annuelRestApres, c.recupRestApres)}</td></tr>
      </table>
      <h2 class="sig-titre">Signatures et validation</h2>
      <table class="sign">
        <tr><th>Fonction</th><th>Nom</th><th>Signature &amp; Date</th></tr>
        <tr><td class="fonction">Employé(e)</td><td class="nom">${esc(emp?.nom || '')}</td><td></td></tr>
        <tr><td class="fonction">Direction</td><td class="nom">Layla El Amrani</td><td></td></tr>
      </table>
      <div class="nb">NB : Toute demande de congé doit être validée par : Employé(e) – Direction, et signée avant la prise du congé.</div>
    </div>
    <div class="pied">
      <div class="gros">L &amp; N Gourmet SARL au capital de 200.000 DH</div>
      6 rue Soumaya, Agdal – Rabat, Maroc · RC : 99941 · Patente : 70185234 · IF : 3367629 · CNSS : 9725039 · ICE : 001701634000029
    </div>
  </div>`
}

function pageAR({ conge, emp, c, dateDoc }) {
  const recupRows = c.recupSource.pieces.map(p =>
    `<div class="r"><span class="d">${frDate(p.date)}</span><span class="ra">${esc(p.raison || 'استرجاع')} (${fmtJours(p.montant)} ي)</span></div>`).join('')
    + (c.recupSource.manque > 0 ? `<div class="r"><span class="d">—</span><span class="ra" style="color:#a33">${fmtJours(c.recupSource.manque)} ي بدون رصيد استرجاع</span></div>` : '')
  const arNb = n => (n > 1 ? `${n} أيام` : `${n} يوم`)
  const nbTxt = arNb(c.nbDec)
  return `
  <div class="page ar" dir="rtl" lang="ar">
    <div class="contenu">
      <div class="entete">
        <img class="logo" src="/Logo_LG.jpg" alt="Lily Gourmet">
        <div class="marque"><div class="n1">LILY GOURMET</div><div class="n2">ل &amp; ن غورمي ش.م.م</div></div>
      </div>
      <h1 class="titre">طلب الاستفادة من العطلة السنوية</h1>
      <div class="infos">
        <div><b>التاريخ :</b> الرباط، في ${dateDoc}</div>
        <div><b>الاسم الكامل :</b> ${esc(emp?.nom || '—')}</div>
        <div><b>رقم الضمان الاجتماعي :</b> ${esc(emp?.cnss || '—')}</div>
        <div><b>الوظيفة :</b> ${esc(emp?.poste || '—')}</div>
      </div>
      <div class="preambule">
        اصرح انا الموقع(ة) أدناه بأنني ألتمس بموجب هذا الطلب الاستفادة من الاجازة
        وفقا للقانون الداخلي للمؤسسة .
      </div>
      <table class="recap">
        <tr><td class="lab">نوع الإجازة</td><td class="val">${esc(typeLabelAR(conge.type_conge))}</td></tr>
        <tr><td class="lab">فترة العطلة المطلوبة</td><td class="val">من ${frDate(conge.date_debut)} إلى ${frDate(conge.date_fin)}</td></tr>
        <tr><td class="lab">يوم عطلة أسبوعية (غير محتسب )</td><td class="val">${ligneOff(c.offDates, JOURS_AR)}</td></tr>
        <tr><td class="lab">يوم عطلة رسمية أو تعويضية</td><td class="val">${ligneFerie(c.ferieDates, c.ferieNom, JOURS_AR)}</td></tr>
        <tr><td class="lab">عدد الأيام المحتسبة</td><td class="val">${nbTxt}</td></tr>
        ${c.splitApplicable ? `<tr><td class="lab"><span class="tag-recup">منها يوم عطلة تعويضي أو رسمي</span></td><td class="val">${arNb(c.recupCount)}${c.recupCount > 0 ? `<div class="sous-recup">${recupRows}</div>` : ''}</td></tr>
        <tr><td class="lab"><span class="tag-annuel">منها إجازة سنوية</span></td><td class="val">${arNb(c.annuelCount)}${c.annuelPlage ? ` &nbsp;·&nbsp; من ${frDate(c.annuelPlage.debut)} إلى ${frDate(c.annuelPlage.fin)}` : ''}</td></tr>` : ''}
        <tr><td class="lab">رصيد العطلة السنوية الحالي</td><td class="val">${soldeSplitAR(c.soldeAvant, c.annuelRestAvant, c.recupRestAvant)}</td></tr>
        <tr><td class="lab">الرصيد المتبقي بعد العطلة</td><td class="val">${soldeSplitAR(c.soldeApres, c.annuelRestApres, c.recupRestApres)}</td></tr>
      </table>
      <h2 class="sig-titre">التوقيعات والمصادقة</h2>
      <table class="sign">
        <tr><th>الصفة</th><th>الاسم</th><th>التوقيع والتاريخ</th></tr>
        <tr><td class="fonction">الموظف(ة)</td><td class="nom">${esc(emp?.nom || '')}</td><td></td></tr>
        <tr><td class="fonction">الإدارة</td><td class="nom">Layla El Amrani</td><td></td></tr>
      </table>
      <div class="nb">ملاحظة : يجب أن يُصادَق على كل طلب إجازة من طرف : الموظف(ة) – الإدارة، وأن يُوقَّع قبل الاستفادة من الإجازة.</div>
    </div>
    <div class="pied">
      <div class="gros">L &amp; N Gourmet SARL au capital de 200.000 DH</div>
      6 rue Soumaya, Agdal – Rabat, Maroc · RC : 99941 · Patente : 70185234 · IF : 3367629 · CNSS : 9725039 · ICE : 001701634000029
    </div>
  </div>`
}

function buildHTML(args) {
  const c = calcule(args)
  const now = new Date()
  const dateDoc = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  const ctx = { ...args, c, dateDoc }
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Demande de congé — ${esc(args.emp?.nom || '')}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#e9e9e9;margin:0;padding:20px;color:#222}
  .toolbar{max-width:780px;margin:0 auto 14px;display:flex;gap:10px;justify-content:flex-end}
  .toolbar button{font-size:14px;padding:9px 18px;border-radius:8px;border:1px solid #993556;background:#993556;color:#fff;cursor:pointer}
  .page{max-width:780px;margin:0 auto 28px;background:#fff;padding:38px 44px 26px;box-shadow:0 2px 10px rgba(0,0,0,.12);border-radius:3px;display:flex;flex-direction:column;min-height:1000px}
  .contenu{flex:1}
  .entete{display:flex;align-items:center;gap:16px;border-bottom:2px solid #1a1a1a;padding-bottom:14px}
  .entete img.logo{height:64px;width:auto}
  .entete .marque .n1{font-size:20px;font-weight:800;letter-spacing:1px;color:#000;line-height:1.1}
  .entete .marque .n2{font-size:11px;color:#666;margin-top:3px}
  h1.titre{text-align:center;font-size:19px;font-weight:800;letter-spacing:1px;margin:26px 0 18px}
  .infos{font-size:14px;line-height:1.9}
  .infos b{display:inline-block;min-width:140px}
  .preambule{font-style:italic;color:#555;font-size:13px;line-height:1.6;margin:14px 0 18px}
  table.recap{width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px}
  table.recap td{border:1px solid #cfcfcf;padding:9px 14px;vertical-align:top}
  table.recap td.lab{background:#fafafa;width:48%;color:#333}
  table.recap td.val{font-weight:700;color:#111}
  .sous-recup{margin-top:6px;font-weight:400}
  .sous-recup .r{display:flex;font-size:12.5px;padding:2px 0}
  .sous-recup .r .d{font-weight:700;color:#1c7a35;min-width:108px}
  .sous-recup .r .ra{color:#555}
  .tag-recup{color:#1c7a35}.tag-annuel{color:#1456a0}
  h2.sig-titre{font-size:14px;font-weight:800;margin:24px 0 10px}
  table.sign{width:100%;border-collapse:collapse;font-size:13px}
  table.sign th{background:#222;color:#fff;text-align:left;padding:8px 12px;font-weight:600;font-size:12px}
  table.sign td{border:1px solid #cfcfcf;padding:10px 12px;height:62px;vertical-align:top}
  table.sign td.fonction{width:34%;color:#333}
  table.sign td.nom{width:36%}
  .nb{font-style:italic;color:#777;font-size:11.5px;line-height:1.5;margin-top:18px}
  .pied{border-top:1px solid #ccc;margin-top:22px;padding-top:10px;text-align:center;font-size:10px;color:#999;line-height:1.5}
  .pied .gros{color:#666;font-weight:600}
  .page.ar{direction:rtl;font-family:'Segoe UI','Tahoma',Arial,sans-serif}
  .page.ar .entete{flex-direction:row-reverse}
  .page.ar table.sign th{text-align:right}
  @media print{body{background:#fff;padding:0}.toolbar{display:none}.page{box-shadow:none;margin:0;page-break-after:always;min-height:auto}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">🖨️ Imprimer / PDF</button></div>
${pageFR(ctx)}
${pageAR(ctx)}
</body></html>`
}

export function imprimerFeuilleConge({ conge, emp, solde, joursFeries, recupAllocs, recupDejaConsomme }) {
  if (!conge || !emp) { toast.error('Données manquantes pour la feuille.'); return }
  const html = buildHTML({ conge, emp, solde, joursFeries, recupAllocs, recupDejaConsomme })
  const w = window.open('', '_blank')
  if (!w) { toast.error("Autorise les fenêtres pop-up pour imprimer la feuille de congé."); return }
  w.document.write(html)
  w.document.close()
}
