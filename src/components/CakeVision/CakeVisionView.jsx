import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from '../../lib/toast'
import AppHeader from '../AppHeader'

// Redimensionne une image (max 1024px) en JPEG léger pour rester rapide.
function resizeDataUrl(dataUrl, max = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width: w, height: h } = img
      if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r) }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(cv.toDataURL('image/jpeg', 0.9))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}
function fileToResizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resizeDataUrl(reader.result).then(resolve, reject)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const CHIPS = [
  'sur 2 étages', 'couleur rose poudré', 'fleurs fraîches sur le dessus',
  'écris « Joyeux anniversaire »', 'style plus épuré', 'doré / chic', 'thème licorne',
]

export default function CakeVisionView({ user, activeView, onNavigate, onLogout }) {
  const [baseImg, setBaseImg] = useState('')   // image de travail (photo ou dernier rendu)
  const [origImg, setOrigImg] = useState('')   // photo d'origine (référence pour garder les détails)
  const [refs, setRefs] = useState([])         // photos de référence à intégrer
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const refFileRef = useRef(null)

  const loadBase = useCallback(async (file) => {
    try {
      const d = await fileToResizedDataUrl(file)
      setBaseImg(d); setOrigImg(d); setResult(''); setErr('')
      toast.success('Photo chargée ✓')
    } catch { toast.error('Image illisible, réessaie.') }
  }, [])

  const addRef = useCallback(async (file) => {
    try { const d = await fileToResizedDataUrl(file); setRefs(r => [...r, d]) } catch { /* ignore */ }
  }, [])

  // Coller une image (Ctrl/Cmd + V) : 1ère = photo de base, suivantes = références.
  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))
      if (!item) return
      const file = item.getAsFile()
      if (!file) return
      e.preventDefault()
      if (!baseImg) loadBase(file); else addRef(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [baseImg, loadBase, addRef])

  async function generate() {
    if (!baseImg) { toast.error("Charge d'abord une photo."); return }
    if (!prompt.trim()) { toast.error('Écris ce que le client veut.'); return }
    setLoading(true); setErr(''); setResult('')
    const iterating = !!origImg && baseImg !== origImg
    let refNote = ''
    if (iterating) refNote += "La 1ère image est la version EN COURS (à modifier). La 2e est la PHOTO D'ORIGINE : garde/restaure ses détails si besoin. "
    if (refs.length) refNote += 'Les images suivantes sont des références : intègre leurs éléments selon la demande. '
    const fullPrompt =
      "Édite cette photo de gâteau de pâtisserie de façon photoréaliste et professionnelle, comme une vraie photo de présentation. "
      + "Garde l'aspect appétissant et soigné, éclairage studio, fond neutre. "
      + refNote + 'Demande du client : ' + prompt.trim()
    const images = [baseImg]
    if (iterating) images.push(origImg)
    images.push(...refs)
    try {
      const r = await fetch('/api/wati-webhook?action=cake-vision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fullPrompt, images }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || ('Erreur ' + r.status))
      setResult(data.image)
    } catch (e) { setErr(e.message || 'Erreur') } finally { setLoading(false) }
  }

  function useResultAsBase() {
    if (!result) return
    setBaseImg(result); setResult(''); setPrompt('')
    toast.success('On repart de ce rendu ✓')
  }
  function reset() {
    setBaseImg(''); setOrigImg(''); setRefs([]); setResult(''); setPrompt(''); setErr('')
  }

  const canGenerate = !loading && baseImg && prompt.trim()

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none mb-1">Cake Vision</h1>
        <p className="text-[13px] text-ink-mute mb-5">Mets une photo de gâteau + ce que le client veut → l'IA génère le rendu. Tu peux <b>coller</b> une image (Ctrl/Cmd + V).</p>

        {/* 1 · Photo du gâteau */}
        <div className="bg-white border border-line rounded-xl p-4 mb-4">
          <div className="text-[12px] font-bold text-bordeaux mb-2">1 · Photo du gâteau</div>
          {!baseImg ? (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) loadBase(f) }}
              className="border-2 border-dashed border-bordeaux/40 rounded-xl p-8 text-center cursor-pointer hover:bg-bordeaux/5 transition-colors"
            >
              <div className="text-[34px] mb-1">🎂</div>
              <div className="text-[13px] text-ink-soft font-medium">Clique pour choisir une photo</div>
              <div className="text-[11px] text-ink-mute mt-1">ou glisse-la ici, ou <b>colle</b> avec Ctrl/Cmd + V</div>
            </div>
          ) : (
            <div>
              {/* Aperçu BIEN visible : on voit que la photo est chargée */}
              <div className="relative inline-block w-full">
                <img src={baseImg} alt="gâteau" className="w-full max-h-72 object-contain rounded-lg border border-line bg-cream-warm" />
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-ok text-cream text-[11px] font-bold px-2 py-1 rounded-full shadow">
                  ✓ Photo chargée
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-[12px] border border-line rounded-lg hover:bg-cream-warm">Changer la photo</button>
                <button onClick={reset} className="px-3 py-1.5 text-[12px] text-red-600 border border-line rounded-lg hover:bg-red-50">Recommencer</button>
              </div>
            </div>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) loadBase(f); e.target.value = '' }} />
        </div>

        {/* Références (optionnel) */}
        {baseImg && (
          <div className="bg-white border border-line rounded-xl p-4 mb-4">
            <div className="text-[12px] font-bold text-bordeaux mb-2">Autres photos à intégrer / combiner <span className="font-normal text-ink-mute">(plusieurs possibles — ex. un modèle, un topper, un logo)</span></div>
            <div className="flex flex-wrap gap-2 items-center">
              {refs.map((u, i) => (
                <div key={i} className="relative">
                  <img src={u} alt="" className="w-16 h-16 object-cover rounded-lg border border-line" />
                  <button onClick={() => setRefs(r => r.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-bordeaux text-cream text-[11px] leading-none">×</button>
                </div>
              ))}
              <button onClick={() => refFileRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-line text-ink-mute text-[22px] hover:bg-cream-warm">+</button>
            </div>
            <input ref={refFileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => { [...e.target.files].forEach(addRef); e.target.value = '' }} />
          </div>
        )}

        {/* 2 · Demande */}
        <div className="bg-white border border-line rounded-xl p-4 mb-4">
          <div className="text-[12px] font-bold text-bordeaux mb-2">2 · Ce que le client veut</div>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
            placeholder="Ex : mets-le sur 2 étages, couleur rose poudré, et écris « Joyeux anniversaire Sara » sur la façade"
            className="w-full px-3 py-2 border border-line rounded-lg text-[13px]" />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CHIPS.map(c => (
              <button key={c} onClick={() => setPrompt(p => (p.trim() ? p.replace(/\s*$/, '') + ', ' : '') + c)}
                className="px-2.5 py-1 text-[11px] rounded-full border border-line text-ink-soft hover:bg-bordeaux hover:text-cream hover:border-bordeaux transition-colors">
                + {c}
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={!canGenerate}
          className="w-full py-3 rounded-xl bg-bordeaux text-cream font-bold text-[14px] disabled:opacity-40 hover:bg-bordeaux-deep transition-colors">
          {loading ? '✨ Génération… (10-30 s)' : '✨ Générer le rendu'}
        </button>

        {err && <div className="mt-3 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {err}</div>}

        {/* Résultat */}
        {result && (
          <div className="bg-white border border-line rounded-xl p-4 mt-4">
            <div className="text-[12px] font-bold text-bordeaux mb-2">✅ Rendu</div>
            <img src={result} alt="rendu" className="w-full rounded-lg border border-line" />
            <div className="flex gap-2 mt-3">
              <a href={result} download="cake-vision.png" className="px-3 py-2 text-[12px] font-medium bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep">⬇️ Télécharger</a>
              <button onClick={useResultAsBase} className="px-3 py-2 text-[12px] font-medium border border-line rounded-lg hover:bg-cream-warm">🔁 Repartir de ce rendu</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
