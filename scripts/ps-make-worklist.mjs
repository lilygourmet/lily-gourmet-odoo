// Construit la liste des images au nom GÉNÉRIQUE à renommer (Layer/Group/…).
// Sortie : cake-photos/_naming/worklist.json = [{ path, local, theme }]
import { readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
const ROOT = 'cake-photos'
const slug = s => String(s).replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || '_divers'
const nomOf = f => f.replace(/^\d+\s/, '').replace(/\.[^.]+$/, '')
const generic = n => n === '' || /^([Ll]ayer|[Gg]roup|[Cc]alque|[Ee]lement|[Rr]ectangle|[Ss]hape|[Ff]orme|[0-9]+)(\b|_| |$)/.test(n)

const jobs = []
for (const theme of readdirSync(ROOT)) {
  if (theme.startsWith('_')) continue
  const dir = join(ROOT, theme); if (!statSync(dir).isDirectory()) continue
  for (const f of readdirSync(dir)) {
    if (!/\.(png|jpe?g|webp)$/i.test(f)) continue
    if (!generic(nomOf(f))) continue
    jobs.push({ path: `${slug(theme)}/${f}`, local: resolve(join(dir, f)), theme })
  }
}
mkdirSync(`${ROOT}/_naming`, { recursive: true })
writeFileSync(`${ROOT}/_naming/worklist.json`, JSON.stringify(jobs))
console.log(`${jobs.length} images à nommer → ${ROOT}/_naming/worklist.json`)
