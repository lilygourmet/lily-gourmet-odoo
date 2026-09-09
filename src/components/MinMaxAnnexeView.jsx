import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { isAdmin } from '../lib/auth'
import { correspond } from '../lib/recherche'
import {
  loadCatalogueAnnexe, saveCatalogueAnnexe, retirerDuCatalogue, loadToutFabAnnexe,
  saveFigesAnnexe, loadArticleFabAnnexe,
} from '../lib/fabAnnexe'

// ====== « Mini / maxi Annexe » : les trois nombres qui décident de tout ======
// Sous le MINI, l'article apparaît dans Fabrication Annexe 2 ; on en fait des
// TOURNÉES entières jusqu'au MAXI. Ces valeurs vivaient dans Supabase, hors de
// portée de Layla — cet écran les lui rend (2026-09-09).
//
// Réservé aux admins : changer un mini change ce que l'atelier fabriquera.

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const propre = n => String(n || '').replace(/^\[[^\]]*\]\s*/, '').trim()

/** Grammes ou pièces en entier ; les kilos gardent leurs décimales. */
const qte = (v, u) => {
  const n = Number(v) || 0
  if (!/^kg$/i.test(String(u || '').trim())) return `${nb(Math.round(n))} ${u || ''}`.trim()
  return n < 1 ? `${nb(Math.round(n * 1000))} g` : `${nb(Math.round(n * 100) / 100)} kg`
}

/**
 * Le panneau des figés : on coche les ingrédients dont la quantité NE BOUGE
 * PAS avec la sortie réelle. Ils viennent de la recette Odoo de l'article —
 * la seule liste qui fasse foi. Un ingrédient cité deux fois n'apparaît
 * qu'une : le figer, c'est figer ses deux lignes. (Layla, 2026-09-09.)
 */
