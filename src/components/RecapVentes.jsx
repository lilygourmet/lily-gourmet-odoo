import { useState, useEffect } from 'react'
import { VENTE_CATEGORIES, loadSalesLinesForDate, groupByHourThenClient, groupByProduct, groupDeliveriesWithFullOrder, groupAllOrdersByHour, groupByProductWithDelivered, filterLines, sumQty, linesForCategory as linesForCategoryHelper } from '../lib/salesLines'
import { isLivreur } from '../lib/auth'
import { printArticleBatch, pingPrinter } from '../lib/printTicket'
import AppHeader from './AppHeader'

// ============================================================
// Helpers etiquettes par commande
// ============================================================

// Une ligne est "individuelle" si son nom contient "(1)" (taille 1 personne)
// Exemples : "[140] E- Fraisier (1)", "E-Pistache fleur d'oranger (1)"
function isIndivLine(item) {
  const name = item?.product_name || ''
  return /\(1\)/.test(name)
}

// Extrait le nom court d'un produit individuel
// "[140] E- Fraisier (1)" -> "Fraisier"
// "E-Cheesecake Exotique (1)" -> "Cheesecake Exotique"
function shortIndivName(productName) {
  return String(productName || '')
    .replace(/^\[\d+\]\s*/, '')   // retire [123]
    .replace(/^E-\s*/i, '')        // retire E-
    .replace(/\s*\(1\)\s*$/, '')   // retire (1)
    .replace(/\s+Message:.*$/, '') // retire Message: ...
    .trim()
}

// Separe les items en deux : non-indiv (cliquables individuellement) et indiv (groupes)
function splitItems(items) {
  const normal = []
  const indiv = []
  for (const it of items) {
    if (isIndivLine(it)) indiv.push(it)
    else normal.push(it)
  }
  return { normal, indiv }
}

// Total quantite indiv d'une commande
function sumIndivQty(items) {
  return items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
}

// Categories ou les lignes sont cliquables pour generer une etiquette
function isClickableCategory(cat) {
  return cat?.viewMode === 'hour-client' || cat?.viewMode === 'delivery-all'
}

