import { useState, useRef, useEffect } from 'react'
import { trimToContent } from './imgutil'

// Éditeur de zone : gomme pinceau (taille réglable), effacer/recolorer un rectangle.
// onClose({ src, ratio } | null) — le cadre est rogné au contenu. null = annulé.
const DISP = 520

export default function RegionEditor({ src, onClose }) {
  const cvRef = useRef(null)
  const scaleRef = useRef(1)
  const draw = useRef(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState('brush')      // 'brush' | 'erase' | 'recolor'
  const [color, setColor] = useState('#ff5aa0')
  const [brush, setBrush] = useState(30)         // taille gomme (px affichés)
  const [rect, setRect] = useState(null)
  const [cur, setCur] = useState(null)           // position curseur (pour le cercle de la gomme)
  const [dispH, setDispH] = useState(200)

  useEffect(() => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      const cap = 1600, sc = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight))
      const W = Math.max(1, Math.round(img.naturalWidth * sc)), H = Math.max(1, Math.round(img.naturalHeight * sc))
      const cv = cvRef.current; cv.width = W; cv.height = H
      cv.getContext('2d').drawImage(img, 0, 0, W, H)
      scaleRef.current = DISP / W
      setDispH(H * scaleRef.current); setReady(true)
    }
    img.onerror = () => { alert("Image protégée (externe) : la sélection ne marche pas dessus. Ça marche sur les photos importées/collées."); onClose(null) }
    img.src = src
  }, [src]) // eslint-disable-line

  const pos = e => { const r = cvRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const erodeAt = (a, b) => {                     // gomme : efface un trait du point a au point b
    const s = scaleRef.current, ctx = cvRef.current.getContext('2d'), r = (brush / 2) / s
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = 2 * r; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(a.x / s, a.y / s); ctx.lineTo(b.x / s, b.y / s); ctx.stroke()
    ctx.beginPath(); ctx.arc(b.x / s, b.y / s, r, 0, 7); ctx.fill()
    ctx.restore()
  }
  const onDown = e => {
    const p = pos(e); e.target.setPointerCapture(e.pointerId)
    if (mode === 'brush') { erodeAt(p, p); draw.current = { brush: true, last: p } }
    else { draw.current = p; setRect({ x: p.x, y: p.y, w: 0, h: 0 }) }
  }
  const onMove = e => {
    const p = pos(e); setCur(p)
    if (!draw.current) return
    if (draw.current.brush) { erodeAt(draw.current.last, p); draw.current.last = p }
    else { const d = draw.current; setRect({ x: Math.min(d.x, p.x), y: Math.min(d.y, p.y), w: Math.abs(p.x - d.x), h: Math.abs(p.y - d.y) }) }
  }
  const onUp = () => { draw.current = null }

  const applyRect = () => {
    if (!rect || rect.w < 3 || rect.h < 3) return
    const s = scaleRef.current
    const cx = Math.round(rect.x / s), cy = Math.round(rect.y / s), cw = Math.round(rect.w / s), ch = Math.round(rect.h / s)
    const ctx = cvRef.current.getContext('2d')
    if (mode === 'erase') ctx.clearRect(cx, cy, cw, ch)
    else {
      const im = ctx.getImageData(cx, cy, cw, ch), d = im.data
      const cr = parseInt(color.slice(1, 3), 16), cg = parseInt(color.slice(3, 5), 16), cb = parseInt(color.slice(5, 7), 16)
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] === 0) continue; d[i] = d[i] * cr / 255; d[i + 1] = d[i + 1] * cg / 255; d[i + 2] = d[i + 2] * cb / 255 }
      ctx.putImageData(im, cx, cy)
    }
    setRect(null)
  }
  const finish = () => { const r = trimToContent(cvRef.current); onClose({ src: r.dataURL, ratio: r.w / r.h }) }

  const tb = 'rounded-lg px-3 py-2 text-[13px] font-semibold'
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onPointerDown={e => { if (e.target === e.currentTarget) onClose(null) }}>
      <div className="bg-white rounded-xl p-4 max-w-[92vw] max-h-[92vh] overflow-auto">
        <div className="font-fraunces text-[15px] mb-1">🖌️ Modifier une zone de la photo</div>
        <div className="flex flex-wrap gap-2 items-center mb-2">
          <button onClick={() => setMode('brush')} className={tb + (mode === 'brush' ? ' bg-bordeaux text-white' : ' bg-white border border-line')}>🧽 Gomme</button>
          <button onClick={() => setMode('erase')} className={tb + (mode === 'erase' ? ' bg-bordeaux text-white' : ' bg-white border border-line')}>⬚ Effacer un rectangle</button>
          <button onClick={() => setMode('recolor')} className={tb + (mode === 'recolor' ? ' bg-bordeaux text-white' : ' bg-white border border-line')}>🎨 Recolorer un rectangle</button>
          {mode === 'recolor' && <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-11 h-9 border border-line rounded-md bg-white p-0.5" />}
          {mode !== 'brush' && <button onClick={applyRect} disabled={!rect || rect.w < 3} className={tb + ' text-white disabled:opacity-40'} style={{ background: '#1a0f0a' }}>✓ Appliquer</button>}
        </div>
        {mode === 'brush' && <div className="flex items-center gap-2 mb-2 text-[12px] text-ink-soft"><span>Taille gomme</span><input type="range" min="4" max="200" value={brush} onChange={e => setBrush(+e.target.value)} className="flex-1" /><span>{brush}px</span></div>}
        <p className="text-[12px] text-ink-soft mb-2">{mode === 'brush' ? "Passe la gomme sur les parties à enlever." : 'Dessine un rectangle puis « Appliquer ». Répétable.'}</p>

        <div className="relative inline-block border border-line rounded-lg overflow-hidden" style={{ width: DISP, height: dispH, backgroundImage: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%)', backgroundSize: '18px 18px' }} onPointerLeave={() => setCur(null)}>
          <canvas ref={cvRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ width: DISP, height: dispH, display: ready ? 'block' : 'none', cursor: mode === 'brush' ? 'none' : 'crosshair', touchAction: 'none' }} />
          {rect && mode !== 'brush' && <div className="absolute border-2 border-dashed border-bordeaux bg-bordeaux/10 pointer-events-none" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
          {mode === 'brush' && cur && <div className="absolute rounded-full border border-bordeaux bg-bordeaux/20 pointer-events-none" style={{ left: cur.x - brush / 2, top: cur.y - brush / 2, width: brush, height: brush }} />}
          {!ready && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-mute">Chargement…</div>}
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={finish} className={tb + ' bg-bordeaux text-white flex-1'}>✓ Terminer</button>
          <button onClick={() => onClose(null)} className={tb + ' bg-white border border-line'}>Annuler</button>
        </div>
      </div>
    </div>
  )
}