function Figes({ ligne, onFermer, onEnregistre }) {
  const [detail, setDetail] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [choisis, setChoisis] = useState(new Set(ligne.figes || []))
  const [nom, setNom] = useState(ligne.figes_nom || '')
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    let vivant = true
    loadArticleFabAnnexe(ligne.produit)
      .then(a => { if (vivant) setDetail(a) })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    return () => { vivant = false }
  }, [ligne.produit])

  // Un même ingrédient peut occuper deux lignes de la recette (le sucre du
  // tiramisu) : on ne le propose qu'une fois.
  const ingredients = useMemo(() => {
    const vus = new Map()
    for (const c of detail?.composants || []) if (!vus.has(c.produit)) vus.set(c.produit, c)
    return [...vus.values()]
  }, [detail])

  const basculer = p => setChoisis(s => {
    const n = new Set(s)
    if (n.has(p)) n.delete(p); else n.add(p)
    return n
  })

  return (
    <div className="fixed inset-0 z-[70] bg-ink/40 flex items-start justify-center p-3 pt-10"
      onPointerDown={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-cream rounded-2xl w-full max-w-[520px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-4 pt-4 pb-2 flex-shrink-0 border-b border-cream-deep">
          <b className="text-[15px]">❄️ Ce qui ne bouge pas — {propre(ligne.libelle || ligne.produit)}</b>
          <p className="text-[12px] text-ink-mute mt-1">
            Coche ce dont la quantité reste celle de la tournée entière, même si
            la fournée sort 128 pièces au lieu de 140. Le reste suivra la recette.
          </p>
        </div>
        <div className="px-4 py-3 flex-1 overflow-y-auto overscroll-contain">
          {erreur && <p className="text-[13px] text-danger">{erreur}</p>}
          {!detail && !erreur && <Skeleton rows={5} />}
          {detail && !ingredients.length && (
            <p className="text-[13px] text-ink-mute py-6 text-center">
              Cet article n'a pas de recette dans Odoo : rien à figer.
            </p>
          )}
          {ingredients.map(c => {
            const on = choisis.has(c.produit)
            return (
              <button key={c.produit} onClick={() => basculer(c.produit)}
                className={'w-full flex items-center gap-2.5 text-left rounded-xl border px-3 py-2 mb-1.5 ' +
                  (on ? 'border-bordeaux bg-bordeaux/5' : 'border-cream-deep bg-cream-warm')}>
                <span className={'w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center text-[12px] font-extrabold ' +
                  (on ? 'border-bordeaux bg-bordeaux text-cream' : 'border-cream-deep')}>{on ? '✓' : ''}</span>
                <span className="flex-1 min-w-0 text-[13px]">{propre(c.produit)}</span>
                <span className="text-[11.5px] text-ink-mute whitespace-nowrap">
                  {qte(c.besoin, c.unite)}{c.fabrique ? ' · se fabrique' : ''}
                </span>
              </button>
            )
          })}
          {!!choisis.size && (
            <label className="block mt-3 text-[12px] text-ink-mute">
              Comment l'atelier appelle ce groupe
              <input value={nom} onChange={e => setNom(e.target.value)}
                placeholder="La mousse" aria-label="Nom du groupe figé"
                className="w-full h-11 mt-1 rounded-xl border border-cream-deep bg-cream-warm px-3
                           text-[15px] text-ink outline-none focus:border-bordeaux" />
            </label>
          )}
        </div>
        <div className="flex gap-2 px-4 py-3 flex-shrink-0 border-t border-cream-deep">
          <button onClick={onFermer}
            className="bg-cream-warm rounded-xl px-4 py-3 text-[13px] font-bold">annuler</button>
          <button disabled={envoi || !detail}
            onClick={async () => {
              setEnvoi(true)
              try {
                const liste = [...choisis]
                await saveFigesAnnexe(ligne.produit, liste, liste.length ? (nom || 'Monté sur place') : null)
                onEnregistre(liste, liste.length ? (nom || 'Monté sur place') : null)
                toast.success(liste.length
                  ? `${liste.length} ingrédient${liste.length > 1 ? 's' : ''} figé${liste.length > 1 ? 's' : ''}`
                  : 'Plus rien de figé : tout suivra la recette')
                onFermer()
              } catch (e) { toast.error('Pas enregistré : ' + (e.message || e)) }
              setEnvoi(false)
            }}
            className="flex-1 bg-bordeaux text-cream rounded-xl py-3 text-[14px] font-extrabold disabled:opacity-40">
            {envoi ? 'enregistrement…' : 'enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MinMaxAnnexeView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(null)
  const [tout, setTout] = useState(null)          // tout ce que l'annexe sait faire
  const [erreur, setErreur] = useState(null)
  const [filtre, setFiltre] = useState('')
  const [ajout, setAjout] = useState('')          // la recherche du bloc « ajouter »
  const [enCours, setEnCours] = useState('')
  const [figes, setFiges] = useState(null)   // l'article dont on règle les figés

  useEffect(() => {
    let vivant = true
    loadCatalogueAnnexe()
      .then(l => { if (vivant) setLignes(l) })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    // Les stocks et les unités viennent d'Odoo, plus lentement : l'écran
    // s'affiche sans les attendre.
    loadToutFabAnnexe()
      .then(t => { if (vivant) setTout(t) })
      .catch(() => { /* régler un seuil reste possible sans voir le stock */ })
    return () => { vivant = false }
  }, [])

  const infos = useMemo(() => {
    const m = new Map()
    for (const a of tout || []) m.set(a.produit, a)
    return m
  }, [tout])

  const visibles = useMemo(
    () => (lignes || []).filter(l => correspond(l.libelle + ' ' + l.produit, filtre)),
    [lignes, filtre])

  // Ce que l'annexe sait faire mais que l'écran ne suit pas encore. Sans
  // recherche on n'en montre rien : la liste ferait 250 lignes.
  const ajoutables = useMemo(() => {
    if (!ajout.trim() || !tout) return []
    const deja = new Set((lignes || []).map(l => l.produit))
    return tout.filter(a => !deja.has(a.produit) && correspond(a.produit, ajout)).slice(0, 12)
  }, [tout, lignes, ajout])

  // On tape sans rien envoyer : l'enregistrement se fait en quittant la case.
  const changer = (produit, champ, valeur) =>
    setLignes(v => (v || []).map(l => (l.produit === produit ? { ...l, [champ]: valeur } : l)))

  const enregistrer = async ligne => {
    setEnCours(ligne.produit)
    try {
      await saveCatalogueAnnexe(ligne)
      toast.success(`${propre(ligne.libelle || ligne.produit)} : mini ${nb(ligne.mini)} · maxi ${nb(ligne.maxi)} · tournée ${nb(ligne.tournee)}`)
    } catch (e) {
      toast.error('Pas enregistré : ' + (e.message || e))
    }
    setEnCours('')
  }

  const ajouter = async a => {
    const neuf = { produit: a.produit, libelle: propre(a.produit), mini: 0, maxi: 0, tournee: 1, actif: true }
    setLignes(v => [...(v || []), neuf].sort((x, y) => x.produit.localeCompare(y.produit, 'fr')))
    setAjout('')
    await enregistrer(neuf)
  }

  const retirer = async l => {
    if (!window.confirm(`Ne plus suivre « ${propre(l.libelle || l.produit)} » ?\n\nIl disparaîtra de « À faire ». On pourra toujours le déclarer.`)) return
    setLignes(v => (v || []).filter(x => x.produit !== l.produit))
    try { await retirerDuCatalogue(l.produit) } catch (e) { toast.error('Pas retiré : ' + (e.message || e)) }
  }

  if (!isAdmin(user)) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
        <p className="max-w-[560px] mx-auto px-4 py-16 text-center text-ink-mute text-[14px]">
          Cet écran est réservé aux administrateurs : changer un mini change ce que
          l'atelier fabriquera demain matin.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[860px] mx-auto px-4 py-5 pb-24">
        <h1 className="font-serif italic text-[26px] leading-tight mb-1">Mini / maxi Annexe</h1>
        <p className="text-[12.5px] text-ink-mute mb-3">
          Sous le <b>mini</b> (ou pile dessus), l'article apparaît dans Fabrication
          Annexe 2. On en fait des <b>tournées</b> entières jusqu'au <b>maxi</b>.
          Un article à <b>0 / 0</b> n'apparaîtra qu'une fois à zéro.
        </p>

        {erreur && <div className="px-4 py-3 rounded-xl bg-danger/5 border border-danger/30 text-danger text-[13px] mb-3">{erreur}</div>}
        {!lignes && !erreur && <Skeleton rows={6} />}

        {lignes && (
          <>
            <input value={filtre} onChange={e => setFiltre(e.target.value)}
              placeholder="chercher un article suivi…" aria-label="Chercher un article suivi"
              className="w-full h-11 rounded-xl border border-cream-deep bg-cream-warm px-3
                         text-[15px] outline-none focus:border-bordeaux mb-3" />

            <div className="text-[12px] text-ink-mute mb-1.5">
              {visibles.length} article{visibles.length > 1 ? 's' : ''} suivi{visibles.length > 1 ? 's' : ''}
              {filtre ? ` sur ${lignes.length}` : ''}
            </div>

            {visibles.map(l => {
              const a = infos.get(l.produit)
              const unite = a?.unite || ''
              const sousLeMini = a && Number(a.stock) <= Number(l.mini)
              return (
                <div key={l.produit}
                  className={'border rounded-xl px-3 py-2.5 mb-1.5 bg-cream-warm ' +
                    (sousLeMini ? 'border-l-4 border-l-bordeaux border-cream-deep' : 'border-cream-deep')}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
                      <div className="text-[14px] font-bold">{propre(l.libelle || l.produit)}</div>
                      <div className="text-[11.5px] text-ink-mute">
                        {a
                          ? <>il en reste <b>{qte(a.stock, unite)}</b>{sousLeMini ? ' — à refaire' : ''}</>
                          : 'stock en cours de lecture…'}
                      </div>
                    </div>
                    {[['mini', 'mini'], ['maxi', 'maxi'], ['tournee', 'tournée']].map(([champ, titre]) => (
                      <label key={champ} className="text-[11.5px] text-ink-mute">
                        {titre}<br />
                        <input type="number" min="0" step="any" inputMode="decimal"
                          value={l[champ] ?? ''} aria-label={`${titre} de ${propre(l.libelle || l.produit)}`}
                          onChange={e => changer(l.produit, champ, e.target.value)}
                          onBlur={() => enregistrer(l)}
                          className="w-[80px] text-right text-[14px] font-bold border border-cream-deep
                                     rounded-lg px-2 py-1.5 bg-cream" />
                      </label>
                    ))}
                    <span className="text-[12px] text-ink-mute w-[26px]">{unite}</span>
                    <button
                      onClick={() => {
                        const actif = !(l.actif !== false)
                        changer(l.produit, 'actif', actif)
                        enregistrer({ ...l, actif })
                      }}
                      title={l.actif !== false ? 'Ne plus le proposer tout seul' : 'Le proposer quand il passe sous son mini'}
                      className={'rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold border ' +
                        (l.actif !== false ? 'bg-success/10 text-success border-success/30' : 'bg-cream text-ink-mute border-cream-deep')}>
                      {l.actif !== false ? 'suivi' : 'en pause'}
                    </button>
                    <button onClick={() => setFiges(l)}
                      title="Choisir les ingrédients dont la quantité ne bouge pas"
                      className={'rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold border ' +
                        ((l.figes || []).length
                          ? 'bg-gold/10 text-gold border-gold/40'
                          : 'bg-cream text-ink-mute border-cream-deep')}>
                      ❄️ figés{(l.figes || []).length ? ` · ${l.figes.length}` : ''}
                    </button>
                    <button onClick={() => retirer(l)} title="Ne plus suivre du tout cet article"
                      className="rounded-lg px-2 py-1.5 text-[11.5px] text-ink-mute border border-cream-deep">
                      retirer
                    </button>
                    {enCours === l.produit && <span className="text-[11.5px] text-bordeaux">enregistrement…</span>}
                  </div>
                </div>
              )
            })}

            {visibles.length === 0 && (
              <p className="py-8 text-center text-ink-mute text-[14px]">Aucun article suivi de ce nom.</p>
            )}

            {figes && (
              <Figes ligne={figes} onFermer={() => setFiges(null)}
                onEnregistre={(liste, nom) => setLignes(v => (v || []).map(x =>
                  (x.produit === figes.produit ? { ...x, figes: liste, figes_nom: nom } : x)))} />
            )}

            {/* Ajouter un article que l'annexe sait faire mais qu'on ne suit pas
                encore : il n'apparaîtra dans « À faire » qu'une fois ses trois
                nombres réglés. */}
            <section className="mt-6 rounded-2xl border border-cream-deep bg-cream-warm p-3">
              <div className="text-[13px] font-extrabold mb-1.5">Suivre un article de plus</div>
              <p className="text-[12px] text-ink-mute mb-2">
                Cherche parmi tout ce que l'annexe sait fabriquer. Il arrive à 0 / 0 :
                règle ses trois nombres juste après.
              </p>
              <input value={ajout} onChange={e => setAjout(e.target.value)}
                placeholder="chercher — tiramisu, sirop, ghriba…" aria-label="Chercher un article à suivre"
                className="w-full h-11 rounded-xl border border-cream-deep bg-cream px-3
                           text-[15px] outline-none focus:border-bordeaux" />
              {!tout && ajout.trim() && (
                <p className="text-[12px] text-ink-mute mt-2">lecture d'Odoo en cours…</p>
              )}
              {ajoutables.map(a => (
                <button key={a.produit} onClick={() => ajouter(a)}
                  className="w-full flex items-center gap-3 text-left mt-1.5 rounded-xl border
                             border-cream-deep bg-cream px-3 py-2 hover:border-bordeaux/40">
                  <span className="flex-1 min-w-0 text-[13px]">{propre(a.produit)}</span>
                  <span className="text-[11.5px] text-ink-mute whitespace-nowrap">{qte(a.stock, a.unite)}</span>
                  <span className="text-[16px] text-bordeaux font-extrabold">+</span>
                </button>
              ))}
              {ajout.trim() && tout && !ajoutables.length && (
                <p className="text-[12px] text-ink-mute mt-2">Rien de ce nom-là, ou déjà suivi.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
