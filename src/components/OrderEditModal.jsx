import { useState, useEffect, useRef } from 'react'
import CopyableRef from './CopyableRef'
import { loadOrderLines, addOrderLine, updateOrderLine, deleteOrderLine, addOrderWarning, removeOrderWarning, updateOrderDate, loadOrderCatalog, loadOrderProduct, loadWarehouses, setOrderWarehouse, removeOrderPhoto } from '../lib/commande'
import { loadLivreurs, loadDeliveryStates, assignDelivery, setLivraisonLocalisation } from '../lib/deliveries'
import { recordDevisTraitement, loadDevisPhotos } from '../lib/conversations'
import { createModification } from '../lib/modifications'
import { ConfiguratorModal, PRICE_EDITABLE } from './ProductConfigurator'
import CakeDayPlanning from './CakeDayPlanning'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { filePhoto } from '../lib/photoCompress'

// Fenêtre « ✏️ Articles » : modifie les articles d'une commande Odoo (ajouter /
// modifier quantité-prix / supprimer). Écrit directement dans Odoo via l'API.
export default function OrderEditModal({ order, onClose, onChanged, user, embedded = false }) {
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
    // Si la commande est encore un DEVIS (non confirmée), pas de demande de modification :
    // modifier un devis fait partie de la prise de commande normale, rien n'est en production.
    if (order.state !== 'sale') return
    createModification({
      order_ref: order.name, client_name: order.clientName || null, client_phone: order.clientPhone || null,
      requested_by: user?.id || null, description: `✏️ ${detail}`,
    }).catch(() => {})
  }
  const [lines, setLines] = useState(null)        // null = chargement
  const [photos, setPhotos] = useState([])        // photos déjà enregistrées dans la commande
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState([])         // articles à ajouter (écrits dans Odoo au moment d'« Enregistrer »)
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
  // Photos déjà attachées à la commande (pour les revoir au lieu de croire qu'elles ont disparu).
  function reloadPhotos() { loadDevisPhotos(order.id).then(setPhotos).catch(() => setPhotos([])) }
  useEffect(() => { reloadPhotos() }, [order.id])

  // Supprime une photo déjà enregistrée dans la commande.
  async function deletePhoto(p) {
    if (!await confirmDialog('Supprimer cette photo de la commande ?', { danger: true, confirmLabel: 'Supprimer' })) return
    setBusy(true)
    try {
      await removeOrderPhoto(order.id, p.id)
      logModif('Photo supprimée')
      toast.success('Photo supprimée')
      reloadPhotos(); onChanged?.()
    } catch (e) { toast.error(e?.message || 'Échec') }
    finally { setBusy(false) }
  }
  const [warehouses, setWarehouses] = useState([])
  useEffect(() => { loadWarehouses().then(setWarehouses).catch(() => {}) }, [])

  // Livreur + adresse (table `livraisons`, indépendant d'Odoo) — pour les commandes avec livraison.
  const [livreurs, setLivreurs] = useState([])
  const [livreurId, setLivreurId] = useState(null)
  const [livraisonLoc, setLivraisonLoc] = useState('')
  useEffect(() => { loadLivreurs().then(setLivreurs).catch(() => {}) }, [])
  useEffect(() => {
    loadDeliveryStates([order.name]).then(m => {
      const s = m[order.name]
      if (s) { setLivreurId(s.livreur_id || null); setLivraisonLoc(s.localisation || '') }
    }).catch(() => {})
  }, [order.name])
  // Détecte une ligne « Livraison (…) » (le produit livraison s'appelle toujours ainsi).
  const hasLivraison = Array.isArray(lines) && lines.some(l => /^\s*livraison\b/i.test(firstLine(l.rawName ?? l.name ?? '')))

  async function saveLivraison() {
    if (!livreurId) { toast.error('Choisis un livreur.'); return }
    setBusy(true)
    try {
      const defaultLivreurId = livreurs.find(l => l.livreur_defaut || l.perm_livreur_defaut)?.id || null
      const autoAccept = livreurId === defaultLivreurId
      await assignDelivery({ orderNum: order.name, livreurId, byUserId: user?.id, titre: `🚚 Livraison ${order.name}`, description: order.clientName || '', autoAccept })
      await setLivraisonLocalisation(order.name, livraisonLoc)
      logModif('Livreur / adresse mis à jour')
      toast.success('Livreur / adresse enregistrés ✓')
      onChanged?.()
    } catch (e) { toast.error(e?.message || 'Échec') }
    finally { setBusy(false) }
  }

  // --- Articles à AJOUTER (panier temporaire) : reclique = quantité +1 ---
  function addToDraft(line) {
    if (!line.variantId) { toast.error('Choisis les options du produit'); return }
    setDraft(prev => {
      const sig = `${line.variantId}|${line.name}|${line.desc || ''}|${line.warn || ''}`
      const i = prev.findIndex(x => x._sig === sig && !(x.photoFiles?.length) && !(line.photoFiles?.length))
      if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n }
      return [...prev, { ...line, _sig: sig, key: Date.now() + '' + Math.random(), qty: 1 }]
    })
  }
  function setDraftQty(key, d) { setDraft(prev => prev.flatMap(x => x.key === key ? (x.qty + d <= 0 ? [] : [{ ...x, qty: x.qty + d }]) : [x])) }
  function removeDraft(key) { setDraft(prev => prev.filter(x => x.key !== key)) }
  const draftCount = draft.reduce((s, x) => s + x.qty, 0)

  // Écrit les articles en attente dans la commande Odoo (appelé par « Enregistrer »).
  async function commitDraft() {
    for (const line of draft) {
      // Le ⚠️ part dans la description → repéré comme warning sur l'article (cf. op list).
      const desc = [line.desc, line.warn ? `⚠️ ${line.warn}` : ''].filter(Boolean).join('\n')
      const photos = line.photoFiles?.length ? await Promise.all(line.photoFiles.map(filePhoto)) : null
      await addOrderLine(order.id, { variantId: line.variantId, qty: line.qty, price: line.price, name: line.name, desc, photos, tmplId: line.tmplId, combo: line.combo })
      logModif(`Article ajouté : ${line.name}${line.qty > 1 ? ` ×${line.qty}` : ''}`)
    }
    setDraft([])
  }

  // Enregistre les articles ajoutés + les quantités / prix modifiés (lignes changées).
  async function saveEdits() {
    const changed = lines.filter(l => l._dirty)
    if (changed.length === 0 && draft.length === 0) { onClose(); return }
    setBusy(true)
    try {
      await commitDraft()
      for (const l of changed) {
        const photos = l._photoFiles?.length ? await Promise.all(l._photoFiles.map(filePhoto)) : null
        await updateOrderLine(order.id, l.id, { qty: l.qty, price: l.price, name: l.rawName, discount: l.discount, photos })
      }
      if (changed.length) logModif(changed.map(l => describeLineChange(l, origRef.current[l.id])).join(' ; '))
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

  function addLinePhotos(id, files) {
    const arr = Array.from(files || []).filter(f => f && f.type?.startsWith('image/'))
    if (!arr.length) return
    setLines(prev => prev.map(l => l.id === id ? {
      ...l, _dirty: true,
      _photoFiles: [...(l._photoFiles || []), ...arr],
      _photoPreviews: [...(l._photoPreviews || []), ...arr.map(f => URL.createObjectURL(f))],
    } : l))
  }
  function removeLinePhotoAt(id, idx) {
    setLines(prev => prev.map(l => l.id === id ? {
      ...l, _dirty: true,
      _photoFiles: (l._photoFiles || []).filter((_, i) => i !== idx),
      _photoPreviews: (l._photoPreviews || []).filter((_, i) => i !== idx),
    } : l))
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
          addLinePhotos(lineId, [file])
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
  const dirty = (Array.isArray(lines) && lines.some(l => l._dirty)) || draft.length > 0
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
    <div className={embedded ? '' : 'fixed inset-0 z-[130] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm'} onClick={embedded ? undefined : tryClose}>
      <div className={embedded ? 'bg-cream' : 'bg-cream rounded-2xl w-full max-w-md shadow-2xl border border-line max-h-[90vh] overflow-y-auto'} onClick={embedded ? undefined : e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="flex items-start justify-between gap-2 px-5 pt-5">
          <div>
            <div className="font-mono text-[13px] font-semibold text-bordeaux"><CopyableRef value={order.name} /></div>
            <div className="font-fraunces italic text-[20px] text-ink leading-tight">{order.clientName || '—'}</div>
          </div>
          <button onClick={tryClose} className="text-ink-mute hover:text-bordeaux text-[18px]">✕</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-soft px-5 mt-2 mb-3">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{isConfirmed ? 'Confirmée' : 'Devis'}</span>
          {order.pickupText && <span>{order.pickupText}</span>}
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

        {/* Livreur + adresse — seulement si la commande contient une livraison */}
        {hasLivraison && (
          <div className="mx-5 mb-3 p-2.5 rounded-lg bg-bordeaux/5 border border-bordeaux/20">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-1.5">🚚 Assigner le livreur</div>
            <div className="flex gap-1.5 flex-wrap">
              {livreurs.length === 0 && <span className="text-[11px] text-ink-mute italic">Aucun livreur trouvé.</span>}
              {livreurs.map(l => (
                <button key={l.id} onClick={() => setLivreurId(livreurId === l.id ? null : l.id)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${livreurId === l.id ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line hover:border-bordeaux'}`}>
                  {l.full_name || l.username}
                </button>
              ))}
            </div>
            <div className="text-[11px] font-semibold text-ink-soft mb-1 mt-2.5">📍 Adresse / localisation (pour le livreur)</div>
            <textarea value={livraisonLoc} onChange={e => setLivraisonLoc(e.target.value)} rows={2}
              placeholder="Adresse écrite, lien Google Maps / WhatsApp, ou coordonnées GPS…"
              className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white focus:outline-none focus:border-bordeaux" />
            <button onClick={saveLivraison} disabled={busy || !livreurId}
              className="mt-2 px-3 py-1.5 bg-bordeaux text-cream rounded-lg text-[12px] font-medium disabled:opacity-50">Enregistrer le livreur / l'adresse</button>
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
              <div className="text-[10px] text-ink-mute mt-2"><b>Message sur le gâteau</b></div>
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
                  {l._photoFiles?.length ? 'Ajouter une photo' : 'Ajouter / changer la photo'}
                  <input type="file" accept="image/*" multiple className="hidden"
                    onChange={e => { addLinePhotos(l.id, e.target.files); e.target.value = '' }} />
                </label>
                <button type="button" onClick={() => pasteLinePhoto(l.id)}
                  className="inline-flex items-center gap-1 text-[12px] text-bordeaux hover:underline">
                  Coller
                </button>
              </div>
              {l._photoPreviews?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {l._photoPreviews.map((src, i) => (
                    <div key={i} className="relative">
                      <img src={src} alt="" className="max-h-28 rounded-lg border border-line object-contain" />
                      <button type="button" onClick={() => removeLinePhotoAt(l.id, i)} title="Retirer"
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] leading-none flex items-center justify-center">✕</button>
                    </div>
                  ))}
                </div>
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
                    placeholder="ex : décor en bleu · sans fruits à coque"
                    className="flex-1 px-2 py-1.5 border border-[#E08A00] bg-[#FFF8EC] rounded-lg text-[12px]" />
                  <button onClick={() => addWarning(l.id)} disabled={busy || !warnText.trim()}
                    className="px-3 py-1.5 bg-[#B36B00] text-white rounded-lg text-[11px] font-medium disabled:opacity-50">OK</button>
                  <button onClick={() => { setWarnFor(null); setWarnText('') }} className="text-ink-mute text-[12px] px-1">✕</button>
                </div>
              ) : (
                <button onClick={() => { setWarnFor(l.id); setWarnText('') }}
                  className="mt-1.5 text-[11px] text-[#B36B00] font-medium hover:underline">+ Attention sur cet article</button>
              )}
            </div>
          ))}

          {/* Photos déjà enregistrées dans la commande (avec suppression). */}
          {photos.length > 0 && (
            <div className="mt-1 mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">Photos de la commande</div>
              <div className="flex flex-wrap gap-2">
                {photos.map(p => (
                  <div key={p.id} className="relative">
                    <img src={p.dataUrl} alt={p.name || 'photo'} className="w-20 h-20 rounded-lg object-cover border border-line" />
                    <button onClick={() => deletePhoto(p)} disabled={busy} title="Supprimer cette photo"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-white border border-line rounded-full text-ink-mute hover:text-danger text-[11px] shadow">✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!adding ? (
            <button onClick={() => setAdding(true)}
              className="w-full mt-1 mb-1 py-2.5 rounded-xl border border-dashed border-bordeaux/50 text-bordeaux text-[13px] font-medium hover:bg-bordeaux/5 transition-all">
              Ajouter un article
            </button>
          ) : (
            <AddArticle onCancel={() => setAdding(false)} onAdd={addToDraft} embedded={embedded} />
          )}

          {/* Articles en attente : ajoutés à la commande quand tu cliques « Enregistrer » */}
          {draft.length > 0 && (
            <div className="border border-bordeaux/30 bg-bordeaux/5 rounded-xl p-2.5 mt-1 mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-bordeaux mb-1.5">À ajouter ({draftCount})</div>
              {draft.map(d => (
                <div key={d.key} className="flex items-center gap-2 py-1.5 border-b border-bordeaux/15 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink font-medium break-words">{firstLine(d.name)}</div>
                    {d.desc && <div className="text-[11px] text-ink-mute break-words">{firstLine(d.desc)}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => setDraftQty(d.key, -1)} className="w-6 h-6 rounded border border-line text-bordeaux">−</button>
                    <span className="w-5 text-center text-[13px] font-semibold">{d.qty}</span>
                    <button onClick={() => setDraftQty(d.key, 1)} className="w-6 h-6 rounded border border-line text-bordeaux">+</button>
                    <button onClick={() => removeDraft(d.key)} className="ml-1 w-6 h-6 flex items-center justify-center rounded-full text-ink-mute hover:text-danger" title="Retirer">🗑</button>
                  </div>
                </div>
              ))}
              <div className="text-[10.5px] text-ink-mute mt-1.5">⤵ Clique <b>« Enregistrer »</b> en bas pour les ajouter à la commande.</div>
            </div>
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
function AddArticle({ onCancel, onAdd, embedded = false }) {
  const [cats, setCats] = useState(null)
  const [activeCat, setActiveCat] = useState(null)
  const [cfg, setCfg] = useState(null)             // produit en cours de configuration (cf. ConfiguratorModal)

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
      onAdd({ name, desc: '', warn: '', price: item.price ?? 0, variantId: item.variantId })
      return
    }
    setCfg({ item, catKey: activeCat, loading: true, attributes: [], variants: [], sel: {}, text: {}, warn: '', photo: '' })
    loadOrderProduct(item.tmplId)
      .then(d => setCfg(c => c && c.item.tmplId === item.tmplId ? { ...c, loading: false, attributes: d.attributes, variants: d.variants } : c))
      .catch(e => { toast.error('Erreur : ' + e.message); setCfg(null) })
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
              <button key={item.tmplId} onClick={() => onTileClick(item)}
                className={`text-center rounded-xl border p-2 bg-cream-warm hover:border-bordeaux transition-all ${item.configurable ? 'border-dashed border-bordeaux/50' : 'border-line'}`}>
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
          onAdd={(line) => { onAdd(line); setCfg(null) }}
          priceEditable={PRICE_EDITABLE.has(activeCat)}
          addLabel="Ajouter à la liste"
          embedded={embedded}
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
  if (l._photoFiles?.length) parts.push('photo')
  return parts.length ? `${name} (${parts.join(', ')})` : name
}
