// Génère une page HTML de revue des doublons (seuil 12, miroir inclus) AVANT suppression.
// L'utilisatrice décoche les faux positifs, clique « Valider » → télécharge doublons-a-supprimer.json
//   node scripts/ps-dedupe-html.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { createCanvas, loadImage } from '@napi-rs/canvas'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const URL = env.VITE_SUPABASE_URL
const sb = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const pub = p => `${URL}/storage/v1/object/public/photoshop/${p.split('/').map(encodeURIComponent).join('/')}`
const TH = 12

const A = createCanvas(8, 8), ax = A.getContext('2d')
const D = createCanvas(9, 8), dx = D.getContext('2d')
function hashOne(img, flip) {
  ax.save(); ax.fillStyle = '#fff'; ax.fillRect(0, 0, 8, 8); if (flip) { ax.translate(8, 0); ax.scale(-1, 1) } ax.drawImage(img, 0, 0, 8, 8); ax.restore()
  const a = ax.getImageData(0, 0, 8, 8).data; const g = []; let sum = 0
  for (let i = 0; i < 64; i++) { const v = a[i * 4] * .3 + a[i * 4 + 1] * .59 + a[i * 4 + 2] * .11; g.push(v); sum += v }
  const m = sum / 64; const aH = g.map(v => v > m ? 1 : 0).join('')
  dx.save(); dx.fillStyle = '#fff'; dx.fillRect(0, 0, 9, 8); if (flip) { dx.translate(9, 0); dx.scale(-1, 1) } dx.drawImage(img, 0, 0, 9, 8); dx.restore()
  const d = dx.getImageData(0, 0, 9, 8).data; let dH = ''
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const i = (y * 9 + x) * 4, j = (y * 9 + x + 1) * 4; const l = q => d[q] * .3 + d[q + 1] * .59 + d[q + 2] * .11; dH += l(i) > l(j) ? '1' : '0' }
  return aH + dH
}

const rows = []; let from = 0
for (;;) { const { data } = await sb.from('ps_photos').select('id, nom, theme, path').range(from, from + 999); rows.push(...data); if (data.length < 1000) break; from += 1000 }
const jobs = rows.filter(r => existsSync(`cake-photos/_cloud/${r.id}.png`))
console.log(`${jobs.length} images à empreindre…`)
let done = 0; const CC = 8
for (let i = 0; i < jobs.length; i += CC) {
  await Promise.all(jobs.slice(i, i + CC).map(async r => { try { const img = await loadImage(`cake-photos/_cloud/${r.id}.png`); r.k = hashOne(img, false); r.kf = hashOne(img, true) } catch (e) {} }))
  done += Math.min(CC, jobs.length - i); if ((i / CC) % 80 === 0) console.log(`  ${done}/${jobs.length}`)
}

const isSimple = n => /(chiffre|ellipse|\bforme|cercle|carr|rectangle|triangle|losange|polygon|lettre|etoile|étoile|ovale|\brond\b|trait|ligne|\bpoint|number|\bshape|alphabet|motif|texture|fond )/i.test(n || '')
const valid = jobs.filter(r => r.k && !isSimple(r.nom) && r.theme !== 'Texte & Messages')
const ham = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n }
const dist = (a, b) => Math.min(ham(a.k, b.k), ham(a.k, b.kf))
const generic = n => !n || /^([Ll]ayer|[Gg]roup|[Cc]alque|[Ee]lement)/.test(n)
const score = r => (generic(r.nom) ? 1000 : 0) + (r.theme === 'Divers' ? 100 : 0) + (r.nom ? r.nom.length : 99)

const used = new Uint8Array(valid.length); const groups = []; const inGroup = new Set()
for (let i = 0; i < valid.length; i++) {
  if (used[i]) continue
  const cl = [valid[i]]
  for (let j = i + 1; j < valid.length; j++) { if (used[j]) continue; if (dist(valid[i], valid[j]) <= TH) { used[j] = 1; cl.push(valid[j]) } }
  if (cl.length > 1) { cl.sort((a, b) => score(a) - score(b)); groups.push({ keep: cl[0], dels: cl.slice(1), kind: 'Ressemblance' }); cl.forEach(r => inGroup.add(r.id)) }
}
// + groupes « MÊME NOM » (même thème, nom normalisé identique) non déjà couverts par la ressemblance
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const skipName = n => !n || n === 'a trier' || n.length < 3
const byName = {}
for (const r of jobs) { const key = r.theme + '||' + norm(r.nom); if (skipName(norm(r.nom))) continue; (byName[key] ||= []).push(r) }
for (const key of Object.keys(byName)) {
  const g = byName[key].filter(r => !inGroup.has(r.id))
  if (g.length < 2) continue
  g.sort((a, b) => score(a) - score(b))
  groups.push({ keep: g[0], dels: g.slice(1), kind: 'Même nom' })
}
const totalDel = groups.reduce((s, g) => s + g.dels.length, 0)
console.log(`groupes: ${groups.length} · doublons à retirer: ${totalDel}`)

