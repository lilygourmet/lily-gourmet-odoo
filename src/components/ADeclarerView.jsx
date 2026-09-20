// ============================================================
// « À DÉCLARER » — la dette du jour.
//
// « Les pâtissiers impriment, prennent les ingrédients, font les recettes,
// mais ne déclarent pas » (Layla, 2026-09-19). Ils n'ont désormais plus rien à
// se rappeler : c'est l'app qui se souvient, et qui réclame.
//
// ⚠️ UNE FEUILLE N'EST DUE QU'UNE FOIS DONNÉE. Imprimer n'engage à rien — on
// peut imprimer et ne jamais venir chercher la marchandise. C'est le geste de
// l'économe qui fait naître la dette, et c'est la règle de Layla.
//
// ⚠️ CE QUI EST DÉCLARÉ DISPARAÎT. « Que ce qui reste à déclarer » : une liste
// vide veut dire qu'il n'y a rien à faire — et rien à cliquer.
//
// ⚠️ ET ON NE LIT PAS ICI (Layla, 2026-09-20 : « trop compliqué pour quelqu'un
// qui ne lit pas / facilite le visuel »). Une photo, un gros chiffre, un bouton
// pleine largeur — le même écran que celui de l'économe, ce sont les mêmes
// mains. Le temps écoulé tient dans une pastille (« ⏰ 5 h ») : c'est le seul
// mot restant, et c'est celui qui fait bouger.
//
// ⚠️ ET RIEN DE L'ÉCONOME ICI (Layla, 2026-09-20). « Rendue » traînait sur des
// fournées dont il n'avait rien donné — « rendue n'est pas à rendre ». Ce qu'il
// a sorti, et peut reprendre, vit dans SON onglet : voir `DonneView`.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { propre } from '../lib/ecranSimple'
import { PhotoFeuille, GrosseQuantite, Rien } from './FeuilleVisuel'
import { feuillesDuJour, aDeclarer, depuis, cheminDe, demanderRetour, resteDeLaCascade } from '../lib/feuilles'
import { confirmDialog } from '../lib/confirmDialog'
import { toast } from '../lib/toast'
import { poserLeScan } from '../lib/scanEntrant'

/**
 * Rouge au-delà de deux heures : 40 min c'est normal, 5 h se voit de loin.
 * On compte depuis le moment où la ligne est devenue DUE — le « donné » de
 * l'économe, ou l'impression pour celles qui n'avaient rien à demander.
 */
const enRetard = f => Date.now() - Date.parse(f.donne_le || f.imprime_le || 0) > 2 * 3600 * 1000

/**
 * Une fournée due : photo, gros chiffre, et le bouton qui ouvre la déclaration.
 *
 * ⚠️ Hors du composant, sans quoi React la prend pour un autre composant à
 * chaque relecture (toutes les minutes) et recharge toutes les photos.
 */
