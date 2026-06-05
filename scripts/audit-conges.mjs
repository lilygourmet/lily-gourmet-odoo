// Audit complet congés / récup sur les données réelles (lecture seule).
// Pour chaque employé actif : recalcule décompte (jour off + férié exclus),
// récup alloué vs pris, solde, et flague les anomalies.
//   node scripts/audit-conges.mjs

const URL = 'https://nsmwcrebjhvtopjdnsun.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbXdjcmViamh2dG9wamRuc3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDg0MzcsImV4cCI6MjA5MjY4NDQzN30.Jffw91mjtlqk3EYMn-l8wq461t1yZBL-YOrEs4JMu9c'
const ANNEE = 2026
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

async function api(path) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`)
  return r.json()
}

function jourOffFixe(emp) {
  if (emp.planning_type === 'fixe') return emp.planning_jour_off || null
  if (emp.planning_type === 'alt') {
    const p = [emp.planning_paire_off_1, emp.planning_paire_off_2].filter(Boolean)
    const i = [emp.planning_impaire_off_1, emp.planning_impaire_off_2].filter(Boolean)
    return p.find(x => i.includes(x)) || null
  }
  return null
}
function classifier(c) {
  const t = (c.type_conge || '').toLowerCase()
  if (t === 'maladie_courte') return 'maladie_courte'
  if (t === 'maladie_longue') return 'maladie_longue'
  if (t.includes('maternit')) return 'maternite'
  if (t.includes('récup') || t.includes('recup') || t.includes('compensatory')) return 'recup'
  if (t.includes('maladie') || t.includes('sick') || t.includes('malade')) {
    const d = (new Date(c.date_fin + 'T00:00:00') - new Date(c.date_debut + 'T00:00:00')) / 86400000 + 1
    return d <= 3 ? 'maladie_courte' : 'maladie_longue'
  }
  if (t.includes('mariage')) return 'mariage'
  if (t.includes('naissance')) return 'naissance'
  if (t.includes('deces') || t.includes('décès')) return 'deces'
  if (t.includes('circoncis')) return 'circoncision'
  if (t.includes('sans solde') || t.includes('unpaid')) return 'autre'
  return 'annuel'
}
// décompte (cal − jour off − férié hors off) pour annuel/récup
function decompte(emp, c, feriesSet) {
  const off = jourOffFixe(emp)
  let cal = 0, offN = 0, ferN = 0
  const d = new Date(c.date_debut + 'T00:00:00'), f = new Date(c.date_fin + 'T00:00:00')
  while (d <= f) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0')
    const ymd = `${y}-${m}-${j}`
    const isOff = off && JOURS[d.getDay()] === off
    const isFer = feriesSet.has(ymd)
    cal++
    if (isOff) offN++
    else if (isFer) ferN++
    d.setDate(d.getDate() + 1)
  }
  return { cal, offN, ferN, net: cal - offN - ferN }
}
const r2 = n => Math.round(n * 100) / 100

const [employes, conges, allocs, feries] = await Promise.all([
  api('employes?select=*'),
  api(`conges?select=*&statut=eq.valide&date_debut=gte.${ANNEE}-01-01&date_debut=lte.${ANNEE}-12-31`),
  api(`conges_allocations?select=*&statut=eq.valide&annee=eq.${ANNEE}`),
  api('jours_feries?select=date'),
])
const feriesSet = new Set(feries.map(f => f.date))
const congesByEmp = new Map(), allocsByEmp = new Map()
for (const c of conges) { (congesByEmp.get(c.employe_id) || congesByEmp.set(c.employe_id, []).get(c.employe_id)).push(c) }
for (const a of allocs) { (allocsByEmp.get(a.employe_id) || allocsByEmp.set(a.employe_id, []).get(a.employe_id)).push(a) }

const actifs = employes.filter(e => e.actif !== false)
let problemes = 0, okCount = 0
const lignes = []

for (const emp of actifs.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))) {
  const cs = congesByEmp.get(emp.id) || []
  const as = allocsByEmp.get(emp.id) || []
  const sum = t => as.filter(a => a.type === t).reduce((s, a) => s + Number(a.jours), 0)
  const recupAlloue  = sum('autre') + sum('recup')
  const annuelAlloue = sum('annuel')
  const reliquat     = sum('reliquat')
  const eventsAlloue = ['mariage', 'naissance', 'deces', 'circoncision', 'maternite'].reduce((s, t) => s + sum(t), 0)

  let annuelPris = 0, recupPris = 0, eventsPris = 0, maladieCPris = 0, maladieLPris = 0
  const flags = []
  for (const c of cs) {
    const cat = classifier(c)
    const dec = decompte(emp, c, feriesSet)
    const net = dec.net
    if (cat === 'recup') recupPris += net
    else if (cat === 'annuel') annuelPris += net
    else if (cat === 'maladie_courte') maladieCPris += dec.cal
    else if (cat === 'maladie_longue') maladieLPris += dec.cal
    else eventsPris += net
    // congé figé dont le décompte ne correspond plus (souvent : férié non retiré)
    if ((cat === 'annuel' || cat === 'recup') && c.jours_decomptes != null && r2(c.jours_decomptes) !== r2(net)) {
      flags.push(`congé ${c.date_debut}→${c.date_fin} (${cat}) : décompté figé ${c.jours_decomptes} ≠ recalcul ${net}${dec.ferN ? ` (dont ${dec.ferN} férié)` : ''}`)
    }
  }

  const dispo = r2(annuelAlloue + reliquat + eventsAlloue + recupAlloue - annuelPris - eventsPris - recupPris)

  // ── Anomalies ──
  if (recupPris > recupAlloue + 0.001) flags.push(`RÉCUP sur-consommée : pris ${r2(recupPris)} > alloué ${r2(recupAlloue)}`)
  if (recupPris > 0.001 && recupAlloue < 0.001) flags.push(`RÉCUP prise (${r2(recupPris)}) mais AUCUNE allocation récup`)
  if (dispo < -0.001) flags.push(`SOLDE NÉGATIF : ${dispo}`)
  if (maladieCPris > (sum('maladie_courte') || 6) + 0.001) flags.push(`Maladie ≤3j dépasse le pool : ${r2(maladieCPris)} / ${sum('maladie_courte') || 6}`)

  if (flags.length) {
    problemes++
    lignes.push(`\n⚠️  ${emp.nom} (#${emp.id})`)
    lignes.push(`    annuel alloué ${r2(annuelAlloue)}${reliquat ? ` +reliquat ${r2(reliquat)}` : ''} · récup alloué ${r2(recupAlloue)} · dispo ${dispo}`)
    lignes.push(`    pris : annuel ${r2(annuelPris)} · récup ${r2(recupPris)} · événements ${r2(eventsPris)}`)
    for (const f of flags) lignes.push(`    → ${f}`)
  } else {
    okCount++
  }
}

console.log(`\n=== AUDIT CONGÉS / RÉCUP ${ANNEE} ===`)
console.log(`Employés actifs : ${actifs.length} · Congés validés : ${conges.length} · Allocations : ${allocs.length} · Jours fériés : ${feriesSet.size}`)
console.log(lignes.join('\n') || '\n(aucune anomalie)')
console.log(`\n──────────`)
console.log(`✅ OK : ${okCount}   ⚠️ Avec anomalie(s) : ${problemes}`)
