import { useState, useEffect } from 'react'
import { VENTE_CATEGORIES, loadSalesLinesForDate, groupByHourThenClient, groupByProduct, groupDeliveriesWithFullOrder, groupAllOrdersByHour, filterLines, sumQty, linesForCategory as linesForCategoryHelper } from '../lib/salesLines'

// ============================================================
// Helper : genere le HTML d'UNE categorie pour impression
// Mode 'product' : liste agregee par produit
// Mode 'hour-client' : groupe par heure -> client -> produits
// Mode 'delivery' : pour chaque commande livraison, affiche TOUTES ses lignes
// ============================================================
function renderCategoryHtml(cat, catLines, dateLabel, isLast, allLines = []) {
  if (catLines.length === 0) return ''

  let html = `<div class="cat-page">
    <div class="header">
      <h1>${cat.label}</h1>
      <div class="date">${dateLabel}</div>
    </div>
    <div class="content">`

  if (cat.viewMode === 'product') {
    // Vue agregee par produit
    const grouped = groupByProduct(catLines)
    for (const [, entry] of grouped.entries()) {
      html += `<div class="item"><span class="qty">×${entry.totalQty}</span> ${entry.product_name}</div>`
    }
  } else if (cat.viewMode === 'delivery') {
    // Vue livraison : pour chaque commande LIVR, montre TOUTES les lignes
    const grouped = groupDeliveriesWithFullOrder(catLines, allLines)
    for (const [hour, clientMap] of grouped.entries()) {
      html += `<div class="hour">${hour}</div>`
      for (const [, entry] of clientMap.entries()) {
        const orderTag = entry.orderNum ? `<span class="ordernum">${entry.orderNum}</span> — ` : ''
        html += `<div class="client">${orderTag}${entry.clientName}</div>`
        for (const item of entry.items) {
          html += `<div class="item"><span class="qty">×${item.quantity}</span> ${item.product_name}</div>`
        }
      }
    }
  } else if (cat.viewMode === 'delivery-all') {
    // Vue Toutes commandes : toutes les commandes du jour, toutes leurs lignes
    const grouped = groupAllOrdersByHour(catLines)
    for (const [hour, clientMap] of grouped.entries()) {
      html += `<div class="hour">${hour}</div>`
      for (const [, entry] of clientMap.entries()) {
        const orderTag = entry.orderNum ? `<span class="ordernum">${entry.orderNum}</span> — ` : ''
        html += `<div class="client">${orderTag}${entry.clientName}</div>`
        for (const item of entry.items) {
          html += `<div class="item"><span class="qty">×${item.quantity}</span> ${item.product_name}</div>`
        }
      }
    }
  } else {
    // Vue heure -> client -> produits (par defaut)
    const grouped = groupByHourThenClient(catLines)
    for (const [hour, clientMap] of grouped.entries()) {
      html += `<div class="hour">${hour}</div>`
      for (const [, entry] of clientMap.entries()) {
        const orderTag = entry.orderNum ? `<span class="ordernum">${entry.orderNum}</span> — ` : ''
        html += `<div class="client">${orderTag}${entry.clientName}</div>`
        for (const item of entry.items) {
          html += `<div class="item"><span class="qty">×${item.quantity}</span> ${item.product_name}</div>`
        }
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
  body { font-family: -apple-system, sans-serif; color: #1a1a1a; background: white; font-size: 10px; }
  .cat-page { padding: 0; page-break-after: always; break-after: page; }
  .cat-page:last-child { page-break-after: auto; break-after: auto; }
  .header { display: flex; justify-content: space-between; align-items: baseline;
            border-bottom: 1px solid #a8324b; padding-bottom: 4px; margin-bottom: 8px; }
  h1 { font-size: 14px; color: #a8324b; font-weight: 600; }
  .date { font-size: 10px; color: #666; }
  .content { font-size: 10px; line-height: 1.35; }
  .hour { font-weight: 600; color: #555; margin-top: 6px; padding-bottom: 1px;
          border-bottom: 0.5px solid #ddd; font-size: 9px; }
  .client { margin-left: 8px; font-weight: 500; color: #333; margin-top: 2px; font-size: 10px; }
  .ordernum { font-family: monospace; font-size: 9px; color: #a8324b; font-weight: 600; letter-spacing: 0.4px; }
  .item { margin-left: 16px; color: #555; }
  .qty { display: inline-block; min-width: 26px; font-weight: 600; color: #a8324b; }
  @page { size: A4 portrait; margin: 1.2cm; }
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
// 3 modes : 'product' (agrege), 'hour-client' (heure>client>items), 'delivery' (heure>cmd>tt items)
// ============================================================
function CategoryPopup({ cat, lines, allLines, dateLabel, onClose }) {
  const total = sumQty(lines)
  const isProductMode = cat.viewMode === 'product'
  const isDeliveryMode = cat.viewMode === 'delivery'
  const isDeliveryAllMode = cat.viewMode === 'delivery-all'

  function handlePrintThisOne() {
    const html = renderCategoryHtml(cat, lines, dateLabel, true, allLines)
    printHtml(html, `${cat.label} - ${dateLabel}`)
  }

  // Pre-calcule le contenu groupe selon le mode
  let groupedHourClient = null
  if (!isProductMode) {
    if (isDeliveryMode) {
      groupedHourClient = groupDeliveriesWithFullOrder(lines, allLines)
    } else if (isDeliveryAllMode) {
      groupedHourClient = groupAllOrdersByHour(lines)
    } else {
      groupedHourClient = groupByHourThenClient(lines)
    }
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
          ) : isProductMode ? (
            // Vue agregee par produit (PROD)
            <div className="space-y-1">
              {[...groupByProduct(lines).entries()].map(([name, entry]) => (
                <div key={name} className="flex gap-3 py-1.5 border-b border-line/30 last:border-0">
                  <span className="font-bold text-bordeaux min-w-[40px] text-[14px]">×{entry.totalQty}</span>
                  <span className="text-[13px] text-ink">{entry.product_name}</span>
                </div>
              ))}
            </div>
          ) : (
            // Vue heure -> (client+orderNum) -> produits — utilisee par hour-client ET delivery
            <div className="space-y-3">
              {[...groupedHourClient.entries()].map(([hour, clientMap]) => (
                <div key={hour} className="border-b border-line/50 pb-3 last:border-0">
                  <div className="font-mono text-[11px] font-semibold text-ink-mute tracking-wider uppercase mb-2">
                    {hour}
                  </div>
                  {[...clientMap.entries()].map(([key, entry]) => (
                    <div key={key} className="ml-2 mb-2">
                      <div className="text-[13px] font-semibold mb-0.5 flex gap-2 items-baseline">
                        {entry.orderNum && (
                          <span className="font-mono text-[10px] text-bordeaux tracking-wider">
                            {entry.orderNum}
                          </span>
                        )}
                        <span className="text-ink">— {entry.clientName}</span>
                      </div>
                      {entry.items.map(item => (
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
// ============================================================
// Composant principal
// Mode "popup" (par defaut) : ouvert depuis le calendrier admin, bouton ✕ pour fermer
// Mode "fullscreen" : utilisateur avec role 'recap' qui n'a que cette page,
//                     pas de bouton fermer, mais bouton "Déconnexion"
// ============================================================
export default function RecapVentes({ onClose, user = null, onLogout = null, fullscreen = false }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(todayStr)
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [popupCat, setPopupCat] = useState(null)
  // Filtres : pour chaque (clients/articles) un mode + un champ de termes
  // mode : 'contains' (=garder uniquement les lignes qui matchent)
  //        'not_contains' (=retirer les lignes qui matchent)
  const [clientsMode, setClientsMode] = useState('not_contains')
  const [clientsTerms, setClientsTerms] = useState('')
  const [articlesMode, setArticlesMode] = useState('not_contains')
  const [articlesTerms, setArticlesTerms] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      const data = await loadSalesLinesForDate(date)
      setLines(data)
      setLoading(false)
    })()
  }, [date])

  // Lignes apres application des filtres (utilise pour les vues + popups + impression)
  const filteredLines = filterLines(lines, { clientsMode, clientsTerms, articlesMode, articlesTerms })
  const isFiltered = clientsTerms.trim() !== '' || articlesTerms.trim() !== ''

  function linesForCategory(catId) {
    const cat = VENTE_CATEGORIES.find(c => c.id === catId)
    if (!cat) return []
    return linesForCategoryHelper(filteredLines, cat)
  }

  // Version non filtree, pour calculer le total complet (Option C : 7/9)
  function linesForCategoryFull(catId) {
    const cat = VENTE_CATEGORIES.find(c => c.id === catId)
    if (!cat) return []
    return linesForCategoryHelper(lines, cat)
  }

  const dateLabel = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  // Imprime TOUTES les categories non vides (1 par page)
  function handlePrintAll() {
    let html = ''
    for (const cat of VENTE_CATEGORIES) {
      const catLines = linesForCategory(cat.id)
      html += renderCategoryHtml(cat, catLines, dateLabel, false, filteredLines)
    }
    if (!html) {
      alert('Aucune vente a imprimer pour cette date')
      return
    }
    printHtml(html, `Recap ventes - ${dateLabel}`)
  }

  return (
    <>
      <div className={fullscreen
          ? "min-h-screen bg-cream"
          : "fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm overflow-y-auto p-4"}>
        <div className={fullscreen
            ? "max-w-7xl mx-auto"
            : "max-w-7xl mx-auto bg-cream rounded-2xl shadow-2xl border border-line my-4"}>

          {/* Header principal */}
          <div className={fullscreen
              ? "bg-cream border-b border-line px-6 py-4 flex items-center justify-between gap-3 flex-wrap"
              : "sticky top-4 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between gap-3 flex-wrap z-10"}>
            <div className="flex items-center gap-3">
              <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-bold">RECAP</div>
              <h2 className="font-fraunces italic text-[24px] font-medium text-ink">Récap des ventes</h2>
              {fullscreen && user?.full_name && (
                <span className="text-[12px] text-ink-mute italic ml-2">— {user.full_name}</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                     className="px-3 py-2 border border-line rounded-full text-[13px] bg-cream focus:outline-none focus:border-bordeaux"/>
              <button onClick={handlePrintAll}
                      className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all">
                🖨️ Tout imprimer
              </button>
              {fullscreen ? (
                <button onClick={onLogout}
                        className="px-4 py-2 border border-line text-ink-soft rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux hover:text-cream hover:border-bordeaux transition-all">
                  Déconnexion
                </button>
              ) : (
                <button onClick={onClose}
                        className="w-9 h-9 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all">
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Barre de filtres */}
          <div className="bg-cream/60 border-b border-line px-6 py-3 flex flex-col gap-2 text-[12px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] tracking-[0.15em] uppercase font-bold text-bordeaux w-[60px]">Clients</span>
              <select
                value={clientsMode}
                onChange={e => setClientsMode(e.target.value)}
                className="px-2 py-1 border border-line rounded-full bg-cream/80 focus:outline-none focus:border-bordeaux text-[11px]"
              >
                <option value="contains">Contient</option>
                <option value="not_contains">Ne contient pas</option>
              </select>
              <input
                type="text"
                value={clientsTerms}
                onChange={e => setClientsTerms(e.target.value)}
                placeholder={clientsMode === 'contains' ? 'agdal, souissi...' : 'vitrine, magasin...'}
                className="flex-1 min-w-[180px] px-2.5 py-1 border border-line rounded-full bg-cream/80 focus:outline-none focus:border-bordeaux"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] tracking-[0.15em] uppercase font-bold text-bordeaux w-[60px]">Articles</span>
              <select
                value={articlesMode}
                onChange={e => setArticlesMode(e.target.value)}
                className="px-2 py-1 border border-line rounded-full bg-cream/80 focus:outline-none focus:border-bordeaux text-[11px]"
              >
                <option value="contains">Contient</option>
                <option value="not_contains">Ne contient pas</option>
              </select>
              <input
                type="text"
                value={articlesTerms}
                onChange={e => setArticlesTerms(e.target.value)}
                placeholder={articlesMode === 'contains' ? 'fraisier, framboisier...' : 'bougies, déco...'}
                className="flex-1 min-w-[180px] px-2.5 py-1 border border-line rounded-full bg-cream/80 focus:outline-none focus:border-bordeaux"
              />
              {isFiltered && (
                <>
                  <button
                    onClick={() => { setClientsTerms(''); setArticlesTerms('') }}
                    className="px-2.5 py-1 text-bordeaux hover:bg-bordeaux/10 rounded-full text-[11px] font-medium"
                  >
                    ✕ Réinitialiser
                  </button>
                  <span className="text-[11px] text-ink-mute italic">
                    {filteredLines.length} / {lines.length} lignes
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Cases cliquables (8 categories) */}
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {loading ? (
              <div className="col-span-full text-center text-ink-mute italic py-12">Chargement...</div>
            ) : VENTE_CATEGORIES.map(cat => {
              const catLines = linesForCategory(cat.id)
              const catLinesFull = linesForCategoryFull(cat.id)
              const total = sumQty(catLines)
              const totalFull = sumQty(catLinesFull)
              const showSlash = isFiltered && total !== totalFull

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
                    <span className="font-fraunces italic text-[22px] font-semibold text-ink">
                      {total}
                      {showSlash && (
                        <span className="text-[14px] text-ink-mute font-normal ml-0.5">
                          /{totalFull}
                        </span>
                      )}
                    </span>
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
          allLines={filteredLines}
          dateLabel={dateLabel}
          onClose={() => setPopupCat(null)}
        />
      )}
    </>
  )
}
