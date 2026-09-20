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
// ⚠️ ET RIEN DE L'ÉCONOME ICI (Layla, 2026-09-20). « Rendue » traînait sur des
// fournées dont il n'avait rien donné — « rendue n'est pas à rendre ». Ce qu'il
// a sorti, et peut reprendre, vit dans SON onglet : voir `DonneView`.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { propre, qte } from '../lib/ecranSimple'
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

function Ligne({ children, ton }) {
  return (
    <div className={`bg-cream-warm border border-line border-l-4 ${ton} rounded-2xl p-3 mb-2`}>
      {children}
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
    // Plusieurs personnes travaillent dessus en même temps : l'économe donne
    // pendant que le pâtissier déclare. On relit sans bruit, écran visible.
    const t = setInterval(() => { if (!document.hidden) relire() }, 60 * 1000)
    return () => clearInterval(t)
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
        <h1 className="font-fraunces italic text-[26px] text-ink">À déclarer</h1>
        <p className="text-[12.5px] text-ink-mute mb-4">
          Donné par l’économe, pas encore déclaré.
        </p>

        {erreur && (
          <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded-2xl mb-4 text-[13px]">
            {erreur}
          </div>
        )}
        {!feuilles && !erreur && <Skeleton />}

        {feuilles && !dues.length && (
          <div className="text-center py-10 text-ink-mute italic text-[14px]">
            Rien à déclarer. Tout ce qui a été donné aujourd’hui est déclaré.
          </div>
        )}

        {dues.map(f => (
          <Ligne key={f.id} ton={enRetard(f) ? 'border-l-danger' : 'border-l-gold'}>
            <span className={`inline-block text-[9.5px] font-extrabold tracking-wide px-2 py-0.5
              rounded-full border mb-1
              ${enRetard(f) ? 'bg-danger-bg text-danger border-danger' : 'bg-gold-pale text-gold border-gold'}`}>
              {f.donne_le ? `DONNÉ IL Y A ${depuis(f.donne_le).toUpperCase()}`
                : `RIEN À DEMANDER · IMPRIMÉ IL Y A ${depuis(f.imprime_le).toUpperCase()}`}
            </span>
            <div className="text-[15px] font-bold text-ink">{propre(f.libelle || f.produit)}</div>
            <div className="text-[12px] text-ink-mute">
              attendu {qte(f.qty_prevue, f.unite)}{f.pour ? ` · pour ${propre(f.pour)}` : ''}
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {/* ⚠️ ON NE DÉCLARE PAS ICI. Cet onglet avait sa propre petite
                  saisie : c'était une déclaration appauvrie, à côté de l'écran
                  qui connaît les cuves, le pressage, le verrou des composants
                  et le reste de la crème. Toucher la ligne ouvre donc le vrai
                  écran, exactement comme le QR — une seule façon de déclarer. */}
              <button
                onClick={() => ouvrirPourDeclarer(f)}
                className="rounded-full bg-bordeaux text-cream px-5 py-2 text-[13px] font-bold
                           active:scale-95 transition">
                Ouvrir pour déclarer
              </button>
              {/* ⚠️ LE RETOUR SE DÉCIDE ICI (Layla, 2026-09-20 : « c'est le
                  pâtissier qui décide »). Lui seul sait qu'il ne fera pas cette
                  fournée. La ligne part alors attendre chez l'économe, qui
                  confirmera l'avoir récupérée.
                  Rien à rendre quand l'économe n'a rien donné — mais on regarde
                  `donne_le`, pas `donne_par` : le scan au comptoir est anonyme,
                  et le bouton disparaissait dès qu'on donnait par le QR. */}
              {f.donne_le && (
                <button
                  onClick={() => rendre(f)} disabled={rend === f.id}
                  className="rounded-full border border-line text-ink-soft px-4 py-2 text-[13px]
                             font-bold active:scale-95 transition disabled:opacity-50">
                  {rend === f.id ? '…' : '↩ Je rends'}
                </button>
              )}
            </div>
          </Ligne>
        ))}


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