const card = (r, checked) => `<div class="c"><input type="checkbox" class="cb" value="${r.id}" ${checked ? 'checked' : ''}><img loading="lazy" src="${pub(r.path)}"><div class="nm">${(r.nom || '').replace(/</g, '&lt;')}</div><div class="th">${r.theme}</div></div>`
const blocks = groups.map((g, i) => `<div class="grp"><div class="gh">Groupe ${i + 1} · ${g.kind} · ${g.dels.length + 1} images — coche celles à supprimer</div><div class="row">${card(g.keep, false)}${g.dels.map(d => card(d, true)).join('')}</div></div>`).join('\n')

const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Doublons à vérifier (${totalDel})</title>
<style>
body{font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#f4f0ea;margin:0;color:#1a0f0a}
header{position:sticky;top:0;background:#993556;color:#fff;padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.2)}
header b{font-size:16px}
button{background:#fff;color:#993556;border:none;border-radius:8px;padding:9px 16px;font-weight:700;font-size:14px;cursor:pointer}
.info{font-size:13px;opacity:.95}
.grp{background:#fff;margin:12px;border-radius:10px;padding:8px 10px;border:1px solid #e8dcc9}
.gh{font-size:12px;color:#8a7a70;font-weight:700;margin-bottom:6px}
.row{display:flex;flex-wrap:wrap;gap:8px}
.c{width:140px;border:3px solid #e8dcc9;border-radius:8px;padding:5px;text-align:center;position:relative;background:#fff}
.c.keep{border-color:#1a9d55;background:#eafaf0}
.c.del{border-color:#d64545;background:#fdeaea}
.c img{width:100%;height:110px;object-fit:contain;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0/16px 16px}
.nm{font-size:11px;margin-top:3px;line-height:1.2;height:26px;overflow:hidden}
.th{font-size:10px;color:#8a7a70}
.c.keep .nm::after{content:' ✓ gardée';color:#1a9d55;font-weight:700}
.cb{position:absolute;top:6px;left:6px;width:24px;height:24px;cursor:pointer;z-index:2}
</style></head><body>
<header>
  <b>🔍 ${totalDel} doublons à vérifier</b>
  <span class="info">Coché (rouge) = sera supprimé · décoché (vert) = gardé. <b>À toi de choisir</b> laquelle garder dans chaque groupe.</span>
  <span style="flex:1"></span>
  <span class="info" id="cnt"></span>
  <button onclick="dl()">💾 Valider et télécharger la liste</button>
</header>
${blocks}
<script>
const cnt=document.getElementById('cnt')
function upd(){const n=document.querySelectorAll('.cb:checked').length;cnt.textContent=n+' à supprimer'}
function paint(cb){const c=cb.closest('.c');c.classList.toggle('del',cb.checked);c.classList.toggle('keep',!cb.checked)}
document.querySelectorAll('.cb').forEach(cb=>{paint(cb);cb.addEventListener('change',()=>{paint(cb);upd()})})
function dl(){
  const ids=[...document.querySelectorAll('.cb:checked')].map(c=>c.value)
  const blob=new Blob([JSON.stringify(ids)],{type:'application/json'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='doublons-a-supprimer.json';a.click()
  alert(ids.length+' identifiants exportés dans doublons-a-supprimer.json. Donne ce fichier à Claude.')
}
upd()
</script></body></html>`

writeFileSync('cake-photos/doublons.html', html)
writeFileSync('cake-photos/_naming/dedupe12-groups.json', JSON.stringify(groups.map(g => ({ keep: g.keep.id, dels: g.dels.map(d => d.id) }))))
console.log('\n✅ Page écrite : cake-photos/doublons.html  (ouvre-la dans ton navigateur)')
