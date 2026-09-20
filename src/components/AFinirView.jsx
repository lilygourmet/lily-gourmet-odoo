// ============================================================
// « À FINIR » — les vracs qui attendent leur mise en forme.
//
// « Quand une mousse, une crème, une chantilly, un crémeux se fait, j'ai besoin
// que ça parte dans À déclarer leur découpe » (Layla, 2026-09-20) : la
// chantilly est PIPÉE, le crémeux COULÉ dans les moules, le voile DÉCOUPÉ.
// Sortir de la cuve n'est pas être fini.
//
// Puis : « quand une mousse reste en stock, elle revient parce qu'elle doit
// être finie » — la ligne n'est donc pas un rappel qu'on montre une fois.
//
// Puis : « À finir, c'est un autre onglet avec badge du nombre d'articles » —
// d'où cet écran, sorti de « À déclarer » où il était d'abord né.
//
// Et enfin : « quand je clique dessus, ça doit me donner son dispatch » —
// combien en 10 pers, combien en indiv, et ce qu'il en reste à la fin.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { AutresTailles, Clavier, Confirmation } from './FabAnnexe2Simple'
import { Rien } from './FeuilleVisuel'
import { toast } from '../lib/toast'
import { propre, qte } from '../lib/ecranSimple'
import { photoFabAnnexe, declarer } from '../lib/fabAnnexe'
import { hasValidJwt } from '../lib/auth'
import { loadAFinir, loadFormats, prevuParLaRecette, dispatchVersOdoo } from '../lib/miseEnForme'

/** Une ligne de la liste : photo, ce qu'il en reste, ce qu'on en fait. */
function LigneVrac({ a, onOuvrir }) {
  return (
    <button
      onClick={() => onOuvrir(a)}
      className="flex items-center gap-2.5 w-full text-left p-2 mb-1.5 bg-cream-warm border
                 border-line border-l-4 border-l-bordeaux rounded-xl active:bg-cream-deep transition">
      <img src={photoFabAnnexe(a.photo || a.produit)} alt="" loading="lazy"
        onError={e => { e.currentTarget.style.visibility = 'hidden' }}
        className="w-12 h-12 rounded-lg object-cover bg-cream-deep flex-none" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold leading-tight text-ink truncate">
          {propre(a.libelle || a.produit)}
        </span>
        <span className="block text-[18px] font-extrabold tabular-nums leading-none text-ink">
          {qte(a.resteG, 'g')}
        </span>
        {a.note && <span className="block text-[11.5px] text-ink-mute truncate">{a.note}</span>}
      </span>
      <span aria-hidden="true" className="flex-none text-[19px] pr-0.5">✍️</span>
    </button>
  )
}

