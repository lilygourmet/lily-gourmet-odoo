import { readPsd } from 'ag-psd'

// Éclate un PSD en éléments (un par calque utile), DANS LE NAVIGATEUR.
// Filtre : doublons (copy/copie, nom+taille), fonds/cadres, textes, planches (~pleine page),
//          quasi-doublons (empreinte 8x8 + rotations/miroir, via le Set `seen` partagé).
const MIN = 24, AREA_MAX = 0.55

let G
function grid(canvas) {
  if (!G) { G = document.createElement('canvas'); G.width = 8; G.height = 8 }
  const gx = G.getContext('2d'); gx.clearRect(0, 0, 8, 8); gx.drawImage(canvas, 0, 0, 8, 8)
  const d = gx.getImageData(0, 0, 8, 8).data; const g = []; let sum = 0
  for (let i = 0; i < 64; i++) { const v = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) * (d[i * 4 + 3] / 255); g.push(v); sum += v }
  const m = sum / 64; return g.map(v => v > m ? 1 : 0)
}
const at = (g, r, c) => g[r * 8 + c]
const build = fn => { const o = new Array(64); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) o[r * 8 + c] = fn(r, c); return o }
const rot90 = g => build((r, c) => at(g, 7 - c, r))
const flipH = g => build((r, c) => at(g, r, 7 - c))
function variants(g) { const out = []; let cur = g; for (let i = 0; i < 4; i++) { out.push(cur.join(''), flipH(cur).join('')); cur = rot90(cur) } return out }
const toBlob = canvas => new Promise(res => canvas.toBlob(res, 'image/png'))

export async function extractPsdLayers(file, seen) {
  const buf = await file.arrayBuffer()
  const psd = readPsd(buf, { skipCompositeImageData: true, skipThumbnail: true })
  const pageArea = (psd.width || 1) * (psd.height || 1)
  const local = new Set(), out = []
  const walk = layers => {
    for (const l of (layers || [])) {
      if (l.children) { walk(l.children); continue }
      const w = (l.right - l.left) || 0, h = (l.bottom - l.top) || 0, nm = (l.name || '').trim()
      if (!l.canvas || l.text) continue
      if (w < MIN || h < MIN) continue
      if (/^(background|fond|calque\s*0|layer\s*0|bg|bkg)$/i.test(nm)) continue
      if (/copy|copie/i.test(nm)) continue
      if (/^(rectangle|frame|cadre|rep[eè]re|grille|grid|planche|board|sheet)\b/i.test(nm)) continue
      if ((w * h) / pageArea >= AREA_MAX) continue
      if (w >= psd.width * 0.92 && h >= psd.height * 0.92) continue
      const base = nm.replace(/\s*(copy|copie)\s*\d*/ig, '').toLowerCase() + '|' + Math.round(w / 8) + 'x' + Math.round(h / 8)
      if (local.has(base)) continue; local.add(base)
      const vs = variants(grid(l.canvas))
      if (seen && vs.some(v => seen.has(v))) continue
      if (seen) vs.forEach(v => seen.add(v))
      out.push({ nom: nm || 'element', canvas: l.canvas })
    }
  }
  walk(psd.children)
  const res = []
  for (const e of out) { const blob = await toBlob(e.canvas); if (blob) res.push({ nom: e.nom, blob }) }
  return res
}
