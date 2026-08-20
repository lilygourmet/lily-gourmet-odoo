import { useState, useEffect } from 'react'
import {
  loadProfils, createProfil, renameProfil, deleteProfil,
  loadAllCategories, createCategory, deleteCategory,
  loadCategoryProfils, setCategoryProfils, createGroup, deleteGroup,
  loadCategoryManage, addArticleFromOdoo, setArticleActive, deleteArticle, linkArticleToOdoo,
  loadOdooProducts, syncWithOdoo,
} from '../../lib/economat'
import { toast } from '../../lib/toast'
import { confirmDialog } from '../../lib/confirmDialog'
import { RefreshCw, Plus, Trash2, ChevronDown, ChevronRight, Search, Eye, EyeOff, Link2, X, Pencil } from 'lucide-react'
import SearchSelect from '../SearchSelect'

// Gestion de l'économat (admin + économe) : catégories, groupes, articles (depuis Odoo).
export default function EconomatManageModal({ onClose, onChanged }) {
  const [categories, setCategories] = useState([])
  const [catId, setCatId] = useState(null)
  const [profils, setProfils] = useState([])
  const [allProfils, setAllProfils] = useState([])   // badges existants
  const [showBadges, setShowBadges] = useState(false)
  const [manage, setManage] = useState({ groups: [], articles: [] })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [addGroupId, setAddGroupId] = useState(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  async function reloadCats(selectId) {
    const cats = await loadAllCategories()
    setCategories(cats)
    const sel = selectId ?? (cats.find(c => c.id === catId)?.id ?? cats[0]?.id ?? null)
    setCatId(sel)
    return sel
  }
  async function reloadManage(id = catId) {
    if (!id) { setManage({ groups: [], articles: [] }); setProfils([]); return }
    const [m, pr] = await Promise.all([loadCategoryManage(id), loadCategoryProfils(id)])
    setManage(m); setProfils(pr)
  }

  async function reloadProfils() { setAllProfils(await loadProfils()) }

  useEffect(() => { (async () => { setLoading(true); try { await Promise.all([reloadCats(), reloadProfils()]) } finally { setLoading(false) } })() }, [])
  useEffect(() => { if (catId) reloadManage(catId) }, [catId])

  function notifyChanged() { onChanged && onChanged() }

  async function addCategory() {
    const name = window.prompt('Nom de la nouvelle catégorie (ex. Cuisine) :')
    if (!name?.trim()) return
    setBusy(true)
    try { const c = await createCategory(name); await reloadCats(c.id); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }
  async function removeCategory() {
    const cat = categories.find(c => c.id === catId)
    if (!cat) return
    if (!await confirmDialog(`Supprimer la catégorie « ${cat.name} » et tous ses groupes/articles ?`, { danger: true, confirmLabel: 'Supprimer' })) return
    setBusy(true)
    try { await deleteCategory(catId); await reloadCats(); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }
  async function toggleProfil(p) {
    const next = profils.includes(p) ? profils.filter(x => x !== p) : [...profils, p]
    setProfils(next)
    try { await setCategoryProfils(catId, next); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function addBadge() {
    const label = window.prompt('Nom du nouveau badge (ex. Ménage) :')
    if (!label?.trim()) return
    setBusy(true)
    try { await createProfil(label); await reloadProfils(); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }
  async function renameBadge(p) {
    const label = window.prompt('Nouveau nom du badge :', p.label)
    if (!label?.trim() || label.trim() === p.label) return
    setBusy(true)
    try { await renameProfil(p.value, label); await reloadProfils(); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }
  async function removeBadge(p) {
    if (!await confirmDialog(`Supprimer le badge « ${p.label} » ?`, { danger: true, confirmLabel: 'Supprimer' })) return
    setBusy(true)
    try { await deleteProfil(p.value); await reloadProfils(); await reloadManage(); notifyChanged() }
    catch (e) { toast.error('Suppression impossible : ' + e.message) } finally { setBusy(false) }
  }

  async function addGroup() {
    const name = window.prompt('Nom du nouveau groupe (ex. Épicerie) :')
    if (!name?.trim()) return
    setBusy(true)
    try { await createGroup(catId, name); await reloadManage(); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }
  async function removeGroup(g) {
    if (!await confirmDialog(`Supprimer le groupe « ${g.name} » ? (ses articles passeront en « sans groupe »)`, { danger: true, confirmLabel: 'Supprimer' })) return
    setBusy(true)
    try { await deleteGroup(g.id); await reloadManage(); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }
  async function runSearch() {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    try { setResults(await loadOdooProducts({ q: q.trim() })) }
    catch (e) { toast.error('Erreur Odoo : ' + e.message) } finally { setSearching(false) }
  }
  async function pickProduct(p) {
    setBusy(true)
    try { await addArticleFromOdoo({ categoryId: catId, groupId: addGroupId, odoo: p }); await reloadManage(); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) } finally { setBusy(false) }
  }
  // Relier un article existant à un produit Odoo : la recherche part de son nom.
  const [lierArt, setLierArt] = useState(null)      // article en cours de liaison
  const [lierQ, setLierQ] = useState('')
  const [lierRes, setLierRes] = useState([])
  const [lierBusy, setLierBusy] = useState(false)

  async function ouvrirLier(a) {
    setLierArt(a); setLierQ(a.name); setLierRes([]); setLierBusy(true)
    try { setLierRes(await loadOdooProducts({ q: a.name })) }
    catch (e) { toast.error('Erreur Odoo : ' + e.message) }
    finally { setLierBusy(false) }
  }
  async function chercherLier(terme) {
    setLierBusy(true)
    try { setLierRes(await loadOdooProducts({ q: terme.trim() })) }
    catch (e) { toast.error('Erreur Odoo : ' + e.message) }
    finally { setLierBusy(false) }
  }
  async function confirmerLier(prod) {
    try {
      await linkArticleToOdoo(lierArt.id, prod)
      toast.success(`« ${lierArt.name} » relié à ${prod.odoo_name || prod.name}`)
      setLierArt(null); await reloadManage(); notifyChanged()
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  async function toggleArticle(a) {
    try { await setArticleActive(a.id, !a.active); await reloadManage() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function removeArticle(a) {
    if (!await confirmDialog(`Supprimer l'article « ${a.name} » ?`, { danger: true, confirmLabel: 'Supprimer' })) return
    try { await deleteArticle(a.id); await reloadManage(); notifyChanged() }
    catch (e) { toast.error('Erreur : ' + e.message) }
  }
  async function runSync() {
    setBusy(true); setSyncMsg('')
    try {
      const r = await syncWithOdoo()
      setSyncMsg(`✅ ${r.linked} rattaché(s), ${r.updated} mis à jour${r.ambiguous ? `, ${r.ambiguous} à vérifier (noms ambigus)` : ''}.`)
      await reloadManage(); notifyChanged()
    } catch (e) { toast.error('Erreur synchro : ' + e.message) } finally { setBusy(false) }
  }

  const groupName = (id) => manage.groups.find(g => g.id === id)?.name
  const articlesByGroup = (gid) => manage.articles.filter(a => (a.group_id ?? null) === gid)

  return (
    <div className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-cream rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl border border-line" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-cream/95 backdrop-blur-sm border-b border-line px-5 py-3 flex items-center justify-between gap-2 z-10">
          <h3 className="font-fraunces italic text-[18px] text-ink">Gérer l'économat</h3>
          <div className="flex items-center gap-2">
            <button onClick={runSync} disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bordeaux text-cream text-[11px] font-medium hover:bg-bordeaux-deep disabled:opacity-50">
              <RefreshCw size={13} strokeWidth={1.8} className={busy ? 'animate-spin' : ''} /> Synchroniser Odoo
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full border border-line text-ink-mute hover:bg-bordeaux hover:text-cream hover:border-bordeaux flex items-center justify-center">×</button>
          </div>
        </div>

        {syncMsg && <div className="px-5 pt-3 text-[12px] text-success">{syncMsg}</div>}

        {loading ? (
          <div className="text-center text-ink-mute italic py-12">Chargement...</div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Badges (profils) : qui a le droit de voir quoi. Global, pas par catégorie. */}
            <div className="border border-line rounded-lg p-3 bg-cream-warm/30">
              <button onClick={() => setShowBadges(v => !v)} className="flex items-center gap-1.5 text-[13px] font-medium text-bordeaux">
                {showBadges ? <ChevronDown size={15} strokeWidth={1.8} /> : <ChevronRight size={15} strokeWidth={1.8} />}
                Badges ({allProfils.length})
              </button>
              {showBadges && (
                <div className="mt-2 space-y-2">
                  <div className="text-[11px] text-ink-mute italic">
                    Le badge donné à un employé décide des catégories qu'il peut demander.
                  </div>
                  <div className="space-y-1">
                    {allProfils.map(p => (
                      <div key={p.value} className="flex items-center gap-2 bg-white border border-line rounded-lg px-3 py-1.5">
                        <span className="flex-1 text-[12px] text-ink truncate">{p.label}</span>
                        <button onClick={() => renameBadge(p)} disabled={busy} title="Renommer"
                                className="text-ink-mute hover:text-bordeaux"><Pencil size={13} strokeWidth={1.8} /></button>
                        <button onClick={() => removeBadge(p)} disabled={busy} title="Supprimer"
                                className="text-ink-mute hover:text-red-600"><Trash2 size={13} strokeWidth={1.8} /></button>
                      </div>
                    ))}
                    {allProfils.length === 0 && (
                      <div className="text-[12px] text-amber-700 italic">Aucun badge. Crées-en un pour donner accès à l'économat.</div>
                    )}
                  </div>
                  <button onClick={addBadge} disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-bordeaux text-bordeaux text-[11px] font-medium hover:bg-bordeaux hover:text-cream disabled:opacity-50">
                    <Plus size={13} strokeWidth={1.8} /> Nouveau badge
                  </button>
                </div>
              )}
            </div>

            {/* Catégorie : sélecteur + créer/supprimer */}
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-ink-mute mb-1.5">Catégorie</div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SearchSelect value={catId ? String(catId) : ''} onChange={v => setCatId(Number(v))} placeholder="Chercher une catégorie…"
                    inputStyle={{ width: '100%', padding: '8px 12px', fontSize: 13, background: 'white', border: '1px solid #e5d8c3', borderRadius: 8, boxSizing: 'border-box' }}
                    options={categories.map(c => ({ value: String(c.id), label: c.name }))} />
                </div>
                <button onClick={addCategory} disabled={busy} title="Nouvelle catégorie" className="px-3 py-2 rounded-lg border border-bordeaux text-bordeaux hover:bg-bordeaux hover:text-cream flex items-center"><Plus size={15} strokeWidth={1.8} /></button>
                {catId && <button onClick={removeCategory} disabled={busy} title="Supprimer la catégorie" className="px-3 py-2 rounded-lg border border-line text-ink-mute hover:bg-red-600 hover:text-white hover:border-red-600 flex items-center"><Trash2 size={14} strokeWidth={1.8} /></button>}
              </div>
            </div>

            {catId && (
              <>
                {/* Profils qui voient cette catégorie */}
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink-mute mb-1.5">Visible par les profils</div>
                  <div className="flex flex-wrap gap-1.5">
                    {allProfils.map(p => (
                      <button key={p.value} onClick={() => toggleProfil(p.value)}
                              className={`px-3 py-1 rounded-full text-[11px] border transition-colors ${profils.includes(p.value) ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-soft border-line hover:border-bordeaux/40'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ajouter un article depuis Odoo */}
                <div className="border border-line rounded-lg p-3 bg-cream-warm/30">
                  <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 text-[13px] font-medium text-bordeaux">
                    {showAdd ? <ChevronDown size={15} strokeWidth={1.8} /> : <ChevronRight size={15} strokeWidth={1.8} />} Ajouter un article (depuis Odoo)
                  </button>
                  {showAdd && (
                    <div className="mt-2 space-y-2">
                      <SearchSelect value={addGroupId ? String(addGroupId) : ''} onChange={v => setAddGroupId(v ? Number(v) : null)} placeholder="Sans groupe"
                        inputStyle={{ width: '100%', padding: '8px 12px', fontSize: 12, background: 'white', border: '1px solid #e5d8c3', borderRadius: 8, boxSizing: 'border-box' }}
                        options={[{ value: '', label: '— Sans groupe —' }, ...manage.groups.map(g => ({ value: String(g.id), label: g.name }))]} />

                      <div className="flex gap-2">
                        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()}
                               placeholder="Chercher un produit Odoo (ex. amande)"
                               className="flex-1 px-3 py-2 border border-line rounded-lg text-[13px] bg-white focus:outline-none focus:border-bordeaux" />
                        <button onClick={runSearch} disabled={searching} title="Chercher" className="px-3 py-2 rounded-lg bg-bordeaux text-cream disabled:opacity-50 flex items-center"><Search size={15} strokeWidth={1.8} /></button>
                      </div>
                      {searching ? (
                        <div className="text-[12px] text-ink-mute italic py-2">Recherche...</div>
                      ) : results.length > 0 && (
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                          {results.map(p => (
                            <button key={p.odoo_id} onClick={() => pickProduct(p)} disabled={busy}
                                    className="w-full flex items-center gap-2 p-1.5 rounded border border-line/60 bg-white text-left hover:border-bordeaux disabled:opacity-50">
                              <div className="w-8 h-8 rounded bg-cream-deep border border-line/40 overflow-hidden flex-shrink-0">
                                {p.image_url && <img src={p.image_url} alt="" className="w-full h-full object-cover" />}
                              </div>
                              <span className="flex-1 text-[12px] text-ink">{p.name}</span>
                              {p.unit && <span className="text-[10px] text-ink-mute">{p.unit}</span>}
                              <Plus size={15} strokeWidth={1.8} className="text-bordeaux" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Groupes + articles */}
                <div className="flex items-center justify-between">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink-mute">Groupes & articles</div>
                  <button onClick={addGroup} disabled={busy} className="inline-flex items-center gap-1 text-[11px] text-bordeaux hover:underline"><Plus size={13} strokeWidth={1.8} /> Nouveau groupe</button>
                </div>

                <div className="space-y-3">
                  {manage.groups.map(g => (
                    <div key={g.id} className="border border-line/60 rounded-lg p-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] font-semibold text-ink">{g.name}</span>
                        <button onClick={() => removeGroup(g)} title="Supprimer le groupe" className="text-ink-mute hover:text-red-600"><Trash2 size={13} strokeWidth={1.8} /></button>
                      </div>
                      <ArticleList articles={articlesByGroup(g.id)} onToggle={toggleArticle} onRemove={removeArticle} onLier={ouvrirLier} />
                    </div>
                  ))}
                  {articlesByGroup(null).length > 0 && (
                    <div className="border border-line/60 rounded-lg p-2">
                      <div className="text-[12px] font-semibold text-ink-mute mb-1.5">Sans groupe</div>
                      <ArticleList articles={articlesByGroup(null)} onToggle={toggleArticle} onRemove={removeArticle} onLier={ouvrirLier} />
                    </div>
                  )}
                  {manage.groups.length === 0 && articlesByGroup(null).length === 0 && (
                    <div className="text-center text-ink-mute italic py-4 text-[12px]">Aucun groupe. Crée un groupe puis ajoute des articles.</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <LierPanel
        article={lierArt} q={lierQ} setQ={setLierQ} results={lierRes} busy={lierBusy}
        onSearch={chercherLier} onPick={confirmerLier}
        onUnlink={async () => { await linkArticleToOdoo(lierArt.id, null); setLierArt(null); await reloadManage(); notifyChanged() }}
        onClose={() => setLierArt(null)}
      />
    </div>
  )
}

// Panneau de liaison : recherche Odoo pré-remplie avec le nom de l'article.
function LierPanel({ article, q, setQ, results, busy, onSearch, onPick, onUnlink, onClose }) {
  if (!article) return null
  return (
    <div className="fixed inset-0 z-[1100] bg-black/45 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-line flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-ink truncate">{article.name}</div>
            <div className="text-[11px] text-ink-mute">
              {article.odoo_product_id ? `Actuellement lié à ${article.odoo_name || '#' + article.odoo_product_id}` : 'Non lié à Odoo'}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-mute hover:text-bordeaux p-1"><X size={18} /></button>
        </div>

        <div className="px-4 py-3 border-b border-line flex gap-2">
          <input value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSearch(q)}
            placeholder="Chercher un produit Odoo…"
            className="flex-1 px-3 py-2 text-[13px] border border-line rounded-lg" />
          <button onClick={() => onSearch(q)} disabled={busy} className="lg-btn text-[13px] px-3">
            {busy ? '…' : <Search size={15} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
          {busy && <div className="text-[12px] text-ink-mute italic">Recherche…</div>}
          {!busy && results.length === 0 && <div className="text-[12px] text-ink-mute italic">Aucun produit trouvé. Essaie un mot plus court.</div>}
          {results.map(p => (
            <button key={p.odoo_id} onClick={() => onPick(p)}
              className="w-full text-left px-3 py-2 rounded-lg border border-line/70 hover:border-bordeaux hover:bg-cream-warm/40 text-[13px]">
              {p.odoo_name || p.name}
              {p.unit && <span className="text-[11px] text-ink-mute ml-2">{p.unit}</span>}
            </button>
          ))}
        </div>

        {article.odoo_product_id && (
          <div className="px-4 py-3 border-t border-line">
            <button onClick={onUnlink} className="text-[12px] text-red-600 hover:underline">Retirer le lien Odoo</button>
          </div>
        )}
      </div>
    </div>
  )
}

function ArticleList({ articles, onToggle, onRemove, onLier }) {
  if (articles.length === 0) return <div className="text-[11px] text-ink-mute italic">Aucun article</div>
  return (
    <div className="space-y-1">
      {articles.map(a => (
        <div key={a.id} className={`flex items-center gap-2 text-[12px] ${a.active ? '' : 'opacity-50'}`}>
          <div className="w-7 h-7 rounded bg-cream-deep border border-line/40 overflow-hidden flex-shrink-0">
            {a.photo_url && <img src={a.photo_url} alt="" className="w-full h-full object-cover" />}
          </div>
          <span className="flex-1 text-ink">{a.name}{!a.odoo_product_id && <span className="text-[9px] text-amber-600 ml-1">(non lié Odoo)</span>}</span>
          {a.unit && <span className="text-[10px] text-ink-mute">{a.unit}</span>}
          {onLier && (
            <button onClick={() => onLier(a)} title={a.odoo_product_id ? 'Changer le produit Odoo lié' : 'Relier à un produit Odoo'}
              className={`px-1 ${a.odoo_product_id ? 'text-ink-mute hover:text-bordeaux' : 'text-amber-600 hover:text-bordeaux'}`}>
              <Link2 size={13} strokeWidth={1.8} />
            </button>
          )}
          <button onClick={() => onToggle(a)} title={a.active ? 'Désactiver' : 'Activer'} className="text-ink-mute hover:text-bordeaux px-1">{a.active ? <Eye size={14} strokeWidth={1.8} /> : <EyeOff size={14} strokeWidth={1.8} />}</button>
          <button onClick={() => onRemove(a)} title="Supprimer" className="text-ink-mute hover:text-red-600 px-1"><Trash2 size={13} strokeWidth={1.8} /></button>
        </div>
      ))}
    </div>
  )
}
