import { useState, useEffect, useMemo } from 'react'
import {
  loadOrdersWithFichesForDate, loadPalette, findColor,
  isLotDone, isItemFullyDone, aggregateByProduct,
  markLotDone, unmarkLotDone, markItemAllDone, unmarkItemAllDone,
  TYPE_LABELS, TYPE_EMOJIS,
  getRealQuantity,
} from '../lib/gmFiches'
import { logout, getCurrentUser } from '../lib/auth'

// ============================================================
// PatissierView : page complete de production patissier
// Props : user, onClose (pour admin qui basculle)
// ============================================================
export default function PatissierView({ user, onLogout, onBackToCalendar }) {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(todayStr)
  const [ordersWithFiches, setOrdersWithFiches] = useState([])
  const [palette, setPalette] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('client')
  const [showDone, setShowDone] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState(null)

  const currentUser = user || getCurrentUser()

  async function refresh() {
    setLoading(true)
    try {
      const [data, pal] = await Promise.all([
        loadOrdersWithFichesForDate(date),
        loadPalette(),
      ])
      setOrdersWithFiches(data)
      setPalette(pal)
    } catch (e) {
      console.error('[PatissierView] erreur:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [date])

  // Total a faire / faits
  const stats = useMemo(() => {
    let toDo = 0, done = 0
    for (const { items } of ordersWithFiches) {
      for (const { fiche, dones } of items) {
        if (!fiche) continue
        if (fiche.parfum_normal) {
          if (dones.length > 0) done += 1
          else toDo += 1
        } else {
          const lots = (fiche.lots || []).length
          if (lots === 0) continue
          for (let i = 0; i < lots; i++) {
            if (dones.some(d => d.lot_idx === i)) done += 1
            else toDo += 1
          }
        }
      }
    }
    return { toDo, done }
  }, [ordersWithFiches])

  const dateLabel = new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="min-h-screen bg-cream pb-12">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-cream/95 backdrop-blur-sm border-b border-line px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[24px]">🍰</span>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-bordeaux font-bold uppercase">PÂTISSIER</div>
            <div className="font-fraunces italic text-[20px] text-ink leading-tight capitalize">{dateLabel}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 border border-line rounded-full text-[13px] bg-cream focus:outline-none focus:border-bordeaux"
          />

          {/* Toggle A faire / Faites */}
          <div className="flex bg-cream-warm rounded-full p-0.5 border border-line">
            <button
              onClick={() => setShowDone(false)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                !showDone ? 'bg-bordeaux text-cream' : 'text-ink-mute'
              }`}
            >
              À faire ({stats.toDo})
            </button>
            <button
              onClick={() => setShowDone(true)}
              className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                showDone ? 'bg-bordeaux text-cream' : 'text-ink-mute'
              }`}
            >
              Faites ({stats.done})
            </button>
          </div>

          {onBackToCalendar && (
            <button
              onClick={onBackToCalendar}
              className="px-3 py-1.5 border border-line text-ink-soft rounded-full text-[11px] hover:bg-cream-warm"
            >
              ← Calendrier
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="px-3 py-1.5 border border-line text-ink-soft rounded-full text-[11px] hover:bg-bordeaux hover:text-cream hover:border-bordeaux"
            >
              Déconnexion
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line bg-cream sticky top-[58px] z-20">
        <button
          onClick={() => setTab('client')}
          className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${
            tab === 'client'
              ? 'text-bordeaux border-b-2 border-bordeaux'
              : 'text-ink-mute hover:text-ink'
          }`}
        >
          👤 Par client
        </button>
        <button
          onClick={() => setTab('product')}
          className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${
            tab === 'product'
              ? 'text-bordeaux border-b-2 border-bordeaux'
              : 'text-ink-mute hover:text-ink'
          }`}
        >
          📦 Par produit
        </button>
      </div>

      {/* Contenu */}
      <div className="max-w-4xl mx-auto p-4">
        {loading ? (
          <div className="text-center text-ink-mute italic py-12">Chargement...</div>
        ) : ordersWithFiches.length === 0 ? (
          <div className="text-center text-ink-mute italic py-12">Aucune commande GM ce jour.</div>
        ) : tab === 'client' ? (
          <ClientTab
            ordersWithFiches={ordersWithFiches}
            palette={palette}
            showDone={showDone}
            currentUserId={currentUser?.id}
            onChange={refresh}
            onPhotoClick={setLightboxUrl}
          />
        ) : (
          <ProductTab
            ordersWithFiches={ordersWithFiches}
            palette={palette}
            showDone={showDone}
            currentUserId={currentUser?.id}
            onChange={refresh}
            onPhotoClick={setLightboxUrl}
          />
        )}
      </div>

      {/* Lightbox photo plein ecran */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center cursor-pointer p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="" className="max-h-full max-w-full object-contain rounded-lg shadow-2xl" />
          <button
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 backdrop-blur text-white text-[20px] hover:bg-white/30"
          >×</button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// VUE PAR CLIENT : par heure -> client -> produits
// ============================================================
function ClientTab({ ordersWithFiches, palette, showDone, currentUserId, onChange, onPhotoClick }) {
  // Grouper par heure
  const byHour = useMemo(() => {
    const map = new Map()
    for (const { order, items } of ordersWithFiches) {
      const dt = new Date(order.delivery_at)
      const h = `${String(dt.getHours()).padStart(2, '0')}h-${String(dt.getHours() + 1).padStart(2, '0')}h`
      if (!map.has(h)) map.set(h, [])
      map.get(h).push({ order, items })
    }
    return map
  }, [ordersWithFiches])

  return (
    <div className="space-y-4">
      {[...byHour.entries()].map(([hour, group]) => {
        // Filtrer items selon showDone
        const filtered = group
          .map(({ order, items }) => ({
            order,
            items: items.filter(({ fiche, dones }) => {
              if (!fiche) return !showDone  // non defini : seulement dans 'a faire'
              const fullyDone = isItemFullyDone(fiche, dones)
              return showDone ? dones.length > 0 : !fullyDone
            }),
          }))
          .filter(({ items }) => items.length > 0)

        if (filtered.length === 0) return null

        return (
          <div key={hour}>
            <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-2 font-bold">
              {hour}
            </div>
            {filtered.map(({ order, items }) => (
              <ClientCard
                key={order.id}
                order={order}
                items={items}
                palette={palette}
                showDone={showDone}
                currentUserId={currentUserId}
                onChange={onChange}
                onPhotoClick={onPhotoClick}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// Carte d'un client (1 commande)
function ClientCard({ order, items, palette, showDone, currentUserId, onChange, onPhotoClick }) {
  return (
    <div className="bg-cream-warm rounded-lg p-3 mb-3 border border-line/50">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div>
          <span className="font-mono text-[10px] text-bordeaux font-bold tracking-wider">{order.order_num}</span>
          <span className="text-[14px] font-medium text-ink ml-2">— {order.client_name || 'Sans nom'}</span>
        </div>
      </div>

      <div className="space-y-2">
        {items.map(({ item, fiche, dones }) => (
          <ItemCard
            key={item.id}
            item={item}
            fiche={fiche}
            dones={dones}
            palette={palette}
            showDone={showDone}
            currentUserId={currentUserId}
            onChange={onChange}
            onPhotoClick={onPhotoClick}
          />
        ))}
      </div>
    </div>
  )
}

// Carte d'un item GM (avec sa fiche et ses lots)
function ItemCard({ item, fiche, dones, palette, showDone, currentUserId, onChange, onPhotoClick }) {
  const realQty = getRealQuantity(item)
  const photoUrl = Array.isArray(item.image_urls) && item.image_urls[0] ? item.image_urls[0] : null

  // Pas de fiche = "à définir"
  if (!fiche) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded p-2 flex items-center gap-2">
        <div className="w-12 h-12 rounded bg-amber-100 flex items-center justify-center text-[18px] text-amber-700 flex-shrink-0">⚠</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-amber-900 truncate">{item.title}</div>
          <div className="text-[11px] text-amber-700 italic">À définir par la vendeuse</div>
        </div>
      </div>
    )
  }

  const typeGm = fiche.type_gm
  const emoji = TYPE_EMOJIS[typeGm] || '✏️'

  async function toggleLotDone(lotIdx, currentlyDone) {
    try {
      if (currentlyDone) {
        await unmarkLotDone(item.id, lotIdx)
      } else {
        await markLotDone(item.id, lotIdx, currentUserId)
      }
      onChange && onChange()
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + e.message)
    }
  }

  async function toggleAllDone() {
    try {
      const fullyDone = isItemFullyDone(fiche, dones)
      if (fullyDone) {
        await unmarkItemAllDone(item.id)
      } else {
        if (fiche.parfum_normal) {
          await markLotDone(item.id, -1, currentUserId)
        } else {
          const lotsCount = (fiche.lots || []).length
          if (lotsCount > 0) {
            await markItemAllDone(item.id, lotsCount, currentUserId)
          }
        }
      }
      onChange && onChange()
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + e.message)
    }
  }

  const fullyDone = isItemFullyDone(fiche, dones)

  return (
    <div className={`bg-white rounded border border-line/60 p-2 ${fullyDone ? 'opacity-60' : ''}`}>
      <div className="flex gap-2 items-start">
        {/* Photo */}
        <button
          onClick={() => photoUrl && onPhotoClick && onPhotoClick(photoUrl)}
          className="w-14 h-14 rounded bg-cream-warm border border-line/40 flex items-center justify-center flex-shrink-0 overflow-hidden hover:opacity-80 transition-opacity"
          disabled={!photoUrl}
          title={photoUrl ? 'Agrandir' : ''}
        >
          {photoUrl ? (
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[24px] opacity-50">{emoji}</span>
          )}
        </button>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] font-medium text-ink">
              {TYPE_LABELS[typeGm]} ({realQty})
            </span>
            {fiche.is_mixte && <span className="text-[10px] font-mono text-bordeaux uppercase tracking-wider">MIXTE</span>}
            {fiche.parfum_normal && <span className="text-[10px] text-ink-mute italic">parfum normal</span>}
          </div>

          {fiche.note_patissier && (
            <div className="text-[11px] text-amber-700 italic mt-1">📝 {fiche.note_patissier}</div>
          )}

          {/* Lots */}
          {!fiche.parfum_normal && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(fiche.lots || []).map((lot, idx) => {
                const done = isLotDone(dones, idx)
                if (showDone && !done) return null
                if (!showDone && done) return null
                const couleur = findColor(palette, lot.couleur_id)
                const zigzag = findColor(palette, lot.zigzag_couleur_id)
                const perles = findColor(palette, lot.perles_couleur_id)
                return (
                  <button
                    key={idx}
                    onClick={() => toggleLotDone(idx, done)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border transition-all ${
                      done
                        ? 'bg-success/10 border-success/30 text-success line-through'
                        : 'bg-cream-warm border-line hover:border-bordeaux'
                    }`}
                  >
                    <span className="font-medium">×{lot.qty}</span>
                    {lot.parfum && <span>{lot.parfum}</span>}
                    {couleur && (
                      <span className="w-3 h-3 rounded-full border border-line/40" style={{ backgroundColor: couleur.hex }} title={couleur.nom} />
                    )}
                    {lot.forme && <span className="capitalize">{lot.forme}</span>}
                    {lot.has_zigzag && zigzag && (
                      <span className="inline-flex items-center gap-0.5">
                        <span className="text-ink-mute">·zig</span>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zigzag.hex }} />
                      </span>
                    )}
                    {lot.has_perles && perles && (
                      <span className="inline-flex items-center gap-0.5">
                        <span className="text-ink-mute">·perl</span>
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: perles.hex }} />
                      </span>
                    )}
                    <span className="ml-1">{done ? '✓' : '○'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Bouton tout fait */}
        <button
          onClick={toggleAllDone}
          className={`text-[10px] px-2 py-1 rounded-full whitespace-nowrap transition-colors ${
            fullyDone
              ? 'bg-success/10 text-success border border-success/30'
              : 'bg-bordeaux text-cream border border-bordeaux hover:bg-bordeaux-deep'
          }`}
        >
          {fullyDone ? '✓ tout fait' : 'Tout fait'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// VUE PAR PRODUIT : agrege fusion par parfum + couleur
// ============================================================
function ProductTab({ ordersWithFiches, palette, showDone, currentUserId, onChange, onPhotoClick }) {
  const products = useMemo(() => aggregateByProduct(ordersWithFiches), [ordersWithFiches])

  if (products.length === 0) {
    return <div className="text-center text-ink-mute italic py-12">Aucun produit défini.</div>
  }

  function handlePrint() {
    const html = buildPrintHtml(products, palette)
    const w = window.open('', '_blank')
    if (!w) return alert('Bloquez les popups ?')
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="space-y-3">
      {!showDone && (
        <div className="flex justify-end">
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 border border-bordeaux text-bordeaux rounded-full text-[11px] hover:bg-bordeaux hover:text-cream transition-colors"
          >
            🖨 Imprimer non faites
          </button>
        </div>
      )}
      {products.map(prod => (
        <ProductCard
          key={prod.typeGm}
          product={prod}
          palette={palette}
          showDone={showDone}
          currentUserId={currentUserId}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

// HTML pour impression "non faites" (vue par produit)
function buildPrintHtml(products, palette) {
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  let body = ''
  for (const prod of products) {
    let prodHtml = ''
    for (const [parfum, entries] of Object.entries(prod.parfums)) {
      const notDoneEntries = entries.filter(e => e.doneCount < e.totalSources)
      if (notDoneEntries.length === 0) continue
      const parfumLabel = parfum === '__normal__' ? 'Parfum normal' : parfum === '__sansparfum__' ? '(sans parfum)' : parfum === '__pasdefini__' ? 'Pas défini' : parfum
      let chips = ''
      for (const e of notDoneEntries) {
        const couleur = palette.find(c => c.id === e.lot.couleur_id)
        const zigzag = palette.find(c => c.id === e.lot.zigzag_couleur_id)
        const perles = palette.find(c => c.id === e.lot.perles_couleur_id)
        let extras = ''
        if (couleur) extras += ` <span style="background:${couleur.hex};display:inline-block;width:9px;height:9px;border-radius:50%;border:1px solid #999"></span> ${couleur.nom}`
        if (e.lot.forme) extras += ` · ${e.lot.forme}`
        if (e.lot.has_zigzag && zigzag) extras += ` · zig ${zigzag.nom}`
        if (e.lot.has_perles && perles) extras += ` · perl ${perles.nom}`
        let detail = ''
        if (e.totalSources > 1 && !e.notDefined) {
          detail = ' <span style="color:#888;font-size:9px">(' + e.sources.map(s => `${s.orderNum} ${s.clientName} ×${s.qty}`).join(', ') + ')</span>'
        } else if (e.notDefined) {
          detail = ` <span style="color:#888;font-size:9px">${e.itemTitle || ''} — ${e.sources[0].orderNum} ${e.sources[0].clientName}</span>`
        }
        chips += `<div style="margin:2px 0">×${e.qty} ${extras}${detail}</div>`
      }
      if (chips) {
        prodHtml += `<div style="margin:6px 0 0;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#666">${parfumLabel}</div>${chips}`
      }
    }
    if (prodHtml) {
      body += `<div style="margin:10px 0;padding:6px;border-bottom:1px solid #ccc"><div style="font-size:13px;font-weight:600">${prod.emoji} ${prod.label}</div>${prodHtml}</div>`
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pâtissier - ${today}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;color:#222;margin:12px;line-height:1.4}
  h1{font-size:14px;margin:0 0 4px}
  @media print{body{margin:6mm}}
</style></head><body>
<h1>🍰 Pâtissier · ${today} · À FAIRE</h1>
${body || '<p>Tout est fait !</p>'}
</body></html>`
}

function ProductCard({ product, palette, showDone, currentUserId, onChange }) {
  const [expanded, setExpanded] = useState(null) // entry pour montrer detail clients

  // Filter parfums: skip ceux qui n'ont aucun lot a afficher selon showDone
  const visibleParfums = Object.entries(product.parfums).map(([parfum, entries]) => ({
    parfum,
    entries: entries.filter(e => {
      const allDone = e.doneCount >= e.totalSources
      return showDone ? e.doneCount > 0 : !allDone
    }),
  })).filter(({ entries }) => entries.length > 0)

  if (visibleParfums.length === 0) return null

  // Compter total
  const totalQty = visibleParfums.reduce((s, { entries }) => s + entries.reduce((s2, e) => s2 + e.qty, 0), 0)

  return (
    <div className="bg-cream-warm rounded-lg border border-line/50 p-3">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-line/40">
        <span className="text-[20px]">{product.emoji}</span>
        <div>
          <div className="text-[14px] font-medium text-ink">{product.label}</div>
          <div className="text-[11px] text-ink-mute">{totalQty} pièces total</div>
        </div>
      </div>

      <div className="space-y-2">
        {visibleParfums.map(({ parfum, entries }) => (
          <div key={parfum} className={`rounded border p-2 ${product.isNonDefini ? 'bg-amber-50 border-amber-200' : 'bg-white border-line/40'}`}>
            <div className={`text-[11px] font-mono uppercase tracking-wider mb-1.5 ${product.isNonDefini ? 'text-amber-700' : 'text-ink-mute'}`}>
              {parfum === '__normal__' ? 'Parfum normal' : parfum === '__sansparfum__' ? '(sans parfum)' : parfum === '__pasdefini__' ? '⚠ Pas défini' : parfum}
            </div>

            {product.isNonDefini ? (
              // Liste detaillee pour les non definis
              <div className="space-y-1">
                {entries.map((entry, idx) => (
                  <div key={idx} className="text-[12px] text-amber-900">
                    <span className="font-mono text-amber-700">{entry.sources[0].orderNum}</span>
                    <span> · {entry.sources[0].clientName} · ×{entry.qty}</span>
                    <span className="text-amber-700 italic ml-1">— {entry.itemTitle}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1">
                  {entries.map((entry, idx) => (
                    <AggLotChip
                      key={idx}
                      entry={entry}
                      palette={palette}
                      currentUserId={currentUserId}
                      onChange={onChange}
                      onShowDetail={() => setExpanded(expanded === entry ? null : entry)}
                      isExpanded={expanded === entry}
                    />
                  ))}
                </div>

                {expanded && entries.includes(expanded) && (
                  <div className="mt-2 pl-2 border-l-2 border-bordeaux/30 text-[11px] text-ink-soft space-y-0.5">
                    {expanded.sources.map((s, i) => (
                      <div key={i}>
                        <span className="font-mono text-bordeaux">{s.orderNum}</span>
                        <span> · {s.clientName} · ×{s.qty}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function AggLotChip({ entry, palette, currentUserId, onChange, onShowDetail, isExpanded }) {
  const allDone = entry.doneCount >= entry.totalSources
  const couleur = findColor(palette, entry.lot.couleur_id)
  const zigzag = findColor(palette, entry.lot.zigzag_couleur_id)
  const perles = findColor(palette, entry.lot.perles_couleur_id)

  async function toggle() {
    try {
      // Marquer/demarquer toutes les sources
      for (const s of entry.sources) {
        if (s.lotIdx === -1) {
          // parfum_normal : 1 done par item
          if (allDone) {
            await unmarkItemAllDone(s.itemId)
          } else {
            await markLotDone(s.itemId, -1, currentUserId)
          }
        } else {
          if (allDone) {
            await unmarkLotDone(s.itemId, s.lotIdx)
          } else {
            await markLotDone(s.itemId, s.lotIdx, currentUserId)
          }
        }
      }
      onChange && onChange()
    } catch (e) {
      console.error(e)
      alert('Erreur : ' + e.message)
    }
  }

  return (
    <div className="inline-flex items-center gap-1">
      <button
        onClick={toggle}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border transition-all ${
          allDone
            ? 'bg-success/10 border-success/30 text-success line-through'
            : 'bg-cream-warm border-line hover:border-bordeaux'
        }`}
      >
        <span className="font-medium">×{entry.qty}</span>
        {couleur && (
          <span className="w-3 h-3 rounded-full border border-line/40" style={{ backgroundColor: couleur.hex }} title={couleur.nom} />
        )}
        {entry.lot.forme && <span className="capitalize">{entry.lot.forme}</span>}
        {entry.lot.has_zigzag && zigzag && (
          <span className="inline-flex items-center gap-0.5">
            <span className="text-ink-mute">·zig</span>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: zigzag.hex }} />
          </span>
        )}
        {entry.lot.has_perles && perles && (
          <span className="inline-flex items-center gap-0.5">
            <span className="text-ink-mute">·perl</span>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: perles.hex }} />
          </span>
        )}
        <span className="ml-1">{allDone ? '✓' : entry.totalSources > 1 ? `(${entry.totalSources})` : '○'}</span>
      </button>
      {entry.totalSources > 1 && (
        <button
          onClick={onShowDetail}
          className="text-[10px] text-ink-mute hover:text-bordeaux px-1"
          title="Voir détail clients"
        >
          {isExpanded ? '▼' : '▶'}
        </button>
      )}
    </div>
  )
}
