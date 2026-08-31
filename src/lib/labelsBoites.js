// ============================================================
// Étiquettes « boîtes » : texte FR + AR en gros, en GRAS.
// L'arabe (et le rendu gras/joli) est DESSINÉ en image puis
// envoyé à l'imprimante Zebra en ZPL (^GFA), car les polices
// internes de la Zebra ne connaissent pas l'arabe.
// Format : 5 × 2,5 cm à 203 dpi → 400 × 200 points.
// ============================================================

const W = 400            // largeur en points (5 cm)
const H = 200            // hauteur en points (2,5 cm)
const MARGIN = 14

// Traduit un texte français en arabe via l'IA (action serveur).
export async function translateToArabic(text) {
  const r = await fetch('/api/wati-webhook?action=translate-ar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data?.error || 'Erreur traduction')
  return (data.arabic || '').trim()
}

// Découpe un texte en lignes qui tiennent dans maxW à la taille de police donnée.
function wrapLines(ctx, text, maxW) {
  const words = String(text).trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let cur = words[0]
  for (let i = 1; i < words.length; i++) {
    const test = cur + ' ' + words[i]
    if (ctx.measureText(test).width <= maxW) cur = test
    else { lines.push(cur); cur = words[i] }
  }
  lines.push(cur)
  return lines
}

// Cherche la plus grande taille de police (en gras) telle que le texte
// tienne dans la zone {w,h}. Renvoie { fontSize, lines }.
function fitText(ctx, text, w, h, fontStack) {
  for (let size = 72; size >= 14; size -= 2) {
    ctx.font = `bold ${size}px ${fontStack}`
    const lines = wrapLines(ctx, text, w)
    if (!lines.length) return { fontSize: size, lines: [] }
    const lineH = size * 1.15
    const totalH = lines.length * lineH
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width))
    if (totalH <= h && widest <= w) return { fontSize: size, lines }
  }
  ctx.font = `bold 14px ${fontStack}`
  return { fontSize: 14, lines: wrapLines(ctx, text, w) }
}

function drawBlock(ctx, text, region, rtl) {
  if (!text || !text.trim()) return
  // Police : sans-serif grasse. Pour l'arabe on privilégie des polices arabes lisibles.
  const fontStack = rtl
    ? `"Geeza Pro", "Tahoma", "Arial", sans-serif`
    : `"Helvetica Neue", "Arial", sans-serif`
  const { fontSize, lines } = fitText(ctx, text, region.w, region.h, fontStack)
  ctx.font = `bold ${fontSize}px ${fontStack}`
  ctx.fillStyle = '#000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.direction = rtl ? 'rtl' : 'ltr'
  const lineH = fontSize * 1.15
  const totalH = lines.length * lineH
  const cx = region.x + region.w / 2
  let y = region.y + (region.h - totalH) / 2 + lineH / 2
  for (const line of lines) {
    ctx.fillText(line, cx, y)
    y += lineH
  }
}

// Dessine l'étiquette (FR en haut, AR en bas) sur un canvas 400×200.
export function drawLabel(canvas, fr, ar) {
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)

  const hasFr = !!(fr && fr.trim())
  const hasAr = !!(ar && ar.trim())
  const usable = { x: MARGIN, w: W - MARGIN * 2 }

  if (hasFr && hasAr) {
    const half = (H - MARGIN * 2) / 2
    drawBlock(ctx, fr, { ...usable, y: MARGIN, h: half }, false)
    drawBlock(ctx, ar, { ...usable, y: MARGIN + half, h: half }, true)
    // fin séparateur discret
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(MARGIN + 40, MARGIN + half)
    ctx.lineTo(W - MARGIN - 40, MARGIN + half)
    ctx.stroke()
  } else if (hasFr) {
    drawBlock(ctx, fr, { ...usable, y: MARGIN, h: H - MARGIN * 2 }, false)
  } else if (hasAr) {
    drawBlock(ctx, ar, { ...usable, y: MARGIN, h: H - MARGIN * 2 }, true)
  }
  return canvas
}

// Code de répétition ZPL (compression ACS) : g..z = ×20 (20..400), G..Y = 1..19.
function countCode(n) {
  let s = ''
  const high = Math.floor(n / 20), low = n % 20
  if (high > 0) s += String.fromCharCode(102 + high) // g..z
  if (low > 0) s += String.fromCharCode(70 + low)    // G..Y
  return s
}

// Compresse le hex d'une rangée : runs identiques + fin blanche « , » / noire « ! ».
function compressRow(hex) {
  let core = hex, trailer = ''
  const zt = hex.match(/0+$/), ft = hex.match(/F+$/)
  if (zt && zt[0].length >= 2) { core = hex.slice(0, hex.length - zt[0].length); trailer = ',' }
  else if (ft && ft[0].length >= 2) { core = hex.slice(0, hex.length - ft[0].length); trailer = '!' }
  let out = '', i = 0
  while (i < core.length) {
    let j = i
    while (j < core.length && core[j] === core[i]) j++
    const run = j - i
    out += run > 1 ? countCode(run) + core[i] : core[i]
    i = j
  }
  return out + trailer
}

