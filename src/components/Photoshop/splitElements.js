import { loadImg } from './imgutil'

// Découpe une planche (photos collées côte à côte sur un fond uni) en éléments
// séparés. Le fond est détecté comme dans « Enlever le fond » (flood-fill depuis
// les 4 coins, avec tolérance) ; ensuite tout ce qui se touche = un même morceau.
// Renvoie [{ dataURL, ratio, rx, ry, rw, rh }] où rx/ry/rw/rh sont la position et
// la taille RELATIVES (0→1) dans l'image d'origine : chaque morceau peut ainsi
// être reposé exactement à sa place.
export async function splitElements(src, { tol = 38, minRatio = 0.002 } = {}) {
  const img = await loadImg(src)
  const cap = 1600, sc = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight))
  const W = Math.max(1, Math.round(img.naturalWidth * sc))
  const H = Math.max(1, Math.round(img.naturalHeight * sc))
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, W, H)
  const d = ctx.getImageData(0, 0, W, H).data

  // 1) le fond : pixels reliés à un bord et de couleur proche d'un coin
  // (le blanc INTÉRIEUR d'un dessin n'est pas relié au bord → il est conservé).
  const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]
  const ref = corners.map(([x, y]) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]] })
  const thr = tol * 3
  const isBg = p => {
    const i = p * 4
    if (d[i + 3] < 16) return true   // déjà transparent (image détourée)
    return ref.some(c => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < thr)
  }
  const bg = new Uint8Array(W * H), st = []
  const seed = p => { if (!bg[p] && isBg(p)) { bg[p] = 1; st.push(p) } }
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x) }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1) }
  while (st.length) {
    const p = st.pop(), x = p % W, y = (p / W) | 0
    if (x > 0) seed(p - 1); if (x < W - 1) seed(p + 1)
    if (y > 0) seed(p - W); if (y < H - 1) seed(p + W)
  }

  // 2) les morceaux : groupes de pixels non-fond qui se touchent (8 voisins)
  const lab = new Int32Array(W * H).fill(-1)
  const parts = []
  for (let p0 = 0; p0 < W * H; p0++) {
    if (bg[p0] || lab[p0] >= 0) continue
    const id = parts.length, q = [p0]; lab[p0] = id
    let n = 0, x0 = W, x1 = 0, y0 = H, y1 = 0
    while (q.length) {
      const p = q.pop(), x = p % W, y = (p / W) | 0
      n++
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      const vois = [
        x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1,
        (x > 0 && y > 0) ? p - W - 1 : -1, (x < W - 1 && y > 0) ? p - W + 1 : -1,
        (x > 0 && y < H - 1) ? p + W - 1 : -1, (x < W - 1 && y < H - 1) ? p + W + 1 : -1,
      ]
      for (const np of vois) if (np >= 0 && !bg[np] && lab[np] < 0) { lab[np] = id; q.push(np) }
    }
    parts.push({ id, n, x0, x1, y0, y1 })
  }

  // 3) on jette les miettes (poussière du scan) et on fabrique une image par morceau
  const min = W * H * minRatio
  return parts.filter(p => p.n > min).sort((a, b) => b.n - a.n).map(p => {
    const w = p.x1 - p.x0 + 1, h = p.y1 - p.y0 + 1
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const cx = c.getContext('2d'), out = cx.createImageData(w, h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (y + p.y0) * W + (x + p.x0)
      if (lab[s] !== p.id) continue           // les autres morceaux restent transparents
      const i = s * 4, o = (y * w + x) * 4
      out.data[o] = d[i]; out.data[o + 1] = d[i + 1]; out.data[o + 2] = d[i + 2]; out.data[o + 3] = 255
    }
    cx.putImageData(out, 0, 0)
    return { dataURL: c.toDataURL('image/png'), ratio: w / h, rx: p.x0 / W, ry: p.y0 / H, rw: w / W, rh: h / H }
  })
}
