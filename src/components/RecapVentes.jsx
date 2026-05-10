import { useState, useEffect } from 'react'
import { VENTE_CATEGORIES, loadSalesLinesForDate, groupByHourThenClient, groupByProduct, groupDeliveriesWithFullOrder, groupAllOrdersByHour, groupByProductWithDelivered, filterLines, sumQty, linesForCategory as linesForCategoryHelper } from '../lib/salesLines'
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

function CategoryPopup({ cat, lines, allLines, dateLabel, onClose }) {
  const isProductMode = cat.viewMode === 'product'
  const isDeliveryMode = cat.viewMode === 'delivery'
  const isDeliveryAllMode = cat.viewMode === 'delivery-all'
  const isOdooTableMode = cat.viewMode === 'odoo-table'

  // State pour le sous-popup d'impression d'etiquettes
  const [labelTask, setLabelTask] = useState(null)   // { mode, orderNum, clientName, productName?, items? }

  function onPickItem(orderNum, clientName, item) {
    // Article unique (plateau, boite...) -> popup nb etiquettes
    setLabelTask({
      mode: 'single',
      orderNum,
      clientName,
      productName: item.product_name,
      defaultCount: Math.max(1, Number(item.quantity) || 1),
    })
  }

  function onPickIndiv(orderNum, clientName, indivItems) {
    // Individuels regroupes -> generation directe
    const items = indivItems.map(it => ({
      name: shortIndivName(it.product_name),
      qty: Number(it.quantity) || 1,
    }))
    setLabelTask({
      mode: 'indiv',
      orderNum,
      clientName,
      items,
    })
  }

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
      <div className={`bg-cream rounded-2xl w-full ${isOdooTableMode ? 'max-w-3xl' : 'max-w-2xl'} max-h-[85vh] overflow-y-auto shadow-2xl border border-line`}
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
                      onPickItem={onPickItem}
                      onPickIndiv={onPickIndiv}
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
            downloadClientLabel({
              mode: 'single',
              orderNum: labelTask.orderNum,
              clientName: labelTask.clientName,
              productName: labelTask.productName,
              count,
            })
            setLabelTask(null)
          }}
        />
      )}
      {/* Mode indiv : telechargement direct sans popup */}
      {labelTask && labelTask.mode === 'indiv' && (() => {
        downloadClientLabel({
          mode: 'indiv',
          orderNum: labelTask.orderNum,
          clientName: labelTask.clientName,
          items: labelTask.items,
        })
        // Ferme le sous-popup directement (pas de UI)
        setTimeout(() => setLabelTask(null), 100)
        return null
      })()}
    </div>
  )
}

// ============================================================
// Bloc client : entete + items (clickable ou non) + indiv groupes
// ============================================================
function ClientBlock({ entry, clickable, onPickItem, onPickIndiv }) {
  const { normal, indiv } = splitItems(entry.items)
  const indivQty = sumIndivQty(indiv)
  const orderNum = entry.orderNum || ''
  const clientName = entry.clientName || ''

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
        <h3 className="font-fraunces italic text-[18px] text-ink mb-1">Imprimer étiquettes</h3>
        <div className="text-[11px] text-ink-mute mb-3 font-mono">
          {task.orderNum} · {task.clientName}
        </div>

        <div className="bg-cream-warm border border-line rounded-md px-3 py-2 mb-4 text-[12px] text-ink">
          {cleanProduct}
        </div>

        <div className="text-[11px] text-ink-soft mb-2">Combien d'étiquettes ?</div>
        <div className="flex items-center justify-between border border-bordeaux rounded-md mb-4">
          <button
            type="button"
            onClick={() => setCount(c => Math.max(1, c - 1))}
            className="px-4 py-2 text-bordeaux hover:bg-bordeaux/5 text-[18px]"
          >−</button>
          <span className="text-[18px] font-bold">{count}</span>
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
          >🖨 Imprimer</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Telechargement etiquette client (appel API)
// ============================================================
async function downloadClientLabel(payload) {
  try {
    const r = await fetch('/api/labels-client-zpl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!r.ok) {
      const txt = await r.text()
      throw new Error(`Erreur ${r.status}: ${txt}`)
    }
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeOrderNum = String(payload.orderNum || 'cmd').replace(/[^A-Za-z0-9]/g, '')
    a.download = `etiquette-${safeOrderNum}.zpl`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('Erreur generation etiquette : ' + e.message)
  }
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
        <div className="bg-cream-warm/30 border-b border-line py-3 px-4 sticky top-[57px] z-20 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-fraunces italic text-[18px] text-ink">📊 Récap</span>
              <span className="capitalize font-mono text-[10px] tracking-[0.15em] uppercase text-bordeaux font-bold ml-1">
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
                className="px-3 py-1.5 bg-bordeaux text-cream rounded-full text-[10px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all"
              >
                🖨 Tout imprimer
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