export default function AFinirView({ user, onLogout, onNavigate, activeView }) {
  const [vracs, setVracs] = useState(null)
  const [erreur, setErreur] = useState('')
  const [ouvert, setOuvert] = useState(null)      // { a, formats }
  const [combien, setCombien] = useState({})      // format → pièces
  const [reste, setReste] = useState(0)           // en grammes
  const [resteDit, setResteDit] = useState(false) // a-t-il répondu lui-même ?
  const [clavier, setClavier] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [fini, setFini] = useState(null)

  const relire = useCallback(() => {
    loadAFinir().then(setVracs).catch(e => setErreur(e.message || String(e)))
  }, [])

  useEffect(() => { relire() }, [relire])

  /** Ouvrir un vrac : on va chercher ses moules. */
  const ouvrir = async a => {
    navigator.vibrate?.(15)
    setOuvert({ a, formats: null })
    setCombien({})
    setResteDit(false)
    setReste(a.resteG)
    try {
      setOuvert({ a, formats: await loadFormats(a.produit) })
    } catch (e) {
      toast('Formats illisibles : ' + (e.message || e))
      setOuvert(null)
    }
  }

  const fermer = () => { setOuvert(null); setClavier(false) }

  const prevu = ouvert?.formats ? prevuParLaRecette(ouvert.formats, combien) : 0
  const resteCalcule = Math.max(0, Math.round(((ouvert?.a.resteG || 0) - prevu) * 10) / 10)
  // ⚠️ TANT QU'IL N'A RIEN DIT, on suit le calcul. Un zéro par défaut ferait
  // rentrer 4 236 g de caramel dans deux bases le jour où l'on se trompe de
  // ligne — et Odoo ne le rattraperait pas. Le bouton « rien » est à un doigt.
  const resteRetenu = resteDit ? reste : resteCalcule
  const trop = prevu > (ouvert?.a.resteG || 0) + 1

  const valider = async () => {
    if (envoi || !ouvert?.formats) return
    if (!hasValidJwt()) {
      toast('Ta session a expiré : déconnecte-toi et reconnecte-toi, puis recommence.')
      return
    }
    const ordres = dispatchVersOdoo({
      vrac: ouvert.a.produit, stock: ouvert.a.resteG, uniteStock: 'g',
      formats: ouvert.formats, quantites: combien, reste: resteRetenu,
    })
    if (!ordres.length) return
    navigator.vibrate?.(15)
    setEnvoi(true)
    try {
      // ⚠️ UN PAR UN, jamais de front : un ordre orphelin chez Odoo ne se
      // rattrape pas tout seul. Même règle que le reste de l'écran.
      for (const o of ordres) {
        const r = await declarer({ produit: o.produit, qty: o.qty, unite: o.unite,
          ajustements: o.ajustements }, user?.id)
        if (r?.erreur) toast(`Odoo a refusé ${propre(o.produit)} : ${r.erreur}`)
      }
      setFini({ quoi: propre(ouvert.a.libelle || ouvert.a.produit),
        combien: ordres.reduce((t, o) => t + o.qty, 0) })
      setTimeout(() => setFini(null), 1600)
      fermer()
      relire()
    } catch (e) {
      toast('Erreur : ' + (e.message || e))
    } finally { setEnvoi(false) }
  }

  const nav = { user, onLogout, onNavigate, activeView }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      {fini && <Confirmation quoi={fini.quoi} combien={fini.combien} />}
      <div className="max-w-[680px] mx-auto px-4 py-5 pb-28">

        {!ouvert && (
          <>
            <h1 className="font-fraunces italic text-[26px] text-ink mb-4">À finir</h1>
            {erreur && (
              <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded-2xl mb-4 text-[13px]">
                {erreur}
              </div>
            )}
            {!vracs && !erreur && <Skeleton />}
            {vracs && !vracs.length && <Rien emoji="✅" mot="Tout est fini" />}
            {(vracs || []).map(a => <LigneVrac key={a.produit} a={a} onOuvrir={ouvrir} />)}
          </>
        )}

        {ouvert && (
          <>
            <button onClick={fermer}
              className="text-[15px] font-bold text-ink-mute mb-3 active:opacity-60">
              ‹ retour
            </button>

            <div className="flex items-center gap-3">
              <img src={photoFabAnnexe(ouvert.a.photo || ouvert.a.produit)} alt="" loading="lazy"
                onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                className="w-16 h-16 rounded-2xl object-cover bg-cream-deep shrink-0" />
              <div className="min-w-0">
                <div className="text-[22px] font-extrabold leading-[1.1]">
                  {propre(ouvert.a.libelle || ouvert.a.produit)}
                </div>
                {ouvert.a.note && (
                  <div className="text-[13px] text-ink-mute mt-0.5">{ouvert.a.note}</div>
                )}
              </div>
            </div>

            <div className="text-center mt-6">
              <div className="text-[15px] text-ink-mute">il t’en reste</div>
              <div className="text-[34px] font-extrabold tabular-nums leading-none text-ink">
                {qte(ouvert.a.resteG, 'g')}
              </div>
            </div>

            {!ouvert.formats && <div className="mt-6"><Skeleton /></div>}

            {ouvert.formats && !ouvert.formats.length && (
              <div className="mt-6 text-center text-[14px] text-ink-mute italic">
                Aucun moule connu pour celui-ci — il se finit ailleurs.
              </div>
            )}

            {!!ouvert.formats?.length && (
              <>
                <AutresTailles
                  titre="Tu en as fait combien ?"
                  tailles={ouvert.formats} valeurs={combien}
                  onChange={(p, n) => setCombien(x => ({ ...x, [p]: n }))} />

                <div className="mt-4 text-center text-[14px] text-ink-mute">
                  la recette en prend <b className="text-ink">{qte(prevu, 'g')}</b>
                </div>
                {trop && (
                  <div className="mt-1 text-center text-[14px] font-bold text-danger">
                    c’est plus que ce qu’il te reste
                  </div>
                )}

                {/* ⚠️ LA QUESTION QU'ELLE A DEMANDÉE MOT POUR MOT (Layla,
                    2026-09-20) : « est-ce qu'il t'est resté de la crème à la
                    fin, pour compléter ou pour stocker ». Zéro veut dire que
                    tout est parti dans les gâteaux — même ce que la recette ne
                    demandait pas. */}
                <div className="mt-6 rounded-2xl border-2 border-cream-deep overflow-hidden">
                  <div className="px-4 py-2.5 bg-cream-deep/40 text-[15px] font-bold">
                    Il t’en reste combien à la fin ?
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3">
                    <button
                      onClick={() => { setResteDit(true); setReste(0) }}
                      className={`rounded-full px-4 py-2 text-[14px] font-extrabold border-2 transition
                        ${resteRetenu === 0 ? 'bg-bordeaux text-cream border-bordeaux'
      : 'bg-cream-warm text-ink-soft border-cream-deep'}`}>
                      rien
                    </button>
                    <button
                      onClick={() => setClavier(true)}
                      aria-label="Changer ce qu’il en reste"
                      className="ml-auto text-[26px] font-extrabold tabular-nums">
                      {qte(resteRetenu, 'g')}
                    </button>
                  </div>
                  {resteRetenu === 0 && (
                    <div className="px-4 pb-3 text-[12.5px] text-ink-mute">
                      tout part dans les gâteaux, même le rab
                    </div>
                  )}
                </div>

                <button
                  onClick={valider}
                  disabled={envoi || trop || !Object.values(combien).some(n => Number(n) > 0)}
                  className={`w-full mt-6 rounded-2xl py-5 text-[20px] font-extrabold transition-colors
                    ${envoi ? 'bg-bordeaux text-cream'
      : trop || !Object.values(combien).some(n => Number(n) > 0)
        ? 'bg-cream-deep text-ink-mute' : 'bg-success text-cream'}`}>
                  {envoi ? 'en cours…' : "C'est fait"}
                </button>
              </>
            )}

            {clavier && (
              <Clavier titre="Il t’en reste" unite="g" valeur={resteRetenu}
                onValider={v => { setResteDit(true); setReste(Math.max(0, v)); setClavier(false) }}
                onFermer={() => setClavier(false)} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
