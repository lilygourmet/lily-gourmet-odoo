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
import { photoFabAnnexe, declarer, loadArticleFabAnnexe, bloquants, ingredientsPour } from '../lib/fabAnnexe'
import { hasValidJwt, canRebuts } from '../lib/auth'
import { loadAFinir, loadFormats, prevuParLaRecette, dispatchVersOdoo, aMettreEnForme, etirementExcessif } from '../lib/miseEnForme'
import { ChoixDuReste } from './RebutView'
import { demanderAJeter } from '../lib/rebuts'

/** Deux noms d'article sont-ils le même ? Odoo colle parfois sa référence devant. */
const cleArticle = n => String(n || '')
  .replace(/^\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase()

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
    loadAFinir({ frais: true }).then(setVracs).catch(e => setErreur(e.message || String(e)))
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
      // ⚠️ L'unité dans laquelle ODOO COMPTE le vrac : c'est dans celle-là que
      // la quantité imposée doit partir, le serveur fait le reste (Layla,
      // 2026-09-21 : « assure-toi que partout pareil »).
      uniteVracArticle: ouvert.a.unite || null,
    })
    if (!ordres.length) return
    /**
     * ⚠️ LE SEUL VERROU QUI RESTE SUR LE VRAC LUI-MÊME — « refuser en dessous
     * de 50 % » (Layla, 2026-09-22 : « mais pour cet écran, pas de verrou ? »).
     *
     * On ne vérifie plus qu'il y en a ASSEZ — étirer une fin de cuve est
     * normal, c'est même la raison d'être de l'écran. On vérifie seulement
     * qu'on ne l'étire pas jusqu'à l'absurde : chaque pièce doit recevoir au
     * moins la MOITIÉ de sa dose. En dessous, ce n'est plus une fin de cuve,
     * c'est un chiffre tapé de travers — 500 pièces au lieu de 50.
     */
    const trop = etirementExcessif({
      stock: ouvert.a.resteG, uniteStock: 'g',
      formats: ouvert.formats, quantites: combien, reste: resteRetenu,
    })
    if (trop) {
      toast(`Chaque pièce ne recevrait que ${trop.pourcent} % de sa dose `
        + `(${qte(trop.consommeG, 'g')} pour ${qte(trop.prevuG, 'g')} demandés). `
        + 'Vérifie le nombre de pièces.')
      return
    }
    navigator.vibrate?.(15)
    setEnvoi(true)
    try {
      // ⚠️ LE MÊME VERROU QU'AILLEURS, SINON C'EST UNE PORTE DÉROBÉE. Cet écran
      // déclare des moules — et un moule a d'autres composants que le vrac
      // qu'on répartit : le gianduja indiv veut aussi son crémeux et son
      // biscuit. Sans cette vérification, deux doigts ici auraient fait
      // consommer à Odoo des composants qui n'existent pas, alors que l'écran
      // de fabrication, lui, l'interdit depuis toujours.
      //
      // ⚠️ MAIS PAS SUR LE VRAC QU'ON EST EN TRAIN DE VIDER (Layla,
      // 2026-09-22 : « il manque Subleme Fromage Passion pour Pr Cheesecake
      // Exotique Indiv — passe par Fabrication Annexe 2 », alors que l'écran
      // venait de lui écrire « c'est plus que ce qu'il te reste — tout y
      // passera »).
      //
      // La recette de 50 individuels réclame 1 400 g ; il en restait 1 158, et
      // c'est exprès : c'est TOUTE la question de cet écran. Le verrou voyait
      // le vrac dans la recette du moule, le trouvait insuffisant, et refusait
      // le seul geste pour lequel l'écran existe. L'écran promettait puis
      // refusait — et renvoyait vers Fabrication Annexe 2, où elle n'aurait
      // pas fait mieux.
      //
      // Ce vrac-là n'a pas besoin d'être vérifié : `dispatchVersOdoo` vient
      // justement de dire combien il en part, au gramme près. Le verrou garde
      // tout le RESTE — le crémeux, le biscuit, la gélée qu'on n'a pas.
      const leVrac = cleArticle(ouvert.a.produit)
      for (const o of ordres) {
        const n = await loadArticleFabAnnexe(o.produit)
        const manque = (n
          ? bloquants({ ...n, composants: ingredientsPour(n, o.qty), enfants: undefined }, {})
          : []
        ).filter(x => cleArticle(x) !== leVrac)
        if (manque.length) {
          toast(`Il manque ${propre(manque[0])} pour ${propre(o.produit)} — passe par Fabrication Annexe 2.`)
          return
        }
      }
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
      /**
       * ⚠️ LA LIGNE PART TOUT DE SUITE, AVEC LE CHIFFRE QU'ELLE A DIT (Layla,
       * 2026-09-22 : « j'ai dit qu'il m'en est resté 0, ça m'a remis 140 »,
       * puis « ça doit s'enlever seul sans rafraîchir la page »).
       *
       * Depuis que « À finir » lit la consommation RÉELLE de l'ordre Odoo, il y
       * a un trou de quelques secondes : l'ordre met sept allers-retours à
       * naître, et pendant ce temps-là le serveur retombe sur le calcul de la
       * recette — donc sur un reste fantôme. Relire immédiatement, c'était
       * ramener ce fantôme sous ses yeux.
       *
       * Ce qu'elle a VU de ses yeux et DIT fait foi, et n'a rien à attendre
       * d'Odoo. On l'applique ici ; la prochaine ouverture de l'écran relira
       * le serveur, qui d'ici là connaîtra l'ordre.
       */
      const ditG = Math.max(0, Number(resteRetenu) || 0)
      setVracs(v => aMettreEnForme((v || []).map(x =>
        (x.produit === ouvert.a.produit ? { ...x, resteG: ditG, pris: null } : x))))
    } catch (e) {
      toast('Erreur : ' + (e.message || e))
    } finally { setEnvoi(false) }
  }

  /**
   * JETER LE RESTE au lieu de le remettre au frigo.
   *
   * ⚠️ ON JETTE AVANT DE DISPATCHER, et c'est voulu : une fois le reste parti
   * au rebut, il ne reste plus rien — le dispatch qui suit fait donc entrer
   * TOUT le vrac dans les gâteaux, exactement comme un « rien ». Sans ça, on
   * aurait jeté 140 g ET laissé 140 g au frigo.
   */
  const jeterLeReste = async a => {
    if (envoi) return
    navigator.vibrate?.(15)
    setEnvoi(true)
    try {
      const r = await demanderAJeter({
        produit: a.produit, libelle: a.libelle, qty: resteRetenu, unite: 'g',
        motif: `À finir — ${propre(a.libelle || a.produit)}`,
      }, user?.id)
      if (r) { setResteDit(true); setReste(0) }
    } catch (e) { toast('Erreur : ' + (e.message || e)) }
    finally { setEnvoi(false) }
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
                {/* Ce n'est PAS une erreur : on a étiré le vrac, tout y est
                    passé. Odoo reçoit ce qui existait vraiment (stock − reste),
                    jamais ce que la recette réclamait. « C'est fait ça doit pas
                    coincer, c'est juste que ça a tout consommé » (Layla,
                    2026-09-22). */}
                {trop && (
                  <div className="mt-1 text-center text-[13.5px] text-ink-mute">
                    c’est plus que ce qu’il te reste — tout y passera
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

                {/* ⚠️ « Je devrais décider ce que j'en fais — par exemple 140
                    Subleme en rebut ? ou à intégrer dans le reste » (Layla,
                    2026-09-22). Le choix n'apparaît QUE s'il reste quelque
                    chose, et QUE pour qui a le droit de jeter : sans la
                    permission, l'écran reste exactement comme avant. */}
                <ChoixDuReste
                  reste={resteRetenu} unite="g" sur="l’annexe" envoi={envoi}
                  onJeter={canRebuts(user) ? () => jeterLeReste(ouvert.a) : undefined} />

                <button
                  onClick={valider}
                  disabled={envoi || !Object.values(combien).some(n => Number(n) > 0)}
                  className={`w-full mt-6 rounded-2xl py-5 text-[20px] font-extrabold transition-colors
                    ${envoi ? 'bg-bordeaux text-cream'
      : !Object.values(combien).some(n => Number(n) > 0)
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
