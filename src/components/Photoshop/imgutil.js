// Outils image : charger + rogner aux bords du contenu (enlève les marges transparentes).
export function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src })
}

// Renvoie {dataURL, w, h} d'un canvas rogné à la zone non transparente (le cadre se resserre).
export function trimToContent(canvas) {
  const W = canvas.width, H = canvas.height
  const d = canvas.getContext('2d').getImageData(0, 0, W, H).data
  let minx = W, miny = H, maxx = -1, maxy = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 8) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y }
  }
  if (maxx < 0) return { dataURL: canvas.toDataURL('image/png'), w: W, h: H }   // tout transparent → on ne touche pas
  const w = maxx - minx + 1, h = maxy - miny + 1
  const out = document.createElement('canvas'); out.width = w; out.height = h
  out.getContext('2d').drawImage(canvas, minx, miny, w, h, 0, 0, w, h)
  return { dataURL: out.toDataURL('image/png'), w, h }
}
