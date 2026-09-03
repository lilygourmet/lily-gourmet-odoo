// src/components/InventaireView.jsx
// Onglet « Inventaire annexe » : compter le stock réel de WHPDX/Stock Prod annexe.
// - La liste vient d'Odoo en direct (matières premières MP- et semi-finis SM…).
// - Le stock théorique n'est PAS affiché pendant le comptage : le voir fausse
//   le comptage. Il apparaît dans l'export, avec l'écart.
import { useEffect, useMemo, useState, useCallback } from 'react'
import { RefreshCw, Plus, Clipboard, Trash2, Upload } from 'lucide-react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { todayISO } from '../lib/dates'
import {
  loadArticlesInventaire, loadComptages, saveComptage, deleteComptages,
  loadAjouts, addAjout, updateAjout, deleteAjout, tableauInventaire, calculer,
  envoyerVersOdoo,
} from '../lib/inventaire'

const FAM_ZERO = 'À zéro ou en négatif'
const FAMILLES = ['Matières premières', 'Semi-finis']

// mode 'stock'  : ce qui a du stock dans l'annexe (l'inventaire d'origine)
// mode 'zero'   : ce dont le stock Odoo est faux — à zéro, ou négatif — volontairement
//                 dans un onglet À PART pour ne pas se mélanger avec le premier comptage.
export default function InventaireView({ user, activeView, onNavigate, onLogout, mode = 'stock', lieu = 'annexe' }) {
  const estZero = mode === 'zero'
  const nomLieu = lieu === 'prod' ? 'Prod' : 'annexe'
  const [loading, setLoading] = useState(true)
  const [articles, setArticles] = useState([])
  const [comptes, setComptes] = useState({})      // product_id -> ligne de comptage
  const [ajouts, setAjouts] = useState([])
  const [search, setSearch] = useState('')
  const [famille, setFamille] = useState(null)
  const [vue, setVue] = useState('tout')          // tout | reste | faits
  const [selection, setSelection] = useState(() => new Set())
  const [ajoutOuvert, setAjoutOuvert] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  const load = useCallback(async () => {
    try {
      const [arts, cpt, ajs] = await Promise.all([
        loadArticlesInventaire(lieu), loadComptages(lieu), loadAjouts(lieu)])
      setArticles(arts.filter(a => (a.fam === FAM_ZERO) === estZero))
      setComptes(Object.fromEntries(cpt.map(c => [c.product_id, c])))
      setAjouts(ajs)
    } catch (e) { toast.error('Chargement impossible : ' + e.message) }
    setLoading(false)
  }, [estZero, lieu])
  // load() ne touche à l'état qu'APRÈS son `await` : la règle ne sait pas le voir
  // et croit à un rendu en cascade. L'écran démarre déjà en « chargement ».
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // Enregistré quand la case est validée (on quitte la case, ou Entrée) : un
  // calcul en cours de frappe (« 2500+ ») ne doit pas partir en base.
  function saisir(a, quantite) {
    if (quantite === null) {
      setComptes(c => { const n = { ...c }; delete n[a.id]; return n })
      deleteComptages(lieu, [a.id]).catch(e => toast.error('Non enregistré : ' + e.message))
      return
    }
    const ligne = {
      product_id: a.id, nom: a.nom, uom: a.uom, quantite,
      qty_odoo: a.qty, compte_par: user?.full_name || user?.username || null,
    }
    setComptes(c => ({ ...c, [a.id]: ligne }))
    saveComptage(lieu, ligne).catch(e => toast.error('Non enregistré : ' + e.message))
  }

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return articles.filter(a => {
      if (famille && a.fam !== famille) return false
      if (vue === 'reste' && comptes[a.id]) return false
      if (vue === 'faits' && !comptes[a.id]) return false
      if (q && !(a.nom.toLowerCase().includes(q) || a.cat.toLowerCase().includes(q))) return false
      return true
    })
  }, [articles, comptes, famille, vue, search])

  const dansFamille = useMemo(
    () => articles.filter(a => !famille || a.fam === famille), [articles, famille])
  const faitsFamille = dansFamille.filter(a => comptes[a.id]).length
  const totalFaits = Object.keys(comptes).length
  const pct = articles.length ? Math.round(totalFaits / articles.length * 100) : 0

  async function effacerSelection() {
    const ids = [...selection]
    if (!ids.length) return
    const ok = await confirmDialog(
      `Effacer ${ids.length} comptage${ids.length > 1 ? 's' : ''} ? Ces articles repasseront « à compter ».`,
      { confirmLabel: 'Effacer', danger: true })
    if (!ok) return
    try {
      await deleteComptages(lieu, ids)
      setComptes(c => { const n = { ...c }; ids.forEach(i => delete n[i]); return n })
      setSelection(new Set()); setVue('tout')
      toast.success('Comptages effacés.')
    } catch (e) { toast.error('Erreur : ' + e.message) }
  }

  // Le comptage part dans Odoo en « quantité comptée ». Rien n'est appliqué
  // ici : Layla relit l'écart dans Odoo et applique elle-même. Seuls les
  // articles de CET onglet partent — on n'envoie pas un comptage qu'elle n'a
  // pas sous les yeux.
  async function versOdoo() {
    // Le comptage du JOUR seulement. Un comptage d'hier a été fait avant les
    // fabrications d'aujourd'hui : l'appliquer effacerait ce qui est sorti
    // depuis. Ceux-là restent de côté, et l'écran dit combien.
    const dujour = articles.filter(a => comptes[a.id] && String(comptes[a.id].compte_le || '').slice(0, 10) === todayISO())
    const vieux = articles.filter(a => comptes[a.id]).length - dujour.length
    const aEnvoyer = dujour.map(a => ({ product_id: a.id, quantite: comptes[a.id].quantite }))
    if (!aEnvoyer.length) {
      toast.error(vieux ? `Rien compté aujourd'hui ici (${vieux} comptage${vieux > 1 ? 's' : ''} plus ancien${vieux > 1 ? 's' : ''}).`
        : "Rien de compté dans cet onglet.")
      return
    }
    const ok = await confirmDialog(
      `Envoyer les ${aEnvoyer.length} comptage${aEnvoyer.length > 1 ? 's' : ''} d'aujourd'hui dans Odoo ?\n\n`
      + (vieux ? `${vieux} comptage${vieux > 1 ? 's' : ''} d'un autre jour reste${vieux > 1 ? 'nt' : ''} de côté.\n\n` : '')
      + "Le stock ne bougera PAS : Odoo les met en attente dans « Ajustements "
      + "d'inventaire ». C'est toi qui appliques là-bas, après avoir relu les écarts.",
      { confirmLabel: 'Envoyer' })
    if (!ok) return
    setEnvoi(true)
    try {
      const r = await envoyerVersOdoo(lieu, aEnvoyer)
      const bouts = []
      if (r.ecrits) bouts.push(r.ecrits + ' à corriger')
      if (r.crees) bouts.push(r.crees + ' nouvelle' + (r.crees > 1 ? 's' : '') + ' ligne' + (r.crees > 1 ? 's' : ''))
      if (r.pareils) bouts.push(r.pareils + ' déjà juste' + (r.pareils > 1 ? 's' : ''))
      toast.success(bouts.length
        ? 'Dans Odoo : ' + bouts.join(', ') + '. À appliquer là-bas.'
        : 'Odoo était déjà à jour.')
      if (r.sautes && r.sautes.length) {
        toast.error('Sautés (plusieurs emplacements) : ' + r.sautes.slice(0, 3).join(' · '))
      }
    } catch (e) { toast.error('Envoi impossible : ' + e.message) }
    setEnvoi(false)
  }

  async function copier() {
    const txt = tableauInventaire(articles, comptes, ajouts)
    if (!txt.includes('\n')) { toast.error("Rien de compté pour l'instant."); return }
    try { await navigator.clipboard.writeText(txt); toast.success('Copié — colle dans Excel.') }
    catch { toast.error('Copie refusée par le navigateur.') }
  }

  const parCategorie = useMemo(() => {
    const g = []; let cour = null
    for (const a of visibles) {
      if (a.cat !== cour) { cour = a.cat; g.push({ cat: cour, lignes: [] }) }
      g[g.length - 1].lignes.push(a)
    }
    return g
  }, [visibles])

  return (
    <div className="min-h-screen lg-vibrant">
      <AppHeader user={user} activeView={activeView} onNavigate={onNavigate} onLogout={onLogout} />
      <div className="max-w-3xl mx-auto px-4 py-6 pb-28">

        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-[24px] font-semibold text-ink tracking-tight">
              {estZero ? `🔍 ${nomLieu} — à zéro ou en négatif` : `📦 Inventaire ${nomLieu}`}
            </h1>
            <p className="text-[13px] text-ink-mute mt-1">
              {estZero
                ? `Utilisés ${lieu === 'prod' ? 'en prod' : "à l'annexe"} cette année, mais qu'Odoo compte mal : à zéro, ou en négatif`
                : `${lieu === 'prod' ? 'WHLVP/Stock/Stock Prod' : 'WHPDX/Stock Prod annexe'} — matières premières et semi-finis`}
            </p>
          </div>
          <button onClick={load} className="px-3 py-2 rounded-full bg-bordeaux text-cream text-[13px] flex items-center gap-1.5 hover:bg-bordeaux-deep">
            <RefreshCw size={14} strokeWidth={1.8} /> <span className="hidden sm:inline">Recharger</span>
          </button>
        </div>

        {loading ? <Skeleton /> : (
          <>
            <div className="bg-white rounded-2xl border border-line shadow-sm p-4 mb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[26px] font-semibold text-ink tabular-nums">{totalFaits}</span>
                <span className="text-[13px] text-ink-mute">comptés sur {articles.length}</span>
                <span className="ml-auto text-[13px] font-semibold text-bordeaux tabular-nums">{pct} %</span>
              </div>
              <div className="h-1.5 bg-line rounded-full overflow-hidden mt-2">
                <div className="h-full bg-bordeaux rounded-full transition-all" style={{ width: pct + '%' }} />
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 mb-3 text-[12.5px] text-amber-900 leading-snug">
              <b>La case de quantité fait calculatrice.</b> Trois sacs pesés ? Tape <code className="bg-white/70 px-1 rounded">2500+1800+400</code>.
              Trois boîtes de 500 g ? <code className="bg-white/70 px-1 rounded">3*500</code>. Le total s'affiche, puis appuie sur Entrée.
            </div>

            <div className="relative mb-3">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Chercher un article…"
                className="w-full px-4 py-2.5 pr-9 text-[14px] bg-white border border-line rounded-xl focus:outline-none focus:border-bordeaux/60 placeholder:text-ink-mute" />
              {search && <button onClick={() => setSearch('')} aria-label="Vider la recherche"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-line text-ink-mute flex items-center justify-center text-[11px]">✕</button>}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
              <Chip actif={famille === null} onClick={() => setFamille(null)}
                label="Tout" compteur={`${totalFaits}/${articles.length}`} />
              {!estZero && FAMILLES.map(f => {
                const tot = articles.filter(a => a.fam === f).length
                if (!tot) return null
                const fait = articles.filter(a => a.fam === f && comptes[a.id]).length
                return <Chip key={f} actif={famille === f} onClick={() => setFamille(famille === f ? null : f)}
                  label={f} compteur={`${fait}/${tot}`} />
              })}
            </div>

            <div className="flex gap-1 bg-line/50 rounded-xl p-1 mb-4">
              {[['tout', 'Tout', dansFamille.length],
                ['reste', 'À compter', dansFamille.length - faitsFamille],
                ['faits', 'Comptés', faitsFamille]].map(([cle, label, n]) => (
                <button key={cle} onClick={() => { if (cle !== 'faits') setSelection(new Set()); setVue(cle) }}
                  aria-pressed={vue === cle}
                  className={`flex-1 py-2 rounded-lg text-[12.5px] font-semibold transition-all ${vue === cle ? 'bg-white text-ink shadow-sm' : 'text-ink-mute'}`}>
                  {label} <span className="font-normal opacity-60 tabular-nums">{n}</span>
                </button>
              ))}
            </div>

            {!visibles.length && !ajouts.length && (
              <p className="py-12 text-center text-[14px] text-ink-mute">
                {vue === 'reste' ? 'Tout est compté ici 🎉' : vue === 'faits' ? "Rien de compté ici pour l'instant." : 'Aucun article ne correspond.'}
              </p>
            )}

            {parCategorie.map(g => (
              <div key={g.cat} className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-bordeaux/70 mb-1.5 px-1">
                  {g.cat} <span className="font-normal normal-case tracking-normal text-ink-mute">· {g.lignes.length}</span>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-sm overflow-hidden">
                  {g.lignes.map(a => (
                    <Ligne key={a.id} a={a} compte={comptes[a.id]} onSaisie={saisir}
                      selectable={vue === 'faits'} selectionne={selection.has(a.id)}
                      onSelect={v => setSelection(s => { const n = new Set(s); v ? n.add(a.id) : n.delete(a.id); return n })} />
                  ))}
                </div>
              </div>
            ))}

            {vue === 'faits' && visibles.length > 0 && (
              <div className="flex items-center justify-center gap-2 flex-wrap py-2 mb-4">
                <button onClick={() => setSelection(s => {
                  const tout = visibles.every(a => s.has(a.id))
                  const n = new Set(s); visibles.forEach(a => tout ? n.delete(a.id) : n.add(a.id)); return n
                })} className="px-3 py-2 rounded-xl border border-line bg-white text-[13px] font-semibold text-ink">
                  {visibles.every(a => selection.has(a.id)) ? 'Tout décocher' : 'Tout cocher'}
                </button>
                <button onClick={effacerSelection} disabled={!selection.size}
                  className="px-3 py-2 rounded-xl border border-line bg-white text-[13px] font-semibold text-bordeaux disabled:text-ink-mute disabled:opacity-60">
                  {selection.size ? `Effacer ${selection.size} comptage${selection.size > 1 ? 's' : ''}` : 'Effacer la sélection'}
                </button>
                <p className="basis-full text-center text-[11.5px] text-ink-mute mt-1">
                  Les articles ajoutés à la main ne sont pas concernés.
                </p>
              </div>
            )}

            {vue !== 'reste' && ajouts.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-bordeaux mb-1.5 px-1">
                  Ajoutés à la main <span className="font-normal normal-case tracking-normal text-ink-mute">· {ajouts.length}</span>
                </div>
                <div className="bg-white rounded-2xl border border-line shadow-sm overflow-hidden">
                  {ajouts.map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-line/60 last:border-0 bg-emerald-50/40">
                      <div className="flex-1 min-w-0 text-[14px] text-ink break-words">{a.nom}</div>
                      <input type="text" inputMode="text" defaultValue={a.quantite}
                        onBlur={e => {
                          const n = calculer(e.target.value)
                          if (n === null) { toast.error('Chiffre ou calcul invalide — ex. 2500+1800'); e.target.value = a.quantite; return }
                          e.target.value = n
                          setAjouts(l => l.map(x => x.id === a.id ? { ...x, quantite: n } : x))
                          updateAjout(a.id, n).catch(err => toast.error(err.message))
                        }}
                        aria-label={'Quantité pour ' + a.nom}
                        className="w-20 px-2 py-2 text-right text-[15px] font-semibold tabular-nums bg-cream border border-line rounded-lg focus:outline-none focus:border-bordeaux/60" />
                      <span className="text-[11.5px] text-ink-mute w-8">{a.uom}</span>
                      <button onClick={async () => {
                        if (!await confirmDialog(`Retirer « ${a.nom} » ?`, { confirmLabel: 'Retirer', danger: true })) return
                        try { await deleteAjout(a.id); setAjouts(l => l.filter(x => x.id !== a.id)) }
                        catch (e) { toast.error(e.message) }
                      }} aria-label={'Retirer ' + a.nom} className="text-ink-mute hover:text-bordeaux">
                        <Trash2 size={15} strokeWidth={1.8} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="lg-bottom-bar fixed left-0 right-0 bottom-0 z-40 bg-white border-t border-line px-4 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <span className="flex-1 text-[12px] text-ink-mute">
            {totalFaits + ajouts.length} article{totalFaits + ajouts.length > 1 ? 's' : ''} compté{totalFaits + ajouts.length > 1 ? 's' : ''}
          </span>
          <button onClick={() => setAjoutOuvert(true)}
            className="px-3 py-2 rounded-xl border border-line bg-white text-[13px] font-semibold text-ink flex items-center gap-1.5">
            <Plus size={14} strokeWidth={2} /> Article
          </button>
          <button onClick={copier}
            className="px-3 py-2 rounded-xl border border-line bg-white text-[13px] font-semibold text-ink flex items-center gap-1.5">
            <Clipboard size={14} strokeWidth={1.8} /> Résultat
          </button>
          <button onClick={versOdoo} disabled={envoi || !totalFaits}
            className="px-3 py-2 rounded-xl bg-bordeaux text-cream text-[13px] font-semibold flex items-center gap-1.5 disabled:opacity-50">
            <Upload size={14} strokeWidth={1.8} /> {envoi ? 'Envoi…' : 'Vers Odoo'}
          </button>
        </div>
      </div>

      {ajoutOuvert && (
        <ModaleAjout user={user} lieu={lieu} onClose={() => setAjoutOuvert(false)}
          onAjoute={a => { setAjouts(l => [...l, a]); setAjoutOuvert(false) }} />
      )}
    </div>
  )
}

function Chip({ actif, onClick, label, compteur }) {
  return (
    <button onClick={onClick} aria-pressed={actif}
      className={`shrink-0 px-3.5 py-2 rounded-full text-[13px] font-medium border whitespace-nowrap transition-all
        ${actif ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-white text-ink-mute border-line'}`}>
      {label} <span className="opacity-65 tabular-nums ml-0.5">{compteur}</span>
    </button>
  )
}

function Ligne({ a, compte, onSaisie, selectable, selectionne, onSelect }) {
  const enregistre = compte ? String(compte.quantite) : ''
  // Le texte tapé vit ici tant qu'on écrit (« 2500+1800 » n'est pas un nombre).
  // Quand la valeur enregistrée change AILLEURS (chargement, effacement groupé),
  // on la reprend — motif React « ajuster l'état pendant le rendu ».
  const [txt, setTxt] = useState(enregistre)
  const [vuPrecedemment, setVuPrecedemment] = useState(enregistre)
  if (enregistre !== vuPrecedemment) { setVuPrecedemment(enregistre); setTxt(enregistre) }

  // Aperçu du total pendant qu'elle tape « 2500+1800 » (le 1er caractère est
  // ignoré pour ne pas prendre un moins de signe pour une opération).
  const apercu = /[+\-*]/.test(txt.slice(1)) ? calculer(txt) : null

  function valider() {
    const v = txt.trim()
    if (v === '') { if (compte) onSaisie(a, null); return }
    const n = calculer(v)
    if (n === null) { toast.error('Chiffre ou calcul invalide — ex. 2500+1800'); setTxt(enregistre); return }
    if (n !== (compte ? compte.quantite : null)) onSaisie(a, n)
    else setTxt(String(n))
  }

  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-b border-line/60 last:border-0 ${compte ? 'bg-emerald-50/40' : ''}`}>
      {selectable && (
        <input type="checkbox" checked={selectionne} onChange={e => onSelect(e.target.checked)}
          aria-label={'Sélectionner ' + a.nom} className="w-5 h-5 shrink-0 accent-[#7a1f3d]" />
      )}
      <div className="flex-1 min-w-0 text-[14px] text-ink break-words">
        {a.nom}
        {a.qty < 0 && (
          <span className="ml-2 align-middle inline-block px-1.5 py-0.5 rounded-md bg-red-50 border border-red-200 text-[11px] font-semibold text-red-700 tabular-nums whitespace-nowrap">
            Odoo : {String(a.qty).replace('-', '\u2212').replace('.', ',')}
          </span>
        )}
      </div>
      <div className="w-24 shrink-0">
        <input type="text" inputMode="text" placeholder="—"
          value={txt} onChange={e => setTxt(e.target.value)} onBlur={valider}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
          aria-label={'Quantité comptée pour ' + a.nom}
          className={`w-full px-2 py-2 text-right text-[15px] font-semibold tabular-nums bg-cream border rounded-lg focus:outline-none focus:border-bordeaux/60 ${compte ? 'border-emerald-500' : 'border-line'}`} />
        {apercu !== null && (
          <div className="text-[11.5px] text-bordeaux font-bold tabular-nums text-right mt-0.5">= {apercu}</div>
        )}
      </div>
      <span className="text-[11.5px] text-ink-mute w-8">{a.uom}</span>
    </div>
  )
}

function ModaleAjout({ user, lieu, onClose, onAjoute }) {
  const [nom, setNom] = useState('')
  const [qte, setQte] = useState('')
  const [uom, setUom] = useState('g')
  const [busy, setBusy] = useState(false)

  async function valider() {
    const n = calculer(qte)
    if (!nom.trim()) { toast.error('Donne un nom à l\'article.'); return }
    if (n === null) { toast.error('Quantité invalide — ex. 2500+1800'); return }
    setBusy(true)
    try {
      const row = await addAjout(lieu, {
        nom: nom.trim(), uom, quantite: n,
        compte_par: user?.full_name || user?.username || null,
      })
      onAjoute(row)
    } catch (e) { toast.error('Erreur : ' + e.message); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-line shadow-xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-[17px] font-semibold text-ink mb-1">Ajouter un article</h2>
        <p className="text-[13px] text-ink-mute mb-4">Pour ce que tu as en stock mais qui n'est pas dans la liste.</p>
        <label className="block mb-3">
          <span className="block text-[12px] text-ink-mute mb-1">Nom de l'article</span>
          <input autoFocus value={nom} onChange={e => setNom(e.target.value)} placeholder="ex. Pâte de pistache Bronte"
            className="w-full px-3 py-2.5 text-[15px] bg-cream border border-line rounded-xl focus:outline-none focus:border-bordeaux/60" />
        </label>
        <div className="flex gap-3 mb-4">
          <label className="flex-1">
            <span className="block text-[12px] text-ink-mute mb-1">Quantité</span>
            <input value={qte} onChange={e => setQte(e.target.value)} inputMode="text" placeholder="2500+1800"
              className="w-full px-3 py-2.5 text-[15px] bg-cream border border-line rounded-xl focus:outline-none focus:border-bordeaux/60" />
          </label>
          <label className="flex-1">
            <span className="block text-[12px] text-ink-mute mb-1">Unité</span>
            <select value={uom} onChange={e => setUom(e.target.value)}
              className="w-full px-3 py-2.5 text-[15px] bg-cream border border-line rounded-xl focus:outline-none focus:border-bordeaux/60">
              {['g', 'kg', 'Units', 'L', 'cl'].map(u => <option key={u}>{u}</option>)}
            </select>
          </label>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-line text-[13.5px] font-semibold text-ink">Annuler</button>
          <button onClick={valider} disabled={busy} className="px-4 py-2 rounded-xl bg-bordeaux text-cream text-[13.5px] font-semibold disabled:opacity-50">
            {busy ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  )
}
