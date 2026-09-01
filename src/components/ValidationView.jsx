import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadOrdres, loadFaits, loadManques, validerDansOdoo, chercherArticles, dernierEcran, garderEcran } from '../lib/fabrication'

// ====== « À valider » : la page dédiée ======
// Tout ce que l'équipe a marqué « fait » (montages, préparations, tournées de
// glaçage) attend ici sa confirmation dans Odoo. On ne force jamais sans une
// demande explicite. Réservée à perm_valider_of.

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const norm = u => String(u || '').toLowerCase().replace(/^units?$/, 'u')
// A l'atelier on ne pese pas 1 234,56 g : les quantites s'affichent entieres.
const qte = (q, u) => (norm(u) === 'kg'
  ? `${nb(Math.round(q * 1000))} g`
  : `${nb(Math.round(q))} ${norm(u) === 'g' ? 'g' : u}`)
const propre = n => String(n || '')
  .replace(/^SM\.?\s*/i, '').replace(/^CD\*\s*/i, '').replace(/^MP-\s*/i, '').replace(/^C-\s*/i, '')
  .replace(/\s*\bCD\*?\b\s*$/i, '').replace(/\s*\baccs\b/i, '').trim()

/**
 * Champ de recherche d'un article Odoo : on tape, il propose.
 * Sert à noter un ingrédient que la recette ne prévoyait pas.
 */
