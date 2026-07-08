import { useState, useEffect, useMemo, useRef } from 'react'
import Skeleton from './Skeleton'
import { usePersistedState } from '../lib/usePersistedState'
import { MessageSquareText, Cake, Croissant, Printer } from 'lucide-react'
import AppHeader from './AppHeader'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import {
  loadMessagesToday,
  markMessagePrinted,
  unmarkMessagePrinted,
  detectBirthdayLayout,
  isArabic,
  EMOJI_PICKER,
} from '../lib/messages'

// ============================================================
// MessagesView : impression d'etiquettes messages
// Format : A4 portrait avec colonne centrale de 10,5cm (la feuille
// est coupee en deux apres impression)
// Zones de LABEL_HEIGHT_MM (4cm par defaut), centrees verticalement
// ============================================================

// ============================================================
// Dimensions des etiquettes (modifier ici pour changer la taille)
// ============================================================
const LABEL_WIDTH_MM = 105     // 10,5 cm largeur
const LABEL_HEIGHT_MM = 40     // 4 cm hauteur (au lieu de 5,94)
const A4_HEIGHT_MM = 297       // hauteur d'une feuille A4
const MAX_ZONES_PER_PAGE = Math.floor(A4_HEIGHT_MM / LABEL_HEIGHT_MM)  // 7 pour 4cm

const FONT_OPTIONS = [
  { id: 'pacifico', label: 'Cursive (Pacifico)', css: "'Pacifico', cursive" },
  { id: 'dancing', label: 'Dancing Script', css: "'Dancing Script', cursive" },
  { id: 'sacramento', label: 'Sacramento', css: "'Sacramento', cursive" },
  { id: 'great', label: 'Great Vibes', css: "'Great Vibes', cursive" },
  { id: 'serif', label: 'Serif', css: "Georgia, 'Times New Roman', serif" },
  { id: 'sans', label: 'Sans-serif', css: "system-ui, -apple-system, sans-serif" },
]

const ARABIC_FONT_OPTIONS = [
  { id: 'naskh', label: 'Naskh', css: "'Noto Naskh Arabic', serif" },
  { id: 'amiri', label: 'Amiri', css: "'Amiri', serif" },
  { id: 'kufi', label: 'Kufi', css: "'Reem Kufi', sans-serif" },
  { id: 'messiri', label: 'El Messiri', css: "'El Messiri', sans-serif" },
  { id: 'tajawal', label: 'Tajawal', css: "'Tajawal', sans-serif" },
]

