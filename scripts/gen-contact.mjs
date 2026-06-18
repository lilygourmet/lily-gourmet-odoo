// Planches-contact LISIBLES et numérotées des PNG d'un dossier (pour nommer les éléments).
//   node scripts/gen-contact.mjs "Spiderman LS"
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { createCanvas, loadImage } from '@napi-rs/canvas'
const stem = process.argv[2] || 'Spiderman LS'
const dir = `cake-photos/${stem}`
const files = readdirSync(dir).filter(f => /\.png$/i.test(f)).sort()
mkdirSync('cake-photos/_apercus', { recursive: true })

const COLS = 5, ROWS = 5, PER = COLS * ROWS, CELL = 300, LBL = 26, PAD = 10
let page = 0
for (let i = 0; i < files.length; i += PER) {
  page++
  const chunk = files.slice(i, i + PER)
  const rows = Math.ceil(chunk.length / COLS)
  const W = COLS * CELL + PAD, H = rows * (CELL + LBL) + PAD
  const cv = createCanvas(W, H); const ctx = cv.getContext('2d')
  ctx.fillStyle = '#EDE6D8'; ctx.fillRect(0, 0, W, H); ctx.font = 'bold 16px sans-serif'
  for (let j = 0; j < chunk.length; j++) {
    const f = chunk[j]
    const num = parseInt(f) // numéro en tête du nom de fichier
    const cx = PAD + (j % COLS) * CELL, cy = PAD + Math.floor(j / COLS) * (CELL + LBL)
    ctx.fillStyle = '#fff'; ctx.fillRect(cx, cy, CELL - PAD, CELL - PAD)
    try {
      const img = await loadImage(`${dir}/${f}`)
      const box = CELL - PAD - 14, sc = Math.min(box / img.width, box / img.height, 1)
      const dw = img.width * sc, dh = img.height * sc
      ctx.drawImage(img, cx + (CELL - PAD - dw) / 2, cy + (CELL - PAD - dh) / 2, dw, dh)
    } catch {}
    ctx.fillStyle = '#7a2942'; ctx.fillText('#' + num, cx + 4, cy + CELL - 4)
  }
  const out = `cake-photos/_apercus/${stem}-p${page}.png`
  writeFileSync(out, cv.toBuffer('image/png'))
  console.log(out + ` (#${parseInt(chunk[0])}–#${parseInt(chunk[chunk.length-1])})`)
}
