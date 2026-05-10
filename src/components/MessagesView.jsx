import { useState, useEffect, useMemo } from 'react'
import {
  loadMessagesForRange,
  groupMessagesByDay,
  markMessagePrinted,
  detectBirthdayLayout,
  isArabic,
  expandShorthand,
  EMOJI_PICKER,
} from '../lib/messages'

// ============================================================
// MessagesView : impression d'etiquettes messages
// Format etiquette 10x29.7 cm portrait, 5 zones
// ============================================================

const FONT_OPTIONS = [
  { id: 'pacifico', label: 'Cursive (Pacifico)', css: "'Pacifico', cursive" },
  { id: 'dancing', label: 'Dancing Script', css: "'Dancing Script', cursive" },
  { id: 'sacramento', label: 'Sacramento', css: "'Sacramento', cursive" },
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
export default function MessagesView({ user }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [doubleSize, setDoubleSize] = useState(new Set())   // ids des messages en x2
  const [editing, setEditing] = useState({})                 // id -> texte modifie
  const [showPrinted, setShowPrinted] = useState(false)
  const [latinFont, setLatinFont] = useState(FONT_OPTIONS[0])
  const [arabicFont, setArabicFont] = useState(ARABIC_FONT_OPTIONS[0])
  const [freeMessages, setFreeMessages] = useState([])       // messages libres ajoutes
  const [showFreeForm, setShowFreeForm] = useState(false)
  const [freeText, setFreeText] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      const today = new Date()
      const yyyy = today.getFullYear()
      const mm = String(today.getMonth() + 1).padStart(2, '0')
      const dd = String(today.getDate()).padStart(2, '0')
      const data = await loadMessagesForRange(`${yyyy}-${mm}-${dd}`, 7)
      setMessages(data)
    } catch (e) {
      console.error('[MessagesView]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  // Charger Google Fonts une fois
  useEffect(() => {
    const id = 'messages-view-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Pacifico&family=Dancing+Script:wght@400;700&family=Sacramento&family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Reem+Kufi:wght@400;700&family=El+Messiri:wght@400;700&family=Tajawal:wght@400;700&display=swap'
    document.head.appendChild(link)
  }, [])

  // Tous les messages affiches : commandes + libres
  const allMessages = useMemo(() => {
    const orderMsgs = showPrinted
      ? messages
      : messages.filter(m => !m.printedAt)
    return [...freeMessages, ...orderMsgs]
  }, [messages, freeMessages, showPrinted])

  const groupedByDay = useMemo(() => groupMessagesByDay(allMessages.filter(m => m.type === 'order')), [allMessages])
  const sortedDays = useMemo(() => [...groupedByDay.keys()].sort(), [groupedByDay])

  function toggleSelect(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  function toggleDouble(id) {
    const next = new Set(doubleSize)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setDoubleSize(next)
  }

  function getMessageText(msg) {
    return editing[msg.id] !== undefined ? editing[msg.id] : msg.text
  }

  function setMessageText(id, text) {
    setEditing(e => ({ ...e, [id]: text }))
  }

  function selectAll() {
    setSelected(new Set(allMessages.map(m => m.id)))
  }

  function clearAll() {
    setSelected(new Set())
  }

  function addFreeMessage() {
    const t = freeText.trim()
    if (!t) return
    const id = `libre:${Date.now()}`
    setFreeMessages(prev => [...prev, {
      id,
      sourceKey: id,
      type: 'free',
      raw: t,
      text: t,
      isArabic: isArabic(t),
      orderNum: null,
      clientName: null,
      deliveryAt: null,
      printedAt: null,
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

  // Calculer les pages : chaque feuille = 5 zones, x2 = 2 zones
  const pages = useMemo(() => {
    const selectedMsgs = allMessages.filter(m => selected.has(m.id))
    const pages = []
    let currentPage = []
    let currentZones = 0

    for (const msg of selectedMsgs) {
      const zones = doubleSize.has(msg.id) ? 2 : 1
      if (currentZones + zones > 5) {
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

  // Imprimer : ouvrir window.print apres avoir genere le HTML
  async function handlePrint() {
    if (pages.length === 0) {
      alert('Aucun message selectionne')
      return
    }
    const html = buildPrintHtml(pages)
    const w = window.open('', '_blank', 'width=400,height=900')
    if (!w) { alert('Popup bloquee'); return }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => {
      w.print()
    }, 500)

    // Marquer comme imprimes (les messages depuis commandes seulement)
    const toMark = allMessages.filter(m => selected.has(m.id) && m.type === 'order' && !m.printedAt)
    for (const msg of toMark) {
      try {
        await markMessagePrinted(msg.sourceKey, getMessageText(msg), user.id)
      } catch (e) {
        console.error('[markMessagePrinted]', e)
      }
    }
    refresh()
  }

  function buildPrintHtml(pages) {
    const renderMsg = (msg, zones) => {
      const text = getMessageText(msg)
      const ar = isArabic(text)
      const fontFamily = ar ? arabicFont.css : latinFont.css
      const layout = detectBirthdayLayout(text)
      const heightCm = zones === 2 ? 11.88 : 5.94

      let inner
      if (layout) {
        // Format anniversaire : greeting petit en haut, nom plus gros
        const nameSize = zones === 2 ? 56 : 36
        inner = `
          <div style="font-family: ${fontFamily}; font-size: ${zones === 2 ? 28 : 20}px; line-height: 1; ${ar ? 'direction: rtl;' : ''}">${escapeHtml(layout.greeting)}</div>
          <div style="font-family: ${fontFamily}; font-size: ${nameSize}px; line-height: 1.1; margin-top: 4mm; ${ar ? 'direction: rtl;' : ''}">${escapeHtml(layout.name)}</div>
        `
      } else {
        // Texte libre : pas d'agrandissement
        const size = zones === 2 ? 32 : 22
        inner = `<div style="font-family: ${fontFamily}; font-size: ${size}px; line-height: 1.3; ${ar ? 'direction: rtl;' : ''}">${escapeHtml(text)}</div>`
      }
      return `<div class="msg" style="height: ${heightCm}cm;">${inner}<div class="cut"></div></div>`
    }

    const renderPage = (items) => {
      let usedZones = 0
      const html = items.map(({ msg, zones }) => {
        usedZones += zones
        return renderMsg(msg, zones)
      }).join('')
      const remaining = 5 - usedZones
      const emptyHeightCm = remaining * 5.94
      const emptyHtml = remaining > 0 ? `<div class="empty" style="height: ${emptyHeightCm}cm;"></div>` : ''
      return `<div class="page">${html}${emptyHtml}</div>`
    }

    const css = `
      @page { size: 100mm 297mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { font-family: sans-serif; }
      .page {
        width: 100mm; height: 297mm;
        padding: 4mm; display: flex; flex-direction: column;
        page-break-after: always;
      }
      .page:last-child { page-break-after: auto; }
      .msg {
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        text-align: center;
        padding: 4mm;
        position: relative;
      }
      .cut {
        position: absolute; bottom: 0; left: 4mm; right: 4mm;
        border-top: 1px dashed #888;
      }
      .empty { /* zone vide, pas de pointille */ }
      @media screen {
        body { background: #ddd; padding: 20px; }
        .page { background: white; margin: 0 auto 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
      }
    `
    const pagesHtml = pages.map(renderPage).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquettes</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Pacifico&family=Dancing+Script:wght@400;700&family=Sacramento&family=Amiri:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Reem+Kufi:wght@400;700&family=El+Messiri:wght@400;700&family=Tajawal:wght@400;700&display=swap">
      <style>${css}</style></head><body>${pagesHtml}</body></html>`
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="max-w-6xl mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💌</span>
          <h1 className="font-mono text-[14px] tracking-[0.15em] uppercase text-bordeaux font-bold">
            Messages
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPrinted(!showPrinted)}
            className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
              showPrinted
                ? 'bg-bordeaux text-cream border-bordeaux'
                : 'border-line text-ink-soft hover:border-bordeaux'
            }`}
          >
            {showPrinted ? '✓ Voir imprimés' : 'Voir imprimés'}
          </button>
          <button
            onClick={selectAll}
            className="text-[11px] px-3 py-1.5 rounded-full border border-line text-ink-soft hover:border-bordeaux"
          >
            Tout cocher
          </button>
          <button
            onClick={clearAll}
            className="text-[11px] px-3 py-1.5 rounded-full border border-line text-ink-soft hover:border-bordeaux"
          >
            Tout décocher
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
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
                value={freeText}
                onChange={e => setFreeText(e.target.value)}
                placeholder="Tapez votre message..."
                className="w-full text-[13px] p-2 border border-line rounded resize-y min-h-[60px] mb-2"
                autoFocus
              />
              <div className="flex flex-wrap gap-1 mb-2">
                {EMOJI_PICKER.map(e => (
                  <button
                    key={e}
                    onClick={() => setFreeText(t => t + e)}
                    className="text-[16px] px-1.5 py-0.5 hover:bg-cream rounded"
                  >{e}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addFreeMessage}
                  className="text-[11px] px-3 py-1 bg-bordeaux text-cream rounded"
                >Ajouter</button>
                <button
                  onClick={() => { setShowFreeForm(false); setFreeText('') }}
                  className="text-[11px] px-3 py-1 border border-line rounded text-ink-mute"
                >Annuler</button>
              </div>
            </div>
          )}

          {/* Messages libres */}
          {freeMessages.length > 0 && (
            <div className="mb-4">
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-bordeaux mb-2">Messages libres</div>
              {freeMessages.map(msg => (
                <MessageItem
                  key={msg.id}
                  msg={msg}
                  selected={selected.has(msg.id)}
                  doubleSize={doubleSize.has(msg.id)}
                  text={getMessageText(msg)}
                  onToggle={() => toggleSelect(msg.id)}
                  onToggleDouble={() => toggleDouble(msg.id)}
                  onTextChange={t => setMessageText(msg.id, t)}
                  onRemove={() => removeFreeMessage(msg.id)}
                />
              ))}
            </div>
          )}

          {/* Messages par jour */}
          {loading ? (
            <div className="text-center text-ink-mute italic py-8">Chargement...</div>
          ) : sortedDays.length === 0 ? (
            <div className="text-center text-ink-mute italic py-8">
              {freeMessages.length === 0 ? 'Aucun message dans les commandes des 7 prochains jours' : ''}
            </div>
          ) : (
            sortedDays.map(dayKey => {
              const dayMsgs = groupedByDay.get(dayKey) || []
              const date = new Date(dayKey + 'T00:00:00')
              const dayLabel = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
              return (
                <div key={dayKey} className="mb-5">
                  <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-bordeaux mb-2">
                    {dayLabel} <span className="text-ink-mute">({dayMsgs.length})</span>
                  </div>
                  <div className="space-y-2">
                    {dayMsgs.map(msg => (
                      <MessageItem
                        key={msg.id}
                        msg={msg}
                        selected={selected.has(msg.id)}
                        doubleSize={doubleSize.has(msg.id)}
                        text={getMessageText(msg)}
                        onToggle={() => toggleSelect(msg.id)}
                        onToggleDouble={() => toggleDouble(msg.id)}
                        onTextChange={t => setMessageText(msg.id, t)}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Aperçu droite */}
        <div className="space-y-3 lg:sticky lg:top-20 self-start">
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-bordeaux">
            Aperçu ({pages.length} feuille{pages.length > 1 ? 's' : ''})
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {pages.length === 0 ? (
              <div className="text-center text-ink-mute italic text-[11px] py-4 border border-dashed border-line rounded">
                Cochez des messages
              </div>
            ) : (
              pages.map((page, i) => (
                <PagePreview
                  key={i}
                  pageItems={page}
                  latinFont={latinFont}
                  arabicFont={arabicFont}
                  getText={getMessageText}
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

          <button
            onClick={handlePrint}
            disabled={selected.size === 0}
            className="w-full py-2 bg-bordeaux hover:bg-bordeaux-deep text-cream rounded text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🖨 Imprimer ({selected.size} message{selected.size > 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Sous-composants
// ============================================================

function MessageItem({ msg, selected, doubleSize, text, onToggle, onToggleDouble, onTextChange, onRemove }) {
  const [editing, setEditing] = useState(false)
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
            {msg.printedAt && <span className="bg-green-100 text-green-800 text-[9px] px-1.5 py-0.5 rounded-full">imprimé</span>}
            {msg.type === 'free' && <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded-full">libre</span>}
          </div>
          {editing ? (
            <input
              type="text"
              value={text}
              onChange={e => onTextChange(e.target.value)}
              onBlur={() => setEditing(false)}
              onKeyDown={e => { if (e.key === 'Enter') setEditing(false) }}
              autoFocus
              className="w-full text-[13px] border border-bordeaux rounded px-1.5 py-0.5"
              style={ar ? { direction: 'rtl', textAlign: 'right' } : {}}
            />
          ) : (
            <div
              className="text-[13px] font-medium text-ink"
              style={ar ? { direction: 'rtl', textAlign: 'right' } : {}}
            >{text}</div>
          )}
          {msg.type === 'order' && msg.raw !== text && (
            <div className="text-[10px] text-ink-mute italic mt-0.5">Original : {msg.raw}</div>
          )}
        </div>

        <div className="flex flex-col gap-1 flex-shrink-0">
          <button
            onClick={() => setEditing(true)}
            className="text-[10px] px-2 py-0.5 border border-line rounded text-ink-mute hover:border-bordeaux hover:text-bordeaux"
            title="Modifier"
          >✎</button>
          <button
            onClick={onToggleDouble}
            className={`text-[10px] px-2 py-0.5 rounded border ${
              doubleSize
                ? 'bg-amber-100 text-amber-800 border-amber-400'
                : 'border-line text-ink-mute hover:border-bordeaux'
            }`}
            title="Double taille (occupe 2 zones)"
          >{doubleSize ? 'x2' : 'x1'}</button>
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-[10px] px-2 py-0.5 border border-line rounded text-red-700 hover:border-red-400"
              title="Supprimer"
            >×</button>
          )}
        </div>
      </div>
    </div>
  )
}

function PagePreview({ pageItems, latinFont, arabicFont, getText }) {
  const usedZones = pageItems.reduce((s, p) => s + p.zones, 0)
  const emptyZones = 5 - usedZones

  return (
    <div className="bg-white border border-line rounded shadow-sm" style={{ width: '120px', aspectRatio: '10/29.7', padding: '4px', display: 'flex', flexDirection: 'column', margin: '0 auto' }}>
      {pageItems.map(({ msg, zones }, i) => {
        const text = getText(msg)
        const ar = isArabic(text)
        const fontFamily = ar ? arabicFont.css : latinFont.css
        const layout = detectBirthdayLayout(text)

        return (
          <div key={msg.id} style={{
            flex: zones,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '3px', position: 'relative',
            borderBottom: '1px dashed #b0b0b0',
          }}>
            {layout ? (
              <>
                <div style={{
                  fontFamily, fontSize: zones === 2 ? '12px' : '8px',
                  textAlign: 'center', lineHeight: 1,
                  direction: ar ? 'rtl' : 'ltr',
                }}>{layout.greeting}</div>
                <div style={{
                  fontFamily, fontSize: zones === 2 ? '20px' : '13px',
                  textAlign: 'center', lineHeight: 1.1, marginTop: '2px',
                  direction: ar ? 'rtl' : 'ltr',
                }}>{layout.name}</div>
              </>
            ) : (
              <div style={{
                fontFamily, fontSize: zones === 2 ? '14px' : '10px',
                textAlign: 'center', lineHeight: 1.2,
                direction: ar ? 'rtl' : 'ltr',
              }}>{text}</div>
            )}
          </div>
        )
      })}
      {emptyZones > 0 && <div style={{ flex: emptyZones }} />}
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
