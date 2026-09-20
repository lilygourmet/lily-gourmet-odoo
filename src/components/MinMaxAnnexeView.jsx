import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { canSeeMinMaxAnnexe } from '../lib/auth'
import { loadMiseEnForme, setMiseEnForme } from '../lib/miseEnForme'
import { Interrupteur, Pastille } from './Interrupteur'
import {
  loadCatalogueAnnexe, saveCatalogueAnnexe, retirerDuCatalogue, loadToutFabAnnexe,
  saveFigesAnnexe, loadArticleFabAnnexe, parGateauMere,
} from '../lib/fabAnnexe'

// ====== « Mini / maxi Annexe » : les trois nombres qui décident de tout ======
// Sous le MINI, l'article apparaît dans Fabrication Annexe 2 ; on en fait des
// TOURNÉES entières jusqu'au MAXI. Ces valeurs vivaient dans Supabase, hors de
// portée de Layla — cet écran les lui rend (2026-09-09).
//
// Réservé aux admins : changer un mini change ce que l'atelier fabriquera.

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const propre = n => String(n || '').replace(/^\[[^\]]*\]\s*/, '').trim()

/**
 * La taille lue dans le nom : « indiv » vaut 1, « 10 pers » et « 20 cm » leur
 * nombre, « (5) » aussi. 0 quand il n'y en a pas.
 */
const tailleDe = nom => {
  const n = String(nom || '')
  if (/\bindiv/i.test(n)) return 1
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*(?:cm|pers)\b/i) || n.match(/\((\d+)\)/)
  return m ? Number(String(m[1]).replace(',', '.')) : 0
}

