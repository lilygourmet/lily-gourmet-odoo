import { useState, useEffect, useMemo } from 'react'
import { todayISO } from '../lib/dates'
import { Plus, Check, Printer, Search, Settings, X } from 'lucide-react'
import AppHeader from './AppHeader'
import { toast } from '../lib/toast'
import {
  SENS, FAMILLES, lieuxDe, peutEnvoyer, peutConfirmer,
  loadArticles, searchOdooProducts, addArticle, removeArticle,
  loadTransferts, addTransfert, confirmTransfert, envoyerVersOdoo,
  loadWaNumbers, saveWaNumbers,
} from '../lib/transfertsStock'

// 3,8 plutôt que 3.8 ; masque les décimales inutiles (5 kg, pas 5,0).
const fmt = n => (Number(n) || 0).toString().replace('.', ',')
const frDate = iso => { const [, m, d] = (iso || '').split('-'); return d ? `${d}/${m}` : iso }

export default function TransfertsStockView({ user, famille = 'mp', activeView, onNavigate, onLogout }) {
  const fam = FAMILLES[famille] || FAMILLES.mp
  const mesLieux = lieuxDe(user)
  const isAdmin = user?.role === 'admin'

  // Sens affiché : celui d'où je peux envoyer, sinon celui que je dois confirmer.
  const sensPossibles = Object.keys(SENS).filter(s => peutEnvoyer(user, s) || peutConfirmer(user, s))
  const [sens, setSens] = useState(sensPossibles.find(s => peutEnvoyer(user, s)) || sensPossibles[0] || 'annexe_boutique')

  const [articles, setArticles] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [choisi, setChoisi] = useState(null)          // article sélectionné (vignette)
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(todayISO())
  const [filtreArticle, setFiltreArticle] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [rechercheOdoo, setRechercheOdoo] = useState('')
  const [resultats, setResultats] = useState(null)     // null = pas de recherche en cours
  const [reglages, setReglages] = useState(null)       // { annexe_boutique, boutique_annexe } quand ouvert

  async function refresh() {
    setLoading(true)
    try {
      const [a, t] = await Promise.all([loadArticles(famille), loadTransferts(famille)])
      setArticles(a); setRows(t)
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh(); setChoisi(null) }, [famille])

  const listeArticles = useMemo(() => {
    const q = filtreArticle.trim().toLowerCase()
    return q ? articles.filter(a => a.nom.toLowerCase().includes(q)) : articles
  }, [articles, filtreArticle])

  async function send() {
    if (!choisi) { toast.error('Choisis un article.'); return }
    if (!(Number(qty) > 0)) { toast.error('Quantité invalide.'); return }
    setBusy(true)
    try {
      await addTransfert({ famille, sens, article: choisi, qty, date, user })
      setChoisi(null); setQty('')
      toast.success(`Transfert enregistré — ${SENS[sens].vers} prévenu.`)
      await refresh()
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  async function confirmerRecu(t) {
    const envoye = fmt(t.qty_envoye)
    const val = prompt(`Quantité reçue de « ${t.matiere} » ? (envoyé : ${envoye} ${t.unite || 'kg'})`, String(t.qty_envoye))
    if (val === null) return
    const n = Number(String(val).replace(',', '.'))
    if (!(n >= 0)) { toast.error('Quantité invalide.'); return }
    setBusy(true)
    try {
      const ref = await confirmTransfert(t, n, user)
      toast.success(ref ? `Reçu — transfert Odoo ${ref} créé en brouillon.` : 'Réception confirmée.')
      await refresh()
    } catch (e) {
      toast.error('Reçu enregistré, mais Odoo a refusé : ' + e.message)
      await refresh()
    } finally { setBusy(false) }
  }

  async function reessayerOdoo(t) {
    setBusy(true)
    try {
      const ref = await envoyerVersOdoo(t, Number(t.qty_recu), user)
      toast.success(`Transfert Odoo ${ref} créé.`)
      await refresh()
    } catch (e) { toast.error('Odoo : ' + e.message) }
    finally { setBusy(false) }
  }

  async function chercher() {
    const q = rechercheOdoo.trim()
    if (q.length < 2) return
    setBusy(true)
    try { setResultats(await searchOdooProducts(q)) }
    catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  async function ajouter(p) {
    try {
      await addArticle({ produit: p, famille, user })
      toast.success(`« ${p.nom} » ajouté à la liste.`)
      setResultats(null); setRechercheOdoo('')
      await refresh()
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function retirer(a) {
    if (!window.confirm(`Retirer « ${a.nom} » de la liste ? (l'historique reste)`)) return
    try { await removeArticle(a.odoo_product_id); await refresh() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function ouvrirReglages() {
    try { setReglages(await loadWaNumbers()) }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function enregistrerReglages() {
    try { await saveWaNumbers(reglages); setReglages(null); toast.success('Numéros enregistrés.') }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  // À confirmer = ce qui arrive DANS mon atelier (peu importe le sens affiché).
  const aConfirmer = rows.filter(r => r.statut === 'en_attente' && peutConfirmer(user, r.sens))
  const journal = filterDate ? rows.filter(r => (r.transfer_date || '').slice(0, 10) === filterDate) : rows

  function printTransferts() {
    const w = window.open('', '_blank')
    if (!w) { toast.error('Autorise les pop-ups pour imprimer.'); return }
    const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    const titre = filterDate ? `Transferts du ${frDate(filterDate)}` : 'Journal complet'
    const trs = journal.map(t => `<tr><td>${frDate(t.transfer_date)}</td><td>${esc(SENS[t.sens]?.label || '')}</td><td>${esc(t.matiere)}</td><td>${fmt(t.qty_envoye)} ${esc(t.unite || '')}</td><td>${t.statut === 'recu' ? `${fmt(t.qty_recu)} ${esc(t.unite || '')}` : '—'}</td><td>${esc(t.envoye_par || '—')}</td><td>${esc(t.odoo_picking_name || '')}</td></tr>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(fam.titre)}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#1a0f0a}h1{font-size:20px;margin:0 0 4px}
      .sub{font-size:12px;color:#666;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f3efe9;font-size:11px;text-transform:uppercase}</style>
      </head><body><h1>${esc(fam.titre)} — ${titre}</h1>
      <p class="sub">Prod annexe ↔ prod boutique · imprimé le ${new Date().toLocaleString('fr-FR')}</p>
      <table><thead><tr><th>Date</th><th>Sens</th><th>Article</th><th>Envoyé</th><th>Reçu</th><th>Par</th><th>Odoo</th></tr></thead>
      <tbody>${trs}</tbody></table></body></html>`)
    w.document.close(); w.focus(); w.print()
  }

  if (!mesLieux.length) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
        <div className="max-w-3xl mx-auto p-4">
          <div className="bg-cream-warm border border-line rounded-2xl p-8 text-center text-[13px] text-ink-mute">
            Tu n'as pas accès aux transferts. Il faut la permission « Prod annexe » ou « Prod boutique ».
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-fraunces italic text-[26px] text-ink">{fam.titre}</h1>
          {isAdmin && (
            <button onClick={ouvrirReglages} className="inline-flex items-center gap-1 text-[12px] px-3 py-1.5 border border-line rounded-lg bg-white hover:bg-cream-warm">
              <Settings size={13} /> Numéros WhatsApp
            </button>
          )}
        </div>
        <p className="text-[13px] text-ink-mute mb-4">{fam.label} — entre la <b>prod annexe</b> et la <b>prod boutique</b>.</p>

        {/* ---- SENS ---- */}
        <div className="flex gap-2 mb-5">
          {Object.entries(SENS).map(([k, s]) => (
            <button key={k} onClick={() => { setSens(k); setChoisi(null) }}
              className={`px-3 py-2 rounded-lg text-[12.5px] border transition-all ${sens === k ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft hover:bg-cream-warm'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {loading ? <div className="text-center py-10 text-ink-mute italic">Chargement…</div> : (<>

          {/* ---- À CONFIRMER ---- */}
          {aConfirmer.length > 0 && (
            <div className="bg-white border border-line rounded-2xl p-4 mb-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-3">
                À confirmer ({aConfirmer.length})
              </h2>
              {aConfirmer.map(t => (
                <div key={t.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                  <div className="flex-1">
                    <div className="text-[13px] text-ink">{t.matiere}</div>
                    <div className="text-[11px] text-ink-mute">
                      {frDate(t.transfer_date)} · {SENS[t.sens]?.label} · envoyé par {t.envoye_par || '—'}
                    </div>
                  </div>
                  <div className="text-[14px] font-medium">{fmt(t.qty_envoye)} {t.unite || 'kg'}</div>
                  <button onClick={() => confirmerRecu(t)} disabled={busy}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep disabled:opacity-50">
                    <Check size={13} /> Confirmer
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ---- ENVOYER ---- */}
          {peutEnvoyer(user, sens) && (
            <div className="bg-cream-warm border border-line rounded-2xl p-4 mb-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-3">
                Envoyer — {SENS[sens].de} → {SENS[sens].vers}
              </h2>

              <input value={filtreArticle} onChange={e => setFiltreArticle(e.target.value)}
                placeholder="🔍 filtrer les articles…"
                className="w-full px-3 py-2 mb-3 border border-line rounded-lg text-[13px] bg-white" />

              {/* vignettes carrées */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 max-h-[320px] overflow-y-auto">
                {listeArticles.map(a => {
                  const sel = choisi?.odoo_product_id === a.odoo_product_id
                  return (
                    <button key={a.odoo_product_id} onClick={() => setChoisi(a)}
                      className={`relative aspect-square p-2 rounded-xl border text-left transition-all ${sel ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line hover:border-bordeaux/40'}`}>
                      <div className={`text-[11.5px] leading-tight line-clamp-4 ${sel ? '' : 'text-ink'}`}>{a.nom}</div>
                      <div className={`absolute bottom-2 left-2 text-[10px] ${sel ? 'opacity-80' : 'text-ink-mute'}`}>{a.unite}</div>
                      {isAdmin && (
                        <span onClick={(e) => { e.stopPropagation(); retirer(a) }}
                          className={`absolute top-1 right-1 p-1 rounded ${sel ? 'hover:bg-white/20' : 'text-ink-mute hover:bg-cream'}`} title="Retirer de la liste">
                          <X size={11} />
                        </span>
                      )}
                    </button>
                  )
                })}
                {listeArticles.length === 0 && (
                  <div className="col-span-full text-center text-[12px] text-ink-mute py-6">
                    Aucun article. Cherche-le ci-dessous pour l'ajouter.
                  </div>
                )}
              </div>

              <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
                <div className="text-[12px] text-ink-soft">
                  {choisi ? <>Article choisi : <b>{choisi.nom}</b></> : <span className="text-ink-mute italic">Choisis un article ci-dessus</span>}
                </div>
                <div className="w-32">
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">Quantité ({choisi?.unite || '—'})</label>
                  <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="5"
                    className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                </div>
                <div className="w-36">
                  <label className="block text-[11px] font-semibold text-ink-soft mb-1">Date</label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                </div>
              </div>
              <button onClick={send} disabled={busy || !choisi}
                className="mt-3 inline-flex items-center justify-center gap-1 px-4 py-2 text-[13px] font-medium bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep disabled:opacity-50">
                <Plus size={14} /> Envoyer
              </button>

              {/* ajouter un article absent de la liste */}
              <div className="mt-4 pt-4 border-t border-line">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">Ajouter un article</div>
                <div className="flex gap-2">
                  <input value={rechercheOdoo} onChange={e => setRechercheOdoo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && chercher()}
                    placeholder="nom du produit dans Odoo…"
                    className="flex-1 px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                  <button onClick={chercher} disabled={busy}
                    className="inline-flex items-center gap-1 px-3 py-2 text-[12px] border border-line rounded-lg bg-white hover:bg-cream">
                    <Search size={13} /> Chercher
                  </button>
                </div>
                {resultats && (
                  <div className="mt-2 max-h-52 overflow-y-auto">
                    {resultats.length === 0 && <div className="text-[12px] text-ink-mute py-2">Aucun produit trouvé.</div>}
                    {resultats.map(p => (
                      <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-line last:border-0">
                        <div className="flex-1 text-[12.5px]">{p.nom} <span className="text-ink-mute">({p.unite})</span></div>
                        <button onClick={() => ajouter(p)} className="px-2.5 py-1 text-[11.5px] border border-line rounded-lg bg-white hover:bg-cream">
                          + Ajouter
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ---- JOURNAL ---- */}
          <div className="bg-white border border-line rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Journal ({journal.length})</h2>
              <div className="flex items-center gap-2">
                <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                  className="px-2 py-1 border border-line rounded-lg text-[12px] bg-white" />
                {filterDate && <button onClick={() => setFilterDate('')} className="text-[12px] text-ink-mute underline">tout</button>}
                <button onClick={printTransferts} className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] border border-line rounded-lg bg-white hover:bg-cream">
                  <Printer size={13} /> Imprimer
                </button>
              </div>
            </div>
            {journal.length === 0 && <div className="text-center text-[12.5px] text-ink-mute py-6">Aucun transfert.</div>}
            {journal.map(t => (
              <div key={t.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                <div className="w-12 text-[11px] text-ink-mute">{frDate(t.transfer_date)}</div>
                <div className="flex-1">
                  <div className="text-[13px] text-ink">{t.matiere}</div>
                  <div className="text-[11px] text-ink-mute">
                    {SENS[t.sens]?.label || ''} · {t.envoye_par || '—'}
                    {t.odoo_picking_name && <span className="text-emerald-700"> · Odoo {t.odoo_picking_name}</span>}
                    {t.odoo_error && <span className="text-red-700"> · Odoo : {t.odoo_error}</span>}
                  </div>
                </div>
                <div className="text-[13px]">
                  {fmt(t.qty_envoye)} {t.unite || 'kg'}
                  {t.statut === 'recu' && Number(t.qty_recu) !== Number(t.qty_envoye) && (
                    <span className="text-amber-700"> → {fmt(t.qty_recu)}</span>
                  )}
                </div>
                <div className="w-24 text-right">
                  {t.statut === 'recu'
                    ? (t.odoo_error && peutConfirmer(user, t.sens)
                      ? <button onClick={() => reessayerOdoo(t)} disabled={busy} className="text-[11px] px-2 py-1 border border-line rounded-lg hover:bg-cream">↻ Odoo</button>
                      : <span className="text-[11px] text-emerald-700">✓ reçu</span>)
                    : <span className="text-[11px] text-amber-700">en attente</span>}
                </div>
              </div>
            ))}
          </div>
        </>)}
      </div>

      {/* ---- RÉGLAGES : numéros prévenus ---- */}
      {reglages && (
        <div onClick={() => setReglages(null)} className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl p-6 w-full max-w-md border border-line">
            <h3 className="text-[15px] font-medium mb-1">Qui est prévenu par WhatsApp ?</h3>
            <p className="text-[12px] text-ink-mute mb-4">Le numéro reçoit un message dès qu'un transfert attend sa confirmation.</p>
            {Object.entries(SENS).map(([k, s]) => (
              <div key={k} className="mb-3">
                <label className="block text-[11.5px] font-semibold text-ink-soft mb-1">{s.label} — prévenir {s.vers}</label>
                <input value={reglages[k] || ''} onChange={e => setReglages({ ...reglages, [k]: e.target.value })}
                  placeholder="06 12 34 56 78" className="w-full px-3 py-2 border border-line rounded-lg text-[13px]" />
              </div>
            ))}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setReglages(null)} className="flex-1 px-3 py-2 text-[13px] border border-line rounded-lg bg-white">Annuler</button>
              <button onClick={enregistrerReglages} className="flex-1 px-3 py-2 text-[13px] bg-bordeaux text-cream rounded-lg">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
