import { useState, useEffect, useRef } from 'react'
import { loadImg } from './imgutil'
import { splitElements } from './splitElements'

// Aperçu réglable de la découpe d'une planche. Les cadres montrent ce qui sera
// détaché ; on valide seulement quand le découpage est bon.
// onClose(parts | null) — parts = découpe refaite en pleine résolution.
const DISP = 460

export default function SplitModal({ src, onClose }) {
  const [tol, setTol] = useState(38)
  const [gapPct, setGapPct] = useState(0)
  const [parts, setParts] = useState(null)
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
        if (req.current === n) { setParts(ps); setCalc(false) }
      } catch (e) { if (req.current === n) { setParts([]); setCalc(false) } }
    }, 200)
    return () => clearTimeout(t)
  }, [src, tol, gapPct])

  const finish = async () => {
    setGo(true)
    try { onClose(await splitElements(src, { tol, gapPct, cap: 1600 })) }
    catch (e) { alert('Découpe impossible : ' + (e?.message || e)); onClose(null) }
  }

  const n = parts ? parts.length : 0
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onPointerDown={e => { if (e.target === e.currentTarget) onClose(null) }}>
      <div className="bg-white rounded-xl p-4 max-w-[92vw] max-h-[92vh] overflow-auto">
        <div className="font-fraunces text-[15px] mb-1">✂️ Détacher les éléments</div>
        <div className="flex items-center gap-2 mb-1 text-[12px] text-ink-soft">
          <span className="w-[130px]">Prise du blanc</span>
          <input type="range" min="8" max="120" value={tol} onChange={e => setTol(+e.target.value)} className="flex-1" /><span className="w-7 text-right">{tol}</span>
        </div>
        <p className="text-[11.5px] text-ink-mute mb-2">Baisse si ça mange ou coupe une photo · monte s'il reste du fond entre les photos.</p>
        <div className="flex items-center gap-2 mb-1 text-[12px] text-ink-soft">
          <span className="w-[130px]">Recoller les morceaux</span>
          <input type="range" min="0" max="15" value={gapPct * 10} onChange={e => setGapPct(+e.target.value / 10)} className="flex-1" /><span className="w-7 text-right">{gapPct.toFixed(1)}</span>
        </div>
        <p className="text-[11.5px] text-ink-mute mb-2">Monte si une même photo ressort en plusieurs morceaux (ils se recollent s'ils sont proches).</p>

        <div className="relative border border-line rounded-lg overflow-hidden" style={{ width: DISP, height: dispH, backgroundImage: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%)', backgroundSize: '18px 18px' }}>
          <img src={src} alt="" style={{ width: DISP, height: dispH, opacity: 0.55 }} />
          {(parts || []).map((p, i) => (
            <div key={i} className="absolute border-2 border-bordeaux" style={{ left: p.rx * DISP, top: p.ry * dispH, width: p.rw * DISP, height: p.rh * dispH }}>
              <span className="absolute -top-0.5 -left-0.5 bg-bordeaux text-white text-[10px] font-bold px-1 rounded-br">{i + 1}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-2 text-[12.5px]">
          {calc ? <span className="text-ink-mute">Calcul…</span> : <b>{n} élément(s) détecté(s)</b>}
        </div>
        <div className="flex gap-2 mt-2">
          <button onClick={finish} disabled={calc || go || n < 2} className={'rounded-lg px-3 py-2 text-[13px] font-bold flex-1 ' + (calc || go || n < 2 ? 'bg-white border border-line text-ink-mute' : 'bg-bordeaux text-white')}>
            {go ? 'Découpe…' : n < 2 ? 'Rien à détacher' : `✂️ Détacher (${n})`}
          </button>
          <button onClick={() => onClose(null)} className="rounded-lg px-3 py-2 text-[13px] font-semibold bg-white border border-line">Annuler</button>
        </div>
      </div>
    </div>
  )
}
