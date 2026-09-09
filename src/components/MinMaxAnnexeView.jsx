import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { isAdmin } from '../lib/auth'
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
    return parGateauMere(base, filtre, true)
  }, [tout, lignes, filtre])

  const combien = useMemo(
    () => new Set(groupes.flatMap(g => g.articles.map(a => a.produit))).size, [groupes])

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
              {combien} article{combien > 1 ? 's' : ''} · {groupes.length} gâteau{groupes.length > 1 ? 'x' : ''}
              {!tout && ' — lecture d’Odoo en cours…'}
            </div>

            {groupes.map(g => (
              <section key={g.nom} className="mb-4">
                <h2 className="font-serif italic text-[17px] text-bordeaux mb-1.5 pb-1 border-b border-cream-deep">
                  {g.nom.replace(/^(E-|MI-|V-)\s*/, '')}
                  <span className="not-italic font-sans text-[12px] text-ink-mute"> · {g.articles.length}</span>
                </h2>
                {g.articles.map(l => {
                  const unite = l.unite || ''
                  const sousLeMini = l.stock !== undefined && Number(l.stock) <= Number(l.mini)
                  return (
                    <div key={g.nom + l.produit}
                      className={'border rounded-xl px-3 py-2.5 mb-1.5 ' +
                        (l.suivi ? 'bg-cream-warm ' : 'bg-cream ') +
                        (l.suivi && sousLeMini ? 'border-l-4 border-l-bordeaux border-cream-deep' : 'border-cream-deep')}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
                          <div className="text-[14px] font-bold">
                            {propre(l.libelle || l.produit)}
                            {!l.suivi && <span className="ml-2 text-[10.5px] font-bold text-ink-mute">pas suivi</span>}
                          </div>
                          <div className="text-[11.5px] text-ink-mute">
                            {l.stock !== undefined
                              ? <>il en reste <b>{qte(l.stock, unite)}</b>{l.suivi && sousLeMini ? ' — à refaire' : ''}</>
                              : 'plus dans Odoo'}
                          </div>
                        </div>
                        {[['mini', 'mini'], ['maxi', 'maxi'], ['tournee', 'tournée']].map(([champ, titre]) => (
                          <label key={champ} className="text-[11.5px] text-ink-mute">
                            {titre}<br />
                            <input type="number" min="0" step="any" inputMode="decimal"
                              value={l[champ] ?? ''} aria-label={`${titre} de ${propre(l.libelle || l.produit)}`}
                              onChange={e => changer(l, champ, e.target.value)}
                              onBlur={() => enregistrer(l)}
                              className="w-[76px] text-right text-[14px] font-bold border border-cream-deep
                                         rounded-lg px-2 py-1.5 bg-cream" />
                          </label>
                        ))}
                        <span className="text-[12px] text-ink-mute w-[26px]">{unite}</span>
                        <button
                          onClick={() => {
                            const actif = !(l.actif !== false)
                            changer(l, 'actif', actif)
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
                          ❄️{(l.figes || []).length ? ` ${l.figes.length}` : ''}
                        </button>
                        {l.suivi && (
                          <button onClick={() => retirer(l)} title="Ne plus suivre du tout cet article"
                            className="rounded-lg px-2 py-1.5 text-[11.5px] text-ink-mute border border-cream-deep">
                            retirer
                          </button>
                        )}
                        {enCours === l.produit && <span className="text-[11.5px] text-bordeaux">enregistrement…</span>}
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}

            {!groupes.length && (
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
