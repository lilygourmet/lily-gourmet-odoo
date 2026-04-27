import { useState, useEffect } from 'react'
import { VENTE_CATEGORIES, loadSalesLinesForDate, groupByHourThenClient, sumQty } from '../lib/salesLines'

// ============================================================
// Helper : genere le HTML d'UNE categorie pour impression
// ============================================================
function renderCategoryHtml(cat, catLines, dateLabel, isLast) {
  if (catLines.length === 0) return ''

  const total = sumQty(catLines)
  const grouped = groupByHourThenClient(catLines)

  let html = `<div class="cat-page">
    <div class="header">
      <h1>${cat.emoji} ${cat.label}</h1>
      <div class="date">${dateLabel}</div>
    </div>
    <div class="total-row">Total : <span class="total-qty">${total}</span></div>
    <div class="content">`

  for (const [hour, clientMap] of grouped.entries()) {
    html += `<div class="hour">${hour}</div>`
    for (const [client, items] of clientMap.entries()) {
      html += `<div class="client">${client}</div>`
      for (const item of items) {
        html += `<div class="item"><span class="qty">×${item.quantity}</span> ${item.product_name}</div>`
      }
    }
  }

  html += `</div></div>`
  return html
}

// ============================================================
// Helper : ouvre une iframe d'impression avec un HTML donne
// ============================================================
function printHtml(htmlBody, title) {
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; color: #1a1a1a; background: white; }
  .cat-page { padding: 0; page-break-after: always; break-after: page; }
  .cat-page:last-child { page-break-after: auto; break-after: auto; }
  .header { border-bottom: 1.5px solid #a8324b; padding-bottom: 12px; margin-bottom: 16px; }
  h1 { font-size: 22px; color: #a8324b; margin-bottom: 4px; }
  .date { font-size: 12px; color: #666; }
  .total-row { font-size: 14px; font-weight: 600; margin-bottom: 16px; padding: 8px 12px;
               background: #fff8e7; border-radius: 4px; border: 0.5px solid #f0e0a0; }
  .total-qty { color: #a8324b; font-size: 16px; }
  .content { font-size: 12px; line-height: 1.6; }
  .hour { font-weight: 600; color: #555; margin-top: 10px; padding-bottom: 2px;
          border-bottom: 0.5px solid #ddd; }
  .client { margin-left: 12px; font-weight: 500; color: #333; margin-top: 4px; }
  .item { margin-left: 24px; color: #555; }
  .qty { display: inline-block; min-width: 32px; font-weight: 600; color: #a8324b; }
  @page { size: A4 portrait; margin: 1.5cm; }
</style></head><body>${htmlBody}</body></html>`

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(fullHtml)
  doc.close()

  setTimeout(() => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    setTimeout(() => document.body.removeChild(iframe), 1000)
  }, 200)
}

// ============================================================
// Popup affiche le detail d'UNE categorie + bouton imprimer
// ============================================================
function CategoryPopup({ cat, lines, dateLabel, onClose }) {
  const total = sumQty(lines)
  const grouped = groupByHourThenClient(lines)

  function handlePrintThisOne() {
    const html = renderCategoryHtml(cat, lines, dateLabel, true)
    printHtml(html, `${cat.label} - ${dateLabel}`)
  }

  return (
    <div className="fixed inset-0 z-[60] bg-ink/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
         onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl border border-line"
           onClick={e => e.stopPropagation()}>

        {/* Header popup */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between gap-3 z-10">
          <div className="flex items-center gap-3">
            <span className="text-[24px]">{cat.emoji}</span>
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-bordeaux font-bold uppercase">
                {cat.label}
              </div>
              <div className="font-fraunces italic text-[20px] font-medium text-ink leading-tight">
                Total : {total}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrintThisOne}
                    className="px-3 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all">
              🖨️ Imprimer
            </button>
            <button onClick={onClose}
                    className="w-9 h-9 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all">
              ✕
            </button>
          </div>
        </div>

        {/* Contenu */}
        <div className="px-6 py-4">
          {lines.length === 0 ? (
            <div className="text-center text-ink-mute italic py-12">Aucune vente pour cette catégorie</div>
          ) : (
            <div className="space-y-3">
              {[...grouped.entries()].map(([hour, clientMap]) => (
                <div key={hour} className="border-b border-line/50 pb-3 last:border-0">
                  <div className="font-mono text-[11px] font-semibold text-ink-mute tracking-wider uppercase mb-2">
                    {hour}
                  </div>
                  {[...clientMap.entries()].map(([client, items]) => (
                    <div key={client} className="ml-2 mb-2">
                      <div className="text-[13px] text-ink font-semibold mb-0.5">{client}</div>
                      {items.map(item => (
                        <div key={item.id} className="ml-4 text-[12px] text-ink-soft flex gap-2">
                          <span className="font-bold text-bordeaux min-w-[32px]">×{item.quantity}</span>
                          <span>{item.product_name}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Composant principal
// ============================================================
export default function RecapVentes({ onClose }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(todayStr)
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [popupCat, setPopupCat] = useState(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      const data = await loadSalesLinesForDate(date)
      setLines(data)
      setLoading(false)
    })()
  }, [date])

  function linesForCategory(catId) {
    return lines.filter(l => l.category === catId)
  }

  const dateLabel = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  // Imprime TOUTES les categories non vides (1 par page)
  function handlePrintAll() {
    let html = ''
    for (const cat of VENTE_CATEGORIES) {
      const catLines = linesForCategory(cat.id)
      html += renderCategoryHtml(cat, catLines, dateLabel, false)
    }
    if (!html) {
      alert('Aucune vente a imprimer pour cette date')
      return
    }
    printHtml(html, `Recap ventes - ${dateLabel}`)
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm overflow-y-auto p-4">
        <div className="max-w-7xl mx-auto bg-cream rounded-2xl shadow-2xl border border-line my-4">

          {/* Header principal */}
          <div className="sticky top-4 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between gap-3 flex-wrap z-10">
            <div className="flex items-center gap-3">
              <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-bold">RECAP</div>
              <h2 className="font-fraunces italic text-[24px] font-medium text-ink">Récap des ventes</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                     className="px-3 py-2 border border-line rounded-full text-[13px] bg-cream focus:outline-none focus:border-bordeaux"/>
              <button onClick={handlePrintAll}
                      className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all">
                🖨️ Tout imprimer
              </button>
              <button onClick={onClose}
                      className="w-9 h-9 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all">
                ✕
              </button>
            </div>
          </div>

          {/* 7 cases cliquables */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loading ? (
              <div className="col-span-full text-center text-ink-mute italic py-12">Chargement...</div>
            ) : VENTE_CATEGORIES.map(cat => {
              const catLines = linesForCategory(cat.id)
              const total = sumQty(catLines)

              return (
                <button key={cat.id}
                        onClick={() => setPopupCat(cat)}
                        className="bg-white border border-line rounded-xl p-4 shadow-sm hover:shadow-md hover:border-bordeaux transition-all text-left cursor-pointer">
                  <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[18px]">{cat.emoji}</span>
                      <span className="font-mono text-[10px] tracking-[0.15em] uppercase font-bold text-bordeaux">
                        {cat.label}
                      </span>
                    </div>
                    <span className="font-fraunces italic text-[22px] font-semibold text-ink">{total}</span>
                  </div>

                  {catLines.length === 0 ? (
                    <div className="text-[12px] text-ink-mute italic text-center py-3">Aucune vente</div>
                  ) : (
                    <div className="text-[11px] text-ink-soft text-center py-2">
                      {catLines.length} ligne{catLines.length > 1 ? 's' : ''} · cliquez pour voir le détail
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Popup detail d'une categorie */}
      {popupCat && (
        <CategoryPopup
          cat={popupCat}
          lines={linesForCategory(popupCat.id)}
          dateLabel={dateLabel}
          onClose={() => setPopupCat(null)}
        />
      )}
    </>
  )
}
