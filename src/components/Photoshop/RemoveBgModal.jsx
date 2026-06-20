import { useState, useRef, useEffect } from 'react'
import { loadImg, trimToContent } from './imgutil'

// Enlever le fond uni avec une TOLÉRANCE réglable + aperçu. onClose({src,ratio} | null).
const DISP = 480

export default function RemoveBgModal({ src, onClose }) {
  const cvRef = useRef(null), origRef = useRef(null), scaleRef = useRef(1)
  const [tol, setTol] = useState(38)
  const [ready, setReady] = useState(false)
  const [dispH, setDispH] = useState(200)

  const applyTol = t => {
    const cv = cvRef.current, W = cv.width, H = cv.height, ctx = cv.getContext('2d'), base = origRef.current
    const im = new ImageData(new Uint8ClampedArray(base.data), W, H), d = im.data
    const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]
    const ref = corners.map(([x, y]) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]] })
    const thr = t * 3, vis = new Uint8Array(W * H), st = []
    const close = i => ref.some(c => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]) < thr)
    for (const [x, y] of corners) { const p = y * W + x; if (!vis[p]) { vis[p] = 1; st.push(p) } }
    while (st.length) { const p = st.pop(), i = p * 4; if (!close(i)) continue; d[i + 3] = 0
      const x = p % W, y = (p / W) | 0
      if (x > 0 && !vis[p - 1]) { vis[p - 1] = 1; st.push(p - 1) }
      if (x < W - 1 && !vis[p + 1]) { vis[p + 1] = 1; st.push(p + 1) }
      if (y > 0 && !vis[p - W]) { vis[p - W] = 1; st.push(p - W) }
      if (y < H - 1 && !vis[p + W]) { vis[p + W] = 1; st.push(p + W) }
    }
    ctx.putImageData(im, 0, 0)
  }
  useEffect(() => {
    (async () => {
      try {
        const img = await loadImg(src)
        const cap = 1200, sc = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight))
        const W = Math.max(1, Math.round(img.naturalWidth * sc)), H = Math.max(1, Math.round(img.naturalHeight * sc))
        const cv = cvRef.current; cv.width = W; cv.height = H; const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, W, H)
        origRef.current = ctx.getImageData(0, 0, W, H); scaleRef.current = DISP / W; setDispH(H * scaleRef.current); setReady(true); applyTol(38)
      } catch (e) { alert("Image protégée (externe) : ça marche sur les photos importées/collées."); onClose(null) }
    })()
  }, [src]) // eslint-disable-line
  const onTol = v => { setTol(v); applyTol(v) }
  const finish = () => { const r = trimToContent(cvRef.current); onClose({ src: r.dataURL, ratio: r.w / r.h }) }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onPointerDown={e => { if (e.target === e.currentTarget) onClose(null) }}>
      <div className="bg-white rounded-xl p-4 max-w-[92vw] max-h-[92vh] overflow-auto">
        <div className="font-fraunces text-[15px] mb-1">🪄 Enlever le fond</div>
        <div className="flex items-center gap-2 mb-2 text-[12px] text-ink-soft"><span>Tolérance</span><input type="range" min="5" max="150" value={tol} onChange={e => onTol(+e.target.value)} className="flex-1" /><span>{tol}</span></div>
        <p className="text-[12px] text-ink-soft mb-2">Augmente la tolérance si du fond reste, baisse-la si ça mange le dessin.</p>
        <div className="border border-line rounded-lg overflow-hidden" style={{ width: DISP, height: dispH, backgroundImage: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%)', backgroundSize: '18px 18px' }}>
          <canvas ref={cvRef} style={{ width: DISP, height: dispH, display: ready ? 'block' : 'none' }} />
          {!ready && <div className="flex items-center justify-center h-full text-[13px] text-ink-mute">Chargement…</div>}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={finish} className="rounded-lg px-3 py-2 text-[13px] font-bold bg-bordeaux text-white flex-1">✓ Terminer</button>
          <button onClick={() => onClose(null)} className="rounded-lg px-3 py-2 text-[13px] font-semibold bg-white border border-line">Annuler</button>
        </div>
      </div>
    </div>
  )
}
