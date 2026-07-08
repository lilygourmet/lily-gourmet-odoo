// Imbrication (nesting) expérimentale : pose des images en essayant plusieurs angles,
// en utilisant leur silhouette transparente quand c'est lisible (sinon = rectangle).
// Grille d'occupation par page (bottom-left, le plus haut/à gauche possible).

const ALPHA = 24   // seuil de transparence (0-255)

function loadImgCORS(src) {
  return new Promise((res) => {
    if (!src) return res(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = () => { const i2 = new Image(); i2.onload = () => res(i2); i2.onerror = () => res(null); i2.src = src }
    img.src = src
  })
}

// L'image a-t-elle une vraie transparence ? (si pixels illisibles → on suppose opaque)
function hasTransparency(img) {
  if (!img) return false
  try {
    const S = 32, cv = document.createElement('canvas'); cv.width = S; cv.height = S
    const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, S, S)
    const d = ctx.getImageData(0, 0, S, S).data
    let t = 0; for (let k = 0; k < S * S; k++) if (d[k * 4 + 3] < ALPHA) t++
    return t > S * S * 0.05
  } catch { return false }
}

// Masque booléen « serré » d'un élément (wcm×hcm) tourné de `angle°`, à `cpc` cellules/cm.
// (la marge anti-chevauchement est ajoutée au moment de poser, pas ici.)
function buildMask(img, wcm, hcm, angle, cpc) {
  const rad = angle * Math.PI / 180
  const c = Math.abs(Math.cos(rad)), s = Math.abs(Math.sin(rad))
  const MW = Math.max(1, Math.ceil((wcm * c + hcm * s) * cpc))   // arrondi au-dessus = empreinte ≥ image (anti-chevauchement)
  const MH = Math.max(1, Math.ceil((wcm * s + hcm * c) * cpc))
  const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH
  const ctx = cv.getContext('2d')
  ctx.translate(MW / 2, MH / 2); ctx.rotate(rad)
  const iw = wcm * cpc, ih = hcm * cpc
  if (img) ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih)
  else { ctx.fillStyle = '#000'; ctx.fillRect(-iw / 2, -ih / 2, iw, ih) }
  const grid = new Uint8Array(MW * MH)
  let data = null
  try { data = ctx.getImageData(0, 0, MW, MH).data } catch { data = null }
  if (data) { for (let k = 0; k < MW * MH; k++) grid[k] = data[k * 4 + 3] > ALPHA ? 1 : 0 }
  else {   // pixels illisibles (sécurité navigateur) → rectangle tourné calculé à la main
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
      const px = (i + 0.5 - MW / 2) / cpc, py = (j + 0.5 - MH / 2) / cpc
      const lx = px * Math.cos(-rad) - py * Math.sin(-rad), ly = px * Math.sin(-rad) + py * Math.cos(-rad)
      grid[j * MW + i] = (Math.abs(lx) <= wcm / 2 && Math.abs(ly) <= hcm / 2) ? 1 : 0
    }
  }
  return { mw: MW, mh: MH, grid, angle }
}

function collide(grid, GW, ox, oy, m) {
  for (let j = 0; j < m.mh; j++) { const row = (oy + j) * GW; for (let i = 0; i < m.mw; i++) if (m.grid[j * m.mw + i] && grid[row + ox + i]) return true }
  return false
}
function stamp(grid, GW, x, y, m) {
  for (let j = 0; j < m.mh; j++) { const row = (y + j) * GW; for (let i = 0; i < m.mw; i++) if (m.grid[j * m.mw + i]) grid[row + x + i] = 1 }
}
// meilleure position (la plus haute, puis la plus à gauche) parmi tous les angles
function findSpot(grid, GW, GH, masks) {
  let best = null
  for (const m of masks) {
    if (m.mw > GW || m.mh > GH) continue
    for (let y = 0; y + m.mh <= GH && (!best || y < best.y); y++) {
      for (let x = 0; x + m.mw <= GW; x++) {
        if (!collide(grid, GW, x, y, m)) { if (!best || y < best.y) best = { x, y, m }; break }
      }
      if (best && best.y === y && best.m === m) break
    }
  }
  return best
}

// Un essai de calage pour un jeu de masques donné. Renvoie {placements, npages}.
function runPack(prepared, GW, GH, cpc) {
  const pages = [new Uint8Array(GW * GH)]
  const placements = []
  const put = (pg, it, spot) => {
    stamp(pages[pg], GW, spot.x, spot.y, spot.m)
    const cx = (spot.x + spot.m.mw / 2) / cpc, cy = (spot.y + spot.m.mh / 2) / cpc   // bord = 0 (pas de marge page)
    placements.push({ id: it.id, page: pg, x: Math.round((cx - it.w / 2) * 20) / 20, y: Math.round((cy - it.h / 2) * 20) / 20, rot: spot.m.angle })
  }
  for (const p of prepared) {
    let done = false
    for (let pg = 0; pg < pages.length && !done; pg++) { const spot = findSpot(pages[pg], GW, GH, p.masks); if (spot) { put(pg, p.it, spot); done = true } }
    if (!done) {
      pages.push(new Uint8Array(GW * GH)); const pg = pages.length - 1
      const spot = findSpot(pages[pg], GW, GH, p.masks)
      if (spot) put(pg, p.it, spot)
      else placements.push({ id: p.it.id, page: pg, x: 0, y: 0, rot: 0 })   // plus grand qu'une page
    }
  }
  return { placements, npages: pages.length }
}

// Essaie plusieurs stratégies (angles + ordre) et garde celle qui laisse le moins de vide.
export async function nestItems(items, UW, UH, cpc = 5) {
  // charge chaque image une fois + détecte la transparence
  const loaded = []
  for (const it of items) { const img = await loadImgCORS(it.src); loaded.push({ it, img, transp: hasTransparency(img) }) }
  const GW = Math.max(1, Math.round(UW * cpc)), GH = Math.max(1, Math.round(UH * cpc))
  const pageArea = UW * UH
  const totalItemArea = items.reduce((s, it) => s + it.w * it.h, 0)

  const STRATS = [
    { transp: [0, 45, 90, 135], opaque: [0, 90], sort: (a, b) => (b.it.w * b.it.h) - (a.it.w * a.it.h) },   // gros d'abord, inclinaison
    { transp: [0, 30, 60, 90, 120, 150], opaque: [0, 90], sort: (a, b) => (b.it.w * b.it.h) - (a.it.w * a.it.h) },
    { transp: [0, 90], opaque: [0, 90], sort: (a, b) => Math.max(b.it.w, b.it.h) - Math.max(a.it.w, a.it.h) },  // sans inclinaison
  ]
  let best = null
  for (const st of STRATS) {
    const prepared = loaded.map(({ it, img, transp }) => ({ it, masks: (transp ? st.transp : st.opaque).map(a => buildMask(img, it.w, it.h, a, cpc)) }))
    prepared.sort(st.sort)
    const r = runPack(prepared, GW, GH, cpc)
    const emptyPct = Math.max(0, Math.round((1 - totalItemArea / (r.npages * pageArea)) * 100))
    if (!best || r.npages < best.npages || (r.npages === best.npages && emptyPct < best.emptyPct)) best = { ...r, emptyPct }
  }
  return best
}
