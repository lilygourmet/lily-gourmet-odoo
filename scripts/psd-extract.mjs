// Extrait les ÉLÉMENTS UNIQUES d'un PSD en PNG (ignore le fond et les copies répétitives),
// et génère une planche-contact pour visualiser.
//   node scripts/psd-extract.mjs "/chemin/fichier.psd"
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import * as agPsd from 'ag-psd'
agPsd.initializeCanvas(createCanvas)

const file = process.argv[2]
if (!file) { console.error('Usage: node scripts/psd-extract.mjs <fichier.psd>'); process.exit(1) }
const buf = readFileSync(file)
const psd = agPsd.readPsd(buf, { skipCompositeImageData: true, skipThumbnail: true })
const stem = basename(file).replace(/\.psd$/i, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim()
const outDir = 'cake-photos/' + stem
mkdirSync(outDir, { recursive: true })

const clean = s => String(s || 'element').replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 50)
const seen = new Set()
const els = []   // { name, canvas, w, h }

function walk(layers) {
  for (const l of (layers || [])) {
    if (l.children) { walk(l.children); continue }       // descend dans les groupes
    const w = (l.right - l.left) || 0, h = (l.bottom - l.top) || 0
    const nm = (l.name || '').trim()
    if (!l.canvas || w < 8 || h < 8) continue
    if (/^(background|fond|calque\s*0)$/i.test(nm)) continue   // fond
    if (/copie/i.test(nm)) continue                            // doublon répétitif
    const key = nm.toLowerCase() + '|' + w + 'x' + h
    if (seen.has(key)) continue                                // même élément déjà pris
    seen.add(key)
    els.push({ name: nm || ('element ' + (els.length + 1)), canvas: l.canvas, w, h })
  }
}
walk(psd.children)

// écrit chaque élément
els.forEach((e, i) => {
  writeFileSync(`${outDir}/${String(i + 1).padStart(2, '0')} ${clean(e.name)}.png`, e.canvas.toBuffer('image/png'))
})
console.log(`${els.length} élément(s) extrait(s) dans ${outDir}/`)
els.forEach((e, i) => console.log(`  ${i + 1}. ${e.name} (${e.w}x${e.h})`))

// planche-contact (grille) pour visualiser
const cols = 4, cell = 230, pad = 12, lblH = 22
const rows = Math.ceil(els.length / cols)
const cw = cols * cell + pad, ch = rows * (cell + lblH) + pad
const sheet = createCanvas(cw, ch); const ctx = sheet.getContext('2d')
ctx.fillStyle = '#F4F0EA'; ctx.fillRect(0, 0, cw, ch)
ctx.font = '13px sans-serif'
els.forEach((e, i) => {
  const cx = pad + (i % cols) * cell, cy = pad + Math.floor(i / cols) * (cell + lblH)
  ctx.fillStyle = '#fff'; ctx.fillRect(cx, cy, cell - pad, cell - pad)
  const box = cell - pad - 16, sc = Math.min(box / e.w, box / e.h, 1)
  const dw = e.w * sc, dh = e.h * sc
  ctx.drawImage(e.canvas, cx + (cell - pad - dw) / 2, cy + (cell - pad - dh) / 2, dw, dh)
  ctx.fillStyle = '#5b4a40'
  ctx.fillText(`${i + 1}. ${e.name}`.slice(0, 28), cx + 2, cy + cell - 2)
})
mkdirSync('cake-photos/_apercus', { recursive: true })
const sheetPath = `cake-photos/_apercus/${stem}-elements.png`
writeFileSync(sheetPath, sheet.toBuffer('image/png'))
console.log(`\nPlanche-contact: ${sheetPath}`)
