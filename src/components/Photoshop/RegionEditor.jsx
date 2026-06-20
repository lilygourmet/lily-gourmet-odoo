import { useState, useRef, useEffect } from 'react'
import { trimToContent } from './imgutil'

// Éditeur « Modifier une zone » : gomme, + sélection (rectangle / rond / lasso / baguette couleur),
// puis action sur la sélection : effacer ou recolorer (= changer la couleur du dessin).
// onClose({ src, ratio } | null). Le cadre est rogné au contenu en sortie.
const DISP = 520

const rgbToHsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h, s, l = (mx + mn) / 2; if (mx === mn) { h = s = 0 } else { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6 } return [h, s, l] }
const hslToRgb = (h, s, l) => { let r, g, b; if (s === 0) { r = g = b = l } else { const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p }; r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3) } return [r * 255, g * 255, b * 255] }

export default function RegionEditor({ src, onClose }) {
  const cvRef = useRef(null)        // canvas de travail (pleine résolution, transparence gardée)
  const maskRef = useRef(null)      // canvas masque (blanc = sélectionné)
  const ovRef = useRef(null)        // canvas d'aperçu de la sélection (résolution affichage)
  const scaleRef = useRef(1)        // px canvas / px affichés
  const drag = useRef(null)
  const hasSelRef = useRef(false)
  const hist = useRef([])           // historique pour annuler (Ctrl+Z)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState('gomme')
  const [color, setColor] = useState('#ff5aa0')
  const [brush, setBrush] = useState(30)
  const [tol, setTol] = useState(30)
  const [hasSel, setHasSel] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cur, setCur] = useState(null)
  const [dispH, setDispH] = useState(200)

  useEffect(() => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => {
      const cap = 1600, sc = Math.min(1, cap / Math.max(img.naturalWidth, img.naturalHeight))
      const W = Math.max(1, Math.round(img.naturalWidth * sc)), H = Math.max(1, Math.round(img.naturalHeight * sc))
      const cv = cvRef.current; cv.width = W; cv.height = H; cv.getContext('2d').drawImage(img, 0, 0, W, H)
      const mk = maskRef.current || (maskRef.current = document.createElement('canvas')); mk.width = W; mk.height = H
      scaleRef.current = W / DISP
      const dh = H / scaleRef.current; setDispH(dh)
      const ov = ovRef.current; ov.width = DISP; ov.height = dh
      hist.current = [cv.getContext('2d').getImageData(0, 0, W, H)]   // état initial
      setReady(true)
    }
    img.onerror = () => { alert("Image protégée (externe) : ça marche sur les photos importées/collées."); onClose(null) }
    img.src = src
  }, [src]) // eslint-disable-line

  const pushState = () => { const cv = cvRef.current; if (!cv) return; hist.current.push(cv.getContext('2d').getImageData(0, 0, cv.width, cv.height)); if (hist.current.length > 40) hist.current.shift() }
  const undo = () => { if (hist.current.length < 2) return; hist.current.pop(); const prev = hist.current[hist.current.length - 1]; cvRef.current.getContext('2d').putImageData(prev, 0, 0); clearSel() }
  useEffect(() => {
    const k = e => {
      const t = document.activeElement, tg = t && t.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.stopPropagation(); undo(); return }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { if (hasSelRef.current) { e.preventDefault(); e.stopPropagation(); copySelection() } return }
      if (hasSelRef.current && e.key.indexOf('Arrow') === 0) { e.preventDefault(); const s = e.shiftKey ? 24 : 5; if (e.key === 'ArrowLeft') shiftMask(-s, 0); else if (e.key === 'ArrowRight') shiftMask(s, 0); else if (e.key === 'ArrowUp') shiftMask(0, -s); else if (e.key === 'ArrowDown') shiftMask(0, s) }
    }
    document.addEventListener('keydown', k, true)
    return () => document.removeEventListener('keydown', k, true)
  }, []) // eslint-disable-line

  const pos = e => { const r = cvRef.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const toCv = p => ({ x: p.x * scaleRef.current, y: p.y * scaleRef.current })

  const drawOverlay = prog => {
    const ov = ovRef.current; if (!ov) return; const ctx = ov.getContext('2d'); const W = ov.width, H = ov.height; ctx.clearRect(0, 0, W, H)
    if (hasSelRef.current) {
      ctx.save(); ctx.globalAlpha = .3; ctx.drawImage(maskRef.current, 0, 0, maskRef.current.width, maskRef.current.height, 0, 0, W, H); ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, W, H); ctx.restore()
      if (!prog) {   // contour rouge épais sur le bord de la sélection (toute forme), bien visible
        const a = ctx.getImageData(0, 0, W, H).data
        ctx.fillStyle = '#ff1744'
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (a[i + 3] < 8) continue
          if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || a[i - 1] < 8 || a[i + 7] < 8 || a[i - W * 4 + 3] < 8 || a[i + W * 4 + 3] < 8) ctx.fillRect(x - 1, y - 1, 3, 3) }
      }
    }
    if (prog) {
      ctx.strokeStyle = '#993556'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4])
      if (prog.shape === 'rect') ctx.strokeRect(Math.min(prog.s.x, prog.c.x), Math.min(prog.s.y, prog.c.y), Math.abs(prog.c.x - prog.s.x), Math.abs(prog.c.y - prog.s.y))
      else if (prog.shape === 'ellipse') { const cx = (prog.s.x + prog.c.x) / 2, cy = (prog.s.y + prog.c.y) / 2; ctx.beginPath(); ctx.ellipse(cx, cy, Math.abs(prog.c.x - prog.s.x) / 2, Math.abs(prog.c.y - prog.s.y) / 2, 0, 0, 7); ctx.stroke() }
      else if (prog.lasso) { ctx.beginPath(); prog.lasso.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke() }
      ctx.setLineDash([])
    }
  }
  const setSel = v => { hasSelRef.current = v; setHasSel(v); drawOverlay() }
  const clearSel = () => { maskRef.current.getContext('2d').clearRect(0, 0, maskRef.current.width, maskRef.current.height); setSel(false) }
  // déplacement de la sélection (souris ou flèches)
  const copyMask = () => { const mk = maskRef.current, t = document.createElement('canvas'); t.width = mk.width; t.height = mk.height; t.getContext('2d').drawImage(mk, 0, 0); return t }
  const shiftMask = (dx, dy) => { if (!hasSelRef.current) return; const t = copyMask(), m = mctx(); m.clearRect(0, 0, maskRef.current.width, maskRef.current.height); m.drawImage(t, dx, dy); drawOverlay() }
  const inMask = c => { try { return mctx().getImageData(c.x | 0, c.y | 0, 1, 1).data[3] > 0 } catch { return false } }

  // gomme directe
  const erodeAt = (a, b) => { const ctx = cvRef.current.getContext('2d'), r = (brush / 2) * scaleRef.current; ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 2 * r; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 7); ctx.fill(); ctx.restore() }

  // construction du masque (coords canvas)
  const mctx = () => maskRef.current.getContext('2d')
  const maskRect = (s, c) => { const m = mctx(); m.clearRect(0, 0, maskRef.current.width, maskRef.current.height); m.fillStyle = '#fff'; m.fillRect(Math.min(s.x, c.x), Math.min(s.y, c.y), Math.abs(c.x - s.x), Math.abs(c.y - s.y)); setSel(true) }
  const maskEllipse = (s, c) => { const m = mctx(); m.clearRect(0, 0, maskRef.current.width, maskRef.current.height); m.fillStyle = '#fff'; m.beginPath(); m.ellipse((s.x + c.x) / 2, (s.y + c.y) / 2, Math.abs(c.x - s.x) / 2, Math.abs(c.y - s.y) / 2, 0, 0, 7); m.fill(); setSel(true) }
  const maskLasso = pts => { if (pts.length < 3) return; const m = mctx(); m.clearRect(0, 0, maskRef.current.width, maskRef.current.height); m.fillStyle = '#fff'; m.beginPath(); pts.forEach((p, i) => { const q = toCv(p); i ? m.lineTo(q.x, q.y) : m.moveTo(q.x, q.y) }); m.closePath(); m.fill(); setSel(true) }
  const maskWand = (cx, cy) => {
    const W = cvRef.current.width, H = cvRef.current.height
    const d = cvRef.current.getContext('2d').getImageData(0, 0, W, H).data
    const sx = cx | 0, sy = cy | 0, si = (sy * W + sx) * 4
    const r0 = d[si], g0 = d[si + 1], b0 = d[si + 2], a0 = d[si + 3]
    const thr = tol * 4
    const seen = new Uint8Array(W * H), out = new Uint8ClampedArray(W * H * 4), st = [sy * W + sx]
    seen[sy * W + sx] = 1
    while (st.length) { const pX = st.pop(), i = pX * 4
      if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) + Math.abs(d[i + 3] - a0) > thr) continue
      out[i] = out[i + 1] = out[i + 2] = 255; out[i + 3] = 255
      const x = pX % W, y = (pX / W) | 0
      if (x > 0 && !seen[pX - 1]) { seen[pX - 1] = 1; st.push(pX - 1) }
      if (x < W - 1 && !seen[pX + 1]) { seen[pX + 1] = 1; st.push(pX + 1) }
      if (y > 0 && !seen[pX - W]) { seen[pX - W] = 1; st.push(pX - W) }
      if (y < H - 1 && !seen[pX + W]) { seen[pX + W] = 1; st.push(pX + W) }
    }
    mctx().putImageData(new ImageData(out, W, H), 0, 0); setSel(true)
  }

  const onDown = e => {
    const p = pos(e); try { e.target.setPointerCapture(e.pointerId) } catch { /* */ }
    const cc = toCv(p)
    if (hasSelRef.current && mode !== 'gomme' && inMask(cc)) { drag.current = { move: true, temp: copyMask(), sx: cc.x, sy: cc.y }; return }   // déplacer la sélection
    if (mode === 'gomme') { const c = toCv(p); erodeAt(c, c); drag.current = { gomme: true, last: c } }
    else if (mode === 'rect' || mode === 'ellipse') drag.current = { shape: mode, s: p, c: p }
    else if (mode === 'lasso') drag.current = { lasso: true, pts: [p] }
    else if (mode === 'wand') { const c = toCv(p); maskWand(c.x, c.y) }
  }
  const onMove = e => {
    const p = pos(e); setCur(p); const dr = drag.current; if (!dr) return
    if (dr.move) { const c = toCv(p), m = mctx(); m.clearRect(0, 0, maskRef.current.width, maskRef.current.height); m.drawImage(dr.temp, c.x - dr.sx, c.y - dr.sy); drawOverlay() }
    else if (dr.gomme) { const c = toCv(p); erodeAt(dr.last, c); dr.last = c }
    else if (dr.shape) { dr.c = p; drawOverlay({ shape: dr.shape, s: dr.s, c: p }) }
    else if (dr.lasso) { dr.pts.push(p); drawOverlay({ lasso: dr.pts }) }
  }
  const onUp = () => {
    const dr = drag.current; drag.current = null; if (!dr) return
    if (dr.gomme) { pushState(); return }
    if (dr.shape === 'rect') maskRect(toCv(dr.s), toCv(dr.c))
    else if (dr.shape === 'ellipse') maskEllipse(toCv(dr.s), toCv(dr.c))
    else if (dr.lasso) maskLasso(dr.pts)
  }

  const eraseSel = () => { const ctx = cvRef.current.getContext('2d'); ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(maskRef.current, 0, 0); ctx.restore(); pushState(); clearSel() }
  const recolorSel = () => {
    const W = cvRef.current.width, H = cvRef.current.height, ctx = cvRef.current.getContext('2d')
    const im = ctx.getImageData(0, 0, W, H), d = im.data
    const m = maskRef.current.getContext('2d').getImageData(0, 0, W, H).data
    const th = rgbToHsl(parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16))
    for (let i = 0; i < d.length; i += 4) { if (m[i + 3] < 10 || d[i + 3] < 10) continue; const l = rgbToHsl(d[i], d[i + 1], d[i + 2])[2]; const [r, g, b] = hslToRgb(th[0], th[1], l); d[i] = r; d[i + 1] = g; d[i + 2] = b }
    ctx.putImageData(im, 0, 0); pushState(); clearSel()
  }
  // copier la zone sélectionnée (Ctrl/Cmd+C) → presse-papiers (recollable avec Ctrl+V)
  const copySelection = async () => {
    if (!hasSelRef.current) return
    const cv = cvRef.current, t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height
    const tx = t.getContext('2d'); tx.drawImage(cv, 0, 0); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(maskRef.current, 0, 0)
    try {
      const r = trimToContent(t); const blob = await (await fetch(r.dataURL)).blob()
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
      setCopied(true); setTimeout(() => setCopied(false), 1600)
    } catch (e) { alert("Copie impossible sur ce navigateur. Astuce : utilise plutôt « Terminer » puis ré-ajoute l'image.") }
  }
  const finish = () => { const r = trimToContent(cvRef.current); onClose({ src: r.dataURL, ratio: r.w / r.h }) }

  const TB = 'rounded-lg px-2.5 py-2 text-[12px] font-semibold'
  const sel = (m) => mode === m ? ' bg-bordeaux text-white' : ' bg-white border border-line'
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onPointerDown={e => { if (e.target === e.currentTarget) onClose(null) }}>
      <div className="bg-white rounded-xl p-4 max-w-[92vw] max-h-[92vh] overflow-auto">
        <div className="font-fraunces text-[15px] mb-2">🖌️ Modifier une zone</div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          <button onClick={() => { setMode('gomme'); clearSel() }} className={TB + sel('gomme')}>🧽 Gomme</button>
          <button onClick={() => setMode('rect')} className={TB + sel('rect')}>▭ Rectangle</button>
          <button onClick={() => setMode('ellipse')} className={TB + sel('ellipse')}>⬭ Rond</button>
          <button onClick={() => setMode('lasso')} className={TB + sel('lasso')}>✎ Lasso</button>
          <button onClick={() => setMode('wand')} className={TB + sel('wand')}>🪄 Baguette (couleur)</button>
        </div>
        {mode === 'gomme' && <div className="flex items-center gap-2 mb-2 text-[12px] text-ink-soft"><span>Taille gomme</span><input type="range" min="4" max="200" value={brush} onChange={e => setBrush(+e.target.value)} className="flex-1" /><span>{brush}px</span></div>}
        {mode === 'wand' && <div className="flex items-center gap-2 mb-2 text-[12px] text-ink-soft"><span>Tolérance</span><input type="range" min="5" max="120" value={tol} onChange={e => setTol(+e.target.value)} className="flex-1" /><span>{tol}</span></div>}
        <p className="text-[12px] text-ink-soft mb-2">{mode === 'gomme' ? 'Passe la gomme sur les zones à effacer.' : mode === 'wand' ? 'Clique une couleur à sélectionner (ajuste la tolérance), puis choisis Effacer ou Recolorer.' : 'Dessine une sélection, puis choisis Effacer ou Recolorer.'}</p>

        <div className="relative inline-block border border-line rounded-lg overflow-hidden" style={{ width: DISP, height: dispH, backgroundImage: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%)', backgroundSize: '18px 18px' }} onPointerLeave={() => setCur(null)}>
          <canvas ref={cvRef} style={{ width: DISP, height: dispH, display: ready ? 'block' : 'none', position: 'absolute', inset: 0 }} />
          <canvas ref={ovRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ width: DISP, height: dispH, position: 'absolute', inset: 0, cursor: mode === 'gomme' ? 'none' : 'crosshair', touchAction: 'none' }} />
          {mode === 'gomme' && cur && <div className="absolute rounded-full border border-bordeaux bg-bordeaux/20 pointer-events-none" style={{ left: cur.x - brush / 2, top: cur.y - brush / 2, width: brush, height: brush }} />}
          {!ready && <div className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-mute">Chargement…</div>}
        </div>

        {hasSel && mode !== 'gomme' && (
          <div className="mt-2 p-2 bg-cream rounded-lg">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[12px] font-semibold text-ink-soft">Sélection :</span>
              <button onClick={eraseSel} className={TB + ' bg-white border border-line'}>🧽 Effacer</button>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-9 h-8 border border-line rounded-md bg-white p-0.5" />
              <button onClick={recolorSel} className={TB + ' bg-white border border-line'}>🎨 Recolorer le dessin</button>
              <button onClick={copySelection} className={TB + ' bg-white border border-line'}>{copied ? '✓ Copié' : '📋 Copier'}</button>
              <button onClick={clearSel} className={TB + ' bg-white border border-line'}>✖ Désélectionner</button>
            </div>
            <p className="text-[11px] text-ink-mute mt-1">Glisse la sélection (ou flèches) pour la déplacer · Ctrl/Cmd+C pour copier · Ctrl/Cmd+Z pour annuler</p>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <button onClick={undo} title="Ctrl/Cmd + Z" className="rounded-lg px-3 py-2 text-[13px] font-semibold bg-white border border-line">↩️ Annuler</button>
          <button onClick={finish} className="rounded-lg px-3 py-2 text-[13px] font-bold bg-bordeaux text-white flex-1">✓ Terminer</button>
          <button onClick={() => onClose(null)} className="rounded-lg px-3 py-2 text-[13px] font-semibold bg-white border border-line">Fermer</button>
        </div>
      </div>
    </div>
  )
}