// Dessine UN bloc de texte (FR ou AR) sur un canvas dédié w×h. Sert à générer
// l'image ZPL de l'arabe uniquement (le français passe en police ZPL native).
function renderRegion(text, w, h, rtl) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  drawBlock(ctx, text, { x: MARGIN, w: w - MARGIN * 2, y: 0, h }, rtl)
  return canvas
}

// Champ ZPL image (^GFA COMPRESSÉ) pour un canvas, positionné en (x,y).
// La compression (l'étiquette est surtout blanche) garde le fichier petit ;
// hex découpé en lignes de 72 (évite que Bloc-notes coupe au milieu).
function gfField(canvas, x, y) {
  const w = canvas.width, h = canvas.height
  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, w, h)
  const bytesPerRow = w / 8
  const total = bytesPerRow * h
  let compData = '', prev = null
  for (let py = 0; py < h; py++) {
    let rowHex = ''
    for (let b = 0; b < bytesPerRow; b++) {
      let byte = 0
      for (let bit = 0; bit < 8; bit++) {
        const px = b * 8 + bit
        const i = (py * w + px) * 4
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
        if (lum < 128) byte |= (0x80 >> bit)
      }
      rowHex += byte.toString(16).padStart(2, '0').toUpperCase()
    }
    const c = compressRow(rowHex)
    compData += (c === prev) ? ':' : c
    prev = c
  }
  const dataLines = compData.match(/.{1,72}/g) || ['']
  return [`^FO${x},${y}^GFA,${total},${total},${bytesPerRow},`, ...dataLines, '^FS'].join('\n')
}

// Impression DIRECTE (image, sans fichier ni Bloc-notes) : ouvre la fenêtre
// d'impression avec l'étiquette dessinée (FR + arabe) au format 50 × 25 mm.
// deg permet de tourner si le pilote impose une orientation.
export function printLabels(fr, ar, qty, deg = 0) {
  const n = Math.max(1, Number(qty) || 1)
  const base = document.createElement('canvas')
  drawLabel(base, fr, ar)

  const swap = deg === 90 || deg === 270
  const canvas = document.createElement('canvas')
  canvas.width = swap ? base.height : base.width
  canvas.height = swap ? base.width : base.height
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((deg * Math.PI) / 180)
  ctx.drawImage(base, -base.width / 2, -base.height / 2)

  const dataUrl = canvas.toDataURL('image/png')
  const pageW = swap ? 25 : 50
  const pageH = swap ? 50 : 25
  const imgs = Array(n).fill(0).map(() => `<img src="${dataUrl}" />`).join('')
  const win = window.open('', '_blank')
  if (!win) throw new Error("Fenêtre d'impression bloquée — autorise les pop-ups.")
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Étiquettes</title>
  <style>
    @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { width: ${pageW}mm; height: ${pageH}mm; display: block; page-break-after: always; }
  </style></head><body>${imgs}
  <script>window.onload=function(){window.focus();window.print();}<\/script>
  </body></html>`)
  win.document.close()
}

// Génère le ZPL de l'étiquette : FRANÇAIS en police ZPL native (gras par
// double-frappe) + ARABE en petite image ^GFA compressée. Résultat compact
// (~1 page) → s'imprime comme les étiquettes café (bon sens, non coupé).
// La quantité est gérée par ^PQ (une seule définition d'étiquette).
export function buildZplBoites(fr, ar, qty) {
  const n = Math.max(1, Number(qty) || 1)
  const hasFr = !!(fr && fr.trim())
  const hasAr = !!(ar && ar.trim())
  const lines = ['^XA', '^CI28', '^MMT', `^PW${W}`, `^LL${H}`, '^LS0']

  if (hasFr) {
    // Le français part en IMAGE comme l'arabe : la G&G GG-D410 ignore ^CI28 et lit
    // sa police CP437, qui n'a pas les majuscules accentuées (GÂTEAU, À, È…) et
    // sortait du charabia. En image, ce qu'on voit à l'écran est ce qui s'imprime.
    const frCanvas = renderRegion(fr, W, hasAr ? 92 : 176, false)
    lines.push(gfField(frCanvas, 0, hasAr ? 6 : 12))
  }
  if (hasFr && hasAr) lines.push('^FO60,98^GB280,3,3^FS')   // séparateur
  if (hasAr) {
    const arCanvas = renderRegion(ar, W, hasFr ? 92 : 176, true)
    lines.push(gfField(arCanvas, 0, hasFr ? 104 : 12))
  }
  lines.push(`^PQ${n},0,1,Y`)
  lines.push('^XZ')
  return lines.join('\n')
}
