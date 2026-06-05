// Corrige les congés annuel/récup dont le décompte gelé (jours_decomptes) ne
// retire pas le jour off / les jours fériés. Met à jour à la valeur recalculée.
//   node scripts/fix-decompte-feries.mjs            (aperçu, ne modifie rien)
//   node scripts/fix-decompte-feries.mjs --apply    (applique les corrections)

const URL = 'https://nsmwcrebjhvtopjdnsun.supabase.co'
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbXdjcmViamh2dG9wamRuc3VuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMDg0MzcsImV4cCI6MjA5MjY4NDQzN30.Jffw91mjtlqk3EYMn-l8wq461t1yZBL-YOrEs4JMu9c'
const ANNEE = 2026
const APPLY = process.argv.includes('--apply')
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

async function api(path, opts = {}) {
  const { headers: extra, ...rest } = opts
  const r = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(extra || {}) },
    ...rest,
  })
  if (!r.ok) throw new Error(`${path} → ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
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
function estAnnuelOuRecup(c) {
  const t = (c.type_conge || '').toLowerCase()
  if (t.includes('maladie') || t.includes('sick') || t.includes('malade')) return false
  if (['mariage', 'naissance', 'deces', 'décès', 'circoncis', 'maternit', 'sans solde', 'unpaid'].some(k => t.includes(k))) return false
  return true // annuel ou récup
}
function netDecompte(emp, c, feriesSet) {
  const off = jourOffFixe(emp)
  let net = 0, fer = 0
  const d = new Date(c.date_debut + 'T00:00:00'), f = new Date(c.date_fin + 'T00:00:00')
  while (d <= f) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), j = String(d.getDate()).padStart(2, '0')
    const ymd = `${y}-${m}-${j}`
    const isOff = off && JOURS[d.getDay()] === off
    const isFer = feriesSet.has(ymd)
    if (!isOff && isFer) fer++
    if (!isOff && !isFer) net++
    d.setDate(d.getDate() + 1)
  }
  return { net, fer }
}
const r2 = n => Math.round(n * 100) / 100

const [employes, conges, feries] = await Promise.all([
  api('employes?select=*'),
  api(`conges?select=id,employe_id,date_debut,date_fin,type_conge,jours_decomptes&statut=eq.valide&date_debut=gte.${ANNEE}-01-01&date_debut=lte.${ANNEE}-12-31`),
  api('jours_feries?select=date'),
])
const empById = new Map(employes.map(e => [e.id, e]))
const feriesSet = new Set(feries.map(f => f.date))

const aCorriger = []
for (const c of conges) {
  if (!estAnnuelOuRecup(c)) continue
  if (c.jours_decomptes == null) continue
  const emp = empById.get(c.employe_id); if (!emp) continue
  const { net, fer } = netDecompte(emp, c, feriesSet)
  if (r2(c.jours_decomptes) !== r2(net)) aCorriger.push({ c, emp, net, fer })
}

console.log(`\n=== CORRECTION DÉCOMPTE (férié/jour off) — ${APPLY ? 'APPLIQUER' : 'APERÇU'} ===`)
console.log(`${aCorriger.length} congé(s) à corriger :\n`)
for (const { c, emp, net, fer } of aCorriger) {
  console.log(`  ${emp.nom} · ${c.date_debut}→${c.date_fin} (${c.type_conge}) : ${c.jours_decomptes} → ${net}${fer ? ` (−${fer} férié)` : ' (jour off)'}`)
}

if (APPLY) {
  let done = 0
  for (const { c, net } of aCorriger) {
    await api(`conges?id=eq.${c.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ jours_decomptes: net }) })
    done++
  }
  console.log(`\n✅ ${done} congé(s) corrigé(s).`)
} else {
  console.log(`\n(aperçu — relance avec --apply pour corriger)`)
}