/** Le nom sans sa taille : ce qui met les tailles d'un même article côte à côte. */
const baseDe = nom => propre(nom)
  .replace(/\bindiv\w*|\d+(?:[.,]\d+)?\s*(?:cm|pers)\b|\(\d+\)/gi, '')
  .replace(/\s{2,}/g, ' ').trim().toLowerCase()

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
  const [enCours, setEnCours] = useState('')
  const [figes, setFiges] = useState(null)   // l'article dont on règle les figés
  // Les gâteaux sont repliés : 277 lignes d'un coup, personne n'y voit rien.
  // On ouvre celui sur lequel on travaille. (Layla, 2026-09-09.)
  const [ouverts, setOuverts] = useState(() => new Set())
  // ⚠️ CE QUI DOIT ÊTRE MIS EN FORME (Layla, 2026-09-20 : « à choisir dans les
  // mini et maxi annexe ce qui apparaît dans les à finir »). La liste vivait
  // en base, hors de sa portée — comme les mini/maxi avant cet écran.
  const [enForme, setEnForme] = useState(() => new Set())

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
    loadMiseEnForme()
      .then(l => { if (vivant) setEnForme(new Set(l)) })
      .catch(() => { /* la case restera décochée : rien de cassé */ })
    return () => { vivant = false }
  }, [])

  // TOUT ce que l'annexe sait faire, rangé sous le ou les gâteaux qu'il sert —
  // pas seulement les articles déjà suivis. Un article sans seuils est à 0 / 0 :
  // il ne sera jamais proposé tant qu'on ne l'a pas réglé. (Layla, 2026-09-09.)
  const groupes = useMemo(() => {
    const reglages = new Map((lignes || []).map(l => [l.produit, l]))
    const base = (tout || []).map(a => {
      const r = reglages.get(a.produit)
      return r
        ? { ...a, ...r, suivi: true }
        : { ...a, libelle: propre(a.produit), mini: 0, maxi: 0, tournee: 1, suivi: false }
    })
    // Ce qui est suivi mais qu'Odoo ne renvoie plus : on ne le perd pas de vue.
    for (const l of lignes || []) {
      if (!base.some(a => a.produit === l.produit)) base.push({ ...l, suivi: true, pour: [] })
    }
    // Dans un gâteau, les tailles d'un même article se suivent, de la plus
    // petite à la plus grande : indiv, 5 pers, 10 pers…
    return parGateauMere(base, filtre, true).map(g => ({
      ...g,
      articles: [...g.articles].sort((x, y) =>
        baseDe(x.produit).localeCompare(baseDe(y.produit), 'fr')
        || tailleDe(x.produit) - tailleDe(y.produit)
        || x.produit.localeCompare(y.produit, 'fr')),
    }))
  }, [tout, lignes, filtre])

  /**
   * ⚠️ SEULEMENT CE QUI SERT À UN GÂTEAU VENDABLE (Layla, 2026-09-20 :
   * « montrer que les composants des articles mère vendable »).
   *
   * « Le reste » rassemble ce qui ne remonte à aucun article vendu : des
   * recettes orphelines, des essais, des articles morts chez Odoo. Les régler
   * ne sert à rien — et ils noyaient les vrais.
   *
   * ⚠️ Cachés, pas supprimés : la RECHERCHE, elle, fouille partout. Taper un
   * nom les fait réapparaître, sinon un article égaré deviendrait introuvable.
   */
  const orphelins = useMemo(
    () => (groupes.find(g => g.nom === 'Le reste')?.articles.length || 0), [groupes])
  const visibles = useMemo(
    () => (filtre.trim() ? groupes : groupes.filter(g => g.nom !== 'Le reste')),
    [groupes, filtre])

  const combien = useMemo(
    () => new Set(visibles.flatMap(g => g.articles.map(a => a.produit))).size, [visibles])

  // On tape sans rien envoyer : l'enregistrement se fait en quittant la case.
  // Un article encore hors catalogue y entre à la première frappe.
  const changer = (ligne, champ, valeur) =>
    setLignes(v => {
      const liste = v || []
      if (liste.some(l => l.produit === ligne.produit)) {
        return liste.map(l => (l.produit === ligne.produit ? { ...l, [champ]: valeur } : l))
      }
      return [...liste, {
        produit: ligne.produit, libelle: ligne.libelle, actif: true,
        mini: ligne.mini, maxi: ligne.maxi, tournee: ligne.tournee, [champ]: valeur,
      }]
    })

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

  const retirer = async l => {
    if (!window.confirm(`Ne plus suivre « ${propre(l.libelle || l.produit)} » ?\n\nIl disparaîtra de « À faire ». On pourra toujours le déclarer.`)) return
    setLignes(v => (v || []).filter(x => x.produit !== l.produit))
    try { await retirerDuCatalogue(l.produit) } catch (e) { toast.error('Pas retiré : ' + (e.message || e)) }
  }

  // ⚠️ LE 8ᵉ ENDROIT d'une permission : le verrou DANS l'écran. L'oublier, c'est
  // donner la permission, voir l'onglet apparaître… et tomber sur « réservé aux
  // administrateurs ». (Layla, 2026-09-16)
  if (!canSeeMinMaxAnnexe(user)) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
        <p className="max-w-[560px] mx-auto px-4 py-16 text-center text-ink-mute text-[14px]">
          Cet écran demande une permission : changer un mini change ce que
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
          Tout ce que l'annexe sait fabriquer, rangé sous son gâteau. Sous le
          <b> mini</b> (ou pile dessus), l'article apparaît dans Fabrication
          Annexe 2 ; on en fait des <b>tournées</b> entières jusqu'au <b>maxi</b>.
          Un article à <b>0 / 0</b> n'apparaîtra qu'une fois à zéro.
        </p>

        {erreur && <div className="px-4 py-3 rounded-xl bg-danger/5 border border-danger/30 text-danger text-[13px] mb-3">{erreur}</div>}
        {!lignes && !erreur && <Skeleton rows={6} />}

        {lignes && (
          <>
            <input value={filtre} onChange={e => setFiltre(e.target.value)}
              placeholder="chercher — tiramisu, sirop, ghriba…" aria-label="Chercher un article"
              className="w-full h-11 rounded-xl border border-cream-deep bg-cream-warm px-3
                         text-[15px] outline-none focus:border-bordeaux mb-3" />

            <div className="text-[12px] text-ink-mute mb-2">
              {combien} article{combien > 1 ? 's' : ''} · {visibles.length} gâteau{visibles.length > 1 ? 'x' : ''}
              {!filtre.trim() && orphelins > 0 && (
                <> · <span className="text-ink-mute">{orphelins} sans gâteau, tape un nom pour les voir</span></>
              )}
              {!tout && ' — lecture d’Odoo en cours…'}
            </div>

            {visibles.map(g => {
              // Une recherche ouvre tout : sinon on cherche et on ne voit rien.
              const ouvert = !!filtre.trim() || ouverts.has(g.nom)
              const aRefaire = g.articles.filter(
                l => l.suivi && l.stock !== undefined && Number(l.stock) <= Number(l.mini)).length
              return (
              <section key={g.nom} className="mb-2">
                <button onClick={() => setOuverts(o => {
                  const n = new Set(o)
                  if (n.has(g.nom)) n.delete(g.nom); else n.add(g.nom)
                  return n
                })}
                  className="w-full flex items-center gap-2 text-left py-2 border-b border-cream-deep">
                  <span className="text-ink-mute text-[13px] w-4">{ouvert ? '▾' : '▸'}</span>
                  <span className="flex-1 min-w-0 font-serif italic text-[17px] text-bordeaux leading-tight">
                    {g.nom.replace(/^(E-|MI-|V-)\s*/, '')}
                  </span>
                  {aRefaire > 0 && (
                    <span className="rounded-full bg-bordeaux text-cream text-[11px] font-bold px-2 py-0.5">
                      {aRefaire} à refaire
                    </span>
                  )}
                  <span className="text-[12px] text-ink-mute">{g.articles.length}</span>
                </button>
                {ouvert && g.articles.map(l => {
                  const unite = l.unite || ''
                  const sousLeMini = l.stock !== undefined && Number(l.stock) <= Number(l.mini)
                  return (
                    <div key={g.nom + l.produit}
                      className={'border rounded-xl px-3 py-2.5 mb-1.5 ' +
                        (l.suivi ? 'bg-cream-warm ' : 'bg-cream ') +
                        (l.suivi && sousLeMini ? 'border-l-4 border-l-bordeaux border-cream-deep' : 'border-cream-deep')}>
                      {/* ⚠️ TROIS ÉTAGES FIXES, PLUS DE SAUTS DE LIGNE (Layla,
                          2026-09-20 : « visuel vraiment pas sympa, des sauts de
                          ligne »). Tout tenait sur une seule rangée qui se
                          repliait où elle pouvait : selon la largeur du nom, les
                          cases passaient à la ligne, les pastilles se
                          déchiraient, et deux lignes voisines n'avaient plus la
                          même forme. Le nom, puis les chiffres, puis les
                          réglages : chacun sa place, toujours la même. */}
                      <div className="text-[14px] font-bold">
                        {propre(l.libelle || l.produit)}
                        {!l.suivi && (
                          <span className="ml-2 text-[10.5px] font-bold text-ink-mute">jamais réglé</span>
                        )}
                      </div>
                      <div className="text-[11.5px] text-ink-mute">
                        {l.stock !== undefined
                          ? <>il en reste <b>{qte(l.stock, unite)}</b>{l.suivi && sousLeMini ? ' — à refaire' : ''}</>
                          : 'plus dans Odoo'}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-2.5">
                        {[['mini', 'mini'], ['maxi', 'maxi'], ['tournee', 'tournée']].map(([champ, titre]) => (
                          <label key={champ} className="block">
                            <span className="block text-[11px] text-ink-mute mb-0.5">
                              {/* ⚠️ L'UNITÉ BRUTE D'ODOO, jamais convertie : ces
                                  trois cases se tapent en KILOS quand l'article
                                  est en kilos. Écrire « g » au-dessus d'un
                                  champ qui attend des kilos, c'est le facteur
                                  mille servi sur un plateau. */}
                              {titre}{unite ? ` (${unite})` : ''}
                            </span>
                            <input type="number" min="0" step="any" inputMode="decimal"
                              value={l[champ] ?? ''} aria-label={`${titre} de ${propre(l.libelle || l.produit)}`}
                              onChange={e => changer(l, champ, e.target.value)}
                              onBlur={() => enregistrer(l)}
                              className="w-full text-right text-[15px] font-bold border border-cream-deep
                                         rounded-lg px-2 py-2 bg-cream tabular-nums" />
                          </label>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        {/* ⚠️ UN INTERRUPTEUR, PAS UN MOT (Layla, 2026-09-20 :
                            « compliqué, le truc de suivi, pause »). « Suivi »
                            ne disait pas ce qu'il faisait, et se confondait
                            avec « pas suivi », « en pause » et « retirer » —
                            quatre boutons gris pour quatre sens. */}
                        <Interrupteur
                          on={l.actif !== false}
                          onClick={() => {
                            const actif = !(l.actif !== false)
                            changer(l, 'actif', actif)
                            enregistrer({ ...l, actif })
                          }}
                          titre={l.actif !== false
                            ? 'L’app le réclame quand il passe sous son mini'
                            : 'L’app se tait — les chiffres, eux, restent'}>
                          Me le proposer
                        </Interrupteur>

                        {/* ⚠️ « À FINIR » : ce qui sort de la cuve et doit
                            encore être coulé, pipé, découpé. C'est cette
                            pastille qui remplit l'onglet 🍮 — cochée,
                            l'article y revient tant qu'il en reste en stock. */}
                        <Pastille
                          on={enForme.has(l.produit)} ton="bordeaux"
                          onClick={async () => {
                            const veut = !enForme.has(l.produit)
                            setEnForme(s0 => {
                              const n = new Set(s0)
                              if (veut) n.add(l.produit); else n.delete(l.produit)
                              return n
                            })
                            try { await setMiseEnForme(l.produit, veut) } catch (e) {
                              toast('Pas enregistré : ' + (e.message || e))
                            }
                          }}
                          titre={enForme.has(l.produit)
                            ? 'Il revient dans « À finir » tant qu’il en reste'
                            : 'Le faire revenir dans « À finir » pour être coulé, pipé, découpé'}>
                          🍮 À finir
                        </Pastille>

                        <Pastille
                          on={(l.figes || []).length > 0} ton="or"
                          onClick={() => setFiges(l)}
                          titre="Les ingrédients dont la quantité ne bouge pas">
                          ❄️ {(l.figes || []).length
      ? `${l.figes.length} figé${l.figes.length > 1 ? 's' : ''}`
      : 'figer'}
                        </Pastille>

                        {/* Rare, et irréversible : une croix discrète, au bout,
                            pour ne pas se toucher par erreur. */}
                        {l.suivi && (
                          <button onClick={() => retirer(l)} title="Ne plus suivre du tout cet article"
                            aria-label={`Ne plus suivre ${propre(l.libelle || l.produit)}`}
                            className="ml-auto text-[15px] text-ink-mute px-2 py-1 active:opacity-60">
                            ✕
                          </button>
                        )}
                        {enCours === l.produit && <span className="text-[11.5px] text-bordeaux">enregistrement…</span>}
                      </div>
                    </div>
                  )
                })}
              </section>
              )
            })}

            {!visibles.length && (
              <p className="py-8 text-center text-ink-mute text-[14px]">Aucun article de ce nom.</p>
            )}

            {figes && (
              <Figes ligne={figes} onFermer={() => setFiges(null)}
                onEnregistre={(liste, nom) => setLignes(v => (v || []).map(x =>
                  (x.produit === figes.produit ? { ...x, figes: liste, figes_nom: nom } : x)))} />
            )}

          </>
        )}
      </div>
    </div>
  )
}
