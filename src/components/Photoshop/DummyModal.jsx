import { useState, useMemo } from 'react'

// Générateur de « dummies » (formes nues de gâteaux) à l'échelle, pour la bibliothèque Studio photo.
// Étage 1 = le haut. Largeur 15/20/25/30 cm, hauteur 5 à 25 cm, par étage.
const SIZES = [15, 20, 25, 30]
const HEIGHTS = [5, 7, 9, 10, 12, 14, 15, 17, 19, 20, 22, 24, 25]

// Construit le SVG du gâteau (tiers = [{w,h}] du HAUT vers le bas) à `scale` px/cm.
// Rectangles simples empilés : la hauteur de l'image = pile la hauteur du gâteau.
function buildSvg(tiers, scale) {
  const n = tiers.length
  const used = tiers.map(t => t.w)
  const usedH = tiers.map(t => t.h)
  const maxW = Math.max(...used)
  const W = Math.round(maxW * scale)
  const H = Math.round(usedH.reduce((a, b) => a + b, 0) * scale)
  const cx = W / 2
  let body = `<defs><linearGradient id="b" x1="0" x2="1" y1="0" y2="0">`
    + `<stop offset="0%" stop-color="#e7e0d4"/><stop offset="18%" stop-color="#faf7f2"/>`
    + `<stop offset="50%" stop-color="#ffffff"/><stop offset="82%" stop-color="#efe9df"/>`
    + `<stop offset="100%" stop-color="#dad2c4"/></linearGradient></defs>`
  let cum = 0
  for (let k = 0; k < n; k++) {
    const i = n - 1 - k                 // k=0 → bas ; i = index étage (0 = haut)
    const w = used[i] * scale
    const hPx = usedH[i] * scale
    const bandTop = H - cum - hPx
    const x = cx - w / 2
    body += `<rect x="${x}" y="${bandTop}" width="${w}" height="${hPx}" fill="url(#b)" stroke="#cfc6b6" stroke-width="1"/>`
    cum += hPx
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`, W, H }
}

// SVG → PNG transparent (dataURL)
function svgToPngDataUrl(svgString, W, H) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }))
    const img = new Image()
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H
      cv.getContext('2d').drawImage(img, 0, 0, W, H)
      URL.revokeObjectURL(url)
      resolve(cv.toDataURL('image/png'))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG illisible')) }
    img.src = url
  })
}

const EXPORT_SCALE = 24   // px/cm pour l'export net

export default function DummyModal({ onClose, onPlace }) {
  const [n, setN] = useState(2)
  const [widths, setWidths] = useState([15, 20, 25, 30])    // étage 1 (haut) → bas
  const [heights, setHeights] = useState([10, 10, 10, 10])
  const [adding, setAdding] = useState(false)

  const tiers = useMemo(() => Array.from({ length: n }, (_, i) => ({ w: widths[i], h: heights[i] })), [n, widths, heights])
  const preview = useMemo(() => buildSvg(tiers, 7), [tiers])
  const usedH = heights.slice(0, n)
  const totalCm = usedH.reduce((a, b) => a + b, 0)

  const setW = (i, v) => setWidths(a => a.map((x, j) => (j === i ? v : x)))
  const setH = (i, v) => setHeights(a => a.map((x, j) => (j === i ? Number(v) : x)))

  async function add() {
    setAdding(true)
    try {
      const big = buildSvg(tiers, EXPORT_SCALE)
      const src = await svgToPngDataUrl(big.svg, big.W, big.H)
      const name = `Dummy ${n} étage${n > 1 ? 's' : ''} (${tiers.map(t => t.w).join('/')} cm)`
      // Pose sur la planche à la VRAIE taille : dimensions de l'image ÷ échelle = cm réels.
      await onPlace(src, big.W / EXPORT_SCALE, big.H / EXPORT_SCALE, name)
      onClose()
    } catch (e) {
      alert('Échec : ' + (e.message || ''))
    } finally {
      setAdding(false)
    }
  }

  const lab = 'text-[11px] font-bold uppercase tracking-wider text-bordeaux mb-1.5'
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !adding && onClose()}>
      <div className="bg-cream rounded-xl w-full max-w-2xl max-h-[88vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <div className="font-fraunces italic text-[18px] text-ink">🎂 Générer un dummy</div>
          <button onClick={() => !adding && onClose()} className="text-ink-mute text-[22px] leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr] gap-4 p-4">
          {/* réglages */}
          <div>
            <div className={lab}>Nombre d'étages</div>
            <div className="flex gap-1.5 mb-4">
              {[1, 2, 3, 4].map(k => (
                <button key={k} onClick={() => setN(k)}
                  className={'flex-1 py-1.5 rounded-lg text-[13px] font-bold border ' + (k === n ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft')}>{k}</button>
              ))}
            </div>

            <div className={lab}>Largeur &amp; hauteur par étage</div>
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className="mb-3 pb-2 border-b border-dashed border-line">
                <div className="text-[12px] font-semibold text-ink mb-1">{i === 0 ? 'Étage 1 (haut)' : (i === n - 1 ? `Étage ${i + 1} (bas)` : `Étage ${i + 1}`)}</div>
                <div className="flex gap-1.5 mb-1.5">
                  {SIZES.map(s => (
                    <button key={s} onClick={() => setW(i, s)}
                      className={'flex-1 py-1 rounded-md text-[12px] font-bold border ' + (widths[i] === s ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft')}>{s}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-mute">hauteur</span>
                  <select value={heights[i]} onChange={e => setH(i, e.target.value)}
                    className="flex-1 px-2 py-1 border border-line rounded-md text-[13px] bg-white">
                    {HEIGHTS.map(h => <option key={h} value={h}>{h} cm</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {/* aperçu (damier = transparence) */}
          <div>
            <div className={lab}>Aperçu (à l'échelle)</div>
            <div className="rounded-lg border border-line flex items-center justify-center p-3 min-h-[300px]"
              style={{ backgroundColor: '#fff', backgroundImage: 'linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)', backgroundSize: '18px 18px', backgroundPosition: '0 0,0 9px,9px -9px,-9px 0' }}>
              <div style={{ maxWidth: 360, maxHeight: 380 }} dangerouslySetInnerHTML={{ __html: preview.svg }} />
            </div>
            <div className="text-center text-[12px] text-ink-mute mt-2">
              {n} étage{n > 1 ? 's' : ''} · {widths.slice(0, n).join('/')} cm · h {usedH.join('/')} cm · total {totalCm} cm
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-line flex justify-end gap-2">
          <button onClick={() => !adding && onClose()} className="px-3 py-2 text-[13px] border border-line rounded-lg">Annuler</button>
          <button onClick={add} disabled={adding} className="px-4 py-2 text-[13px] font-bold bg-bordeaux text-cream rounded-lg disabled:opacity-50">
            {adding ? 'Ajout…' : '➕ Poser sur la planche'}
          </button>
        </div>
      </div>
    </div>
  )
}