function Fiche({ f, rend, onDeclarer, onRendre }) {
  const tard = enRetard(f)
  return (
    <div className={`bg-cream-warm border border-line border-l-[5px] rounded-2xl overflow-hidden
                     shadow-sm ${tard ? 'border-l-danger' : 'border-l-gold'}`}>
      <div className="flex gap-2.5 p-2.5">
        <PhotoFeuille f={f} className="w-[62px] h-[62px] rounded-xl flex-none" />
        <div className="min-w-0 flex flex-col justify-center gap-0.5">
          <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-extrabold
                            tabular-nums ${tard ? 'bg-danger-bg text-danger' : 'bg-gold-pale text-gold'}`}>
            ⏰ {depuis(f.donne_le || f.imprime_le)}
          </span>
          <div className="text-[15px] font-extrabold leading-tight text-ink">
            {propre(f.libelle || f.produit)}
          </div>
          <GrosseQuantite f={f} compact />
          {f.pour && (
            <div className="text-[11.5px] text-ink-mute truncate">→ {propre(f.pour)}</div>
          )}
        </div>
      </div>

      {/* ⚠️ ON NE DÉCLARE PAS ICI. Cet onglet avait sa propre petite saisie :
          c'était une déclaration appauvrie, à côté de l'écran qui connaît les
          cuves, le pressage, le verrou des composants et le reste de la crème.
          Toucher la ligne ouvre donc le vrai écran, exactement comme le QR. */}
      <button
        onClick={() => onDeclarer(f)}
        className="w-full bg-bordeaux text-cream py-2.5 text-[16px] font-extrabold
                   active:brightness-90 transition">
        ✍️ Déclarer
      </button>
      {/* ⚠️ LE RETOUR SE DÉCIDE ICI (Layla, 2026-09-20 : « c'est le pâtissier
          qui décide »). Lui seul sait qu'il ne fera pas cette fournée.
          Rien à rendre quand l'économe n'a rien donné — mais on regarde
          `donne_le`, pas `donne_par` : le scan au comptoir est anonyme, et le
          bouton disparaissait dès qu'on donnait par le QR. */}
      {f.donne_le && (
        <button
          onClick={() => onRendre(f)} disabled={rend === f.id}
          className="w-full border-t border-line text-ink-mute py-2 text-[13px] font-bold
                     active:bg-cream-deep transition disabled:opacity-50">
          {rend === f.id ? '…' : '↩ Je rends'}
        </button>
      )}
    </div>
  )
}

export default function ADeclarerView({ user, onLogout, onNavigate, activeView }) {
  const [feuilles, setFeuilles] = useState(null)
  const [erreur, setErreur] = useState('')
  const [rend, setRend] = useState(null)
  // La question « et le reste de la cascade ? », quand il y a un reste.
  const [aRendre, setARendre] = useState(null)

  const relire = useCallback(() => {
    feuillesDuJour().then(setFeuilles).catch(e => setErreur(e.message || String(e)))
  }, [])

  useEffect(() => {
    relire()
    // ⚠️ AU RETOUR SUR L'ÉCRAN, TOUT DE SUITE (Layla, 2026-09-20 : « je dois
    // mettre à jour la page pour les voir »). Plusieurs personnes travaillent
    // en même temps — l'économe donne pendant que le pâtissier déclare — et on
    // revient sans arrêt d'ailleurs : du scan, de la fiche, d'une autre app.
    // On tombait alors sur la liste d'AVANT, et il fallait recharger la page à
    // la main pour la croire. On relit donc à chaque retour, en plus du rythme
    // de fond.
    const auRetour = () => { if (!document.hidden) relire() }
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('focus', auRetour)
    const t = setInterval(auRetour, 30 * 1000)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('focus', auRetour)
    }
  }, [relire])

  /**
   * Rendre la marchandise : elle part attendre chez l'économe.
   *
   * ⚠️ ET LA CASCADE AVEC (Layla, 2026-09-20 : « qu'allons-nous faire avec les
   * articles mère ? »). La liasse a été imprimée pour UN gâteau : sans sa
   * crème, ni la génoise ni le cadre n'ont de sens aujourd'hui. Sans ça, le
   * pâtissier gardait un gâteau que le verrou l'empêchait de déclarer.
   * On le lui demande — jamais en silence, et seulement quand il y a
   * vraiment autre chose derrière.
   */
  const rendre = async f => {
    if (rend) return
    navigator.vibrate?.(15)
    const reste = resteDeLaCascade(feuilles, f)
    if (reste.length) { setARendre({ f, reste }); return }
    if (!await confirmDialog(
      `Tu rends la marchandise de « ${propre(f.libelle || f.produit)} » à l'économe ?`,
      { confirmLabel: 'Oui, je rends' })) return
    lancerRetour(f, false)
  }

  const lancerRetour = async (f, toute) => {
    setARendre(null)
    setRend(f.id)
    try {
      await demanderRetour(f.id, user?.id, toute)
      toast('C’est noté — l’économe le verra dans son onglet.')
      relire()
    } catch (e) { toast('Erreur : ' + (e.message || e)) }
    finally { setRend(null) }
  }

  /** Le vrai écran de déclaration, posé sur cet article. */
  const ouvrirPourDeclarer = f => {
    navigator.vibrate?.(15)
    // Le chemin entier : une crème ne s'ouvre pas seule, elle se descend
    // depuis son gâteau (voir `cheminDe`).
    // `retour` : d'où l'on vient. Sans lui, refermer la fiche laissait le
    // pâtissier dans le dossier Fabrication, loin de sa liste — « pour revenir,
    // c'est toujours dans le même dossier » (Layla, 2026-09-20).
    poserLeScan({ chemin: cheminDe(f), declarer: true, retour: 'a-declarer' })
    onNavigate?.('fabrication-annexe-2')
  }

  const nav = { user, onLogout, onNavigate, activeView }
  const dues = feuilles ? aDeclarer(feuilles) : []

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      <div className="max-w-[820px] mx-auto px-4 py-5">
        <h1 className="font-fraunces italic text-[26px] text-ink mb-4">À déclarer</h1>

        {erreur && (
          <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded-2xl mb-4 text-[13px]">
            {erreur}
          </div>
        )}
        {!feuilles && !erreur && <Skeleton />}

        {feuilles && !dues.length && <Rien emoji="✅" mot="Tout est déclaré" />}

        <div className="grid gap-2 sm:grid-cols-2">
          {dues.map(f => (
            <Fiche key={f.id} f={f} rend={rend}
              onDeclarer={ouvrirPourDeclarer} onRendre={rendre} />
          ))}
        </div>

        {/* ⚠️ UNE SEULE QUESTION, ET SEULEMENT QUAND ELLE SE POSE. */}
        {aRendre && (
          <div className="fixed inset-0 z-[70] bg-ink/40 flex items-end justify-center p-3"
            onPointerDown={e => { if (e.target === e.currentTarget) setARendre(null) }}>
            <div className="bg-cream rounded-3xl w-full max-w-[480px] p-5 shadow-2xl">
              <p className="text-[16px] font-extrabold">
                Tu rends « {propre(aRendre.f.libelle || aRendre.f.produit)} »
              </p>
              <p className="text-[13.5px] text-ink-soft mt-2">
                Le reste de cette cascade n’a plus lieu d’être :
              </p>
              <ul className="text-[13.5px] text-ink mt-1 mb-4 list-disc pl-5">
                {aRendre.reste.map(x => (
                  <li key={x.id}>{propre(x.libelle || x.produit)}</li>
                ))}
              </ul>
              <button
                onClick={() => lancerRetour(aRendre.f, true)}
                className="w-full rounded-2xl bg-bordeaux text-cream py-4 text-[16px] font-extrabold
                           active:scale-95 transition">
                Rendre toute la cascade
              </button>
              <button
                onClick={() => lancerRetour(aRendre.f, false)}
                className="w-full mt-2 rounded-2xl border border-line text-ink-soft py-3 text-[14px]
                           font-bold active:scale-95 transition">
                Juste celle-là
              </button>
              <button
                onClick={() => setARendre(null)}
                className="w-full mt-2 text-[13px] text-ink-mute py-2">
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
