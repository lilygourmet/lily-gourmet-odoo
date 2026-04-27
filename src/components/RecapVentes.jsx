import { useState, useEffect } from 'react'
import { VENTE_CATEGORIES, loadSalesLinesForDate, groupByHourThenClient, sumQty } from '../lib/salesLines'

export default function RecapVentes({ onClose }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(todayStr)
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)

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

  function handlePrint() {
    const dateLabel = new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    })

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Recap ventes - ${dateLabel}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 20px; color: #1a1a1a; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .date { color: #666; margin-bottom: 24px; font-size: 14px; }
  .cat { margin-bottom: 24px; page-break-inside: avoid; }
  .cat-title { font-size: 14px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;
               color: #a8324b; border-bottom: 1px solid #a8324b; padding-bottom: 4px; margin-bottom: 8px; }
  .total { font-weight: 600; color: #333; }
  .hour { margin-top: 8px; font-weight: 600; font-size: 13px; color: #555; }
  .client { margin-left: 12px; font-size: 12px; color: #666; }
  .item { margin-left: 24px; font-size: 12px; }
  .qty { display: inline-block; min-width: 32px; font-weight: 600; }
  @page { size: A4; margin: 1.5cm; }
</style></head><body>`

    html += `<h1>Recap ventes</h1><div class="date">${dateLabel}</div>`

    for (const cat of VENTE_CATEGORIES) {
      const catLines = linesForCategory(cat.id)
      if (catLines.length === 0) continue

      const total = sumQty(catLines)
      html += `<div class="cat"><div class="cat-title">${cat.emoji} ${cat.label} <span class="total">— Total: ${total}</span></div>`

      const grouped = groupByHourThenClient(catLines)
      for (const [hour, clientMap] of grouped.entries()) {
        html += `<div class="hour">${hour}</div>`
        for (const [client, items] of clientMap.entries()) {
          html += `<div class="client">${client}</div>`
          for (const item of items) {
            html += `<div class="item"><span class="qty">${item.quantity}</span> ${item.product_name}</div>`
          }
        }
      }
      html += `</div>`
    }

    html += `</body></html>`

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
    doc.write(html)
    doc.close()

    setTimeout(() => {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
      setTimeout(() => document.body.removeChild(iframe), 1000)
    }, 200)
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm overflow-y-auto p-4">
      <div className="max-w-7xl mx-auto bg-cream rounded-2xl shadow-2xl border border-line my-4">

        {/* Header */}
        <div className="sticky top-4 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between gap-3 flex-wrap z-10">
          <div className="flex items-center gap-3">
            <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-bold">RECAP</div>
            <h2 className="font-fraunces italic text-[24px] font-medium text-ink">Récap des ventes</h2>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
                   className="px-3 py-2 border border-line rounded-full text-[13px] bg-cream focus:outline-none focus:border-bordeaux"/>
            <button onClick={handlePrint}
                    className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all">
              🖨️ Imprimer
            </button>
            <button onClick={onClose}
                    className="w-9 h-9 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all">
              ✕
            </button>
          </div>
        </div>

        {/* 7 cases */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full text-center text-ink-mute italic py-12">Chargement...</div>
          ) : VENTE_CATEGORIES.map(cat => {
            const catLines = linesForCategory(cat.id)
            const total = sumQty(catLines)
            const grouped = groupByHourThenClient(catLines)

            return (
              <div key={cat.id} className="bg-white border border-line rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-line pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[18px]">{cat.emoji}</span>
                    <span className="font-mono text-[10px] tracking-[0.15em] uppercase font-bold text-bordeaux">
                      {cat.label}
                    </span>
                  </div>
                  <span className="font-fraunces italic text-[18px] font-semibold text-ink">{total}</span>
                </div>

                {catLines.length === 0 ? (
                  <div className="text-[12px] text-ink-mute italic text-center py-4">Aucune vente</div>
                ) : (
                  <div className="space-y-2">
                    {[...grouped.entries()].map(([hour, clientMap]) => (
                      <div key={hour}>
                        <div className="font-mono text-[10px] font-semibold text-ink-mute tracking-wider mb-1">
                          {hour}
                        </div>
                        {[...clientMap.entries()].map(([client, items]) => (
                          <div key={client} className="ml-2 mb-2">
                            <div className="text-[11px] text-ink font-medium">{client}</div>
                            {items.map(item => (
                              <div key={item.id} className="ml-3 text-[11px] text-ink-soft flex gap-2">
                                <span className="font-semibold text-bordeaux min-w-[28px]">×{item.quantity}</span>
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
            )
          })}
        </div>
      </div>
    </div>
  )
}
