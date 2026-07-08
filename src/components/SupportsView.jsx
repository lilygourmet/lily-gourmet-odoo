import { useState, useEffect } from 'react'
import { Plus, Trash2, Pencil, PackageOpen, AlertTriangle } from 'lucide-react'
import AppHeader from './AppHeader'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import {
  loadSupports, addSupport, updateSupport, deleteSupport,
  loadOpenSorties, recordSortie, recordRetour, uploadSupportPhoto,
  loadRules, addRule, deleteRule, loadAPreparer,
} from '../lib/supports'

const ALERT_DAYS = 7   // alerte si dehors depuis plus de X jours

function daysSince(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export default function SupportsView({ user, onLogout, onNavigate, activeView }) {
  const [supports, setSupports] = useState([])
  const [sorties, setSorties] = useState([])
  const [aPreparer, setAPreparer] = useState([])
  const [rules, setRules] = useState([])
  const [rulesOpen, setRulesOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Modale type (ajout / édition)
  const [typeModal, setTypeModal] = useState(null)   // { id?, name, total_qty, photo_url, file }
  // Formulaire sortie
  const [sortieOpen, setSortieOpen] = useState(false)
  const [f, setF] = useState({ support_id: '', qty: '', dest_type: 'ocp', client_name: '', order_num: '', date_sortie: new Date().toISOString().slice(0, 10), note: '' })
  // Formulaire d'ajout de règle
  const [rf, setRf] = useState({ support_id: '', keyword: '', qty_mode: 'line_qty', qty_value: 1 })

  async function refresh() {
    setLoading(true)
    try {
      const [sups, sos, prep, rls] = await Promise.all([loadSupports(), loadOpenSorties(), loadAPreparer().catch(() => []), loadRules().catch(() => [])])
      setSupports(sups)
      setSorties(sos)
      setAPreparer(prep)
      setRules(rls)
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  // ---- Types ----
  async function saveType() {
    if (!typeModal?.name?.trim()) { toast.error('Le nom est obligatoire.'); return }
    setBusy(true)
    try {
      let photo_url = typeModal.photo_url || null
      if (typeModal.file) photo_url = await uploadSupportPhoto(typeModal.file)
      if (typeModal.id) await updateSupport(typeModal.id, { name: typeModal.name.trim(), total_qty: Number(typeModal.total_qty) || 0, photo_url })
      else await addSupport({ name: typeModal.name, totalQty: typeModal.total_qty, photoUrl: photo_url })
      setTypeModal(null)
      await refresh()
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }
  async function removeType(s) {
    if (!await confirmDialog(`Supprimer le support « ${s.name} » ? (ses sorties seront aussi supprimées)`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteSupport(s.id); await refresh() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  // ---- Sortie ----
  async function saveSortie() {
    if (!f.support_id) { toast.error('Choisis un support.'); return }
    if (!(Number(f.qty) > 0)) { toast.error('Quantité invalide.'); return }
    if (f.dest_type === 'client' && !f.client_name.trim()) { toast.error('Nom du client obligatoire.'); return }
    setBusy(true)
    try {
      await recordSortie({ ...f, created_by: user?.id })
      setSortieOpen(false)
      setF({ support_id: '', qty: '', dest_type: 'ocp', client_name: '', order_num: '', date_sortie: new Date().toISOString().slice(0, 10), note: '' })
      await refresh()
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  // ---- Retour ----
  async function doRetour(s) {
    const remaining = (s.qty || 0) - (s.qty_returned || 0)
    const val = prompt(`Combien de « ${s.support?.name} » rendus ? (reste ${remaining})`, String(remaining))
    if (val === null) return
    const n = Number(val)
    if (!(n > 0)) { toast.error('Quantité invalide.'); return }
    try { await recordRetour(s, Math.min(n, remaining)); await refresh() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  // Depuis « À préparer » : pré-remplit la sortie (support + quantité détectés + commande).
  function sortirFromDetection(order, det) {
    const isOcp = /ocp/i.test(order.client_name || '')
    setF({
      support_id: String(det.support.id), qty: String(det.qty),
      dest_type: isOcp ? 'ocp' : 'client', client_name: isOcp ? '' : (order.client_name || ''),
      order_num: order.order_num || '', date_sortie: new Date().toISOString().slice(0, 10), note: '',
    })
    setSortieOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveRule() {
    if (!rf.support_id) { toast.error('Choisis un support.'); return }
    if (!rf.keyword.trim()) { toast.error('Mot-clé obligatoire.'); return }
    try { await addRule(rf); setRf({ support_id: '', keyword: '', qty_mode: 'line_qty', qty_value: 1 }); await refresh() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function removeRule(id) {
    try { await deleteRule(id); await refresh() } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  const lateCount = sorties.filter(s => daysSince(s.date_sortie) > ALERT_DAYS).length

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView || 'supports'} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-4xl mx-auto p-4">
        <h1 className="font-fraunces italic text-[26px] text-ink mb-1">Supports (consignes)</h1>
        <p className="text-[13px] text-ink-mute mb-4">Suivi des verrines, plateaux, présentoirs… prêtés à l'OCP ou aux clients : qui les a, depuis quand, ce qui est rendu.</p>

        {lateCount > 0 && (
          <div className="flex items-center gap-2 bg-bordeaux/8 border border-bordeaux/40 text-bordeaux rounded-xl px-4 py-3 mb-5 text-[13px]">
            <AlertTriangle size={16} strokeWidth={1.8} /> <b>{lateCount}</b> sortie{lateCount > 1 ? 's' : ''} dehors depuis plus de {ALERT_DAYS} jours — pense à réclamer le retour.
          </div>
        )}

        {loading ? <div className="text-center py-10 text-ink-mute italic">Chargement…</div> : (<>

          {/* ---- À PRÉPARER (détecté par règles) ---- */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">À préparer — commandes à venir</h2>
            <button onClick={() => setRulesOpen(true)} className="text-[12px] text-ink-soft hover:text-bordeaux inline-flex items-center gap-1">⚙️ Règles de détection</button>
          </div>
          {aPreparer.length === 0 ? (
            <div className="text-[12px] text-ink-mute italic bg-white border border-line rounded-2xl px-3 py-4 text-center mb-6">
              {rules.length === 0
                ? 'Aucune règle définie — clique « Règles de détection » pour dire quels articles utilisent quels supports.'
                : 'Rien à préparer dans les 14 prochains jours.'}
            </div>
          ) : (
            <div className="bg-white border border-line rounded-2xl overflow-hidden mb-1.5">
              {aPreparer.map(({ order, supports: dets }) => (
                <div key={order.id} className="px-3 py-2.5 border-b border-line last:border-b-0">
                  <div className="flex items-center gap-2 text-[12px] mb-1.5">
                    <span className="font-mono text-[10px] text-bordeaux font-bold">{order.order_num}</span>
                    <span className="text-ink truncate">— {order.client_name || 'Sans nom'}</span>
                    <span className="ml-auto text-[10px] text-ink-mute flex-shrink-0">{new Date(order.delivery_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {dets.map(d => (
                      <button key={d.support.id} onClick={() => sortirFromDetection(order, d)}
                        className="inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-full border border-bordeaux/40 bg-bordeaux/5 text-bordeaux hover:bg-bordeaux hover:text-cream transition-all">
                        {d.support.name} ×{d.qty} <span className="text-[10px] opacity-70">→ Sortir</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {aPreparer.length > 0 && <p className="text-[11px] text-ink-mute mb-6">« Sortir » pré-remplit la sortie (tu confirmes/corriges). Ce qui n'a pas de règle → ajoute-le à la main plus bas.</p>}

          {/* ---- STOCK ---- */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Mon stock</h2>
            <button onClick={() => setTypeModal({ name: '', total_qty: '', photo_url: null, file: null })}
              className="inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 border border-line rounded-lg hover:border-bordeaux transition-all">
              <Plus size={14} /> Ajouter un type
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {supports.length === 0 && <div className="col-span-full text-center py-6 text-ink-mute italic text-[13px]">Aucun support. Ajoute un type pour commencer.</div>}
            {supports.map(s => (
              <div key={s.id} className="bg-white border border-line rounded-2xl p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  {s.photo_url
                    ? <img src={s.photo_url} alt="" className="w-11 h-11 rounded-lg object-cover border border-line flex-shrink-0" />
                    : <div className="w-11 h-11 rounded-lg bg-cream-warm border border-line flex items-center justify-center text-ink-mute flex-shrink-0"><PackageOpen size={18} /></div>}
                  <div className="font-medium text-ink text-[14px] leading-tight flex-1 min-w-0">{s.name}</div>
                </div>
                <div className="text-[28px] font-semibold text-bordeaux leading-none">{s.en_stock} <span className="text-[11px] text-ink-mute font-medium">en stock</span></div>
                <div className="flex justify-between text-[12px] text-ink-soft mt-2 pt-2 border-t border-dashed border-line">
                  <span>Dehors : <span className={s.dehors > 0 ? 'text-bordeaux font-semibold' : ''}>{s.dehors}</span></span>
                  <span>Total : {s.total_qty}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setTypeModal({ id: s.id, name: s.name, total_qty: s.total_qty, photo_url: s.photo_url, file: null })}
                    className="text-[11px] text-ink-soft hover:text-bordeaux inline-flex items-center gap-1"><Pencil size={11} /> Modifier</button>
                  <button onClick={() => removeType(s)} className="text-[11px] text-ink-mute hover:text-bordeaux inline-flex items-center gap-1 ml-auto"><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>

          {/* ---- SORTIE ---- */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Enregistrer une sortie</h2>
            <button onClick={() => setSortieOpen(v => !v)}
              className="inline-flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep transition-all">
              <Plus size={14} /> Nouvelle sortie
            </button>
          </div>
          {sortieOpen && (
            <div className="bg-cream-warm border border-line rounded-2xl p-4 mb-6 grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">Support</label>
                <select value={f.support_id} onChange={e => setF({ ...f, support_id: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white">
                  <option value="">— Choisir —</option>
                  {supports.map(s => <option key={s.id} value={s.id}>{s.name} (stock {s.en_stock})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">Quantité</label>
                <input type="number" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">Destinataire</label>
                <select value={f.dest_type} onChange={e => setF({ ...f, dest_type: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white">
                  <option value="ocp">OCP</option>
                  <option value="client">Client</option>
                </select>
              </div>
              {f.dest_type === 'client' && (
                <div>
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">Nom du client</label>
                  <input value={f.client_name} onChange={e => setF({ ...f, client_name: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">N° commande (S…)</label>
                <input value={f.order_num} onChange={e => setF({ ...f, order_num: e.target.value })} placeholder="S48587" className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">Date de sortie</label>
                <input type="date" value={f.date_sortie} onChange={e => setF({ ...f, date_sortie: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">Note (optionnel)</label>
                <input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
              </div>
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <button onClick={() => setSortieOpen(false)} className="px-4 py-2 text-[12px] border border-line rounded-lg text-ink-soft">Annuler</button>
                <button onClick={saveSortie} disabled={busy} className="px-4 py-2 text-[12px] font-medium bg-bordeaux text-cream rounded-lg disabled:opacity-50">Enregistrer la sortie</button>
              </div>
            </div>
          )}

          {/* ---- DEHORS ---- */}
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">Dehors (pas encore rendus)</h2>
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            {sorties.length === 0 && <div className="text-center py-6 text-ink-mute italic text-[13px]">Rien dehors. 🎉</div>}
            {sorties.map(s => {
              const remaining = (s.qty || 0) - (s.qty_returned || 0)
              const d = daysSince(s.date_sortie)
              const late = d > ALERT_DAYS
              return (
                <div key={s.id} className={`flex items-center gap-3 px-3 py-2.5 border-b border-line last:border-b-0 ${late ? 'bg-bordeaux/5' : ''}`}>
                  {s.support?.photo_url
                    ? <img src={s.support.photo_url} alt="" className="w-8 h-8 rounded-md object-cover border border-line flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-md bg-cream-warm border border-line flex items-center justify-center text-ink-mute flex-shrink-0"><PackageOpen size={14} /></div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-ink truncate">{s.support?.name} <span className="text-ink-mute font-normal">×{remaining}</span></div>
                    <div className="text-[11px] text-ink-mute truncate">
                      {s.dest_type === 'ocp' ? 'OCP' : (s.client_name || 'Client')}{s.order_num ? ` · ${s.order_num}` : ''}
                      {s.qty_returned > 0 ? ` · ${s.qty_returned}/${s.qty} rendus` : ''}
                    </div>
                  </div>
                  <span className={`text-[11px] flex-shrink-0 ${late ? 'text-bordeaux font-semibold' : 'text-ink-mute'}`}>{d === 0 ? "aujourd'hui" : `il y a ${d} j`}</span>
                  <button onClick={() => doRetour(s)} className="flex-shrink-0 text-[11px] font-medium px-3 py-1.5 border border-bordeaux text-bordeaux rounded-lg hover:bg-bordeaux hover:text-cream transition-all">Retour</button>
                </div>
              )
            })}
          </div>
        </>)}
      </div>

      {/* ---- Modale règles de détection ---- */}
      {rulesOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={() => setRulesOpen(false)}>
          <div className="bg-cream rounded-2xl w-full max-w-lg shadow-2xl border border-line p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-fraunces italic text-[19px] text-ink">Règles de détection</h3>
              <button onClick={() => setRulesOpen(false)} className="text-ink-mute hover:text-bordeaux text-[18px]">✕</button>
            </div>
            <p className="text-[12px] text-ink-mute mb-3">Quand un article d'une commande contient le mot-clé, le support est proposé dans « À préparer ».</p>

            <div className="space-y-1.5 mb-4">
              {rules.length === 0 && <div className="text-[12px] text-ink-mute italic">Aucune règle pour l'instant.</div>}
              {rules.map(r => (
                <div key={r.id} className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-2 text-[12px]">
                  <span className="flex-1">Article contient <b>« {r.keyword} »</b> → <b>{r.support?.name}</b>, {r.qty_mode === 'fixed' ? `${r.qty_value} fixe` : `= quantité de l'article${Number(r.qty_value) > 1 ? ` ×${r.qty_value}` : ''}`}</span>
                  <button onClick={() => removeRule(r.id)} className="text-ink-mute hover:text-bordeaux flex-shrink-0"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>

            <div className="border-t border-line pt-3 grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">Si un article contient le mot…</label>
                <input value={rf.keyword} onChange={e => setRf({ ...rf, keyword: e.target.value })} placeholder="ex : verrine · plateau · entremet" className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">→ Sortir le support</label>
                <select value={rf.support_id} onChange={e => setRf({ ...rf, support_id: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white">
                  <option value="">— Choisir —</option>
                  {supports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink-soft mb-1">Quantité</label>
                <select value={rf.qty_mode} onChange={e => setRf({ ...rf, qty_mode: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white">
                  <option value="line_qty">= quantité de l'article</option>
                  <option value="fixed">nombre fixe</option>
                </select>
              </div>
              <div className="col-span-2 flex items-end gap-2">
                <div className="w-28">
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">{rf.qty_mode === 'fixed' ? 'Combien' : 'Multiplicateur'}</label>
                  <input type="number" value={rf.qty_value} onChange={e => setRf({ ...rf, qty_value: e.target.value })} className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                </div>
                <button onClick={saveRule} className="ml-auto px-4 py-2 text-[12px] font-medium bg-bordeaux text-cream rounded-lg">Ajouter la règle</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Modale ajout/édition type ---- */}
      {typeModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={() => setTypeModal(null)}>
          <div className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl border border-line p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-fraunces italic text-[19px] text-ink mb-3">{typeModal.id ? 'Modifier le support' : 'Nouveau support'}</h3>
            <label className="block text-[11px] font-semibold text-ink-soft mb-1">Nom</label>
            <input value={typeModal.name} onChange={e => setTypeModal({ ...typeModal, name: e.target.value })} placeholder="ex : Verrines rondes"
              className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white mb-3" />
            <label className="block text-[11px] font-semibold text-ink-soft mb-1">Quantité totale possédée</label>
            <input type="number" value={typeModal.total_qty} onChange={e => setTypeModal({ ...typeModal, total_qty: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white mb-3" />
            <label className="block text-[11px] font-semibold text-ink-soft mb-1">Photo</label>
            <div className="flex items-center gap-3 mb-4">
              {(typeModal.file || typeModal.photo_url)
                ? <img src={typeModal.file ? URL.createObjectURL(typeModal.file) : typeModal.photo_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-line" />
                : <div className="w-14 h-14 rounded-lg bg-cream-warm border border-line flex items-center justify-center text-ink-mute"><PackageOpen size={20} /></div>}
              <label className="text-[12px] px-3 py-2 border border-dashed border-bordeaux text-bordeaux rounded-lg cursor-pointer bg-white">
                Choisir une photo
                <input type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) setTypeModal({ ...typeModal, file }) }} />
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setTypeModal(null)} className="px-4 py-2 text-[12px] border border-line rounded-lg text-ink-soft">Annuler</button>
              <button onClick={saveType} disabled={busy} className="px-4 py-2 text-[12px] font-medium bg-bordeaux text-cream rounded-lg disabled:opacity-50">{busy ? '…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
