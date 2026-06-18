// Extraction EN LOT de tous les PSD d'un dossier -> un dossier PNG par PSD.
// Filtre : doublons (copy/copie, même nom+taille), fonds/cadres, calques texte,
//          planches (calque ~pleine page), doublons pivotés 90/180/270 + miroir, quasi-identiques.
//   node scripts/psd-extract-all.mjs                 -> tout le dossier
//   node scripts/psd-extract-all.mjs "A.psd" "B.psd" -> seulement ces fichiers (échantillon)
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import * as agPsd from 'ag-psd'
agPsd.initializeCanvas(createCanvas)

const SRC = '/Users/layla/Desktop/Ancien ordi/LG/PSD/'
const OUT = 'cake-photos'
const MIN = 24                       // taille mini d'un élément (px)
const AREA_MAX = 0.55                // calque > 55% de la page = planche -> ignoré

const args = process.argv.slice(2)
const files = (args.length ? args : readdirSync(SRC).filter(f => /\.psd$/i.test(f)))

const clean = s => String(s || 'element').replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 50)
const stemOf = f => f.replace(/\.psd$/i, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim()

// ---- empreinte d'image 8x8 (aHash) + variantes pivotées/miroir pour repérer les doublons ----
const G = createCanvas(8, 8), gx = G.getContext('2d')
function hashGrid(cv) {
  gx.clearRect(0, 0, 8, 8); gx.drawImage(cv, 0, 0, 8, 8)
  const d = gx.getImageData(0, 0, 8, 8).data
  const g = []; let sum = 0
  for (let i = 0; i < 64; i++) { const v = (d[i*4]*0.3 + d[i*4+1]*0.59 + d[i*4+2]*0.11) * (d[i*4+3]/255); g.push(v); sum += v }
  const mean = sum / 64
  return g.map(v => v > mean ? 1 : 0)
}
const at = (g, r, c) => g[r*8 + c]
const build = fn => { const o = new Array(64); for (let r=0;r<8;r++) for (let c=0;c<8;c++) o[r*8+c]=fn(r,c); return o }
const rot90 = g => build((r,c)=>at(g,7-c,r))
const flipH = g => build((r,c)=>at(g,r,7-c))
function variants(g){ const out=[]; let cur=g; for(let i=0;i<4;i++){ out.push(cur.join(''), flipH(cur).join('')); cur=rot90(cur) } return out }

const seen = new Set()   // empreintes déjà vues (toutes orientations) -> dédoublonnage global
let totLayers = 0, totKept = 0
const summary = []

for (const f of files) {
  let psd
  try { psd = agPsd.readPsd(readFileSync(SRC + f), { skipCompositeImageData: true, skipThumbnail: true }) }
  catch (e) { summary.push({ f, kept: 0, total: 0, err: e.message.split('\n')[0] }); console.log('✗', f, e.message.split('\n')[0]); continue }

  const pageArea = (psd.width || 1) * (psd.height || 1)
  const localSeen = new Set()    // nom de base + taille, dans ce fichier
  const els = []
  let total = 0

  const walk = layers => {
    for (const l of (layers || [])) {
      if (l.children) { walk(l.children); continue }
      total++
      const w = (l.right - l.left) || 0, h = (l.bottom - l.top) || 0
      const nm = (l.name || '').trim()
      if (!l.canvas || l.text) continue                                   // vide ou texte
      if (w < MIN || h < MIN) continue                                    // trop petit
      if (/^(background|fond|calque\s*0|layer\s*0|bg|bkg)$/i.test(nm)) continue
      if (/copy|copie/i.test(nm)) continue                                // doublon
      if (/^(rectangle|frame|cadre|guide|rep[eè]re|grille|grid|planche|board|sheet)\b/i.test(nm)) continue
      if ((w * h) / pageArea >= AREA_MAX) continue                        // planche (pleine page)
      if (w >= psd.width * 0.92 && h >= psd.height * 0.92) continue
      const base = nm.replace(/\s*(copy|copie)\s*\d*/ig, '').toLowerCase() + '|' + Math.round(w/8) + 'x' + Math.round(h/8)
      if (localSeen.has(base)) continue
      localSeen.add(base)
      // empreinte image (dédoublonnage global, y compris pivoté/miroir)
      const vs = variants(hashGrid(l.canvas))
      if (vs.some(v => seen.has(v))) continue
      vs.forEach(v => seen.add(v))
      els.push({ name: nm || ('element ' + (els.length + 1)), canvas: l.canvas, w, h })
    }
  }
  walk(psd.children)

  const stem = stemOf(f)
  if (els.length) {
    const dir = `${OUT}/${stem}`
    mkdirSync(dir, { recursive: true })
    els.forEach((e, i) => writeFileSync(`${dir}/${String(i + 1).padStart(3, '0')} ${clean(e.name)}.png`, e.canvas.toBuffer('image/png')))
    // planche-contact pour vérifier à l'œil
    const cols = 5, cell = 200, pad = 10, lbl = 18
    const rows = Math.ceil(els.length / cols)
    const cw = cols * cell + pad, ch = rows * (cell + lbl) + pad
    const sh = createCanvas(cw, ch); const ctx = sh.getContext('2d')
    ctx.fillStyle = '#F4F0EA'; ctx.fillRect(0, 0, cw, ch); ctx.font = '12px sans-serif'
    els.forEach((e, i) => { const cx = pad + (i % cols) * cell, cy = pad + Math.floor(i / cols) * (cell + lbl)
      ctx.fillStyle = '#fff'; ctx.fillRect(cx, cy, cell - pad, cell - pad)
      const box = cell - pad - 14, sc = Math.min(box / e.w, box / e.h, 1)
      ctx.drawImage(e.canvas, cx + (cell - pad - e.w*sc)/2, cy + (cell - pad - e.h*sc)/2, e.w*sc, e.h*sc)
      ctx.fillStyle = '#5b4a40'; ctx.fillText(`${i+1}. ${e.name}`.slice(0, 26), cx + 2, cy + cell - 3) })
    mkdirSync(`${OUT}/_apercus`, { recursive: true })
    writeFileSync(`${OUT}/_apercus/${stem}-elements.png`, sh.toBuffer('image/png'))
  }
  totLayers += total; totKept += els.length
  summary.push({ f, kept: els.length, total })
  console.log(`✓ ${f}  ${els.length}/${total} gardés`)
}

console.log(`\n=== ${files.length} fichier(s) · ${totKept} éléments gardés sur ${totLayers} calques ===`)
console.log('Aperçus: cake-photos/_apercus/<nom>-elements.png')
