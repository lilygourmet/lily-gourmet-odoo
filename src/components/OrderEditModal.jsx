import { useState, useEffect, useRef } from 'react'
import { loadOrderLines, addOrderLine, updateOrderLine, deleteOrderLine, addOrderWarning, removeOrderWarning, updateOrderDate, loadOrderCatalog, loadOrderProduct, loadWarehouses, setOrderWarehouse } from '../lib/commande'
import { recordDevisTraitement } from '../lib/conversations'
import { createModification } from '../lib/modifications'
import { ConfiguratorModal, PRICE_EDITABLE, PHOTO_WARN } from './ProductConfigurator'
import CakeDayPlanning from './CakeDayPlanning'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'

// Fenêtre « ✏️ Articles » : modifie les articles d'une commande Odoo (ajouter /
// modifier quantité-prix / supprimer). Écrit directement dans Odoo via l'API.
export default function OrderEditModal({ order, onClose, onChanged, user }) {
  // Journal interne des commandes : trace TOUS les changements (non bloquant).
  const logModif = (detail) => {
    recordDevisTraitement({
      order_num: order.name, action: 'modification', detail,
      user_id: user?.id, user_name: user?.full_name || user?.username,
    }).catch(() => {})
  }
  // Demande « Modifications » + notif WhatsApp aux « 🔧 Notif modifications » :
  // UNIQUEMENT pour une vraie modification = quantité qui BAISSE / passe à 0, ou suppression.
  // (Pas pour : ajout d'article, hausse de quantité, prix, remise, message, date…)
  const notifyModif = (detail) => {
    createModification({
      order_ref: order.name, client_name: order.clientName || null, client_phone: order.clientPhone || null,
      requested_by: user?.id || null, description: `✏️ ${detail}`,
    }).catch(() => {})
  }
  const [lines, setLines] = useState(null)        // null = chargement
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [warnFor, setWarnFor] = useState(null)   // id de l'article pour lequel on ajoute une attention
  const [warnText, setWarnText] = useState('')
  const isConfirmed = order.state === 'sale'
  // Date + heure de retrait/livraison (modifiables, même si la commande est confirmée).
  // deliveryAt est en UTC (Odoo) → on l'affiche en heure du Maroc.
  const _pickup = moroccoParts(order.deliveryAt)
  const [dDate, setDDate] = useState(_pickup.date)
  const [dTime, setDTime] = useState(_pickup.time || '16:00')

  async function saveDate() {
    if (!dDate) { toast.error('Choisis une date.'); return }
    setBusy(true)
    try {
      await updateOrderDate(order.id, dDate, dTime)
      logModif(`Date/heure → ${dDate} ${dTime}`)
      toast.success('Date / heure mises à jour ✓')
      onChanged?.()
    } catch (e) { toast.error(e?.message || 'Échec') }
    finally { setBusy(false) }
  }

  async function addWarning(lineId) {
    const w = warnText.trim()
    if (!w) return
    setBusy(true)
    try {
      await addOrderWarning(order.id, lineId, w)
      setWarnText(''); setWarnFor(null)
      toast.success('Attention ajoutée ⚠️')
      await reload()
      onChanged?.()
    } catch (e) { toast.error(e?.message || 'Échec de l\'ajout') }
    finally { setBusy(false) }
  }

  async function deleteWarning(w) {
    setBusy(true)
    try {
      // Ancien format = ligne séparée (noteId) ; nouveau = écrit dans l'article (lineId + idx).
      if (w.noteId != null) await deleteOrderLine(order.id, w.noteId)
      else await removeOrderWarning(order.id, w.lineId, w.idx)
      toast.success('Attention retirée')
      await reload(); onChanged?.()
    } catch (e) { toast.error(e?.message || 'Échec') }
    finally { setBusy(false) }
  }

  // Valeurs d'origine par ligne (pour décrire « avant → après » dans le journal).
  const origRef = useRef({})
  async function reload() {
    try {
      const ls = await loadOrderLines(order.id)
      const snap = {}
      for (const l of ls) snap[l.id] = { qty: l.qty, price: l.price, name: l.rawName ?? l.name, discount: l.discount }
      origRef.current = snap
      setLines(ls)
    }
    catch (e) { toast.error(e?.message || 'Chargement impossible'); setLines([]) }
  }
  useEffect(() => { reload() }, [order.id])
  const [warehouses, setWarehouses] = useState([])
  useEffect(() => { loadWarehouses().then(setWarehouses).catch(() => {}) }, [])

  // Enregistre les quantités / prix modifiés (uniquement les lignes changées).
  async function saveEdits() {
    const changed = lines.filter(l => l._dirty)
    if (changed.length === 0) { onClose(); return }
    setBusy(true)
    try {
      for (const l of changed) {
        let photo = null
        if (l._photoFile) {
          const data = await fileToBase64(l._photoFile)
          photo = { name: l._photoName || l._photoFile.name, data, mimetype: l._photoFile.type || 'image/jpeg' }
        }
        await updateOrderLine(order.id, l.id, { qty: l.qty, price: l.price, name: l.rawName, discount: l.discount, photo })
      }
      logModif(changed.map(l => describeLineChange(l, origRef.current[l.id])).join(' ; '))
      // Vraie modification : un article dont la quantité a BAISSÉ (ou est passée à 0).
      const reductions = changed.filter(l => {
        const o = Number(origRef.current[l.id]?.qty), n = Number(l.qty)
        return Number.isFinite(o) && Number.isFinite(n) && n < o
      })
      if (reductions.length) {
        notifyModif(reductions.map(l => `${firstLine(l.rawName ?? l.name)} : qté ${origRef.current[l.id]?.qty}→${l.qty}${Number(l.qty) === 0 ? ' (retiré)' : ''}`).join(' ; '))
      }
      toast.success('Modifications enregistrées ✅')
      onChanged?.()
      onClose()
    } catch (e) {
      toast.error(e?.message || "Échec de l'enregistrement")
    } finally { setBusy(false) }
  }

  async function removeLine(l) {
    const ok = await confirmDialog(
      `Supprimer « ${firstLine(l.name)} » de la commande ${order.name} ?`,
      { danger: true, confirmLabel: 'Supprimer' }
    )
    if (!ok) return
    setBusy(true)
    try {
      await deleteOrderLine(order.id, l.id)
      logModif(`Article supprimé : ${firstLine(l.name)}`)
      notifyModif(`Article supprimé : ${firstLine(l.name)}`)   // suppression = vraie modification
      toast.success('Article supprimé')
      await reload()
      onChanged?.()
    } catch (e) {
      toast.error(e?.message || 'Échec de la suppression')
    } finally { setBusy(false) }
  }

  function patchLine(id, patch) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch, _dirty: true } : l))
  }

  // Colle une image depuis le presse-papier (copie une image puis clique « Coller »).
  async function pasteLinePhoto(lineId) {
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'))
        if (type) {
          const blob = await it.getType(type)
          const ext = (type.split('/')[1] || 'png').replace('jpeg', 'jpg')
          const file = new File([blob], `coller.${ext}`, { type })
          patchLine(lineId, { _photoFile: file, _photoName: file.name, _photoPreview: URL.createObjectURL(file) })
          toast.success('Photo collée ✓')
          return
        }
      }
      toast.error("Aucune image dans le presse-papier (copie d'abord une image).")
    } catch {
      toast.error("Collage refusé. Autorise le presse-papier, ou utilise « Ajouter ».")
    }
  }

  // Y a-t-il des modifs non enregistrées ? + total des articles mis à jour en direct.
  const dirty = Array.isArray(lines) && lines.some(l => l._dirty)
  const total = Array.isArray(lines)
    ? lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - (Number(l.discount) || 0) / 100), 0)
    : 0
  // Fermeture protégée : si des modifs ne sont pas enregistrées, on demande confirmation.
  async function tryClose() {
    if (dirty) {
      const ok = await confirmDialog('Tu as des modifications non enregistrées. Fermer sans les enregistrer ?', { danger: true, confirmLabel: 'Fermer sans enregistrer' })
      if (!ok) return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={tryClose}>
      <div className="bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="flex items-start justify-between gap-2 px-5 pt-5">
          <div>
            <div className="font-mono text-[13px] font-semibold text-bordeaux">{order.name}</div>
            <div className="font-fraunces italic text-[20px] text-ink leading-tight">{order.clientName || '—'}</div>
          </div>
          <button onClick={tryClose} className="text-ink-mute hover:text-bordeaux text-[18px]">✕</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-soft px-5 mt-2 mb-3">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{isConfirmed ? 'Confirmée' : 'Devis'}</span>
          {order.pickupText && <span>🗓️ {order.pickupText}</span>}
        </div>

        {/* Date + heure de retrait/livraison — modifiable (même si confirmée) */}
        <div className="mx-5 mb-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-1">Date / heure de retrait-livraison</div>
          <div className="flex items-center gap-1.5">
            <input type="date" value={dDate} onChange={e => setDDate(e.target.value)}
              className="flex-1 px-2 py-1.5 border border-line rounded-lg text-[13px] bg-white focus:outline-none focus:border-bordeaux" />
            <input type="time" value={dTime} onChange={e => setDTime(e.target.value)}
              className="px-2 py-1.5 border border-line rounded-lg text-[13px] bg-white focus:outline-none focus:border-bordeaux" />
            <button onClick={saveDate} disabled={busy || !dDate}
              className="px-3 py-1.5 bg-bordeaux text-cream rounded-lg text-[12px] font-medium disabled:opacity-50">OK</button>
          </div>
          {/* Planning cake design du jour (guide la répartition) — si la commande a un CD-. */}
          {dDate && Array.isArray(lines) && lines.some(l => /^CD-/i.test(l.rawName ?? l.name ?? '')) && (
            <CakeDayPlanning date={dDate} selectedHour={parseInt(dTime, 10)}
              onPick={h => setDTime(`${String(h).padStart(2, '0')}:00`)} />
          )}
        </div>

        {/* Entrepôt — changeable avant confirmation (ex. commande venue du lien client) */}
        {warehouses.length > 0 && (
          <div className="mx-5 mb-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-1">Entrepôt</div>
            <select defaultValue=""
              onChange={async e => { const id = e.target.value; if (!id) return; try { await setOrderWarehouse(order.id, Number(id)); toast.success('Entrepôt mis à jour ✓'); logModif('Entrepôt changé'); onChanged?.() } catch (err) { toast.error(err?.message || 'Échec') } }}
              className="w-full px-2 py-1.5 border border-line rounded-lg text-[13px] bg-white focus:outline-none focus:border-bordeaux">
              <option value="">— Choisir un entrepôt —</option>
              {[warehouses.find(w => !/vitrine/i.test(w.name)), ...warehouses.filter(w => /vitrine/i.test(w.name))].filter(Boolean).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        {isConfirmed && (
          <div className="mx-5 mb-3 text-[11px] text-warn-ink bg-warn-bg border border-warn/40 rounded-lg px-3 py-2">
            ⚠️ Commande confirmée : la modification change la vraie commande dans Odoo.
          </div>
        )}

        {/* Liste des articles */}
        <div className="px-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">Articles</div>

          {lines === null ? (
            <div className="text-[13px] text-ink-mute py-4">Chargement…</div>
          ) : lines.length === 0 ? (
            <div className="text-[13px] text-ink-mute py-4">Aucun article.</div>
          ) : lines.map(l => (
            <div key={l.id} className="bg-white border border-line rounded-xl p-3 mb-2">
              <div className="text-[14px] text-ink font-medium">{firstLine(l.rawName ?? l.name)}</div>
              {/* Détails modifiables : parfum, thème, âge, message — apparaît tel quel dans le message WhatsApp au client */}
              <div className="text-[10px] text-ink-mute mt-1.5">Parfum / thème / âge <span className="opacity-70">(apparaît dans le message WhatsApp)</span></div>
              <textarea
                value={detailsNoMsg(l.rawName ?? l.name)}
                onChange={e => { const s = splitDetails(l.rawName ?? l.name); patchLine(l.id, { rawName: rebuildDetails(s.first, e.target.value.split('\n'), s.message) }) }}
                rows={2}
                placeholder="ex : Parfum : Vanille · Âge : 5"
                className="w-full mt-1 px-2 py-1.5 text-[12px] border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux" />
              {/* Champ MESSAGE dédié : toujours mis proprement sur sa propre ligne « Message : … » */}
              <div className="text-[10px] text-ink-mute mt-2">💬 <b>Message sur le gâteau</b></div>
              <input
                value={splitDetails(l.rawName ?? l.name).message}
                onChange={e => { const s = splitDetails(l.rawName ?? l.name); patchLine(l.id, { rawName: rebuildDetails(s.first, s.restNoMsg, e.target.value) }) }}
                placeholder="ex : Joyeux anniversaire Lina"
                className="w-full mt-1 px-2 py-1.5 text-[12px] border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux" />
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <label className="text-[12px] text-ink-soft flex items-center gap-1.5">
                  Qté
                  <input type="number" min="0" value={l.qty}
                    onChange={e => patchLine(l.id, { qty: e.target.value })}
                    className="w-14 px-2 py-1 text-[13px] text-center border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux" />
                </label>
                <label className="text-[12px] text-ink-soft flex items-center gap-1.5">
                  Prix
                  <input type="number" min="0" value={l.price}
                    onChange={e => patchLine(l.id, { price: e.target.value })}
                    className="w-20 px-2 py-1 text-[13px] text-right border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux" />
                  DH
                </label>
                <label className="text-[12px] text-ink-soft flex items-center gap-1.5">
                  Remise
                  <input type="number" min="0" max="100" value={l.discount ?? 0}
                    onChange={e => patchLine(l.id, { discount: e.target.value })}
                    className="w-14 px-2 py-1 text-[13px] text-center border border-line rounded-lg bg-cream focus:outline-none focus:border-bordeaux" />
                  %
                </label>
                <button onClick={() => removeLine(l)} disabled={busy}
                  className="ml-auto w-8 h-8 flex items-center justify-center rounded-full bg-danger-bg text-danger hover:bg-danger hover:text-white transition-all disabled:opacity-50" title="Supprimer cet article">🗑</button>
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <label className="inline-flex items-center gap-2 text-[12px] text-bordeaux cursor-pointer">
                  📎 {l._photoName || 'Ajouter / changer la photo'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) patchLine(l.id, { _photoFile: f, _photoName: f.name, _photoPreview: URL.createObjectURL(f) }) }} />
                </label>
                <button type="button" onClick={() => pasteLinePhoto(l.id)}
                  className="inline-flex items-center gap-1 text-[12px] text-bordeaux hover:underline">
                  📋 Coller
                </button>
              </div>
              {l._photoPreview && (
                <img src={l._photoPreview} alt="" className="mt-2 max-h-40 rounded-lg border border-line object-contain" />
              )}
              {(l.warnings || []).map(w => (
                <div key={w.noteId ?? `${w.lineId}#${w.idx}`} className="flex items-center gap-2 mt-1.5 text-[12px] text-[#B36B00] font-semibold">
                  <span className="break-words">⚠️ {w.text}</span>
                  <button onClick={() => deleteWarning(w)} disabled={busy} title="Retirer cette attention"
                    className="ml-auto text-ink-mute hover:text-danger text-[12px] flex-shrink-0">✕</button>
                </div>
              ))}
              {warnFor === l.id ? (
                <div className="flex gap-2 mt-2">
                  <input autoFocus value={warnText} onChange={e => setWarnText(e.target.value)}
                    placeholder="⚠️ ex : décor en bleu · sans fruits à coque"
                    className="flex-1 px-2 py-1.5 border border-[#E08A00] bg-[#FFF8EC] rounded-lg text-[12px]" />
                  <button onClick={() => addWarning(l.id)} disabled={busy || !warnText.trim()}
                    className="px-3 py-1.5 bg-[#B36B00] text-white rounded-lg text-[11px] font-medium disabled:opacity-50">OK</button>
                  <button onClick={() => { setWarnFor(null); setWarnText('') }} className="text-ink-mute text-[12px] px-1">✕</button>
                </div>
              ) : (
                <button onClick={() => { setWarnFor(l.id); setWarnText('') }}
                  className="mt-1.5 text-[11px] text-[#B36B00] font-medium hover:underline">+ ⚠️ Attention sur cet article</button>
              )}
            </div>
          ))}

          {!adding ? (
            <button onClick={() => setAdding(true)}
              className="w-full mt-1 mb-1 py-2.5 rounded-xl border border-dashed border-bordeaux/50 text-bordeaux text-[13px] font-medium hover:bg-bordeaux/5 transition-all">
              ➕ Ajouter un article
            </button>
          ) : (
            <AddArticle
              orderId={order.id}
              onLog={(name) => logModif(`Article ajouté : ${name}`)}
              onCancel={() => setAdding(false)}
              onAdded={async () => { setAdding(false); await reload(); onChanged?.() }}
            />
          )}
        </div>

        {/* Total des articles, mis à jour pendant qu'on modifie */}
        {Array.isArray(lines) && lines.length > 0 && (
          <div className="px-5 mt-2 flex items-center justify-between text-[13px]">
            <span className="text-ink-soft">Total articles</span>
            <span className="font-semibold text-ink">{Math.round(total).toLocaleString('fr-FR')} DH</span>
          </div>
        )}

        {/* Pied */}
        <div className="px-5 py-4 mt-2 border-t border-line bg-cream-deep/40 flex items-center gap-2">
          <button onClick={tryClose} className="text-[13px] text-ink-mute px-3 py-2">Fermer</button>
          {dirty && <span className="text-[11px] text-bordeaux font-medium">● non enregistré</span>}
          <button onClick={saveEdits} disabled={busy || lines === null}
            className="ml-auto px-5 py-2 bg-bordeaux text-cream rounded-full text-[13px] font-medium tracking-wider hover:bg-bordeaux-deep transition-all disabled:opacity-50">
            {busy ? '⏳ …' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Sous-panneau : MÊME configurateur que « Nouvelle commande », mais écrit dans la commande Odoo ----
function AddArticle({ orderId, onCancel, onAdded, onLog }) {
  const [cats, setCats] = useState(null)
  const [activeCat, setActiveCat] = useState(null)
  const [cfg, setCfg] = useState(null)             // produit en cours de configuration (cf. ConfiguratorModal)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadOrderCatalog()
      .then(cs => { setCats(cs); setActiveCat(cs[0]?.key || null) })
      .catch(e => { toast.error(e?.message || 'Catalogue indisponible'); setCats([]) })
  }, [])

  const cat = (cats || []).find(c => c.key === activeCat) || null

  function onTileClick(item) {
    if (!item.configurable) {
      let name = item.name
      // « Autre » : on saisit ce que c'est (description = nom de la ligne).
      if (activeCat === 'divers' && /^autre$/i.test(item.name)) {
        const d = window.prompt('Décris l\'article « Autre » (ce que c\'est) :', '')
        if (d === null) return
        name = d.trim() || 'Autre'
      }
      addToOrder({ name, desc: '', warn: '', photoFile: null, price: item.price ?? 0, variantId: item.variantId })
      return
    }
    setCfg({ item, catKey: activeCat, loading: true, attributes: [], variants: [], sel: {}, text: {}, warn: '', photo: '' })
    loadOrderProduct(item.tmplId)
      .then(d => setCfg(c => c && c.item.tmplId === item.tmplId ? { ...c, loading: false, attributes: d.attributes, variants: d.variants } : c))
      .catch(e => { toast.error('Erreur : ' + e.message); setCfg(null) })
  }

  async function addToOrder(line) {
    if (!line.variantId) { toast.error('Choisis les options du produit'); return }
    setBusy(true)
    try {
      // Le ⚠️ part dans la description → repéré comme warning sur l'article (cf. op list).
      const desc = [line.desc, line.warn ? `⚠️ ${line.warn}` : ''].filter(Boolean).join('\n')
      let photo = null
      if (line.photoFile) {
        const data = await fileToBase64(line.photoFile)
        photo = { name: line.photoName || line.photoFile.name, data, mimetype: line.photoFile.type || 'image/jpeg' }
      }
      await addOrderLine(orderId, { variantId: line.variantId, qty: 1, price: line.price, name: line.name, desc, photo })
      onLog?.(line.name)
      toast.success('Article ajouté ✅')
      onAdded()
    } catch (e) { toast.error(e?.message || "Échec de l'ajout") }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-white border border-line rounded-xl p-3 mt-1 mb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="font-fraunces italic text-[16px] text-ink">Ajouter un article</div>
        <button onClick={onCancel} className="text-ink-mute hover:text-bordeaux text-[16px]">✕</button>
      </div>

      {cats === null ? (
        <div className="text-[13px] text-ink-mute py-2">Chargement du catalogue…</div>
      ) : (
        <>
          {/* Catégories */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {cats.map(c => (
              <button key={c.key} onClick={() => setActiveCat(c.key)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium border ${activeCat === c.key ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft hover:border-bordeaux'}`}>
                {c.label}
              </button>
            ))}
          </div>

          {/* Grille de tuiles (même affichage que « Nouvelle commande ») */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(cat?.items || []).map(item => (
              <button key={item.tmplId} onClick={() => onTileClick(item)} disabled={busy}
                className={`text-center rounded-xl border p-2 bg-cream-warm hover:border-bordeaux transition-all disabled:opacity-50 ${item.configurable ? 'border-dashed border-bordeaux/50' : 'border-line'}`}>
                {item.image
                  ? <img src={item.image} alt="" loading="lazy" className="w-full aspect-square object-cover rounded-lg mb-1.5" />
                  : <div className="w-full aspect-square rounded-lg bg-cream mb-1.5 flex items-center justify-center text-ink-mute text-[11px]">Pas de photo</div>}
                <div className="text-[13px] font-semibold text-ink leading-tight">{item.name}</div>
                <div className="text-[12px] font-bold text-bordeaux mt-1">{item.configurable ? 'configurer' : `${item.price ?? '—'} DH`}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {cfg && (
        <ConfiguratorModal
          cfg={cfg}
          onChange={setCfg}
          onClose={() => setCfg(null)}
          onAdd={(line) => { addToOrder(line); setCfg(null) }}
          withPhotoWarn={PHOTO_WARN.has(activeCat)}
          priceEditable={PRICE_EDITABLE.has(activeCat)}
          addLabel="Ajouter à la commande"
        />
      )}
    </div>
  )
}

// Convertit un datetime UTC (Odoo) en { date, time } en heure du Maroc, pour pré-remplir les champs.
function moroccoParts(s) {
  if (!s) return { date: '', time: '16:00' }
  const dt = new Date(String(s).replace(' ', 'T') + 'Z')
  if (isNaN(dt)) return { date: String(s).slice(0, 10), time: String(s).slice(11, 16) || '16:00' }
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(dt).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

function firstLine(s) { return String(s || '').split('\n')[0] }
function restLines(s) { return String(s || '').split('\n').slice(1).join('\n').trim() }

// Sépare le libellé d'un article : 1ʳᵉ ligne (produit), détails sans le message, et le message seul.
function splitDetails(raw) {
  const lines = String(raw || '').split('\n')
  const first = lines[0] || ''
  const rest = lines.slice(1)
  const idx = rest.findIndex(l => /^\s*message\s*:/i.test(l))
  const message = idx >= 0 ? rest[idx].replace(/^\s*message\s*:\s?/i, '') : ''
  const restNoMsg = rest.filter((_, i) => i !== idx)
  return { first, restNoMsg, message }
}
function detailsNoMsg(raw) { return splitDetails(raw).restNoMsg.join('\n').trim() }
// Reconstruit le libellé : produit + détails + (message sur sa PROPRE ligne « Message : … »).
function rebuildDetails(first, restNoMsg, message) {
  const lines = [first]
  for (const l of restNoMsg) if (String(l).trim() !== '') lines.push(l)
  if (String(message || '').trim()) lines.push(`Message : ${message}`)
  return lines.join('\n')
}

// Décrit ce qui a changé sur une ligne (avant → après) pour le Journal des commandes.
function describeLineChange(l, orig) {
  const name = firstLine(l.rawName ?? l.name)
  if (!orig) return name
  const parts = []
  if (Number(orig.qty) !== Number(l.qty)) parts.push(`qté ${orig.qty}→${l.qty}`)
  if (Number(orig.price) !== Number(l.price)) parts.push(`prix ${orig.price}→${l.price}`)
  if (Number(orig.discount || 0) !== Number(l.discount || 0)) parts.push(`remise ${orig.discount || 0}%→${l.discount || 0}%`)
  if ((orig.name || '') !== (l.rawName ?? l.name ?? '')) parts.push('texte')
  if (l._photoFile) parts.push('photo')
  return parts.length ? `${name} (${parts.join(', ')})` : name
}

// Lit une image en base64 (sans le préfixe data:) pour l'envoyer à Odoo.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] || '')
    r.onerror = reject
    r.readAsDataURL(file)
  })
}
