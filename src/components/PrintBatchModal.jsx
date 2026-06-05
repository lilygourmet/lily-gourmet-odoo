import { useState, useEffect } from 'react'
import { markOrdersPrintedBatch } from '../lib/printOrders'
import { loadFichesForOrder, getSableDimensionLabel } from '../lib/gmFiches'
import { computeSizesForCake } from '../lib/cakeSizes'
import { loadPalette } from '../lib/palette'
import { toast } from '../lib/toast'

const DAY_NAMES_FULL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MONTH_NAMES = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
]

function formatDateFr(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${DAY_NAMES_FULL[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}h${String(d.getMinutes()).padStart(2,'0')}`
}


function cleanParfums(parfumsArray) {
  if (!Array.isArray(parfumsArray)) return []
  const FORMES = ['carre', 'rectangle', 'rond', 'ovale', 'coeur', 'fleur', 'etoile']
  return parfumsArray.filter(p => {
    if (!p) return false
    const lower = String(p).toLowerCase().trim()
    if (/^\d+$/.test(lower)) return false
    if (FORMES.includes(lower)) return false
    return true
  })
}

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function resolveColors(ids, palette) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  return ids.map(id => {
    if (typeof id === 'object' && id?.hex) return id
    return palette.find(p => p.id === id) || null
  }).filter(Boolean)
}

// Extrait les avertissements (notes par article venant des line_note Odoo) sous forme
// d'un tableau de strings non vides. Gere les 3 formats possibles vus dans la base :
//   - string brute
//   - array de strings
//   - array d'objets { text: '...' }
function extractItemWarnings(item) {
  const w = item?.warnings
  if (!w) return []
  if (typeof w === 'string') {
    return w.trim() ? [w.trim()] : []
  }
  if (Array.isArray(w)) {
    return w
      .map(x => typeof x === 'string' ? x : (x?.text || ''))
      .map(s => String(s).trim())
      .filter(Boolean)
  }
  if (typeof w === 'object' && w.text) {
    const t = String(w.text).trim()
    return t ? [t] : []
  }
  return []
}

// Genere un bloc HTML "Note" en italique rose pale, a placer sous un article.
// Retourne '' si l'article n'a pas de note.
function renderItemNoteBlock(item) {
  const notes = extractItemWarnings(item)
  if (notes.length === 0) return ''
  return `
    <div style="margin-top:6px;padding:6px 10px;background:#fce4ec;border-left:3px solid #c2185b;border-radius:3px;">
      <div style="font-size:9.5px;font-weight:bold;color:#c2185b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:2px;">⚠ Note</div>
      ${notes.map(n => `<div style="font-size:11.5px;color:#333;font-style:italic;line-height:1.4;">${escapeHtml(n)}</div>`).join('')}
    </div>
  `
}

// Generer le HTML d'une seule commande
function renderOrderHtml(order, fichesByItemId, palette) {
  // Filtre les items a quantite zero (acompte, lignes ajoutees pour reference, etc.)
  const rawItems = order.order_items || []
  const items = rawItems.filter(i => {
    const q = parseFloat(i?.quantity)
    return !isNaN(q) && q > 0
  })
  const cdItems = items.filter(i => i.type === 'CD')
  const gmItems = items.filter(i => i.type === 'GM')

  // Photos
  const allPhotos = []
  for (const item of items) {
    const urls = Array.isArray(item.image_urls) ? item.image_urls : []
    for (const u of urls) if (!allPhotos.includes(u)) allPhotos.push(u)
  }

  // CD HTML
  let cdHtml = ''
  if (cdItems.length > 0) {
    cdHtml = `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: bold; color: #666; text-transform: uppercase; letter-spacing: 1.5px; padding-bottom: 6px; border-bottom: 0.5px solid #ddd; margin-bottom: 10px;">
          GATEAU(X)
        </div>
        ${cdItems.map(item => {
          const parfumsArray = cleanParfums(item.parfums)
          const etagesCount = item.etages_count || 1
          const sizesPerEtage = item.pers ? computeSizesForCake(item.pers, etagesCount) : null
          const polys = item.polys || {}
          const polysList = []
          for (const key of Object.keys(polys)) {
            const v = polys[key]
            const num = parseInt(key.replace('etage', ''), 10)
            polysList.push({ etage: num, value: typeof v === 'object' ? v.value : v })
          }
          polysList.sort((a, b) => a.etage - b.etage)

          return `
            <div style="margin-bottom: 10px;">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">
                × ${item.quantity || 1} — ${escapeHtml(item.title)}
              </div>
              <div style="font-size: 11.5px; color: #333; line-height: 1.5;">
                ${item.pers ? `<div>${item.pers} personnes${item.etages_count > 1 ? ` · ${item.etages_count} etages` : ''}</div>` : ''}
                ${sizesPerEtage ? `
                  <div style="margin-top:4px;padding:6px 10px;background:#fff8e7;border-radius:4px;border:0.5px solid #f0e0a0;">
                    <div style="font-size:10px;font-weight:bold;color:#7a5c00;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:3px;">Tailles</div>
                    ${sizesPerEtage.map((cm, i) => `
                      <div style="font-size:12px;color:#333;">
                        <span style="font-weight:600;color:#7a5c00;">${cm} cm</span>
                        ${parfumsArray[i] ? `<span style="font-style:italic;color:#666;"> · ${escapeHtml(parfumsArray[i])}</span>` : ''}
                      </div>
                    `).join('')}
                  </div>
                ` : (parfumsArray.length > 0 ? `<div>Parfums : ${escapeHtml(parfumsArray.join(', '))}</div>` : '')}
                ${item.theme ? `<div>Theme : ${escapeHtml(item.theme)}</div>` : ''}
                ${item.age ? `<div>Age : ${escapeHtml(item.age)}</div>` : ''}
                ${item.message ? `<div>Message : « ${escapeHtml(item.message)} »</div>` : ''}
                ${polysList.length > 0 ? `<div>Polys : ${polysList.map(p => `Etage ${p.etage} = ${escapeHtml(p.value || '—')}`).join(' ')}</div>` : ''}
              </div>
              ${renderItemNoteBlock(item)}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  // GM HTML
  let gmHtml = ''
  if (gmItems.length > 0) {
    gmHtml = `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: bold; color: #666; text-transform: uppercase; letter-spacing: 1.5px; padding-bottom: 6px; border-bottom: 0.5px solid #ddd; margin-bottom: 10px;">
          ACCESSOIRES
        </div>
        ${gmItems.map(item => {
          const fiche = fichesByItemId[item.id]
          const parfumsArray = cleanParfums(item.parfums)
          const qty = item.quantity || 1
          const couleurs = fiche ? resolveColors(fiche.couleurs || [], palette) : []
          const zigzagCouleurs = fiche ? resolveColors(fiche.zigzag_couleurs || [], palette) : []
          const decos = fiche?.decos || []
          const dispatchPerParfum = parfumsArray.length > 0 ? Math.floor(qty / parfumsArray.length) : 0

          return `
            <div style="margin-bottom: 10px;">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 3px;">
                × ${qty} ${escapeHtml(item.title)}
              </div>
              <div style="font-size: 11.5px; color: #333; line-height: 1.5;">
                ${fiche?.taille && fiche.type_gm !== 'sable' ? `<div>Taille : ${escapeHtml(fiche.taille)}</div>` : ''}
                ${parfumsArray.length > 0 ? `<div>Parfums : ${parfumsArray.length === 1 ? escapeHtml(parfumsArray[0]) : parfumsArray.map(p => `${dispatchPerParfum} ${escapeHtml(p)}`).join(' · ')}</div>` : ''}
                ${!fiche ? `<div style="color:#c2185b;font-style:italic;">⚠ Fiche a definir</div>` : ''}
                ${fiche?.type_gm === 'sable' ? `<div>Forme ${escapeHtml(fiche.forme || '')}${fiche.taille ? ` · ${escapeHtml(getSableDimensionLabel(fiche.forme, fiche.taille) || '')}` : ''}${fiche.bord ? ` · Bord ${escapeHtml(fiche.bord)}` : ''}</div>` : ''}
                ${couleurs.length > 0 ? `<div>Couleurs : ${couleurs.map(c => `<span style="display:inline-flex;align-items:center;gap:3px;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c.hex};border:0.5px solid #999;vertical-align:middle;"></span>${escapeHtml(c.nom)}</span>`).join(', ')}</div>` : ''}
                ${fiche?.zigzag_mode === 'meme' ? `<div>Zigzag meme couleur</div>` : ''}
                ${fiche?.zigzag_mode === 'differente' && zigzagCouleurs.length > 0 ? `<div>Zigzag : ${zigzagCouleurs.map(c => escapeHtml(c.nom)).join(', ')}</div>` : ''}
                ${decos.length > 0 ? `<div>Deco : ${decos.map(escapeHtml).join(' · ')}</div>` : ''}
              </div>
              ${renderItemNoteBlock(item)}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  // Photos HTML
  let photosHtml = ''
  if (allPhotos.length > 0) {
    photosHtml = `
      <div style="margin-top: 14px;">
        <div style="font-size: 11px; font-weight: bold; color: #666; text-transform: uppercase; letter-spacing: 1.5px; padding-bottom: 6px; border-bottom: 0.5px solid #ddd; margin-bottom: 10px;">
          PHOTOS
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
          ${allPhotos.slice(0, 6).map(url => `
            <div style="aspect-ratio: 1/1; background: #f5f5f5; border-radius: 4px; overflow: hidden; border: 0.5px solid #ddd;">
              <img src="${escapeHtml(url)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
            </div>
          `).join('')}
        </div>
      </div>
    `
  }

  return `
    <div class="order-page">
      <!-- HEADER -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;border-bottom:0.5px solid #c0c0c0;padding-bottom:10px;margin-bottom:16px;">
        <div>
          <img src="/logo.png" alt="" style="width:55px;height:55px;object-fit:contain;display:block;" onerror="this.style.display='none'" />
          <div style="font-size:11px;color:#444;margin-top:4px;">Lily Gourmet</div>
        </div>
        <div style="text-align:right;font-size:13px;font-weight:600;">${escapeHtml(order.client_name || '—')}</div>
      </div>

      <!-- TITRE -->
      <div style="font-size:24px;font-weight:300;color:#666;margin-bottom:14px;">
        Bon de production N° ${escapeHtml(order.order_num)}
      </div>

      <!-- INFOS -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;font-size:12px;">
        <div>
          <div style="color:#888;font-size:11px;">Date livraison :</div>
          <div style="font-weight:600;">${escapeHtml(formatDateFr(order.delivery_at))}</div>
        </div>
        <div>
          <div style="color:#888;font-size:11px;">Vendeur :</div>
          <div style="font-weight:600;">${escapeHtml(order.seller_name || '—')}</div>
        </div>
      </div>

      ${cdHtml}
      ${gmHtml}
      ${photosHtml}
    </div>
  `
}

export default function PrintBatchModal({ orders, user, onClose, onPrinted }) {
  const [printing, setPrinting] = useState(false)
  const [fichesByItemId, setFichesByItemId] = useState({})
  const [palette, setPalette] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const allFiches = {}
        for (const order of orders) {
          const fiches = await loadFichesForOrder(order.id)
          for (const f of fiches) allFiches[f.order_item_id] = f
        }
        setFichesByItemId(allFiches)
        const p = await loadPalette()
        setPalette(p)
      } catch (e) {
        console.error('[batch] erreur chargement:', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [orders])

  async function handlePrintAll() {
    if (printing) return
    setPrinting(true)

    try {
      const printedAt = new Date()
      const printedAtStr = `${printedAt.getDate()}/${String(printedAt.getMonth()+1).padStart(2,'0')}/${printedAt.getFullYear()} a ${String(printedAt.getHours()).padStart(2,'0')}h${String(printedAt.getMinutes()).padStart(2,'0')}`

      // Construire le HTML complet
      const ordersHtml = orders.map(o => renderOrderHtml(o, fichesByItemId, palette)).join('')

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Lily Gourmet - Planning</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #1a1a1a;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .order-page {
    page-break-after: always;
    break-after: page;
    padding: 0;
  }
  .order-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }
  img { max-width: 100%; }
  @page {
    size: A4 portrait;
    margin: 1.5cm;
  }
  @media print {
    .order-page {
      page-break-after: always !important;
      break-after: page !important;
    }
    .order-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
  }
</style>
</head>
<body>
${ordersHtml}
</body>
</html>`

      // Creer iframe cache
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

      // Attendre que les images chargent
      await new Promise((resolve) => {
        const imgs = doc.querySelectorAll('img')
        if (imgs.length === 0) {
          setTimeout(resolve, 300)
          return
        }
        let loaded = 0
        const total = imgs.length
        const checkDone = () => {
          loaded++
          if (loaded >= total) resolve()
        }
        imgs.forEach(img => {
          if (img.complete) checkDone()
          else {
            img.addEventListener('load', checkDone)
            img.addEventListener('error', checkDone)
          }
        })
        // Securite : timeout max 5s
        setTimeout(resolve, 5000)
      })

      // Petite attente supplementaire pour le rendu
      await new Promise(r => setTimeout(r, 300))

      // Marquer imprimees AVANT d'ouvrir l'apercu
      // (apres tout, l'utilisateur a clique "Imprimer toutes")
      console.log('[print] DEBUT marquage', { userId: user?.id, ordersCount: orders.length })
      if (user?.id) {
        const ids = orders.map(o => o.id)
        console.log('[print] IDs a marquer:', ids)
        try {
          const result = await markOrdersPrintedBatch(ids, user.id)
          console.log('[print] markOrdersPrintedBatch resultat:', result)
          // Sauvegarde le batch pour permettre une réimpression en cas de pépin
          // d'imprimante (papier coincé, hors-ligne…). Stocké en local, valable
          // jusqu'au prochain batch.
          try {
            localStorage.setItem('lastPrintBatch', JSON.stringify({
              ids,
              printedAt: printedAt.toISOString(),
              count: orders.length,
            }))
          } catch (_) { /* localStorage indispo, ignore */ }
        } catch (e) {
          console.error('[print] ERREUR markOrdersPrintedBatch:', e)
          toast.error('Erreur marquage: ' + e.message)
        }
      } else {
        console.warn('[print] PAS de user.id, marquage skippe!')
      }

      // Notifier le parent pour rafraichir le compteur
      console.log('[print] Appel onPrinted...')
      if (onPrinted) await onPrinted()
      console.log('[print] onPrinted termine')

      // Imprimer (l'apercu va s'ouvrir maintenant)
      iframe.contentWindow.focus()
      iframe.contentWindow.print()

      // Nettoyer apres delai
      setTimeout(() => {
        document.body.removeChild(iframe)
      }, 1000)
    } catch (e) {
      console.error('[batch] erreur:', e)
      toast.error('Erreur lors de l\'impression : ' + e.message)
    }

    setPrinting(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
         onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl border border-line"
           onClick={e => e.stopPropagation()}>

        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-6 py-4 flex items-center justify-between z-10">
          <div>
            <div className="font-mono text-[11px] tracking-[0.2em] text-bordeaux font-semibold mb-1">
              IMPRESSION GROUPEE
            </div>
            <div className="font-fraunces italic text-[20px] font-medium text-ink leading-tight">
              {orders.length} commande{orders.length > 1 ? 's' : ''} non imprimee{orders.length > 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={onClose}
                  className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center transition-all flex-shrink-0">
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-2">
          <div className="text-[12px] text-ink-mute italic mb-3">
            Triees par date de livraison
          </div>
          {loading ? (
            <div className="text-center py-6 text-ink-mute text-[12px]">Chargement...</div>
          ) : (
            <div className="space-y-1.5">
              {orders.map((o, i) => (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2 bg-white rounded-md border border-line text-[12px]">
                  <span className="font-mono text-[10px] text-ink-mute font-semibold w-6">{i + 1}</span>
                  <span className="font-mono text-[10px] text-bordeaux font-semibold">{o.order_num}</span>
                  <span className="font-fraunces italic text-[13px] text-ink flex-1 truncate">{o.client_name || '—'}</span>
                  <span className="text-[10px] text-ink-mute font-mono">
                    {o.delivery_at ? new Date(o.delivery_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-ink-soft italic pt-3">
            ~{orders.length} page{orders.length > 1 ? 's' : ''} (1 commande par page)
          </div>
        </div>

        <div className="sticky bottom-0 bg-cream/95 backdrop-blur-sm border-t border-line px-6 py-3 flex justify-end gap-2">
          <button onClick={onClose}
                  className="px-4 py-2 border border-line text-ink-mute rounded-full text-[11px] font-medium tracking-wider hover:bg-line/30 transition-all">
            Annuler
          </button>
          <button onClick={handlePrintAll} disabled={loading || printing || orders.length === 0}
                  className="px-4 py-2 bg-bordeaux text-cream rounded-full text-[11px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all disabled:opacity-50">
            {printing ? '⏳ Preparation...' : `🖨️ Imprimer toutes (${orders.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
