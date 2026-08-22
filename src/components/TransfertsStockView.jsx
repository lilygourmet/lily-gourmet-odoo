import { useState, useEffect, useMemo } from 'react'
import { todayISO } from '../lib/dates'
import { Plus, Check, Printer, Search, Settings, X, Trash2, Eye, EyeOff, Send, ChevronUp, ChevronDown } from 'lucide-react'
import AppHeader from './AppHeader'
import { toast } from '../lib/toast'
import { canSeeTransfertsProduits } from '../lib/auth'
import {
  SENS, FAMILLES, GROUPES, lieuxDe, peutEnvoyer, peutConfirmer,
  loadArticles, searchOdooProducts, addArticle, setArticleActif,
  loadTransferts, addTransfertsGroupes, confirmTransfert, envoyerVersOdoo,
  loadWaNumbers, saveWaNumbers,
} from '../lib/transfertsStock'

// 3,8 plutôt que 3.8 ; masque les décimales inutiles (5 kg, pas 5,0).
const fmt = n => (Number(n) || 0).toString().replace('.', ',')
const frDate = iso => { const [, m, d] = (iso || '').split('-'); return d ? `${d}/${m}` : iso }

export default function TransfertsStockView({ user, famille = 'mp', activeView, onNavigate, onLogout }) {
  const fam = FAMILLES[famille] || FAMILLES.mp
  const mesLieux = lieuxDe(user)
  const isAdmin = user?.role === 'admin'

  const sensPossibles = Object.keys(SENS).filter(s => peutEnvoyer(user, s) || peutConfirmer(user, s))
  const [sens, setSens] = useState(sensPossibles.find(s => peutEnvoyer(user, s)) || sensPossibles[0] || 'annexe_boutique')

  const [articles, setArticles] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [groupe, setGroupe] = useState('')            // '' = tous les types
  const [filtreArticle, setFiltreArticle] = useState('')
  const [voirMasques, setVoirMasques] = useState(false)
  const [calc, setCalc] = useState(null)              // { article, saisie } quand la calculatrice est ouverte
  const [panier, setPanier] = useState([])            // la liste préparée avant envoi
  const [panierOuvert, setPanierOuvert] = useState(false)   // détail replié : sinon il cache les articles
  const [date, setDate] = useState(todayISO())
  const [filterDate, setFilterDate] = useState('')
  const [rechercheOdoo, setRechercheOdoo] = useState('')
  const [resultats, setResultats] = useState(null)
  const [reglages, setReglages] = useState(null)

  async function refresh() {
    setLoading(true)
    try {
      const [a, t] = await Promise.all([loadArticles(famille, true), loadTransferts(famille)])
      setArticles(a); setRows(t)
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { refresh(); setPanier([]); setGroupe('') }, [famille])

  // Types présents dans cette famille (on n'affiche pas un filtre vide).
  const groupesPresents = useMemo(() => {
    const vus = new Set(articles.filter(a => a.actif).map(a => a.groupe || 'autre'))
    return GROUPES.filter(g => vus.has(g.key))
  }, [articles])

  const listeArticles = useMemo(() => {
    const q = filtreArticle.trim().toLowerCase()
    return articles.filter(a => {
      if (!a.actif && !voirMasques) return false
      if (groupe && (a.groupe || 'autre') !== groupe) return false
      if (q && !a.nom.toLowerCase().includes(q)) return false
      return true
    })
  }, [articles, filtreArticle, groupe, voirMasques])

  // ---- calculatrice ----
  function tape(touche) {
    setCalc(c => {
      if (!c) return c
      let v = c.saisie
      if (touche === 'C') v = ''
      else if (touche === '←') v = v.slice(0, -1)
      else if (touche === ',') v = v.includes(',') ? v : (v || '0') + ','
      else v = (v === '0' ? '' : v) + touche
      return { ...c, saisie: v }
    })
  }
  function validerCalc() {
    const n = Number((calc.saisie || '').replace(',', '.'))
    if (!(n > 0)) { toast.error('Quantité invalide.'); return }
    const a = calc.article
    setPanier(p => {
      const i = p.findIndex(x => x.odoo_product_id === a.odoo_product_id)
      if (i >= 0) { const c = [...p]; c[i] = { ...c[i], qty: n }; return c }
      return [...p, { odoo_product_id: a.odoo_product_id, nom: a.nom, unite: a.unite, image_url: a.image_url, qty: n }]
    })
    setCalc(null)
  }

  async function envoyerListe() {
    if (!panier.length) return
    setBusy(true)
    try {
      await addTransfertsGroupes({ famille, sens, lignes: panier, date, user })
      toast.success(`${panier.length} article(s) envoyé(s) — ${SENS[sens].vers} prévenu.`)
      setPanier([])
      await refresh()
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  async function confirmerRecu(t) {
    const val = prompt(`Quantité reçue de « ${t.matiere} » ? (envoyé : ${fmt(t.qty_envoye)} ${t.unite || 'kg'})`, String(t.qty_envoye))
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
    try { toast.success(`Transfert Odoo ${await envoyerVersOdoo(t, Number(t.qty_recu), user)} créé.`); await refresh() }
    catch (e) { toast.error('Odoo : ' + e.message) }
    finally { setBusy(false) }
  }

  async function chercher() {
    if (rechercheOdoo.trim().length < 2) return
    setBusy(true)
    try { setResultats(await searchOdooProducts(rechercheOdoo.trim())) }
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

  async function basculerArticle(a) {
    try { await setArticleActif(a.odoo_product_id, !a.actif); await refresh() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function ouvrirReglages() {
    try { setReglages(await loadWaNumbers()) } catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function enregistrerReglages() {
    try { await saveWaNumbers(reglages); setReglages(null); toast.success('Numéros enregistrés.') }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }

  const aConfirmer = rows.filter(r => r.statut === 'en_attente' && peutConfirmer(user, r.sens))
  const journal = filterDate ? rows.filter(r => (r.transfer_date || '').slice(0, 10) === filterDate) : rows
  const nbMasques = articles.filter(a => !a.actif).length

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

  // L'onglet Produits (semi-finis) demande sa propre permission.
  const refus = !mesLieux.length
    ? "Tu n'as pas accès aux transferts. Il faut la permission « Transferts — atelier Prod annexe » ou « Prod boutique »."
    : (famille === 'sm' && !canSeeTransfertsProduits(user))
      ? "Tu n'as pas accès aux transferts de produits. Il faut la permission « Transferts Produits (SM) »."
      : null

  if (refus) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
        <div className="max-w-3xl mx-auto p-4">
          <div className="bg-cream-warm border border-line rounded-2xl p-8 text-center text-[13px] text-ink-mute">
            {refus}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />

      <div className="max-w-3xl mx-auto p-4 pb-28">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-fraunces italic text-[26px] text-ink">{fam.titre}</h1>
          {isAdmin && (
            <button onClick={ouvrirReglages} className="inline-flex items-center gap-1 text-[12px] px-3 py-1.5 border border-line rounded-lg bg-white hover:bg-cream-warm">
              <Settings size={13} /> Numéros WhatsApp
            </button>
          )}
        </div>
        <p className="text-[13px] text-ink-mute mb-4">{fam.label} — entre la <b>prod annexe</b> et la <b>prod boutique</b>.</p>

        <div className="flex gap-2 mb-5">
          {Object.entries(SENS).map(([k, s]) => (
            <button key={k} onClick={() => setSens(k)}
              className={`px-3 py-2 rounded-lg text-[12.5px] border transition-all ${sens === k ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft hover:bg-cream-warm'}`}>
              {s.label}
            </button>
          ))}
        </div>

        {loading ? <div className="text-center py-10 text-ink-mute italic">Chargement…</div> : (<>

          {/* ---- À CONFIRMER ---- */}
          {aConfirmer.length > 0 && (
            <div className="bg-white border border-line rounded-2xl p-4 mb-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-3">À confirmer ({aConfirmer.length})</h2>
              {aConfirmer.map(t => (
                <div key={t.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0">
                  <div className="flex-1">
                    <div className="text-[13px] text-ink">{t.matiere}</div>
                    <div className="text-[11px] text-ink-mute">{frDate(t.transfer_date)} · {SENS[t.sens]?.label} · envoyé par {t.envoye_par || '—'}</div>
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

          {/* ---- CHOISIR LES ARTICLES ---- */}
          {peutEnvoyer(user, sens) && (
            <div className="bg-cream-warm border border-line rounded-2xl p-4 mb-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-3">
                Envoyer — {SENS[sens].de} → {SENS[sens].vers}
              </h2>

              {/* filtres par type */}
              {groupesPresents.length > 1 && (
                <div className="flex gap-1.5 flex-wrap mb-3">
                  <button onClick={() => setGroupe('')}
                    className={`px-2.5 py-1 rounded-full text-[11.5px] border ${!groupe ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft'}`}>
                    Tout
                  </button>
                  {groupesPresents.map(g => (
                    <button key={g.key} onClick={() => setGroupe(groupe === g.key ? '' : g.key)}
                      className={`px-2.5 py-1 rounded-full text-[11.5px] border ${groupe === g.key ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white border-line text-ink-soft'}`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <input value={filtreArticle} onChange={e => setFiltreArticle(e.target.value)}
                  placeholder="🔍 filtrer les articles…"
                  className="flex-1 px-3 py-2 border border-line rounded-lg text-[13px] bg-white" />
                {nbMasques > 0 && (
                  <button onClick={() => setVoirMasques(!voirMasques)} title="Articles masqués"
                    className="inline-flex items-center gap-1 px-2.5 py-2 text-[11.5px] border border-line rounded-lg bg-white hover:bg-cream">
                    {voirMasques ? <EyeOff size={13} /> : <Eye size={13} />} {nbMasques}
                  </button>
                )}
              </div>

              {/* vignettes : photo + nom ; un clic ouvre la calculatrice */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[380px] overflow-y-auto">
                {listeArticles.map(a => {
                  const dansPanier = panier.find(p => p.odoo_product_id === a.odoo_product_id)
                  return (
                    <button key={a.odoo_product_id} onClick={() => setCalc({ article: a, saisie: dansPanier ? String(dansPanier.qty).replace('.', ',') : '' })}
                      className={`relative rounded-xl border overflow-hidden text-left transition-all ${dansPanier ? 'border-bordeaux ring-2 ring-bordeaux/25' : 'border-line hover:border-bordeaux/40'} ${a.actif ? 'bg-white' : 'bg-cream opacity-60'}`}>
                      <div className="aspect-square bg-cream flex items-center justify-center overflow-hidden">
                        {a.image_url
                          ? <img src={a.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          : <span className="text-[10px] text-ink-mute px-2 text-center">pas de photo</span>}
                      </div>
                      <div className="p-1.5">
                        <div className="text-[10.5px] leading-tight text-ink line-clamp-2">{a.nom}</div>
                        <div className="text-[9.5px] text-ink-mute mt-0.5">{a.unite}</div>
                      </div>
                      {dansPanier && (
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-bordeaux text-cream text-[10px] font-medium">
                          {fmt(dansPanier.qty)}
                        </span>
                      )}
                      {isAdmin && (
                        <span onClick={(e) => { e.stopPropagation(); basculerArticle(a) }}
                          className="absolute top-1 right-1 p-1 rounded bg-white/85 text-ink-mute hover:text-bordeaux"
                          title={a.actif ? 'Masquer cet article' : 'Remettre dans la liste'}>
                          {a.actif ? <X size={11} /> : <Eye size={11} />}
                        </span>
                      )}
                    </button>
                  )
                })}
                {listeArticles.length === 0 && (
                  <div className="col-span-full text-center text-[12px] text-ink-mute py-6">
                    Aucun article ici. Cherche-le ci-dessous pour l'ajouter.
                  </div>
                )}
              </div>

              {panier.length === 0 && (
                <p className="mt-3 text-[12px] text-ink-mute">
                  Touche un article ci-dessus pour saisir la quantité : le bouton <b>Envoyer la liste</b> apparaîtra en bas de l'écran.
                </p>
              )}

              {/* ajouter un article absent */}
              <div className="mt-4 pt-4 border-t border-line">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute mb-2">Ajouter un article</div>
                <div className="flex gap-2">
                  <input value={rechercheOdoo} onChange={e => setRechercheOdoo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && chercher()} placeholder="nom du produit dans Odoo…"
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
                        {p.image && <img src={p.image} alt="" className="w-8 h-8 rounded object-cover" />}
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

      {/* ---- LA LISTE À ENVOYER (barre du bas, repliée par défaut) ---- */}
      {panier.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-line shadow-[0_-4px_14px_rgba(122,42,68,0.08)] z-40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="max-w-3xl mx-auto p-2.5">
            {/* Le détail est masqué par défaut : déplié, il cachait les articles à choisir. */}
            {panierOuvert && (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-mute">Liste à envoyer</div>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="px-2 py-1 border border-line rounded-lg text-[12px]" />
                </div>
                <div className="max-h-[28vh] overflow-y-auto mb-2">
                  {panier.map(p => (
                    <div key={p.odoo_product_id} className="flex items-center gap-2 py-1 text-[12.5px]">
                      <div className="flex-1 truncate">{p.nom}</div>
                      <button onClick={() => setCalc({ article: p, saisie: String(p.qty).replace('.', ',') })}
                        className="px-2 py-0.5 border border-line rounded-md">{fmt(p.qty)} {p.unite}</button>
                      <button onClick={() => setPanier(panier.filter(x => x.odoo_product_id !== p.odoo_product_id))}
                        className="p-1 text-ink-mute hover:text-red-700"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => setPanierOuvert(!panierOuvert)}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 text-[12.5px] border border-line rounded-lg bg-white whitespace-nowrap">
                {panierOuvert ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                <b>{panier.length}</b> article{panier.length > 1 ? 's' : ''}
              </button>
              <button onClick={envoyerListe} disabled={busy}
                className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 text-[13.5px] font-medium bg-bordeaux text-cream rounded-lg hover:bg-bordeaux-deep disabled:opacity-50">
                <Send size={15} /> Envoyer — {SENS[sens].vers}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- CALCULATRICE ---- */}
      {calc && (
        <div onClick={() => setCalc(null)} className="fixed inset-0 bg-black/45 z-50 flex items-end sm:items-center justify-center p-3 overflow-y-auto">
          <div onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl p-4 w-full max-w-xs border border-line max-h-[92dvh] overflow-y-auto"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-start gap-2 mb-3">
              {calc.article.image_url && <img src={calc.article.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />}
              <div className="flex-1">
                <div className="text-[13px] text-ink leading-tight">{calc.article.nom}</div>
                <div className="text-[11px] text-ink-mute">en {calc.article.unite}</div>
              </div>
              <button onClick={() => setCalc(null)} className="p-1 text-ink-mute"><X size={16} /></button>
            </div>

            <div className="bg-cream-warm border border-line rounded-xl px-4 py-3 mb-3 text-right">
              <span className="text-[28px] font-medium text-ink">{calc.saisie || '0'}</span>
              <span className="text-[13px] text-ink-mute ml-1">{calc.article.unite}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '←'].map(t => (
                <button key={t} onClick={() => tape(t)}
                  className="py-3 rounded-xl border border-line bg-white text-[18px] font-medium hover:bg-cream active:bg-cream-warm">
                  {t}
                </button>
              ))}
            </div>

            <div className="flex gap-2 mt-3 sticky bottom-0 bg-white pt-1">
              <button onClick={() => tape('C')} className="px-4 py-3 text-[13px] border border-line rounded-lg bg-white">Effacer</button>
              <button onClick={validerCalc} className="flex-1 inline-flex items-center justify-center gap-1 px-4 py-3 text-[14px] font-medium bg-bordeaux text-cream rounded-lg">
                <Plus size={15} /> Ajouter à la liste
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- RÉGLAGES ---- */}
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