function AjoutIngredient({ onChoisir }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState([])
  const [cherche, setCherche] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) return
    let vivant = true
    // on attend une petite pause avant d'interroger Odoo, sinon une question
    // partirait à chaque lettre tapée
    const t = setTimeout(async () => {
      try { const a = await chercherArticles(q); if (vivant) setRes(a) } catch { if (vivant) setRes([]) }
      if (vivant) setCherche(false)
    }, 300)
    return () => { vivant = false; clearTimeout(t) }
  }, [q])

  return (
    <div className="mt-2">
      <input value={q} onChange={e => {
          setQ(e.target.value)
          setRes([])
          setCherche(e.target.value.trim().length >= 2)
        }}
        placeholder="+ ajouter un ingrédient présent en Stock Prod"
        className="w-full text-[13.5px] border border-line rounded-lg px-3 py-2 bg-white" />
      {q.trim().length >= 2 && (
        <div className="mt-1 border border-line rounded-lg bg-white max-h-[190px] overflow-y-auto">
          {cherche && <div className="px-3 py-2 text-[12.5px] text-ink-mute">recherche…</div>}
          {!cherche && !res.length && <div className="px-3 py-2 text-[12.5px] text-ink-mute">aucun article de ce nom</div>}
          {res.map(a => (
            <button key={a.id} onClick={() => { onChoisir(a); setQ(''); setRes([]) }}
              className="w-full text-left px-3 py-2 text-[13px] border-b border-[#f0e8db] last:border-0 hover:bg-cream-warm">
              {a.nom}
              <span className="text-ink-mute text-[11.5px]"> · il y en a {qte(a.stock, a.unite)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ValidationView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(() => dernierEcran('valider'))
  const [sel, setSel] = useState(() => (dernierEcran('valider') || []).map(x => x.name))
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [resultats, setResultats] = useState(null)
  const [confirmer, setConfirmer] = useState(false)
  const [tour, setTour] = useState(0)
  const [ouvert, setOuvert] = useState(null)      // l'ordre dont on note les consommations
  const [notes, setNotes] = useState({})          // { ordre: { idLigne: quantité } }
  const [ajouts, setAjouts] = useState({})        // { ordre: [ingrédients ajoutés à la main] }

  useEffect(() => {
    let vivant = true
    Promise.all([loadOrdres(), loadFaits()])
      .then(async ([tous, f]) => {
        if (!vivant) return
        // Tout ce qui est marqué fait : les ordres nommés directement (montages,
        // tournées de glaçage ou de pâte à sucre, et tout ce qu'on ajoutera) et
        // les préparations, cochées par produit. On ne filtre PAS sur la liste
        // de Fabrication CD : elle ne contient que les articles « CD* », et la
        // pâte à sucre n'en fait pas partie. C'est Odoo qui dira, plus bas, ce
        // qui est encore ouvert.
        const noms = new Set()
        const ouvertsOdoo = new Set(tous.map(o => o.name))
        for (const [c, info] of Object.entries(f)) {
          if (/^WH.*\/MO\//i.test(c)) { noms.add(c); continue }
          if (!c.startsWith('PREP:')) continue
          // exactement les ordres retenus au moment de la coche, pas tous ceux
          // du même article
          for (const n of (info && info.ordres) || []) if (ouvertsOdoo.has(n)) noms.add(n)
        }
        if (!noms.size) { setLignes([]); garderEcran('valider', []); return }
        const m = await loadManques([...noms])
        if (!vivant) return
        // validé ou annulé dans Odoo entre-temps : ça n'attend plus rien
        const ouverts = m.filter(x => x.etat !== 'done' && x.etat !== 'cancel')
        setLignes(ouverts)
        // Cocher d'avance seulement ce qui est dû : un ordre prévu dans quinze
        // jours ne correspond pas à la tournée qu'on vient de faire.
        const jour = new Date().toISOString().slice(0, 10)
        setSel(ouverts.filter(x => !x.quand || String(x.quand).slice(0, 10) <= jour).map(x => x.name))
        garderEcran('valider', ouverts)
      })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    return () => { vivant = false }
  }, [tour])

  const choisis = useMemo(() => (lignes || []).filter(l => sel.includes(l.name)), [lignes, sel])
  const prets = choisis.filter(l => !l.manques.length)
  const bloques = choisis.filter(l => l.manques.length)
  const manquesCumules = [...new Map(bloques.flatMap(l => l.manques).map(m => [m.produit, m])).values()]

  async function lancer(forcer) {
    const cibles = (forcer ? bloques : prets).map(l => l.name)
    if (!cibles.length) return
    setEnvoi(true)
    const aEnvoyer = {}
    for (const n of cibles) {
      if (!notes[n]) continue
      const ordre = (lignes || []).find(x => x.name === n)
      const conv = {}
      for (const [id, v] of Object.entries(notes[n])) {
        const c = (ordre?.lignes || []).find(x => String(x.id) === String(id))
        const fact = norm(c?.unite) === 'kg' ? 1000 : 1
        if (v !== '' && Number(v) >= 0) conv[id] = Number(v) / fact
      }
      if (Object.keys(conv).length) aEnvoyer[n] = conv
    }
    const enPlus = {}
    for (const n of cibles) {
      const liste = (ajouts[n] || []).filter(a => Number(a.qty) > 0)
      if (!liste.length) continue
      enPlus[n] = liste.map(a => ({
        produit: a.produit, uom: a.uom,
        qty: Number(a.qty) / (norm(a.unite) === 'kg' ? 1000 : 1),
      }))
    }
    try { setResultats(await validerDansOdoo(cibles, forcer, user?.id, aEnvoyer, enPlus)) }
    catch (e) { toast.error(e.message || String(e)) }
    setEnvoi(false)
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[660px] mx-auto px-4 py-5">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="font-fraunces italic text-[26px] font-medium">À valider</h1>
          <button onClick={() => { setLignes(null); setResultats(null); setTour(v => v + 1) }}
            className="ml-auto bg-white border border-line rounded-xl px-3 py-2 text-[13px] text-ink-soft">↻ Actualiser</button>
        </div>
        <p className="text-[12.5px] text-ink-mute mb-3">
          Ce qui est marqué « fait » et attend sa confirmation dans Odoo. La génoise et l'eau ne sont pas comptées dans les manques.
        </p>

        {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3">{erreur}</div>}
        {!lignes && !erreur && <Skeleton rows={4} />}
        {envoi && <p className="text-center text-ink-mute py-8">Validation en cours dans Odoo…</p>}

        {resultats && !envoi && (
          <>
            {resultats.map(r => (
              <div key={r.name} className={'rounded-xl px-3.5 py-3 mb-2 ' +
                (r.ok ? 'bg-[#EAF3DE] border border-[#cfe0b8]' : 'bg-[#FCEEE8] border border-[#f0c9c9]')}>
                <b className="text-[14.5px]">{r.ok ? '✓' : '✗'} {r.name}</b>
                <div className="text-[12.5px] text-ink-soft">
                  {r.ok ? 'validé dans Odoo' : r.message}
                  {r.glacage > 0 && ` · ${nb(Math.round(r.glacage))} g de glaçage royal consommés dedans`}
                  {r.pour && ` · réservé aussitôt pour ${r.pour}`}
                </div>
              </div>
            ))}
            <button onClick={() => { setLignes(null); setResultats(null); setTour(v => v + 1) }}
              className="w-full bg-bordeaux text-cream rounded-2xl py-3.5 text-[15px] font-bold mt-2">Terminer</button>
          </>
        )}

        {lignes && !resultats && !envoi && lignes.length === 0 && (
          <div className="py-14 text-center text-ink-mute text-[14px] bg-cream-warm rounded-xl">
            Rien à valider pour le moment.<br />
            <span className="text-[12.5px]">Ce que l'équipe marque « fait » dans Fabrication CD ou Fabrication Glaçage arrive ici.</span>
          </div>
        )}

        {lignes && !resultats && !envoi && lignes.map(l => {
          const on = sel.includes(l.name)
          return (
            <div key={l.name} className={'border border-line rounded-xl mb-2 overflow-hidden border-l-4 ' +
              (l.manques.length ? 'border-l-[#d9a441]' : 'border-l-[#7ba05b]')}>
              <div className="flex items-center gap-3 px-3.5 py-3 bg-white">
                <input type="checkbox" checked={on} className="w-6 h-6 accent-[#993556] flex-shrink-0"
                  onChange={e => setSel(v => (e.target.checked ? [...v, l.name] : v.filter(x => x !== l.name)))} />
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold">{propre(l.produit)} — {qte(l.qty, l.unite)}</div>
                  <div className="text-[11px] text-ink-mute font-mono">{l.name}{l.lieu ? ' · ' + l.lieu : ''}</div>
                  {l.quand && <div className={'text-[11.5px] ' + (String(l.quand).slice(0, 10) > new Date().toISOString().slice(0, 10) ? 'text-[#854F0B] font-bold' : 'text-ink-mute')}>
                    prévu le {new Date(String(l.quand).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </div>}
                </div>
                <span className={'text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ' +
                  (l.manques.length ? 'bg-[#FFF7E0] text-[#854F0B]' : 'bg-[#EAF3DE] text-ok')}>
                  {l.manques.length ? 'il manque' : 'prêt'}
                </span>
              </div>
              {l.manques.length > 0 && (
                <div className="border-t border-dashed border-line bg-[#fffdf7] px-3.5 py-2 text-[12.5px]">
                  {l.manques.map((m, i) => (
                    <div key={i}>• <b>{qte(m.manque, m.unite)}</b> de {propre(m.produit)}</div>
                  ))}
                </div>
              )}

              {/* Noter ce qui a vraiment été consommé, avant de valider */}
              {(l.lignes || []).length > 0 && (
                <div className="border-t border-line">
                  <button onClick={() => setOuvert(ouvert === l.name ? null : l.name)}
                    className="w-full text-left px-3.5 py-2 text-[12.5px] text-bordeaux font-semibold">
                    {ouvert === l.name ? '▾' : '▸'} noter ce qui a été consommé
                  </button>
                  {ouvert === l.name && (
                    <div className="px-3.5 pb-3">
                      <p className="text-[12px] text-ink-mute mb-2">
                        Corrige les quantités si tu n'as pas utilisé exactement la recette.
                        Ferme sans rien changer pour garder ce qui est prévu.
                      </p>
                      {l.lignes.map(c => {
                        // Odoo compte parfois en kg, l'équipe pense en grammes :
                        // on saisit en grammes et on reconvertit à l'envoi.
                        const enG = norm(c.unite) === 'kg'
                        const fact = enG ? 1000 : 1
                        const val = (notes[l.name] || {})[c.id]
                        const affiche = val !== undefined ? val : Math.round((c.consomme ?? c.besoin) * fact * 100) / 100
                        return (
                          <div key={c.id} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-[#f0e8db] last:border-0">
                            <span className="flex-1 text-[13.5px] min-w-0">{propre(c.produit)}</span>
                            <input type="number" min="0" step="any" inputMode="decimal" value={affiche}
                              onChange={e => setNotes(n => ({
                                ...n, [l.name]: { ...(n[l.name] || {}), [c.id]: e.target.value },
                              }))}
                              className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                            <span className="text-[12px] text-ink-mute w-[26px]">{enG ? 'g' : c.unite}</span>
                          </div>
                        )
                      })}

                      {(ajouts[l.name] || []).map((a, i) => (
                        <div key={'a' + i} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-[#f0e8db]">
                          <span className="flex-1 text-[13.5px] min-w-0 text-bordeaux">{propre(a.nom)}</span>
                          <input type="number" min="0" step="any" inputMode="decimal" value={a.qty}
                            onChange={e => setAjouts(m => ({
                              ...m,
                              [l.name]: (m[l.name] || []).map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                            }))}
                            className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                          <span className="text-[12px] text-ink-mute w-[26px]">{norm(a.unite) === 'kg' ? 'g' : a.unite}</span>
                          <button onClick={() => setAjouts(m => ({
                            ...m, [l.name]: (m[l.name] || []).filter((_, j) => j !== i),
                          }))} className="text-ink-mute text-[15px] px-1" title="retirer">✕</button>
                        </div>
                      ))}

                      <AjoutIngredient onChoisir={a => setAjouts(m => ({
                        ...m,
                        [l.name]: [...(m[l.name] || []), { produit: a.id, nom: a.nom, uom: a.uom, unite: a.unite, qty: '' }],
                      }))} />

                      <div className="flex gap-2 mt-2.5">
                        <button onClick={() => setOuvert(null)}
                          className="rounded-lg px-3 py-2 text-[12.5px] font-bold border border-line bg-white text-ink-soft">
                          fermer sans changer
                        </button>
                        {(notes[l.name] || ajouts[l.name]) && (
                          <button onClick={() => {
                            setNotes(n => { const s2 = { ...n }; delete s2[l.name]; return s2 })
                            setAjouts(m => { const s2 = { ...m }; delete s2[l.name]; return s2 })
                          }}
                            className="rounded-lg px-3 py-2 text-[12.5px] font-bold border border-line bg-white text-ink-mute">
                            revenir à la recette
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {lignes && lignes.length > 0 && !resultats && !envoi && (
          <>
            <div className="text-[12.5px] text-ink-soft my-3">
              {choisis.length} sélectionné(s) · {prets.length} prêt(s), {bloques.length} à forcer
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => lancer(false)} disabled={!prets.length}
                className={'flex-1 min-w-[200px] rounded-2xl py-3.5 text-[15px] font-bold ' +
                  (prets.length ? 'bg-bordeaux text-cream' : 'bg-white border border-line text-ink-mute')}>
                Valider la sélection{prets.length ? ` (${prets.length})` : ''}
              </button>
              <button onClick={() => setConfirmer(true)} disabled={!bloques.length}
                className={'rounded-2xl py-3.5 px-4 text-[13.5px] font-bold border bg-white ' +
                  (bloques.length ? 'border-danger text-danger' : 'border-line text-ink-mute')}>
                Forcer la sélection{bloques.length ? ` (${bloques.length})` : ''}
              </button>
            </div>
          </>
        )}
      </div>

      {confirmer && (
        <div className="fixed inset-0 z-[80] bg-ink/50 flex items-center justify-center p-4"
          onPointerDown={e => { if (e.target === e.currentTarget) setConfirmer(false) }}>
          <div className="bg-white rounded-2xl p-4 max-w-[420px]">
            <b className="text-[16px]">Forcer la validation ?</b>
            <p className="text-[13px] text-ink-soft mt-1 mb-2">Odoo enregistrera la fabrication même si le stock ne suit pas. Il manque :</p>
            {manquesCumules.map((m, i) => (
              <div key={i} className="text-[13.5px]">• <b>{qte(m.manque, m.unite)}</b> de {propre(m.produit)}</div>
            ))}
            <p className="text-[12px] text-ink-mute mt-2">Le stock de ces articles deviendra négatif dans Odoo.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setConfirmer(false); lancer(true) }}
                className="flex-1 bg-danger text-cream rounded-xl py-3 text-[14px] font-bold">Forcer</button>
              <button onClick={() => setConfirmer(false)} className="rounded-xl py-3 px-4 text-[14px] border border-line">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
