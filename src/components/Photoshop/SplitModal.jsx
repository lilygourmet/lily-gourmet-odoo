import { useState, useEffect, useRef } from 'react'
import { loadImg } from './imgutil'
import { splitElements } from './splitElements'

// Aperçu réglable de la découpe d'une planche : on voit les morceaux DÉCOUPÉS
// (fond enlevé) sur un damier, donc l'effet des curseurs se voit tout de suite.
// Clic sur un morceau = le garder ou l'écarter.
// onClose(parts | null) — parts = les morceaux gardés, refaits en pleine résolution.
const DISP = 460

export default function SplitModal({ src, onClose }) {
  const [tol, setTol] = useState(38)
  const [gapPct, setGapPct] = useState(0)
  const [parts, setParts] = useState(null)
  const [off, setOff] = useState(new Set())   // morceaux écartés (index)
  const [dispH, setDispH] = useState(240)
  const [calc, setCalc] = useState(true)
  const [go, setGo] = useState(false)
  const req = useRef(0)

  useEffect(() => { loadImg(src).then(im => setDispH(DISP * im.naturalHeight / im.naturalWidth)).catch(() => { }) }, [src])

  // aperçu recalculé à chaque réglage (petite taille = rapide)
  useEffect(() => {
    const n = ++req.current
    setCalc(true)
    const t = setTimeout(async () => {
      try {
        const ps = await splitElements(src, { tol, gapPct, cap: 700 })
        if (req.current === n) { setParts(ps); setOff(new Set()); setCalc(false) }
      } catch (e) { if (req.current === n) { setParts([]); setOff(new Set()); setCalc(false) } }
    }, 200)
    return () => clearTimeout(t)
  }, [src, tol, gapPct])

  const toggle = i => setOff(s => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const nb = (parts || []).length - off.size

  const finish = async () => {
    setGo(true)
    try {
      // découpe définitive en pleine résolution ; on retire ce qui a été décoché
      // (appariement par position, l'aperçu étant calculé plus petit)
      const full = await splitElements(src, { tol, gapPct, cap: 2400 })
      const jetes = (parts || []).filter((_, i) => off.has(i))
      const garde = f => !jetes.some(j =>
        Math.abs((j.rx + j.rw / 2) - (f.rx + f.rw / 2)) < 0.03 && Math.abs((j.ry + j.rh / 2) - (f.ry + f.rh / 2)) < 0.03)
      onClose(full.filter(garde))
    } catch (e) { alert('Découpe impossible : ' + (e?.message || e)); onClose(null) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onPointerDown={e => { if (e.target === e.currentTarget) onClose(null) }}>
      <div className="bg-white rounded-xl p-4 max-w-[92vw] max-h-[92dvh] overflow-auto">
        <div className="font-fraunces text-[15px] mb-1">✂️ Détacher les éléments</div>
        <div className="flex items-center gap-2 mb-1 text-[12px] text-ink-soft">
          <span className="w-[130px]">Prise du blanc</span>
          <input type="range" min="8" max="120" value={tol} onChange={e => setTol(+e.target.value)} className="flex-1" /><span className="w-7 text-right">{tol}</span>
        </div>
        <p className="text-[11.5px] text-ink-mute mb-2">Baisse si ça mange ou coupe une photo · monte s'il reste du fond autour.</p>
        <div className="flex items-center gap-2 mb-1 text-[12px] text-ink-soft">
          <span className="w-[130px]">Recoller les morceaux</span>
          <input type="range" min="0" max="15" value={gapPct * 10} onChange={e => setGapPct(+e.target.value / 10)} className="flex-1" /><span className="w-7 text-right">{gapPct.toFixed(1)}</span>
        </div>
        <p className="text-[11.5px] text-ink-mute mb-2">Monte si une même photo ressort en plusieurs morceaux (ils se recollent s'ils sont proches).</p>

        {/* aperçu : les morceaux découpés, sur damier. Clic = garder / écarter. */}
        <div className="relative border border-line rounded-lg overflow-hidden" style={{ width: DISP, height: dispH, backgroundImage: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%)', backgroundSize: '18px 18px' }}>
          {(parts || []).map((p, i) => {
            const jete = off.has(i)
            return (
              <button key={i} onClick={() => toggle(i)} title={jete ? 'Cliquer pour garder' : 'Cliquer pour écarter'}
                className={'absolute ' + (jete ? 'border border-dashed border-ink-mute' : 'border-2 border-bordeaux')}
                style={{ left: p.rx * DISP, top: p.ry * dispH, width: p.rw * DISP, height: p.rh * dispH, opacity: jete ? 0.25 : 1 }}>
                <img src={p.dataURL} alt="" className="w-full h-full" />
                <span className={'absolute -top-0.5 -left-0.5 text-white text-[10px] font-bold px-1 rounded-br ' + (jete ? 'bg-ink-mute' : 'bg-bordeaux')}>{jete ? '✕' : i + 1}</span>
              </button>
            )
          })}
          {calc && <div className="absolute inset-0 bg-white/60 flex items-center justify-center text-[13px] text-ink-mute">Calcul…</div>}
        </div>

        <div className="flex items-center gap-2 mt-2 text-[12.5px]">
          <b>{nb} gardé(s)</b>
          {off.size > 0 && <span className="text-ink-mute">· {off.size} écarté(s)</span>}
          <button onClick={() => setOff(new Set())} className="ml-auto text-[12px] text-bordeaux underline">Tout garder</button>
          <button onClick={() => setOff(new Set((parts || []).map((_, i) => i)))} className="text-[12px] text-bordeaux underline">Tout écarter</button>
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={finish} disabled={calc || go || nb < 1} className={'rounded-lg px-3 py-2 text-[13px] font-bold flex-1 ' + (calc || go || nb < 1 ? 'bg-white border border-line text-ink-mute' : 'bg-bordeaux text-white')}>
            {go ? 'Découpe…' : nb < 1 ? 'Rien à détacher' : `✂️ Détacher (${nb})`}
          </button>
          <button onClick={() => onClose(null)} className="rounded-lg px-3 py-2 text-[13px] font-semibold bg-white border border-line">Annuler</button>
        </div>
      </div>
    </div>
  )
}
