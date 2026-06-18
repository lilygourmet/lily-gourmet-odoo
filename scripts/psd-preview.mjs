// Génère un aperçu PNG (image finale aplatie) d'un PSD.
//   node scripts/psd-preview.mjs "/chemin/fichier.psd"
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import * as agPsd from 'ag-psd'
agPsd.initializeCanvas(createCanvas)

const file = process.argv[2]
const buf = readFileSync(file)
const psd = agPsd.readPsd(buf, { skipLayerImageData: true, skipThumbnail: true }) // garde le composite
mkdirSync('cake-photos/_apercus', { recursive: true })
const stem = basename(file).replace(/\.psd$/i, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim()

if (!psd.canvas) { console.log('Pas de composite dans ce PSD.'); process.exit(0) }
// aperçu réduit (max 1100px de large) pour visualisation
const maxW = 1100, scale = Math.min(1, maxW / psd.width)
const w = Math.round(psd.width * scale), h = Math.round(psd.height * scale)
const c = createCanvas(w, h); const ctx = c.getContext('2d')
ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
ctx.drawImage(psd.canvas, 0, 0, w, h)
const out = `cake-photos/_apercus/${stem}.png`
writeFileSync(out, c.toBuffer('image/png'))
console.log(`Aperçu écrit: ${out} (${w}x${h})`)
