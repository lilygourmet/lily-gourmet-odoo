import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from '../../lib/toast'
import AppHeader from '../AppHeader'
import { loadConversations, uploadConversationMedia, sendMessage } from '../../lib/conversations'

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
// Transforme un dataURL (résultat IA) en File pour l'upload média.
function dataUrlToFile(dataUrl, name) {
  const [head, b64] = dataUrl.split(',')
  const mime = head.match(/:(.*?);/)?.[1] || 'image/png'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new File([arr], name, { type: mime })
}

const CHIPS = [
  'ajoute le prénom', 'ajoute l\'âge / un chiffre', 'ajoute des bougies',
  'change la couleur', 'ajoute des fleurs', 'sur 2 étages', 'ajoute des fruits frais',
]

export default function CakeVisionView({ user, activeView, onNavigate, onLogout }) {
  const [baseImg, setBaseImg] = useState('')   // image de travail (photo ou dernier rendu)
  const [origImg, setOrigImg] = useState('')   // photo d'origine (référence pour garder les détails)
  const [refs, setRefs] = useState([])         // photos d'inspiration (détails à intégrer)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef(null)
  const refFileRef = useRef(null)

  // Envoi au client : liste des conversations récentes
  const [showSend, setShowSend] = useState(false)
  const [convs, setConvs] = useState([])
  const [convSearch, setConvSearch] = useState('')
  const [sending, setSending] = useState(false)

  const loadBase = useCallback(async (file) => {
    try {
      const d = await fileToResizedDataUrl(file)
      setBaseImg(d); setOrigImg(d); setResult(''); setErr('')
      toast.success('Photo chargée ✓')
    } catch { toast.error('Image illisible, réessaie.') }
  }, [])

  const addRef = useCallback(async (file) => {
    try { const d = await fileToResizedDataUrl(file); setRefs(r => [...r, { url: d, take: '' }]) } catch { /* ignore */ }
  }, [])

  // Coller une image (Ctrl/Cmd + V) : 1ère = photo de base, suivantes = inspiration.
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
    if (refs.length) {
      const takes = refs.map((r, i) => (r.take || '').trim() ? `de la photo d'inspiration ${i + 1}, prends : ${r.take.trim()}` : null).filter(Boolean)
      refNote += takes.length
        ? "Photos d'inspiration — " + takes.join(' ; ') + '. '
        : "Les images suivantes sont des photos d'inspiration : reprends-en les détails (décor, couleurs, éléments) selon la demande. "
    }
    const fullPrompt =
      "Édite cette photo de gâteau de pâtisserie de façon photoréaliste et professionnelle, comme une vraie photo de présentation. "
      + "Garde l'aspect appétissant et soigné, éclairage studio, fond neutre. "
      + refNote + 'Demande du client : ' + prompt.trim()
    const images = [baseImg]
    if (iterating) images.push(origImg)
    images.push(...refs.map(r => r.url))
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

  // Ouvre le sélecteur de conversation (charge la liste au 1er appel).
  async function openSend() {
    setShowSend(true); setConvSearch('')
    if (!convs.length) {
      try { setConvs(await loadConversations('all', user.id)) }
      catch { toast.error('Impossible de charger les conversations.') }
    }
  }
  // Envoie le rendu dans la conversation choisie.
  async function sendToConversation(conv) {
    if (!result || sending) return
    setSending(true)
    try {
      const file = dataUrlToFile(result, `cake-vision-${Date.now()}.png`)
      const path = await uploadConversationMedia(file, user.id)
      await sendMessage({ conversationId: conv.id, clientPhone: conv.client_phone, userId: user.id, mediaPath: path, mediaType: 'image' })
      toast.success(`Photo envoyée à ${conv.client_name || conv.client_phone} ✓`)
      setShowSend(false)
    } catch (e) { toast.error('Échec envoi : ' + (e.message || '')) }
    finally { setSending(false) }
  }

  const canGenerate = !loading && baseImg && prompt.trim()
  const filteredConvs = convs.filter(c => {
    const q = convSearch.trim().toLowerCase()
    if (!q) return true
    return (c.client_name || '').toLowerCase().includes(q) || (c.client_phone || '').includes(q)
  })

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none mb-1">Cake Vision</h1>
        <p className="text-[13px] text-ink-mute mb-5">Photo du gâteau + ce que le client veut → l'IA génère le rendu. Tu peux <b>coller</b> une image (Ctrl/Cmd + V).</p>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 items-start">
          {/* ───────── GAUCHE : réglages / chargement ───────── */}
          <div className="space-y-4">
            {/* 1 · Photo du gâteau (base) */}
            <div className="bg-white border border-line rounded-xl p-4">
              <div className="text-[12px] font-bold text-bordeaux mb-2">1 · Photo de base (le gâteau)</div>
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

            {/* Photos d'inspiration (optionnel) */}
            {baseImg && (
              <div className="bg-white border border-line rounded-xl p-4">
                <div className="text-[12px] font-bold text-bordeaux mb-2">Photos d'inspiration <span className="font-normal text-ink-mute">(précise sous chaque photo CE QU'IL FAUT en prendre)</span></div>
                <div className="flex flex-wrap gap-3 items-start">
                  {refs.map((r, i) => (
                    <div key={i} className="w-24">
                      <div className="relative">
                        <img src={r.url} alt="" className="w-24 h-20 object-cover rounded-lg border border-line" />
                        <button onClick={() => setRefs(rr => rr.filter((_, j) => j !== i))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-bordeaux text-cream text-[11px] leading-none">×</button>
                      </div>
                      <input
                        value={r.take}
                        onChange={e => setRefs(rr => rr.map((x, j) => j === i ? { ...x, take: e.target.value } : x))}
                        placeholder="quoi prendre ?"
                        className="w-24 mt-1 px-1.5 py-1 text-[11px] border border-line rounded bg-white"
                      />
                    </div>
                  ))}
                  <button onClick={() => refFileRef.current?.click()} className="w-24 h-20 rounded-lg border-2 border-dashed border-line text-ink-mute text-[22px] hover:bg-cream-warm">+</button>
                </div>
                <input ref={refFileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { [...e.target.files].forEach(addRef); e.target.value = '' }} />
              </div>
            )}

            {/* 2 · Demande */}
            <div className="bg-white border border-line rounded-xl p-4">
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

            {err && <div className="text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ {err}</div>}
          </div>

          {/* ───────── DROITE : visuel ───────── */}
          <div className="bg-white border border-line rounded-xl p-4 min-h-[420px] flex flex-col">
            <div className="text-[12px] font-bold text-bordeaux mb-2">{result ? '✅ Rendu' : 'Visuel'}</div>
            <div className="flex-1 flex items-center justify-center">
              {loading ? (
                <div className="text-center text-ink-mute text-[13px]">✨ Génération en cours…<div className="text-[11px] mt-1">10 à 30 secondes</div></div>
              ) : result ? (
                <img src={result} alt="rendu" className="w-full rounded-lg border border-line" />
              ) : (
                <div className="text-center text-ink-mute text-[14px] px-6">Le rendu de l'IA<br />apparaîtra ici 👈</div>
              )}
            </div>
            {result && !loading && (
              <div className="flex flex-wrap gap-2 mt-3">
                <a href={result} download="cake-vision.png" className="px-3 py-2 text-[12px] font-medium border border-line rounded-lg hover:bg-cream-warm">⬇️ Télécharger</a>
                <button onClick={openSend} className="px-3 py-2 text-[12px] font-bold bg-ok text-cream rounded-lg hover:opacity-90">📲 Envoyer au client</button>
                <button onClick={useResultAsBase} className="px-3 py-2 text-[12px] font-medium border border-line rounded-lg hover:bg-cream-warm">🔁 Continuer sur ce rendu</button>
                {origImg && baseImg !== origImg && (
                  <button onClick={() => { setBaseImg(origImg); setResult(''); setPrompt(''); toast.success('On repart de la photo de base ✓') }}
                    className="px-3 py-2 text-[12px] font-medium border border-line rounded-lg hover:bg-cream-warm">↩️ Repartir de la photo de base</button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sélecteur de conversation pour l'envoi */}
      {showSend && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !sending && setShowSend(false)}>
          <div className="bg-cream rounded-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <div className="font-fraunces italic text-[18px] text-ink">Envoyer à…</div>
              <button onClick={() => !sending && setShowSend(false)} className="text-ink-mute text-[20px] leading-none">×</button>
            </div>
            <div className="p-3 border-b border-line">
              <input autoFocus value={convSearch} onChange={e => setConvSearch(e.target.value)}
                placeholder="Chercher un client (nom ou téléphone)…"
                className="w-full px-3 py-2 text-[13px] border border-line rounded-lg bg-white" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredConvs.length === 0 ? (
                <div className="text-center text-ink-mute text-[13px] py-8">Aucune conversation.</div>
              ) : filteredConvs.slice(0, 100).map(c => (
                <button key={c.id} disabled={sending} onClick={() => sendToConversation(c)}
                  className="w-full text-left px-4 py-3 border-b border-line/60 hover:bg-cream-warm disabled:opacity-50 flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="text-[14px] text-ink font-medium block truncate">{c.client_name || 'Sans nom'}</span>
                    <span className="text-[11px] text-ink-mute font-mono">{c.client_phone}</span>
                  </span>
                  <span className="text-[16px] flex-shrink-0">{sending ? '⏳' : '📲'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
