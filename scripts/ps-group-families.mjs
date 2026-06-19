// Regroupe des familles de thèmes sous "Famille · …" (Foot, Super-héros, Macarons…).
//   node scripts/ps-group-families.mjs           (aperçu)
//   node scripts/ps-group-families.mjs --apply
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = {}; for (const l of readFileSync('.env.local', 'utf8').split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '').trim() }
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const hit = (t, list) => { const s = norm(t); return list.some(k => new RegExp(`(^|[^a-z0-9])${k.replace(/ /g, '[^a-z0-9]+')}([^a-z0-9]|$)`).test(s)) }

// Ordre = priorité (1er qui matche gagne). On NE touche PAS aux thèmes déjà préfixés.
const FAMILIES = [
  { name: 'Super-héros', kw: ['spider', 'spiderman', 'batman', 'superman', 'captain america', 'super heros', 'superhero', 'super 4', 'iron man', 'hulk', 'avenger', 'super papa', 'super maman', 'supermaman', 'superpapa', 'superwomen'] },
  { name: 'Foot', kw: ['foot', 'real madrid', 'real', 'fcb', 'barca', 'barça', 'chelsea', 'fifa', 'coupe du monde', 'echarpe', 'scarf', 'joueurs real', 'joeurs real', 'maillot'] },
  { name: 'Macarons', kw: ['macaron', 'macarons'] },
  { name: 'Voitures', kw: ['voiture', 'voitures', 'bmw', 'mercedes', 'audi', 'harley', 'moto', 'bentley', 'ferrari', 'porsche', 'lamborghini'] },
  { name: 'Marques', kw: ['logo', 'marque', 'marques', 'chanel', 'channel', 'gucci', 'prada', 'louboutin', 'rolex', 'cartier', 'burberry', 'burburry', 'valentino', 'havaianas', 'havainas', 'converse', 'opi', 'miu miu', 'hermes', 'louis vuitton', 'juicy couture', 'dior', 'versace', 'tiffany', 'tifanny', 'spalding'] },
  { name: 'Mariage', kw: ['mariage', 'marie', 'maries', 'fiancaille', 'fiancailles', 'bride', 'wedding', 'noces', 'marry', 'bachelorette', 'henna', 'henne'] },
  { name: 'Musique', kw: ['music', 'musique', 'piano', 'guitar', 'guitare', 'luth', 'cle de sol', 'clef de sol', 'casque music', 'michael buble'] },
  { name: 'Naissance', kw: ['naissance', 'bebe', 'baby', 'babyshower', 'bbshower', 'landeau', 'bapteme', 'baby shower'] },
  { name: 'Anniversaire', kw: ['anniversaire', 'birthday', 'chiffre', 'chiffres', 'numbers', 'bougie'] },
  { name: 'Fêtes', kw: ['noel', 'christmas', 'halloween', 'ramadan', 'paques', 'easter', 'valentine', 'valentines', 'carnaval', 'carnival', '8 mars', 'journee de la femme', 'women', 'womens day', 'bonne annee', 'nouvel an', 'aid', 'best mom', 'mothers day', 'saint valentin'] },
  { name: 'Fleurs', kw: ['fleur', 'fleurs', 'roses', 'flower', 'floral', 'tulipe', 'marguerite'] },
  { name: 'Carte', kw: ['carte', 'cartes'] },
  { name: 'Animaux', kw: ['chien', 'chat', 'cheval', 'horse', 'elephant', 'zebre', 'lapin', 'pingouin', 'poussin', 'papillon', 'papillons', 'oiseau', 'oiseaux', 'ourson', 'ouson', 'teddy', 'grenouille', 'froggy', 'mouton', 'singe', 'panda', 'renard', 'girafe', 'zebra'] },
]
const PREFIXES = ['Disney ', ...FAMILIES.map(f => f.name + ' ')]

const rows = []; let from = 0
for (;;) { const { data, error } = await sb.from('ps_photos').select('theme').range(from, from + 999); if (error) { console.log(error.message); break } rows.push(...data); if (data.length < 1000) break; from += 1000 }
const cnt = {}; rows.forEach(r => { cnt[r.theme] = (cnt[r.theme] || 0) + 1 })

const plan = []
for (const th of Object.keys(cnt)) {
  if (PREFIXES.some(p => th.startsWith(p))) continue
  for (const fam of FAMILIES) {
    if (hit(th, fam.kw)) { plan.push([th, `${fam.name} · ${th.replace(/[-_ ]*Recovered/ig, '').trim()}`, cnt[th]]); break }
  }
}
plan.sort((a, b) => a[1].localeCompare(b[1]))
const byFam = {}; plan.forEach(([, nt, c]) => { const f = nt.split(' · ')[0]; byFam[f] = (byFam[f] || 0) + c })
console.log(`${plan.length} thèmes regroupés`, byFam)
plan.forEach(([t, nt, c]) => console.log(`  "${t}" (${c}) → ${nt}`))

if (!APPLY) { console.log('\n(aperçu) --apply pour appliquer.'); process.exit(0) }
let ok = 0
for (const [t, nt] of plan) { const { error } = await sb.from('ps_photos').update({ theme: nt }).eq('theme', t); if (!error) ok++ }
console.log(`Terminé : ${ok} thème(s) regroupé(s).`)
