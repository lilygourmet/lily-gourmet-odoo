import { useState, useRef, useEffect } from 'react'
import { todayISO } from '../lib/dates'
import { toast } from '../lib/toast'
import AppHeader from './AppHeader'
import { drawLabel, buildZplBoites, printLabels, translateToArabic } from '../lib/labelsBoites.js'

export default function EtiquettesBoitesView({ user, activeView, onNavigate, onLogout }) {
  const [fr, setFr] = useState('')
  const [ar, setAr] = useState('')
  const [qty, setQty] = useState(1)
  const [translating, setTranslating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const canvasRef = useRef(null)

  // Aperçu : redessine l'étiquette à chaque changement de texte.
  useEffect(() => {
    if (canvasRef.current) drawLabel(canvasRef.current, fr, ar)
  }, [fr, ar])

  async function handleTranslate() {
    if (!fr.trim()) { toast.error('Écris d\'abord le texte en français.'); return }
    setTranslating(true)
    try {
      const arabic = await translateToArabic(fr)
      setAr(arabic)
    } catch (e) {
      toast.error('Erreur traduction : ' + e.message)
    } finally {
      setTranslating(false)
    }
  }

  function handlePrint() {
    if (!fr.trim() && !ar.trim()) { toast.error('Écris au moins un texte.'); return }
    try {
      printLabels(fr, ar, qty)
    } catch (e) {
      toast.error(e.message)
    }
  }

  function handleDownload() {
    if (!fr.trim() && !ar.trim()) { toast.error('Écris au moins un texte.'); return }
    setDownloading(true)
    try {
      const zpl = buildZplBoites(fr, ar, qty)
      const blob = new Blob([zpl], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `etiquettes-boites-${todayISO()}.zpl`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error('Erreur génération ZPL : ' + e.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div className="max-w-2xl mx-auto px-4 pb-8 pt-4">
        <div className="flex items-baseline gap-3 mb-1">
          <h1 className="font-fraunces italic text-[26px] font-normal text-ink leading-none">Étiquettes boîtes</h1>
          <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute">FR + Arabe · 5 × 2,5 cm</span>
        </div>
        <p className="text-[12px] text-ink-soft mb-5">
          Écris le texte en français, traduis en arabe (corrige si besoin), puis télécharge le ZPL à imprimer.
        </p>

        {/* Texte français */}
        <label className="block text-[12px] font-medium text-ink mb-1">Texte français</label>
        <textarea
          value={fr}
          onChange={e => setFr(e.target.value)}
          rows={2}
          placeholder="ex : Gâteau au chocolat"
          className="w-full text-[15px] px-3 py-2 border border-line rounded-xl bg-white mb-2"
        />
        <button
          onClick={handleTranslate}
          disabled={translating}
          className="text-[12px] px-4 py-1.5 border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream rounded-full font-medium transition-colors disabled:opacity-60 mb-4"
        >
          {translating ? 'Traduction…' : 'Traduire en arabe →'}
        </button>

        {/* Texte arabe (modifiable) */}
        <label className="block text-[12px] font-medium text-ink mb-1">Texte arabe (modifiable)</label>
        <textarea
          value={ar}
          onChange={e => setAr(e.target.value)}
          rows={2}
          dir="rtl"
          placeholder="النص بالعربية"
          className="w-full text-[17px] px-3 py-2 border border-line rounded-xl bg-white mb-5"
          style={{ fontFamily: '"Geeza Pro", "Tahoma", Arial, sans-serif' }}
        />

        {/* Aperçu */}
        <label className="block text-[12px] font-medium text-ink mb-1">Aperçu de l'étiquette</label>
        <div className="flex justify-center mb-5">
          <canvas
            ref={canvasRef}
            className="border border-line rounded-md shadow-sm"
            style={{ width: 320, height: 160, background: '#fff' }}
          />
        </div>

        {/* Quantité + télécharger */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-soft">Quantité</span>
            <div className="flex items-center border border-bordeaux/40 rounded">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-1 text-bordeaux hover:bg-bordeaux/5">−</button>
              <span className="min-w-[28px] text-center text-[14px] font-bold text-ink">{qty}</span>
              <button onClick={() => setQty(q => Math.min(99, q + 1))} className="px-3 py-1 text-bordeaux hover:bg-bordeaux/5">+</button>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="ml-auto text-[13px] px-5 py-2 bg-bordeaux text-cream hover:bg-bordeaux-deep rounded-full font-medium"
          >
            Imprimer ({qty})
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="text-[12px] px-4 py-2 border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream rounded-full font-medium disabled:opacity-50"
            title="Télécharger le fichier ZPL"
          >
            {downloading ? '…' : 'ZPL'}
          </button>
        </div>
      </div>
    </div>
  )
}