// ============================================================
export default function MessagesView({ user, activeView, onNavigate, onLogout }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = usePersistedState('lily.messages.tab', 'cd')   // 'cd' | 'prod'
  const [selected, setSelected] = useState(new Set())
  const [doubleSize, setDoubleSize] = useState(new Set())
  const [editing, setEditing] = useState({})
  const [showPrinted, setShowPrinted] = useState(false)
  const [latinFont, setLatinFont] = useState(FONT_OPTIONS[0])
  const [arabicFont, setArabicFont] = useState(ARABIC_FONT_OPTIONS[0])
  const [sizeFactor, setSizeFactor] = useState(100)   // 50 a 150% override de l'auto-fit
  const [freeMessages, setFreeMessages] = useState([])
  const [showFreeForm, setShowFreeForm] = useState(false)
  const [freeText, setFreeText] = useState('')
  const [showArabicKbFree, setShowArabicKbFree] = useState(false)
  const freeTextareaRef = useRef(null)

  async function refresh() {
    setLoading(true)
    try {
      const data = await loadMessagesToday()
      setMessages(data)
    } catch (e) {
      console.error('[MessagesView]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  useEffect(() => {
    const id = 'messages-view-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Pacifico&family=Dancing+Script:wght@400;700&family=Sacramento&family=Great+Vibes&family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Reem+Kufi:wght@400;700&family=El+Messiri:wght@400;700&family=Tajawal:wght@400;700&display=swap'
    document.head.appendChild(link)
  }, [])

  const orderMessages = useMemo(() => {
    return showPrinted
      ? messages.filter(m => m.printedAt)      // imprimes seulement
      : messages.filter(m => !m.printedAt)     // non-imprimes seulement
  }, [messages, showPrinted])

  const cdMessages = useMemo(() => orderMessages.filter(m => m.source === 'cd'), [orderMessages])
  const prodMessages = useMemo(() => orderMessages.filter(m => m.source === 'prod'), [orderMessages])

  // Filtre des messages libres selon l'onglet actif :
  //   - "Aujourd'hui" : on cache ceux qui ont ete imprimes
  //   - "Imprimes"    : on n'affiche que ceux qui ont ete imprimes
  const visibleFreeMessages = useMemo(() => {
    return showPrinted
      ? freeMessages.filter(m => m.printedAt)
      : freeMessages.filter(m => !m.printedAt)
  }, [freeMessages, showPrinted])

  const allMessages = useMemo(() => {
    return [...freeMessages, ...orderMessages]
  }, [freeMessages, orderMessages])

  const currentTabMessages = activeTab === 'cd' ? cdMessages : prodMessages

  function toggleSelect(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }
  function toggleDouble(id) {
    const next = new Set(doubleSize)
    if (next.has(id)) next.delete(id); else next.add(id)
    setDoubleSize(next)
  }
  function getMessageText(msg) {
    return editing[msg.id] !== undefined ? editing[msg.id] : msg.text
  }
  function setMessageText(id, text) {
    setEditing(e => ({ ...e, [id]: text }))
  }
  function selectAllInTab() {
    setSelected(new Set([...selected, ...currentTabMessages.map(m => m.id), ...freeMessages.map(m => m.id)]))
  }
  function clearAll() {
    setSelected(new Set())
  }

  function addFreeMessage() {
    const t = freeText.trim()
    if (!t) return
    const id = `libre:${Date.now()}`
    setFreeMessages(prev => [...prev, {
      id, sourceKey: id, type: 'free', source: 'free',
      raw: t, text: t,
      isArabic: isArabic(t),
      orderNum: null, clientName: null, deliveryAt: null, printedAt: null,
    }])
    setSelected(prev => new Set([...prev, id]))
    setFreeText('')
    setShowFreeForm(false)
  }

  function removeFreeMessage(id) {
    setFreeMessages(prev => prev.filter(m => m.id !== id))
    const next = new Set(selected); next.delete(id); setSelected(next)
    const nextD = new Set(doubleSize); nextD.delete(id); setDoubleSize(nextD)
  }

  async function handleUnmarkPrinted(msg) {
    if (!msg.printedAt) return
    if (!await confirmDialog(`Marquer "${msg.text}" comme NON imprimé ?`, { confirmLabel: 'Confirmer' })) return
    // Messages libres : ils ne sont pas en base, donc on mute juste le state local
    if (msg.type === 'free') {
      setFreeMessages(prev => prev.map(m =>
        m.id === msg.id ? { ...m, printedAt: null } : m
      ))
      return
    }
    try {
      await unmarkMessagePrinted(msg.sourceKey)
      refresh()
    } catch (e) {
      toast.error('Erreur : ' + e.message)
    }
  }

  // Pages : 5 zones par feuille, x2 = 2 zones
  const pages = useMemo(() => {
    const selectedMsgs = allMessages.filter(m => selected.has(m.id))
    const pages = []
    let currentPage = []
    let currentZones = 0
    for (const msg of selectedMsgs) {
      const zones = doubleSize.has(msg.id) ? 2 : 1
      if (currentZones + zones > MAX_ZONES_PER_PAGE) {
        if (currentPage.length > 0) pages.push(currentPage)
        currentPage = []
        currentZones = 0
      }
      currentPage.push({ msg, zones })
      currentZones += zones
    }
    if (currentPage.length > 0) pages.push(currentPage)
    return pages
  }, [allMessages, selected, doubleSize])

  async function handlePrint() {
    if (pages.length === 0) {
      toast.error('Aucun message selectionne')
      return
    }
    const html = buildPrintHtml(pages)
    const w = window.open('', '_blank', 'width=600,height=900')
    if (!w) { toast.error('Popup bloquee'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 700)

    // 1) Marquer les messages de commande (type 'order') comme imprimes en base
    const toMark = allMessages.filter(m => selected.has(m.id) && m.type === 'order' && !m.printedAt)
    for (const msg of toMark) {
      try {
        await markMessagePrinted(msg.sourceKey, getMessageText(msg), user.id)
      } catch (e) {
        console.error('[markMessagePrinted]', e)
      }
    }

    // 2) Marquer les messages libres (state local) comme imprimes
    //    -> ils basculeront vers l'onglet "imprimes" comme les autres
    const printedAtNow = new Date().toISOString()
    setFreeMessages(prev => prev.map(m => {
      if (selected.has(m.id) && !m.printedAt) {
        return { ...m, printedAt: printedAtNow }
      }
      return m
    }))

    // 3) Vider la selection : les messages imprimes ne sont plus dans le panier
    setSelected(new Set())
    setDoubleSize(new Set())

    refresh()
  }

  // Mesure la vraie largeur d'un texte avec canvas (precise pour script fonts)
  function measureTextWidth(text, fontFamily, fontSizePt) {
    const canvas = measureTextWidth._canvas || (measureTextWidth._canvas = document.createElement('canvas'))
    const ctx = canvas.getContext('2d')
    // 1pt ~ 1.333px a 96dpi
    const pxSize = fontSizePt * 1.333
    ctx.font = `${pxSize}px ${fontFamily}`
    return ctx.measureText(text).width / 3.78   // px -> mm (96dpi)
  }

  // ============================================================
  // Calcul auto-fit : taille de police pour remplir une zone
  // Zone : LABEL_WIDTH_MM large x LABEL_HEIGHT_MM haut (single) ou 2x (double)
  // Surface utile : ~93mm x ~47mm avec marges
  // Le texte peut etre wrappe sur plusieurs lignes mais pas mid-word
  // ============================================================
  function computeFontSizes(text, zones, isLayout) {
    const widthMm = LABEL_WIDTH_MM - 15   // marges horizontales totales (~7.5mm de chaque cote)
    // Hauteur utile (avec marge 20%) : double zone fait 2x la hauteur d'une seule
    const totalHeightMm = (zones === 2 ? 2 * LABEL_HEIGHT_MM : LABEL_HEIGHT_MM) * 0.80
    const heightMm = totalHeightMm
    const factor = sizeFactor / 100

    const ar = isArabic(text)
    const fontFamily = ar ? arabicFont.css : latinFont.css

    // Largeur reelle d'un texte a une font-size donnee
    function widthAt(textStr, ptSize) {
      return measureTextWidth(textStr, fontFamily, ptSize)
    }

    // Combien de lignes pour un texte (split par mots, jamais mid-word)
    function linesAtSize(textStr, ptSize) {
      let totalLines = 0
      for (const line of textStr.split('\n')) {
        if (line.length === 0) { totalLines += 1; continue }
        const words = line.split(/\s+/).filter(Boolean)
        let currentWidth = 0
        let currentLineExists = false
        for (const word of words) {
          const wordW = widthAt(word, ptSize)
          const spaceW = widthAt(' ', ptSize)
          if (!currentLineExists) {
            currentWidth = wordW
            currentLineExists = true
          } else if (currentWidth + spaceW + wordW <= widthMm) {
            currentWidth += spaceW + wordW
          } else {
            totalLines += 1
            currentWidth = wordW
          }
        }
        if (currentLineExists) totalLines += 1
      }
      return totalLines
    }

    function heightAtSize(ptSize, lineCount) {
      return lineCount * ptSize * 0.353 * 1.2
    }

    function maxWordWidthAt(textStr, ptSize) {
      let max = 0
      for (const line of textStr.split('\n')) {
        for (const word of line.split(/\s+/).filter(Boolean)) {
          const w = widthAt(word, ptSize)
          if (w > max) max = w
        }
      }
      return max
    }

    function fitSize(textStr, heightMmAvail, minPt, maxPt) {
      let lo = minPt, hi = maxPt
      let best = minPt
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        // Test: le mot le plus long doit tenir en largeur
        const maxWordW = maxWordWidthAt(textStr, mid)
        if (maxWordW > widthMm) {
          hi = mid - 1
          continue
        }
        // Test: hauteur totale doit tenir
        const lines = linesAtSize(textStr, mid)
        const h = heightAtSize(mid, lines)
        if (h <= heightMmAvail) {
          best = mid
          lo = mid + 1
        } else {
          hi = mid - 1
        }
      }
      return best
    }

    if (isLayout) {
      // Layout 2 lignes (formule + prenom) : meme taille pour les 2 lignes
      // Chaque ligne a environ 45% de la hauteur dispo (avec un peu d'espace au milieu)
      const lineMaxH = heightMm * 0.45

      const nameStr = text.replace(/^(Joyeux Anniversaire|Happy Birthday|عيد ميلاد سعيد)\s+/i, '')
      const greetingStr = text.match(/^(Joyeux Anniversaire|Happy Birthday|عيد ميلاد سعيد)/i)?.[1] || 'Joyeux Anniversaire'

      // On calcule la taille pour CHAQUE ligne, puis on prend la plus petite
      // pour qu'elles tiennent toutes les deux sans depasser, et soient identiques
      const greetingFits = fitSize(greetingStr, lineMaxH, 14, 90)
      const nameFits = fitSize(nameStr, lineMaxH, 14, 90)
      const sharedPt = Math.min(greetingFits, nameFits) * factor

      return {
        greetingPt: Math.max(14, Math.min(sharedPt, 90)),
        namePt: Math.max(14, Math.min(sharedPt, 90)),
      }
    } else {
      const textPt = fitSize(text, heightMm, 10, 130) * factor
      return { textPt: Math.max(10, Math.min(textPt, 130)) }
    }
  }

  function buildPrintHtml(pages) {
    const renderPage = (items, pageIdx) => {
      // Position absolue de chaque message : top fixe en mm
      let topMm = 0
      const blocks = []
      for (const { msg, zones } of items) {
        const heightMm = zones === 2 ? 2 * LABEL_HEIGHT_MM : LABEL_HEIGHT_MM
        blocks.push({ msg, zones, topMm, heightMm })
        topMm += heightMm
      }
      const totalZones = items.reduce((s, { zones }) => s + zones, 0)
      const lastIdx = blocks.length - 1
      const html = blocks.map(({ msg, zones, topMm, heightMm }, idx) => {
        const showCut = !(totalZones === MAX_ZONES_PER_PAGE && idx === lastIdx)
        return renderMsgAbsolute(msg, zones, topMm, heightMm, showCut)
      }).join('')
      const breakStyle = pageIdx > 0 ? ' style="page-break-before: always;"' : ''
      return `<div class="page"${breakStyle}><div class="strip">${html}</div></div>`
    }

    const renderMsgAbsolute = (msg, zones, topMm, heightMm, showCut) => {
      const text = getMessageText(msg)
      const ar = isArabic(text)
      const fontFamily = ar ? arabicFont.css : latinFont.css
      const layout = detectBirthdayLayout(text)
      const sizes = computeFontSizes(text, zones, !!layout)

      let inner
      if (layout) {
        inner = `
          <div style="font-family: ${fontFamily}; font-size: ${sizes.greetingPt}pt; line-height: 1; ${ar ? 'direction: rtl;' : ''}">${escapeHtml(layout.greeting)}</div>
          <div style="font-family: ${fontFamily}; font-size: ${sizes.namePt}pt; line-height: 1.05; margin-top: 4mm; ${ar ? 'direction: rtl;' : ''}">${escapeHtml(layout.name)}</div>
        `
      } else {
        inner = `<div style="font-family: ${fontFamily}; font-size: ${sizes.textPt}pt; line-height: 1.2; white-space: pre-wrap; ${ar ? 'direction: rtl;' : ''}">${escapeHtml(text)}</div>`
      }
      const cutHtml = showCut ? '<div class="cut"></div>' : ''
      return `<div class="msg" style="top: ${topMm}mm; height: ${heightMm}mm;">${inner}${cutHtml}</div>`
    }

    const css = `
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body { width: 210mm; }
      body { font-family: sans-serif; }
      .page {
        width: 210mm;
        height: 296mm;
        position: relative;
        overflow: hidden;
      }
      .strip {
        position: absolute;
        left: 52.5mm;
        top: 0;
        width: 105mm;
        height: 296mm;
        overflow: hidden;
      }
      .msg {
        position: absolute;
        left: 0; right: 0;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        text-align: center;
        padding: 6mm 6mm;
        overflow: hidden;
        word-break: break-word;
      }
      .msg > div { max-width: 100%; }
      .cut {
        position: absolute; bottom: 0; left: 6mm; right: 6mm;
        border-top: 1px dashed #888;
      }
      @media screen {
        body { background: #ddd; padding: 20px; }
        .page { background: white; margin: 0 auto 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      }
    `
    const pagesHtml = pages.map((p, i) => renderPage(p, i)).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquettes</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pacifico&family=Dancing+Script:wght@400;700&family=Sacramento&family=Great+Vibes&family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Reem+Kufi:wght@400;700&family=El+Messiri:wght@400;700&family=Tajawal:wght@400;700&display=swap">
      <style>${css}</style></head><body>${pagesHtml}</body></html>`
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} onSyncSuccess={refresh} />

      <div className="max-w-[1100px] mx-auto px-5 py-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h1 className="font-fraunces italic text-[26px] text-ink inline-flex items-center gap-2"><MessageSquareText size={22} /> Messages</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowPrinted(!showPrinted)}
              className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                showPrinted ? 'bg-bordeaux text-cream border-bordeaux' : 'border-line text-ink-soft hover:border-bordeaux'
              }`}
            >
              {showPrinted ? '✓ Voir imprimés' : 'Voir imprimés'}
            </button>
            <button onClick={selectAllInTab} className="text-[11px] px-3 py-1.5 rounded-full border border-line text-ink-soft hover:border-bordeaux">Tout cocher</button>
            <button onClick={clearAll} className="text-[11px] px-3 py-1.5 rounded-full border border-line text-ink-soft hover:border-bordeaux">Tout décocher</button>
          </div>
        </div>

        {/* Onglets CD / Prod */}
        <div className="flex gap-1 mb-4 border-b border-line">
          <button
            onClick={() => setActiveTab('cd')}
            className={`px-4 py-2 text-[12px] font-medium tracking-wider transition-colors border-b-2 -mb-px inline-flex items-center gap-1.5 ${
              activeTab === 'cd' ? 'border-bordeaux text-bordeaux' : 'border-transparent text-ink-mute hover:text-ink'
            }`}
          >
            <Cake size={14} /> Gâteaux ({cdMessages.length})
          </button>
          <button
            onClick={() => setActiveTab('prod')}
            className={`px-4 py-2 text-[12px] font-medium tracking-wider transition-colors border-b-2 -mb-px inline-flex items-center gap-1.5 ${
              activeTab === 'prod' ? 'border-bordeaux text-bordeaux' : 'border-transparent text-ink-mute hover:text-ink'
            }`}
          >
            <Croissant size={14} /> Production ({prodMessages.length})
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          {/* Liste gauche */}
          <div>
            {/* Bouton + Message libre */}
            {!showFreeForm && (
              <button
                onClick={() => setShowFreeForm(true)}
                className="w-full mb-3 py-2 border-2 border-dashed border-bordeaux/40 rounded-lg text-bordeaux text-[12px] hover:bg-bordeaux/5"
              >
                + Ajouter un message libre
              </button>
            )}
            {showFreeForm && (
              <div className="bg-cream-warm border border-bordeaux/30 rounded-lg p-3 mb-3">
                <textarea
                  ref={freeTextareaRef}
                  value={freeText}
                  onChange={e => setFreeText(e.target.value)}
                  placeholder="Tapez votre message... (Entrée = retour ligne)"
                  className="w-full text-[13px] p-2 border border-line rounded resize-y min-h-[60px] mb-2"
                  style={isArabic(freeText) ? { direction: 'rtl', textAlign: 'right' } : {}}
                  autoFocus
                />
                {/* Formules rapides : clic = insère la formule + un espace (plus besoin de la retaper). */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {['Joyeux anniversaire', 'Happy Birthday', 'عيد ميلاد سعيد'].map(g => (
                    <button
                      key={g}
                      type="button"
                      onMouseDown={ev => ev.preventDefault()}
                      onClick={() => setFreeText(t => (t && !/\s$/.test(t) ? t + ' ' : t) + g + ' ')}
                      className="text-[11px] px-2 py-0.5 rounded border border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream transition-colors"
                      style={/[؀-ۿ]/.test(g) ? { fontFamily: '"Noto Naskh Arabic", "Amiri", sans-serif' } : {}}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mb-2 items-center">
                  {EMOJI_PICKER.map(e => (
                    <button key={e} type="button" onMouseDown={ev => ev.preventDefault()} onClick={() => setFreeText(t => t + e)} className="text-[16px] px-1.5 py-0.5 hover:bg-cream rounded">{e}</button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={ev => ev.preventDefault()}
                    onClick={() => setShowArabicKbFree(v => !v)}
                    className={`text-[11px] px-2 py-0.5 rounded border transition-colors ml-1 ${
                      showArabicKbFree
                        ? 'bg-bordeaux text-cream border-bordeaux'
                        : 'border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream'
                    }`}
                    title="Clavier arabe"
                  >
                    <span style={{ fontFamily: '"Noto Naskh Arabic", "Amiri", sans-serif' }}>ع</span> AR
                  </button>
                </div>
                {showArabicKbFree && (
                  <ArabicKeyboard
                    textareaRef={freeTextareaRef}
                    onInsert={(newValue) => setFreeText(newValue)}
                    onClose={() => setShowArabicKbFree(false)}
                  />
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={addFreeMessage} className="text-[11px] px-3 py-1 bg-bordeaux text-cream rounded">Ajouter</button>
                  <button onClick={() => { setShowFreeForm(false); setFreeText(''); setShowArabicKbFree(false) }} className="text-[11px] px-3 py-1 border border-line rounded text-ink-mute">Annuler</button>
                </div>
              </div>
            )}

            {/* Messages libres (filtres selon l'onglet : non imprimes / imprimes) */}
            {visibleFreeMessages.length > 0 && (
              <div className="mb-4">
                <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-bordeaux mb-2">Messages libres</div>
                <div className="space-y-2">
                  {visibleFreeMessages.map(msg => (
                    <MessageItem
                      key={msg.id} msg={msg}
                      selected={selected.has(msg.id)} doubleSize={doubleSize.has(msg.id)}
                      text={getMessageText(msg)}
                      onToggle={() => toggleSelect(msg.id)} onToggleDouble={() => toggleDouble(msg.id)}
                      onTextChange={t => setMessageText(msg.id, t)}
                      onRemove={() => removeFreeMessage(msg.id)}
                      onUnmarkPrinted={() => handleUnmarkPrinted(msg)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Messages de l'onglet actif */}
            {loading ? (
              <Skeleton rows={5} />
            ) : currentTabMessages.length === 0 ? (
              <div className="text-center text-ink-mute italic py-8">
                {activeTab === 'cd' ? 'Aucun message gâteau' : 'Aucun message production'} aujourd'hui
              </div>
            ) : (
              <div className="space-y-2">
                {currentTabMessages.map(msg => (
                  <MessageItem
                    key={msg.id} msg={msg}
                    selected={selected.has(msg.id)} doubleSize={doubleSize.has(msg.id)}
                    text={getMessageText(msg)}
                    onToggle={() => toggleSelect(msg.id)} onToggleDouble={() => toggleDouble(msg.id)}
                    onTextChange={t => setMessageText(msg.id, t)}
                    onUnmarkPrinted={() => handleUnmarkPrinted(msg)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Aperçu droite */}
          <div className="space-y-3 lg:sticky lg:top-20 self-start">
            <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-bordeaux">
              Aperçu A4 ({pages.length} feuille{pages.length > 1 ? 's' : ''})
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {pages.length === 0 ? (
                <div className="text-center text-ink-mute italic text-[11px] py-4 border border-dashed border-line rounded">
                  Cochez des messages
                </div>
              ) : (
                pages.map((page, i) => (
                  <PagePreview
                    key={i} pageItems={page}
                    latinFont={latinFont} arabicFont={arabicFont}
                    sizeFactor={sizeFactor}
                    getText={getMessageText}
                    computeSizes={computeFontSizes}
                  />
                ))
              )}
            </div>

            <div>
              <label className="text-[10px] text-ink-mute block mb-1">Police latine</label>
              <select
                value={latinFont.id}
                onChange={e => setLatinFont(FONT_OPTIONS.find(f => f.id === e.target.value))}
                className="w-full text-[12px] border border-line rounded px-2 py-1"
              >
                {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-ink-mute block mb-1">Police arabe</label>
              <select
                value={arabicFont.id}
                onChange={e => setArabicFont(ARABIC_FONT_OPTIONS.find(f => f.id === e.target.value))}
                className="w-full text-[12px] border border-line rounded px-2 py-1"
              >
                {ARABIC_FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-ink-mute block mb-1">Taille texte ({sizeFactor}%)</label>
              <input
                type="range" min="50" max="150" step="5"
                value={sizeFactor}
                onChange={e => setSizeFactor(parseInt(e.target.value))}
                className="w-full"
              />
            </div>

            <button
              onClick={handlePrint}
              disabled={selected.size === 0}
              className="w-full py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5"
            >
              <Printer size={14} /> Imprimer ({selected.size} message{selected.size > 1 ? 's' : ''})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// MessageItem : carte d'un message dans la liste
// ============================================================
function MessageItem({ msg, selected, doubleSize, text, onToggle, onToggleDouble, onTextChange, onRemove, onUnmarkPrinted }) {
  const [editing, setEditing] = useState(false)
  const [showArabicKb, setShowArabicKb] = useState(false)
  const textareaRef = useRef(null)
  const ar = isArabic(text)
  const time = msg.deliveryAt ? new Date(msg.deliveryAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className={`bg-white border rounded-lg p-2.5 ${selected ? 'border-bordeaux ring-1 ring-bordeaux/20' : 'border-line'}`}>
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
            selected ? 'bg-bordeaux border-bordeaux' : 'border-line bg-white'
          }`}
        >
          {selected && <span className="text-cream text-[12px] leading-none">✓</span>}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
            {msg.orderNum && <span className="font-mono text-[9px] text-ink-mute">{msg.orderNum}</span>}
            {time && <span className="font-mono text-[9px] text-ink-mute">{time}</span>}
            {msg.clientName && <span className="text-[10px] text-ink-soft truncate">{msg.clientName}</span>}
            {ar && <span className="bg-purple-100 text-purple-800 text-[9px] px-1.5 py-0.5 rounded-full">AR</span>}
            {msg.printedAt && (
              <button
                onClick={onUnmarkPrinted}
                className="bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-800 text-[9px] px-1.5 py-0.5 rounded-full transition-colors cursor-pointer"
                title="Cliquer pour marquer comme NON imprimé"
              >
                ✓ imprimé · annuler
              </button>
            )}
            {msg.type === 'free' && <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-full">libre</span>}
          </div>
          {editing ? (
            <>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={e => onTextChange(e.target.value)}
                onBlur={() => { if (!showArabicKb) setEditing(false) }}
                autoFocus
                rows={Math.max(2, text.split('\n').length)}
                className="w-full text-[13px] border border-bordeaux rounded px-1.5 py-1 resize-y"
                style={ar ? { direction: 'rtl', textAlign: 'right' } : {}}
              />
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setShowArabicKb(v => !v)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    showArabicKb
                      ? 'bg-bordeaux text-cream border-bordeaux'
                      : 'border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream'
                  }`}
                  title="Clavier arabe"
                >
                  <span style={{ fontFamily: '"Noto Naskh Arabic", "Amiri", sans-serif' }}>ع</span> AR
                </button>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setShowArabicKb(false); setEditing(false) }}
                  className="text-[10px] px-2 py-0.5 rounded border border-line text-ink-mute hover:bg-cream-warm"
                >
                  Fermer
                </button>
              </div>
              {showArabicKb && (
                <ArabicKeyboard
                  textareaRef={textareaRef}
                  onInsert={(newValue) => onTextChange(newValue)}
                  onClose={() => setShowArabicKb(false)}
                />
              )}
            </>
          ) : (
            <div
              className="text-[13px] font-medium text-ink whitespace-pre-wrap"
              style={ar ? { direction: 'rtl', textAlign: 'right' } : {}}
            >{text}</div>
          )}
          {msg.type === 'order' && msg.raw !== text && !editing && (
            <div className="text-[10px] text-ink-mute italic mt-0.5">Original : {msg.raw}</div>
          )}
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            onClick={() => setEditing(!editing)}
            className={`text-[10px] px-2 py-0.5 border rounded ${editing ? 'bg-bordeaux text-cream border-bordeaux' : 'border-line text-ink-mute hover:border-bordeaux hover:text-bordeaux'}`}
            title="Modifier"
          >{editing ? '✓' : '✎'}</button>
          <button
            onClick={onToggleDouble}
            className={`text-[10px] px-2 py-0.5 rounded border ${
              doubleSize ? 'bg-amber-100 text-amber-800 border-amber-400' : 'border-line text-ink-mute hover:border-bordeaux'
            }`}
            title="Double taille (occupe 2 zones)"
          >{doubleSize ? 'x2' : 'x1'}</button>
          {onRemove && (
            <button onClick={onRemove} className="text-[10px] px-2 py-0.5 border border-line rounded text-red-700 hover:border-red-400" title="Supprimer">×</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PagePreview : aperçu d'une feuille A4 avec colonne centrale 10,5cm
// Utilise computeFontSizes pour matcher l'impression
// ============================================================
function PagePreview({ pageItems, latinFont, arabicFont, sizeFactor, getText, computeSizes }) {
  const usedZones = pageItems.reduce((s, p) => s + p.zones, 0)
  const emptyZones = MAX_ZONES_PER_PAGE - usedZones
  const emptyBottom = emptyZones   // toujours en bas

  // Echelle aperçu : la colonne fait 105mm => on l'affiche en ~85px
  const ptToPx = 0.286

  return (
    <div className="bg-white border border-line rounded shadow-sm" style={{
      width: '170px', aspectRatio: '210/297', display: 'flex', justifyContent: 'center', margin: '0 auto'
    }}>
      <div style={{ width: '50%', display: 'flex', flexDirection: 'column' }}>
        {pageItems.map(({ msg, zones }) => {
          const text = getText(msg)
          const ar = isArabic(text)
          const fontFamily = ar ? arabicFont.css : latinFont.css
          const layout = detectBirthdayLayout(text)
          const sizes = computeSizes(text, zones, !!layout)

          return (
            <div key={msg.id} style={{
              flex: zones,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              padding: '4px', borderBottom: '1px dashed #b0b0b0',
              overflow: 'hidden',
            }}>
              {layout ? (
                <>
                  <div style={{
                    fontFamily, fontSize: `${sizes.greetingPt * ptToPx}px`,
                    textAlign: 'center', lineHeight: 1,
                    direction: ar ? 'rtl' : 'ltr',
                    wordBreak: 'break-word',
                  }}>{layout.greeting}</div>
                  <div style={{
                    fontFamily, fontSize: `${sizes.namePt * ptToPx}px`,
                    textAlign: 'center', lineHeight: 1.05,
                    marginTop: '2px',
                    direction: ar ? 'rtl' : 'ltr',
                    wordBreak: 'break-word',
                    maxWidth: '100%',
                  }}>{layout.name}</div>
                </>
              ) : (
                <div style={{
                  fontFamily,
                  fontSize: `${sizes.textPt * ptToPx}px`,
                  textAlign: 'center', lineHeight: 1.2,
                  direction: ar ? 'rtl' : 'ltr',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxWidth: '100%',
                }}>{text}</div>
              )}
            </div>
          )
        })}
        {emptyBottom > 0 && <div style={{ flex: emptyBottom }} />}
      </div>
    </div>
  )
}

// ============================================================
// ArabicKeyboard : clavier arabe virtuel a cliquer
// Utile sur PC sans clavier arabe physique. Insere le caractere
// a la position du curseur dans le textarea, ou a la fin sinon.
// ============================================================
// Layout standard arabe (28 lettres + chiffres + ponctuation).
// Disposition AZERTY-like arabe pour familiariser les utilisateurs.
const ARABIC_KEYBOARD_LAYOUT = [
  // Ligne 1 : chiffres arabes
  ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'],
  // Ligne 2 : lettres
  ['ض','ص','ث','ق','ف','غ','ع','ه','خ','ح','ج'],
  // Ligne 3
  ['ش','س','ي','ب','ل','ا','ت','ن','م','ك','ط'],
  // Ligne 4
  ['ئ','ء','ؤ','ر','لا','ى','ة','و','ز','ظ','د','ذ'],
  // Ligne 5 : ponctuation et lettres avec hamza
  ['أ','إ','آ','،','؟','؛',':','"','!','-','.'],
]

function ArabicKeyboard({ onInsert, onClose, textareaRef }) {
  // Insere a la position du curseur si textareaRef fourni, sinon ajoute a la fin
  function handleClick(char) {
    if (textareaRef?.current) {
      const ta = textareaRef.current
      const start = ta.selectionStart ?? ta.value.length
      const end = ta.selectionEnd ?? ta.value.length
      const newValue = ta.value.slice(0, start) + char + ta.value.slice(end)
      onInsert(newValue, start + char.length)
      // Re-place le curseur apres le caractere insere
      setTimeout(() => {
        ta.focus()
        ta.setSelectionRange(start + char.length, start + char.length)
      }, 0)
    } else {
      onInsert(char)
    }
  }

  return (
    <div className="bg-cream-warm border border-bordeaux/30 rounded-lg p-2 mt-2" dir="rtl">
      <div className="flex items-center justify-between mb-2" dir="ltr">
        <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-bordeaux">
          Clavier arabe
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="text-[10px] text-ink-mute hover:text-bordeaux px-2"
            title="Fermer"
          >
            <i className="ti ti-x text-[12px]" aria-hidden="true"></i>
          </button>
        )}
      </div>
      <div className="space-y-1">
        {ARABIC_KEYBOARD_LAYOUT.map((row, ri) => (
          <div key={ri} className="flex flex-wrap gap-1 justify-center">
            {row.map((char, ci) => (
              <button
                key={ci}
                type="button"
                onMouseDown={e => e.preventDefault()}   // empeche perte de focus
                onClick={() => handleClick(char)}
                className="min-w-[28px] h-8 px-1.5 text-[16px] bg-white border border-line rounded hover:bg-bordeaux hover:text-cream hover:border-bordeaux transition-colors font-arabic"
                style={{ fontFamily: '"Noto Naskh Arabic", "Amiri", "Arial", sans-serif' }}
              >
                {char}
              </button>
            ))}
          </div>
        ))}
        {/* Ligne d'actions : espace + retour ligne */}
        <div className="flex gap-1 justify-center pt-1">
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleClick(' ')}
            className="min-w-[120px] h-8 px-3 text-[11px] bg-white border border-line rounded hover:bg-bordeaux hover:text-cream hover:border-bordeaux transition-colors"
          >Espace</button>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => handleClick('\n')}
            className="min-w-[60px] h-8 px-3 text-[11px] bg-white border border-line rounded hover:bg-bordeaux hover:text-cream hover:border-bordeaux transition-colors"
          >↵</button>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              if (textareaRef?.current) {
                const ta = textareaRef.current
                const start = ta.selectionStart ?? ta.value.length
                if (start === 0) return
                const newValue = ta.value.slice(0, start - 1) + ta.value.slice(start)
                onInsert(newValue, start - 1)
                setTimeout(() => {
                  ta.focus()
                  ta.setSelectionRange(start - 1, start - 1)
                }, 0)
              }
            }}
            className="min-w-[40px] h-8 px-3 text-[11px] bg-white border border-line rounded hover:bg-bordeaux hover:text-cream hover:border-bordeaux transition-colors"
          >⌫</button>
        </div>
      </div>
    </div>
  )
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