// Extrait une URL Google Maps / Maps.app.goo / OpenStreetMap d'un texte
function extractMapsUrl(text) {
  if (!text) return null
  const re = /(https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps[^\s<>"]+|maps\.app\.goo\.gl\/[^\s<>"]+|maps\.google\.[a-z.]+\/[^\s<>"]+|goo\.gl\/maps\/[^\s<>"]+|openstreetmap\.org\/[^\s<>"]+|waze\.com\/[^\s<>"]+))/i
  const m = text.match(re)
  return m ? m[1] : null
}

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
  } else if (cat.viewMode === 'odoo-table') {
    // Vue Tableau Odoo : tableau Article / Cmd / Livré / Reste
    // Exclure clients 'vitrine' et lignes ou reste=0
    const filteredLines = catLines.filter(l => !/vitrine/i.test(l.client_name || ''))
    const grouped = groupByProductWithDelivered(filteredLines)
    let totalOrd = 0, totalDel = 0, totalRem = 0
    html += `<table class="odoo-table"><thead><tr>
      <th>Article</th><th class="num">Cmd</th><th class="num">Livré</th><th class="num">Reste</th>
    </tr></thead><tbody>`
    for (const [, entry] of grouped.entries()) {
      if (entry.remaining <= 0) continue  // Skip si tout livre
      totalOrd += entry.ordered
      totalDel += entry.delivered
      totalRem += entry.remaining
      html += `<tr>
        <td>${entry.name}</td>
        <td class="num">${entry.ordered}</td>
        <td class="num">${entry.delivered}</td>
        <td class="num">${entry.remaining}</td>
      </tr>`
    }
    html += `</tbody><tfoot><tr>
      <td><strong>Total</strong></td>
      <td class="num"><strong>${totalOrd}</strong></td>
      <td class="num"><strong>${totalDel}</strong></td>
      <td class="num"><strong>${totalRem}</strong></td>
    </tr></tfoot></table>`
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
  .odoo-table { width: 100%; border-collapse: collapse; font-size: 10px; }
  .odoo-table th { text-align: left; padding: 6px 4px; border-bottom: 1px solid #a8324b;
                   color: #a8324b; font-weight: 600; }
  .odoo-table th.num, .odoo-table td.num { text-align: right; }
  .odoo-table td { padding: 4px; border-bottom: 0.5px solid #eee; }
  .odoo-table tfoot td { border-top: 1px solid #a8324b; border-bottom: none;
                         padding-top: 6px; }
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
// ============================================================
// Sous-composant : vue tableau Odoo avec filtres internes
// (filtre additionnel en plus des filtres globaux deja appliques)
// ============================================================
function OdooTableView({ lines }) {
  // Filtres locaux par defaut : exclure 'vitrine' et lignes ou reste = 0
  const [clientsMode, setClientsMode] = useState('not_contains')
  const [clientsTerms, setClientsTerms] = useState('vitrine')
  const [articlesMode, setArticlesMode] = useState('contains')
  const [articlesTerms, setArticlesTerms] = useState('')

  const filtered = filterLines(lines, { clientsMode, clientsTerms, articlesMode, articlesTerms })
  const isFiltered = clientsTerms.trim() !== '' || articlesTerms.trim() !== ''

  // Filtrer aussi les lignes ou reste=0 (= tout livre, plus rien a faire)
  const groupedRaw = groupByProductWithDelivered(filtered)
  const grouped = new Map()
  for (const [k, e] of groupedRaw.entries()) {
    if (e.remaining > 0) grouped.set(k, e)
  }

  let totalOrd = 0, totalDel = 0, totalRem = 0
  const rows = [...grouped.entries()]
  for (const [, e] of rows) { totalOrd += e.ordered; totalDel += e.delivered; totalRem += e.remaining }

  return (
    <div>
      {/* Mini barre de filtres */}
      <div className="bg-cream/60 rounded-lg border border-line px-3 py-2 mb-4 flex flex-col gap-2 text-[11px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase font-bold text-bordeaux w-[55px]">Clients</span>
          <select value={clientsMode} onChange={e => setClientsMode(e.target.value)}
                  className="px-2 py-0.5 border border-line rounded-full bg-cream/80 focus:outline-none focus:border-bordeaux text-[10px]">
            <option value="contains">Contient</option>
            <option value="not_contains">Ne contient pas</option>
          </select>
          <input type="text" value={clientsTerms} onChange={e => setClientsTerms(e.target.value)}
                 placeholder={clientsMode === 'contains' ? 'agdal, souissi...' : 'vitrine, magasin...'}
                 className="flex-1 min-w-[140px] px-2 py-0.5 border border-line rounded-full bg-cream/80 focus:outline-none focus:border-bordeaux"/>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase font-bold text-bordeaux w-[55px]">Articles</span>
          <select value={articlesMode} onChange={e => setArticlesMode(e.target.value)}
                  className="px-2 py-0.5 border border-line rounded-full bg-cream/80 focus:outline-none focus:border-bordeaux text-[10px]">
            <option value="contains">Contient</option>
            <option value="not_contains">Ne contient pas</option>
          </select>
          <input type="text" value={articlesTerms} onChange={e => setArticlesTerms(e.target.value)}
                 placeholder={articlesMode === 'contains' ? 'fraisier...' : 'bougies, déco...'}
                 className="flex-1 min-w-[140px] px-2 py-0.5 border border-line rounded-full bg-cream/80 focus:outline-none focus:border-bordeaux"/>
          {isFiltered && (
            <button onClick={() => { setClientsTerms(''); setArticlesTerms('') }}
                    className="px-2 py-0.5 text-bordeaux hover:bg-bordeaux/10 rounded-full text-[10px] font-medium">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tableau */}
      {rows.length === 0 ? (
        <div className="text-center text-ink-mute italic py-8 text-[12px]">Aucun article ne correspond au filtre</div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-bordeaux">
              <th className="text-left py-2 font-mono text-[10px] tracking-wider uppercase text-bordeaux">Article</th>
              <th className="text-right py-2 font-mono text-[10px] tracking-wider uppercase text-bordeaux">Cmd</th>
              <th className="text-right py-2 font-mono text-[10px] tracking-wider uppercase text-bordeaux">Livré</th>
              <th className="text-right py-2 font-mono text-[10px] tracking-wider uppercase text-bordeaux">Reste</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, entry]) => (
              <tr key={name} className="border-b border-line/30">
                <td className="py-1.5 text-ink">{entry.name}</td>
                <td className="py-1.5 text-right text-ink">{entry.ordered}</td>
                <td className="py-1.5 text-right text-ink-soft">{entry.delivered}</td>
                <td className="py-1.5 text-right font-semibold text-bordeaux">{entry.remaining}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-bordeaux">
              <td className="py-2 font-semibold text-ink">Total</td>
              <td className="py-2 text-right font-semibold text-ink">{totalOrd}</td>
              <td className="py-2 text-right font-semibold text-ink">{totalDel}</td>
              <td className="py-2 text-right font-semibold text-bordeaux">{totalRem}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

function CategoryPopup({
  cat, lines, allLines, dateLabel, onClose,
  cart, onAddToCart, onRemoveFromCart, onClearCart, onDownloadCart, downloadingCart,
  onAddToPrintCart, printCartCount,
}) {
  const isProductMode = cat.viewMode === 'product'
  const isDeliveryMode = cat.viewMode === 'delivery'
  const isDeliveryAllMode = cat.viewMode === 'delivery-all'
  const isOdooTableMode = cat.viewMode === 'odoo-table'

  // Sous-popup pour choisir le nb d'etiquettes pour 1 article
  const [labelTask, setLabelTask] = useState(null)

  // Helper : trouve la date de livraison la plus probable pour un orderNum
  // (utile pour le ticket). On cherche dans les lignes affichees l'item correspondant.
  function findDeliveryAt(orderNum) {
    if (!orderNum) return null
    const found = (lines || []).find(l => l.order_num === orderNum)
    return found?.delivery_at || null
  }

  // Click sur un item : ouvre la popup "Combien de boites ?".
  // Le user choisit N, et on cree 1 entree dans le panier avec boxCount=N.
  // A l'impression, on demultipliera en N tickets numerotes 1/N, 2/N, ...
  function onPickItem(orderNum, clientName, item) {
    setLabelTask({
      mode: 'single',
      orderNum,
      clientName,
      productName: item.product_name,
      deliveryAt: item.delivery_at || findDeliveryAt(orderNum),
      quantity: item.quantity,
      defaultCount: 1,
    })
  }

  // Click sur "Individuels" : 1 ticket par sous-item, automatique (sans popup).
  function onPickIndiv(orderNum, clientName, indivItems) {
    if (!onAddToPrintCart) return
    const deliveryAt = findDeliveryAt(orderNum)
    for (const it of indivItems) {
      onAddToPrintCart({
        deliveryAt: it.delivery_at || deliveryAt,
        orderNum,
        clientName,
        productName: it.product_name,
        quantity: it.quantity,
        boxCount: 1,
      })
    }
  }

  // Total etiquettes dans le panier
  const totalLabels = cart.reduce((s, e) => s + (e.labelCount || 1), 0)

  const total = sumQty(lines)

  function handlePrintThisOne() {
    const html = renderCategoryHtml(cat, lines, dateLabel, true, allLines)
    printHtml(html, `${cat.label} - ${dateLabel}`)
  }

  // Pre-calcule le contenu groupe selon le mode
  let groupedHourClient = null
  if (!isProductMode && !isOdooTableMode) {
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
      <div className={`relative bg-cream rounded-2xl w-full ${isOdooTableMode ? 'max-w-3xl' : 'max-w-2xl'} max-h-[85vh] overflow-y-auto shadow-2xl border border-line`}
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
        <div className={`px-6 py-4 ${cart.length > 0 ? 'pb-[50vh]' : ''}`}>
          {lines.length === 0 ? (
            <div className="text-center text-ink-mute italic py-12">Aucune vente pour cette catégorie</div>
          ) : isOdooTableMode ? (
            <OdooTableView lines={lines} />
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
                    <ClientBlock
                      key={key}
                      entry={entry}
                      clickable={isClickableCategory(cat)}
                      showContact={isDeliveryMode}
                      onPickItem={onPickItem}
                      onPickIndiv={onPickIndiv}
                      onAddToPrintCart={onAddToPrintCart}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sous-popup pour choisir nb etiquettes (mode single uniquement) */}
      {labelTask && labelTask.mode === 'single' && (
        <LabelCountPopup
          task={labelTask}
          onClose={() => setLabelTask(null)}
          onConfirm={(count) => {
            // count = nombre de boites = nombre de tickets a imprimer pour cet article
            if (onAddToPrintCart) {
              onAddToPrintCart({
                deliveryAt: labelTask.deliveryAt,
                orderNum: labelTask.orderNum,
                clientName: labelTask.clientName,
                productName: labelTask.productName,
                quantity: labelTask.quantity,
                boxCount: count,
              })
            }
            setLabelTask(null)
          }}
        />
      )}

      {/* Barre panier en bas */}
      {cart.length > 0 && (
        <CartBar
          cart={cart}
          totalLabels={totalLabels}
          downloading={downloadingCart}
          onRemove={onRemoveFromCart}
          onClear={() => onClearCart()}
          onDownload={onDownloadCart}
        />
      )}
    </div>
  )
}

// ============================================================
// Bloc client : entete + items (clickable ou non) + indiv groupes
// ============================================================
function ClientBlock({ entry, clickable, showContact, onPickItem, onPickIndiv, onAddToPrintCart }) {
  const { normal, indiv } = splitItems(entry.items)
  const indivQty = sumIndivQty(indiv)
  const orderNum = entry.orderNum || ''
  const clientName = entry.clientName || ''
  const clientPhone = entry.clientPhone || null
  const orderNote = entry.orderNote || null
  const orderTotal = typeof entry.orderTotal === 'number' ? entry.orderTotal : null
  const orderAcompte = typeof entry.orderAcompte === 'number' ? entry.orderAcompte : null

  // Detection d'URL Google Maps dans la note
  const mapsUrl = orderNote ? extractMapsUrl(orderNote) : null

  // Format montant en DH sans centimes inutiles (1 900 DH au lieu de 1 900,00 DH)
  function fmtMad(v) {
    if (v === null || v === undefined || isNaN(v)) return ''
    const rounded = Math.round(Math.abs(v) * 100) / 100
    // Affiche avec virgule + centimes uniquement si non entier
    const formatted = Number.isInteger(rounded)
      ? rounded.toLocaleString('fr-FR')
      : rounded.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return `${v < 0 ? '−' : ''}${formatted} DH`
  }

  return (
    <div className="ml-2 mb-2">
      <div className="text-[13px] font-semibold mb-0.5 flex gap-2 items-baseline">
        {orderNum && (
          <span className="font-mono text-[10px] text-bordeaux tracking-wider">
            {orderNum}
          </span>
        )}
        <span className="text-ink">— {clientName}</span>
      </div>

      {/* Telephone + note : seulement en mode livraison */}
      {showContact && (clientPhone || orderNote) && (
        <div className="ml-2 mb-1 text-[11px] text-ink-soft flex flex-col gap-0.5">
          {clientPhone && (
            <a
              href={`tel:${clientPhone.replace(/\s/g, '')}`}
              className="text-bordeaux hover:underline"
              onClick={e => e.stopPropagation()}
            >
              📞 {clientPhone}
            </a>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-bordeaux hover:underline"
              onClick={e => e.stopPropagation()}
            >
              📍 Voir sur Maps
            </a>
          )}
          {orderNote && !mapsUrl && (
            <div className="text-ink-mute italic whitespace-pre-wrap">
              {orderNote}
            </div>
          )}
        </div>
      )}

      {/* Montants Total / Acompte / Reste : seulement en mode livraison */}
      {showContact && orderTotal !== null && orderTotal > 0 && (() => {
        const acompte = orderAcompte || 0
        const reste = orderTotal - acompte
        // Cas 1 : pas d'acompte -> "1 900 DH a encaisser"
        if (acompte === 0) {
          return (
            <div className="ml-2 mb-1 text-[11px] flex items-center gap-1.5">
              <span className="font-mono tracking-wide text-bordeaux font-medium">
                {fmtMad(orderTotal)}
              </span>
              <span className="text-ink-mute">à encaisser</span>
            </div>
          )
        }
        // Cas 2 : reste exactement 0 -> commande payee
        if (Math.abs(reste) < 0.01) {
          return (
            <div className="ml-2 mb-1 text-[11px] flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-ink-soft">{fmtMad(orderTotal)}</span>
              <span className="text-ink-mute">·</span>
              <span className="text-ink-mute">acompte</span>
              <span className="font-mono text-ink-soft">{fmtMad(acompte)}</span>
              <span className="text-ink-mute">·</span>
              <span className="text-success font-medium">payé</span>
            </div>
          )
        }
        // Cas 3 : reste > 0 -> "reste 400 DH"
        if (reste > 0) {
          return (
            <div className="ml-2 mb-1 text-[11px] flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-ink-soft">{fmtMad(orderTotal)}</span>
              <span className="text-ink-mute">·</span>
              <span className="text-ink-mute">acompte</span>
              <span className="font-mono text-ink-soft">{fmtMad(acompte)}</span>
              <span className="text-ink-mute">·</span>
              <span className="text-ink-mute">reste</span>
              <span className="font-mono text-bordeaux font-medium">{fmtMad(reste)}</span>
            </div>
          )
        }
        // Cas 4 : reste < 0 -> trop percu, a rendre
        return (
          <div className="ml-2 mb-1 text-[11px] flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-ink-soft">{fmtMad(orderTotal)}</span>
            <span className="text-ink-mute">·</span>
            <span className="text-ink-mute">acompte</span>
            <span className="font-mono text-ink-soft">{fmtMad(acompte)}</span>
            <span className="text-ink-mute">·</span>
            <span className="text-success font-medium">{fmtMad(Math.abs(reste))} à rendre</span>
          </div>
        )
      })()}

      {/* Items normaux : cliquables si la categorie le permet */}
      {normal.map(item => (
        clickable ? (
          <button
            key={item.id}
            onClick={() => onPickItem(orderNum, clientName, item)}
            className="ml-4 text-[12px] text-bordeaux font-medium flex gap-2 hover:bg-bordeaux/10 px-2 py-1 rounded transition-colors text-left w-full"
          >
            <span className="font-mono min-w-[32px]">×{item.quantity}</span>
            <span>{item.product_name}</span>
          </button>
        ) : (
          <div key={item.id} className="ml-4 text-[12px] text-ink-soft flex gap-2">
            <span className="font-bold text-bordeaux min-w-[32px]">×{item.quantity}</span>
            <span>{item.product_name}</span>
          </div>
        )
      ))}

      {/* Indiv : ligne unique cliquable + detail dessous */}
      {indiv.length > 0 && (
        <>
          {clickable ? (
            <button
              onClick={() => onPickIndiv(orderNum, clientName, indiv)}
              className="ml-4 text-[12px] text-bordeaux font-medium flex gap-2 hover:bg-bordeaux/10 px-2 py-1 rounded transition-colors text-left w-full"
            >
              <span className="font-mono min-w-[32px]">×{indivQty}</span>
              <span>Individuels</span>
            </button>
          ) : (
            <div className="ml-4 text-[12px] text-ink-soft flex gap-2">
              <span className="font-bold text-bordeaux min-w-[32px]">×{indivQty}</span>
              <span>Individuels</span>
            </div>
          )}
          <div className="ml-12 text-[11px] text-ink-mute leading-relaxed">
            {indiv.map(it => (
              <div key={it.id}>
                {it.quantity} {shortIndivName(it.product_name)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// Sous-popup : choisir le nombre d'etiquettes
// ============================================================
function LabelCountPopup({ task, onClose, onConfirm }) {
  const [count, setCount] = useState(task.defaultCount || 1)
  const cleanProduct = String(task.productName || '').replace(/^\[\d+\]\s*/, '')

  return (
    <div
      className="fixed inset-0 z-[70] bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-cream rounded-2xl p-5 w-full max-w-sm shadow-2xl border border-line"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-fraunces italic text-[18px] text-ink mb-1">Imprimer tickets</h3>
        <div className="text-[11px] text-ink-mute mb-3 font-mono">
          {task.orderNum} · {task.clientName}
        </div>

        <div className="bg-cream-warm border border-line rounded-md px-3 py-2 mb-4 text-[12px] text-ink">
          {cleanProduct}
        </div>

        <div className="text-[11px] text-ink-soft mb-2">Combien de boîtes ?</div>
        <div className="flex items-center justify-between border border-bordeaux rounded-md mb-4">
          <button
            type="button"
            onClick={() => setCount(c => Math.max(1, c - 1))}
            className="px-4 py-2 text-bordeaux hover:bg-bordeaux/5 text-[18px]"
          >−</button>
          <input
            type="number"
            min="1"
            max="99"
            value={count}
            onChange={e => {
              const v = parseInt(e.target.value, 10)
              if (isNaN(v)) setCount(1)
              else setCount(Math.max(1, Math.min(99, v)))
            }}
            onFocus={e => e.target.select()}
            className="text-[18px] font-bold text-center bg-transparent border-none outline-none w-16"
          />
          <button
            type="button"
            onClick={() => setCount(c => Math.min(99, c + 1))}
            className="px-4 py-2 text-bordeaux hover:bg-bordeaux/5 text-[18px]"
          >+</button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 border border-line rounded-full text-[12px] text-ink-soft hover:bg-cream-warm"
          >Annuler</button>
          <button
            onClick={() => onConfirm(count)}
            className="flex-1 py-2 rounded-full text-[12px] font-medium bg-bordeaux text-cream hover:bg-bordeaux-deep"
          >Ajouter au panier</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ============================================================
// FloatingCart : badge compact en bas a droite, s'etend au clic
// Visible quand le panier a au moins 1 element ET qu'aucune popup n'est ouverte
// ============================================================
function FloatingCart({ cart, totalLabels, expanded, onToggle, onRemove, onClear, onDownload, downloading }) {
  return (
    <div
      className="fixed bottom-6 right-6 z-[65]"
      onClick={e => e.stopPropagation()}
    >
      {expanded ? (
        /* Panneau etendu : liste des etiquettes + actions */
        <div className="bg-cream border border-bordeaux/40 rounded-2xl shadow-2xl w-[320px] max-h-[60vh] flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
            <div className="font-fraunces italic text-[15px] text-ink leading-none">
              Panier
            </div>
            <button
              onClick={onToggle}
              className="w-7 h-7 rounded-full hover:bg-line/30 flex items-center justify-center text-ink-mute"
              aria-label="Réduire le panier"
            >
              <i className="ti ti-chevron-down text-[16px]" aria-hidden="true"></i>
            </button>
          </div>
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-bordeaux font-mono">
            {totalLabels} étiquette{totalLabels > 1 ? 's' : ''} · {cart.length} ligne{cart.length > 1 ? 's' : ''}
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-1">
            {cart.map(entry => (
              <div
                key={entry.id}
                className="flex items-start gap-2 px-2 py-1.5 bg-cream-warm/50 rounded text-[11px] text-ink-soft"
              >
                <span className="flex-1 min-w-0 leading-tight">{entry.displayLabel}</span>
                <button
                  onClick={() => onRemove(entry.id)}
                  className="flex-shrink-0 w-5 h-5 rounded-full hover:bg-bordeaux/10 flex items-center justify-center text-ink-mute hover:text-bordeaux"
                  aria-label="Retirer du panier"
                >
                  <i className="ti ti-x text-[12px]" aria-hidden="true"></i>
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 px-3 py-3 border-t border-line">
            <button
              onClick={onClear}
              className="flex-1 py-1.5 border border-line rounded-full text-[11px] text-ink-soft hover:bg-cream-warm"
            >
              Vider
            </button>
            <button
              onClick={onDownload}
              disabled={downloading || cart.length === 0}
              className={`flex-[2] py-1.5 rounded-full text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
                downloading || cart.length === 0
                  ? 'bg-line/40 text-ink-mute cursor-not-allowed'
                  : 'bg-bordeaux text-cream hover:bg-bordeaux-deep'
              }`}
            >
              <i className={`ti ${downloading ? 'ti-loader-2 animate-spin' : 'ti-printer'} text-[13px]`} aria-hidden="true"></i>
              {downloading ? 'Génération…' : 'Télécharger ZPL'}
            </button>
          </div>
        </div>
      ) : (
        /* Badge compact */
        <button
          onClick={onToggle}
          className="bg-bordeaux text-cream rounded-full shadow-2xl hover:bg-bordeaux-deep transition-colors flex items-center gap-2 pl-3 pr-4 py-2.5 group"
          title="Voir le panier d'étiquettes"
        >
          <i className="ti ti-shopping-cart text-[18px]" aria-hidden="true"></i>
          <span className="font-mono font-bold text-[13px]">{totalLabels}</span>
          <span className="text-[11px] uppercase tracking-wider opacity-90">
            étiquette{totalLabels > 1 ? 's' : ''}
          </span>
        </button>
      )}
    </div>
  )
}

// ============================================================
// Barre panier d'etiquettes (sticky en bas du popup)
// ============================================================
function CartBar({ cart, totalLabels, downloading, onRemove, onClear, onDownload }) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-cream border-t-2 border-bordeaux p-3 max-h-[40vh] overflow-y-auto z-[70] shadow-2xl"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="text-[10px] uppercase tracking-wider text-bordeaux font-bold mb-2">
        Panier — {totalLabels} étiquette{totalLabels > 1 ? 's' : ''}
      </div>

      <div className="flex flex-col gap-1 mb-3">
        {cart.map(entry => (
          <div key={entry.id} className="flex justify-between items-center text-[11px] px-2 py-1.5 bg-bordeaux/10 rounded text-bordeaux-deep">
            <span className="truncate">{entry.displayLabel}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(entry.id) }}
              className="text-bordeaux hover:bg-bordeaux/10 rounded px-1.5 ml-2 flex-shrink-0"
              title="Retirer"
              type="button"
            >✕</button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onClear() }}
          type="button"
          className="px-3 py-2 border border-line rounded-full text-[11px] text-ink-soft hover:bg-cream-warm flex-shrink-0"
        >Vider</button>
        <button
          onClick={(e) => { e.stopPropagation(); onDownload() }}
          disabled={downloading}
          type="button"
          className={`flex-1 py-2 rounded-full text-[12px] font-medium transition-colors ${
            downloading ? 'bg-line/40 text-ink-mute cursor-not-allowed' : 'bg-bordeaux text-cream hover:bg-bordeaux-deep'
          }`}
        >
          {downloading ? '⏳ Génération...' : `🖨 Télécharger ZPL (${totalLabels} étiquette${totalLabels > 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// ============================================================
// RecapCard : une card pour une categorie (3 variantes : default, transverse, global)
// ============================================================
function RecapCard({ cat, linesForCategory, linesForCategoryFull, isFiltered, onClick, variant = 'default' }) {
  const catLines = linesForCategory(cat.id)
  const catLinesFull = linesForCategoryFull(cat.id)
  const total = sumQty(catLines)
  const totalFull = sumQty(catLinesFull)
  const showSlash = isFiltered && total !== totalFull
  const isEmpty = total === 0 && !showSlash

  // Style de bordure selon la variante
  const borderClass = isEmpty
    ? 'bg-transparent border border-dashed border-line/60 hover:border-bordeaux/40'
    : variant === 'global'
      ? 'bg-cream border border-bordeaux/40 hover:border-bordeaux hover:bg-cream-warm/40'
      : variant === 'transverse'
        ? 'bg-cream-warm/30 border border-line hover:border-bordeaux'
        : 'bg-white border border-line hover:border-bordeaux'

  const numClass = isEmpty
    ? 'text-[26px] text-line'
    : variant === 'global'
      ? 'text-[36px] text-bordeaux'
      : 'text-[34px] text-bordeaux'

  return (
    <button onClick={onClick}
            className={`rounded-xl p-4 transition-all text-left cursor-pointer ${borderClass}`}>
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <span className="text-[15px] opacity-80">{cat.emoji}</span>
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute truncate">
          {cat.label.replace(/^Vente\s+/i, '')}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`font-fraunces italic font-medium leading-none ${numClass}`}>
          {total}
          {showSlash && (
            <span className="text-[14px] text-ink-mute font-normal ml-0.5">
              /{totalFull}
            </span>
          )}
        </span>
        {!isEmpty && catLines.length > 0 && (
          <span className="text-[11px] text-ink-mute ml-auto">
            {catLines.length} ligne{catLines.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </button>
  )
}

// ============================================================
// Composant principal
// Mode "popup" (par defaut) : ouvert depuis le calendrier admin, bouton ✕ pour fermer
// Mode "fullscreen" : utilisateur avec role 'recap' qui n'a que cette page,
//                     pas de bouton fermer, mais bouton "Déconnexion"
// ============================================================
export default function RecapVentes({ onClose, user = null, onLogout = null, fullscreen = false, activeView, onNavigate }) {
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

  // Panier d'etiquettes partage entre toutes les popups categories.
  // Persiste en localStorage pour survivre a un refresh.
  const CART_KEY = 'lg_label_cart_v1'
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  const [cartExpanded, setCartExpanded] = useState(false)
  const [downloadingCart, setDownloadingCart] = useState(false)

  // ============================================================
  // Panier d'IMPRESSION TICKETS Epson (separe du panier etiquettes Zebra)
  // Chaque entree contient { id, deliveryAt, orderNum, clientName, productName, quantity }
  // Chaque entree = 1 ticket imprime sur l'imprimante Epson TM-T88VII via helper PC
  // ============================================================
  const PRINT_CART_KEY = 'lg_print_cart_v1'
  const [printCart, setPrintCart] = useState(() => {
    try {
      const raw = localStorage.getItem(PRINT_CART_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  const [printCartExpanded, setPrintCartExpanded] = useState(false)
  const [printing, setPrinting] = useState(false)

  // Sauvegarde automatique du panier d'impression
  useEffect(() => {
    try { localStorage.setItem(PRINT_CART_KEY, JSON.stringify(printCart)) } catch {}
  }, [printCart])

  function addToPrintCart(entry) {
    setPrintCart(c => [...c, { ...entry, id: Date.now() + Math.random() }])
  }

  function removeFromPrintCart(id) {
    setPrintCart(c => c.filter(e => e.id !== id))
  }

  function clearPrintCart(skipConfirm = false) {
    if (printCart.length === 0) return
    if (!skipConfirm && !window.confirm('Vider le panier d\'impression ?')) return
    setPrintCart([])
  }

  async function printAllCart() {
    if (printCart.length === 0 || printing) return
    setPrinting(true)
    try {
      const result = await printArticleBatch(printCart)
      if (result.errors.length === 0) {
        // Tout est OK -> on vide le panier
        setPrintCart([])
        setPrintCartExpanded(false)
      } else {
        // Erreurs : on previent l'utilisateur, on garde le panier
        alert(
          `${result.ok} ticket(s) imprime(s) sur ${result.total}.\n\n` +
          `${result.errors.length} erreur(s) :\n` +
          result.errors.slice(0, 3).map(e => `- ${e.article.productName} : ${e.error}`).join('\n') +
          (result.errors.length > 3 ? `\n... et ${result.errors.length - 3} autres.` : '') +
          `\n\nVerifiez que le helper PC tourne (192.168.1.241:9999) et que l'imprimante est allumee.`
        )
      }
    } catch (e) {
      alert(
        `Echec impression : ${e.message}\n\n` +
        `Verifiez :\n` +
        `1. Le PC Windows est allume et connecte au reseau\n` +
        `2. Le helper print-server tourne sur le PC\n` +
        `3. L'imprimante Epson est allumee\n` +
        `4. Si vous etes sur HTTPS, autorisez le contenu non securise (cadenas dans la barre URL)`
      )
    } finally {
      setPrinting(false)
    }
  }

  // Sauvegarde automatique du panier
  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch {}
  }, [cart])

  function addToCart(entry) {
    setCart(c => [...c, { ...entry, id: Date.now() + Math.random() }])
  }

  function removeFromCart(id) {
    setCart(c => c.filter(e => e.id !== id))
  }

  function clearCart(skipConfirm = false) {
    if (cart.length === 0) return
    if (!skipConfirm && !confirm('Vider le panier ?')) return
    setCart([])
    setCartExpanded(false)
  }

  async function downloadCart() {
    if (cart.length === 0) return
    setDownloadingCart(true)
    try {
      const r = await fetch('/api/labels-client-zpl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: cart }),
      })
      if (!r.ok) {
        const txt = await r.text()
        throw new Error(`Erreur ${r.status}: ${txt}`)
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `etiquettes-${new Date().toISOString().slice(0, 10)}.zpl`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      clearCart(true)
    } catch (e) {
      alert('Erreur generation : ' + e.message)
    } finally {
      setDownloadingCart(false)
    }
  }

  const totalLabels = cart.reduce((s, e) => s + (e.labelCount || 1), 0)

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
  // Exclut "Toutes commandes" et "Recap 16h" (vues d'audit, trop volumineuses)
  function handlePrintAll() {
    let html = ''
    for (const cat of VENTE_CATEGORIES) {
      if (cat.id === 'ALL' || cat.id === 'ODOO') continue
      const catLines = linesForCategory(cat.id)
      html += renderCategoryHtml(cat, catLines, dateLabel, false, filteredLines)
    }
    if (!html) {
      alert('Aucune vente a imprimer pour cette date')
      return
    }
    printHtml(html, `Recap ventes - ${dateLabel}`)
  }

  // ============================================================
  // Helpers pour les boutons rapides de date
  // ============================================================
  // Calcule un yyyy-mm-dd a partir d'aujourd'hui + offset (en jours)
  function dateOffset(days) {
    const d = new Date()
    d.setDate(d.getDate() + days)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  // Calcule l'offset entre la date selectionnee et aujourd'hui (en jours)
  const selectedOffset = (() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const sel = new Date(date); sel.setHours(0, 0, 0, 0)
    return Math.round((sel - today) / (1000 * 60 * 60 * 24))
  })()

  // Bouton rapide pour une date relative
  function QuickDateBtn({ offset, label }) {
    const isActive = selectedOffset === offset
    return (
      <button
        onClick={() => setDate(dateOffset(offset))}
        className={`px-3 py-1 rounded-full text-[10px] font-medium tracking-wider transition-all ${
          isActive
            ? 'bg-bordeaux text-cream border border-bordeaux'
            : 'border border-bordeaux/40 text-bordeaux hover:bg-bordeaux hover:text-cream hover:border-bordeaux'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <>
      {fullscreen && (
        <AppHeader
          user={user}
          activeView={activeView || 'recap'}
          onNavigate={onNavigate}
          onLogout={onLogout}
        />
      )}

      {/* Sous-header Recap : selecteur de date + boutons rapides + imprimer */}
      {fullscreen && (
        <div className="bg-cream/60 border-b border-line py-3 px-4 sticky top-[57px] z-20 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="font-fraunces italic text-[26px] font-normal text-ink leading-none">Récap</h1>
              <span className="capitalize font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute">
                {dateLabel}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Boutons rapides */}
              <QuickDateBtn offset={0} label="Aujourd'hui" />
              <QuickDateBtn offset={1} label="Demain" />
              <QuickDateBtn offset={2} label="+2j" />
              <QuickDateBtn offset={3} label="+3j" />
              {/* Selecteur de date libre (toutes dates passees ET futures) */}
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="px-2.5 py-1 border border-line rounded-full text-[11px] bg-cream focus:outline-none focus:border-bordeaux"
                title="Choisir n'importe quelle date"
              />
              <button
                onClick={handlePrintAll}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream rounded-full text-[11px] font-medium tracking-wider transition-all"
              >
                <i className="ti ti-printer text-[14px]" aria-hidden="true"></i>
                Tout imprimer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={fullscreen
          ? "min-h-screen bg-cream"
          : "fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm overflow-y-auto p-4"}>
        <div className={fullscreen
            ? "max-w-7xl mx-auto"
            : "max-w-7xl mx-auto bg-cream rounded-2xl shadow-2xl border border-line my-4"}>

          {/* Header (uniquement en mode modal) */}
          {!fullscreen && (
            <div className="sticky top-4 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between gap-3 flex-wrap z-10">
              <div className="flex items-center gap-3">
                <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-bold">RECAP</div>
                <h2 className="font-fraunces italic text-[24px] font-medium text-ink">Récap des ventes</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <QuickDateBtn offset={0} label="Aujourd'hui" />
                <QuickDateBtn offset={1} label="Demain" />
                <QuickDateBtn offset={2} label="+2j" />
                <QuickDateBtn offset={3} label="+3j" />
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
          )}

          {/* Barre de filtres : design epure - cachee pour livreur */}
          {!isLivreur(user) && (
          <div className="bg-cream/30 px-6 py-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[12px]">
            {/* Filtre Clients */}
            <div className="relative flex items-center gap-2 bg-white border border-line rounded-full px-3 py-1.5 focus-within:border-bordeaux transition-colors">
              <i className="ti ti-user text-[14px] text-ink-mute flex-shrink-0" aria-hidden="true"></i>
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-mute flex-shrink-0">Clients</span>
              <input
                type="text"
                value={clientsTerms}
                onChange={e => setClientsTerms(e.target.value)}
                placeholder={clientsMode === 'contains' ? 'agdal, souissi…' : 'vitrine, magasin…'}
                className="flex-1 min-w-0 bg-transparent focus:outline-none text-[12px] placeholder:text-ink-mute/60"
              />
              <button
                type="button"
                onClick={() => setClientsMode(clientsMode === 'contains' ? 'not_contains' : 'contains')}
                title={clientsMode === 'contains' ? 'Inclure ces termes' : 'Exclure ces termes'}
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[14px] font-medium transition-colors ${
                  clientsMode === 'contains'
                    ? 'bg-bordeaux/10 text-bordeaux hover:bg-bordeaux/20'
                    : 'bg-line/40 text-ink-mute hover:bg-line/60'
                }`}
              >
                {clientsMode === 'contains' ? '+' : '−'}
              </button>
            </div>

            {/* Filtre Articles */}
            <div className="relative flex items-center gap-2 bg-white border border-line rounded-full px-3 py-1.5 focus-within:border-bordeaux transition-colors">
              <i className="ti ti-box text-[14px] text-ink-mute flex-shrink-0" aria-hidden="true"></i>
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-mute flex-shrink-0">Articles</span>
              <input
                type="text"
                value={articlesTerms}
                onChange={e => setArticlesTerms(e.target.value)}
                placeholder={articlesMode === 'contains' ? 'fraisier, framboisier…' : 'bougies, déco…'}
                className="flex-1 min-w-0 bg-transparent focus:outline-none text-[12px] placeholder:text-ink-mute/60"
              />
              <button
                type="button"
                onClick={() => setArticlesMode(articlesMode === 'contains' ? 'not_contains' : 'contains')}
                title={articlesMode === 'contains' ? 'Inclure ces termes' : 'Exclure ces termes'}
                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[14px] font-medium transition-colors ${
                  articlesMode === 'contains'
                    ? 'bg-bordeaux/10 text-bordeaux hover:bg-bordeaux/20'
                    : 'bg-line/40 text-ink-mute hover:bg-line/60'
                }`}
              >
                {articlesMode === 'contains' ? '+' : '−'}
              </button>
            </div>

            {/* Bouton reset + compteur, sur sa propre ligne si filtre actif */}
            {isFiltered && (
              <div className="md:col-span-2 flex items-center gap-3 justify-end text-[11px]">
                <span className="text-ink-mute italic">
                  {filteredLines.length} / {lines.length} lignes
                </span>
                <button
                  onClick={() => { setClientsTerms(''); setArticlesTerms('') }}
                  className="flex items-center gap-1 text-bordeaux hover:underline"
                >
                  <i className="ti ti-x text-[12px]" aria-hidden="true"></i>
                  Réinitialiser
                </button>
              </div>
            )}
          </div>
          )}

          {/* 3 sections : Ventes par categorie / Vues transverses / Recap globaux */}
          {loading ? (
            <div className="p-6 text-center text-ink-mute italic py-12">Chargement...</div>
          ) : isLivreur(user) ? (
            /* Vue restreinte LIVREUR : uniquement la card Livraisons en grand */
            <div className="p-6">
              {(() => {
                const cat = VENTE_CATEGORIES.find(c => c.id === 'LIVR')
                if (!cat) return <div className="text-ink-mute italic">Aucune livraison à afficher.</div>
                return (
                  <div className="max-w-2xl mx-auto">
                    <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-mute mb-3">
                      Mes livraisons
                    </p>
                    <RecapCard
                      cat={cat}
                      linesForCategory={linesForCategory}
                      linesForCategoryFull={linesForCategoryFull}
                      isFiltered={isFiltered}
                      onClick={() => setPopupCat(cat)}
                      variant="global"
                    />
                  </div>
                )
              })()}
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* SECTION 1 : Ventes par categorie (4 cards compactes) */}
              {(() => {
                const sectionIds = ['CD', 'RAHN', 'SALES', 'VIENN']
                const cats = sectionIds.map(id => VENTE_CATEGORIES.find(c => c.id === id)).filter(Boolean)
                return (
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-mute mb-3">
                      Ventes par catégorie
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {cats.map(cat => <RecapCard key={cat.id} cat={cat}
                          linesForCategory={linesForCategory}
                          linesForCategoryFull={linesForCategoryFull}
                          isFiltered={isFiltered}
                          onClick={() => setPopupCat(cat)} />)}
                    </div>
                  </div>
                )
              })()}

              {/* SECTION 2 : Vues transverses (3 cards moyennes) */}
              {(() => {
                const sectionIds = ['LIVR', 'PROD', 'CLT']
                const cats = sectionIds.map(id => VENTE_CATEGORIES.find(c => c.id === id)).filter(Boolean)
                return (
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-mute mb-3">
                      Vues transverses
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {cats.map(cat => <RecapCard key={cat.id} cat={cat}
                          linesForCategory={linesForCategory}
                          linesForCategoryFull={linesForCategoryFull}
                          isFiltered={isFiltered}
                          onClick={() => setPopupCat(cat)}
                          variant="transverse" />)}
                    </div>
                  </div>
                )
              })()}

              {/* SECTION 3 : Recap globaux (2 cards encadrees) */}
              {(() => {
                const sectionIds = ['ALL', 'ODOO']
                const cats = sectionIds.map(id => VENTE_CATEGORIES.find(c => c.id === id)).filter(Boolean)
                return (
                  <div>
                    <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-ink-mute mb-3">
                      Récap globaux
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {cats.map(cat => <RecapCard key={cat.id} cat={cat}
                          linesForCategory={linesForCategory}
                          linesForCategoryFull={linesForCategoryFull}
                          isFiltered={isFiltered}
                          onClick={() => setPopupCat(cat)}
                          variant="global" />)}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
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
          cart={cart}
          onAddToCart={addToCart}
          onRemoveFromCart={removeFromCart}
          onClearCart={clearCart}
          onDownloadCart={downloadCart}
          downloadingCart={downloadingCart}
          onAddToPrintCart={addToPrintCart}
          printCartCount={printCart.length}
        />
      )}

      {/* Panier flottant Etiquettes Zebra : visible quand le panier n'est pas vide ET aucune popup ouverte */}
      {cart.length > 0 && !popupCat && (
        <FloatingCart
          cart={cart}
          totalLabels={totalLabels}
          expanded={cartExpanded}
          onToggle={() => setCartExpanded(v => !v)}
          onRemove={removeFromCart}
          onClear={() => clearCart()}
          onDownload={downloadCart}
          downloading={downloadingCart}
        />
      )}

      {/* Panier flottant TICKETS Epson : visible meme quand la popup categorie
          est ouverte, sinon on cliquerait sur 12 articles sans voir l'effet. */}
      {printCart.length > 0 && (
        <FloatingPrintCart
          cart={printCart}
          expanded={printCartExpanded}
          onToggle={() => setPrintCartExpanded(v => !v)}
          onRemove={removeFromPrintCart}
          onClear={() => clearPrintCart()}
          onPrint={printAllCart}
          printing={printing}
        />
      )}
    </>
  )
}

// ============================================================
// FloatingPrintCart : panier flottant pour les tickets Epson
// Visuellement distinct du panier Zebra (couleur bleue, icone imprimante).
// Position : en bas-droite mais a gauche du panier Zebra (decale).
// ============================================================
function FloatingPrintCart({ cart, expanded, onToggle, onRemove, onClear, onPrint, printing }) {
  // Nombre total de tickets a imprimer = somme des boxCount.
  // Si une entree a boxCount=3, ca produira 3 tickets numerotes 1/3, 2/3, 3/3.
  const totalTickets = cart.reduce(
    (s, e) => s + Math.max(1, parseInt(e.boxCount) || 1),
    0
  )
  return (
    <div className="fixed bottom-6 left-6 z-[60] print-cart-floating">
      {expanded ? (
        <div className="bg-white rounded-xl shadow-2xl border border-line w-[320px] overflow-hidden animate-fadeIn">
          <div className="px-4 py-2.5 bg-bordeaux text-cream flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-wider uppercase flex items-center gap-2">
              <i className="ti ti-printer text-[14px]" aria-hidden="true"></i>
              {totalTickets} ticket{totalTickets > 1 ? 's' : ''}
            </span>
            <button
              onClick={onToggle}
              className="text-cream hover:opacity-70 text-[14px]"
              aria-label="Replier"
            >
              <i className="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
          <div className="max-h-[280px] overflow-y-auto px-3 py-2 space-y-1">
            {cart.map(entry => {
              const nbBoites = Math.max(1, parseInt(entry.boxCount) || 1)
              return (
                <div key={entry.id} className="flex items-start gap-2 text-[11px] py-1 border-b border-line/40 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[9px] text-bordeaux">{entry.orderNum}</div>
                    <div className="text-ink-soft truncate">{entry.clientName}</div>
                    <div className="text-ink-mute truncate">
                      <span className="font-bold text-bordeaux">×{entry.quantity}</span> {entry.productName}
                    </div>
                    {nbBoites > 1 && (
                      <div className="text-[10px] text-bordeaux font-medium">
                        {nbBoites} boîtes — {nbBoites} tickets
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onRemove(entry.id)}
                    className="text-ink-mute hover:text-bordeaux flex-shrink-0"
                    title="Retirer"
                  >
                    <i className="ti ti-x text-[12px]" aria-hidden="true"></i>
                  </button>
                </div>
              )
            })}
          </div>
          <div className="px-3 py-2 border-t border-line bg-cream-warm flex gap-2">
            <button
              onClick={onClear}
              disabled={printing}
              className="flex-1 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-soft border border-line rounded hover:bg-white transition-colors disabled:opacity-50"
            >
              Vider
            </button>
            <button
              onClick={onPrint}
              disabled={printing || cart.length === 0}
              className={`flex-1 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1 ${
                printing || cart.length === 0
                  ? 'bg-ink-mute/30 text-ink-mute cursor-not-allowed'
                  : 'bg-bordeaux text-cream hover:bg-bordeaux-deep'
              }`}
            >
              <i className={`ti ${printing ? 'ti-loader-2 animate-spin' : 'ti-printer'} text-[13px]`} aria-hidden="true"></i>
              {printing ? 'Impression...' : 'Imprimer'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onToggle}
          className="bg-bordeaux text-cream rounded-full shadow-lg hover:shadow-xl px-4 py-2.5 flex items-center gap-2 transition-all"
        >
          <i className="ti ti-printer text-[16px]" aria-hidden="true"></i>
          <span className="font-mono text-[11px] tracking-wider">
            {totalTickets} ticket{totalTickets > 1 ? 's' : ''}
          </span>
        </button>
      )}
    </div>
  )
}
