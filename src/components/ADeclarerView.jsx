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
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { propre, qte } from '../lib/ecranSimple'
import { feuillesDuJour, aDeclarer, aDonner, donner, rendue, depuis, lienFeuille }
  from '../lib/feuilles'
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
  const [busy, setBusy] = useState(null)

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

  /** Le vrai écran de déclaration, posé sur cet article. */
  const ouvrirPourDeclarer = f => {
    navigator.vibrate?.(15)
    // Le chemin entier : une crème ne s'ouvre pas seule, elle se descend
    // depuis son gâteau (voir `scanEntrant`).
    poserLeScan({ chemin: (f.chemin && f.chemin.length) ? f.chemin : [f.produit], declarer: true })
    onNavigate?.('fabrication-annexe-2')
  }

  const agir = async (f, quoi) => {
    if (busy) return
    navigator.vibrate?.(15)
    // C'est la seule façon pour une ligne de disparaître sans qu'aucun travail
    // n'ait été enregistré : on demande confirmation, une fois.
    if (quoi === 'rendue' && !await confirmDialog(
      `La marchandise de « ${propre(f.libelle || f.produit)} » est revenue à l’économe ?`,
      { confirmLabel: 'Oui, rendue' })) return
    setBusy(f.id)
    try {
      if (quoi === 'donner') await donner(f.id, user?.id)
      else await rendue(f.id)
      relire()
    } catch (e) { toast('Erreur : ' + (e.message || e)) }
    finally { setBusy(null) }
  }

  const nav = { user, onLogout, onNavigate, activeView }
  const dues = feuilles ? aDeclarer(feuilles) : []
  const attente = feuilles ? aDonner(feuilles) : []

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
              {/* ⚠️ LA SEULE SORTIE SANS DÉCLARATION (Layla, 2026-09-20).
                  « Pas faite » n'existe plus : une fournée qu'on n'a pas eu le
                  temps de faire n'a rien à effacer — « c'est systématique
                  gardé », la crème attend au frigo et le travail se fera. La
                  ligne reste donc là, sans qu'on ait à cliquer.
                  Elle ne part que si la marchandise est REVENUE à l'économe. */}
              <button
                onClick={() => agir(f, 'rendue')} disabled={busy === f.id}
                className="rounded-full border border-line text-ink-soft px-4 py-2 text-[13px]
                           font-bold active:scale-95 transition disabled:opacity-50">
                Rendue
              </button>
            </div>
          </Ligne>
        ))}

        {/* ⚠️ LA LISTE DE L'ÉCONOME, EN SECOND. Elle ne sert pas à servir — il
            scanne le papier pour ça — mais à voir ce qui traîne : imprimé, et
            jamais venu chercher. Rien n'est dû sur ces lignes-là. */}
        {!!attente.length && (
          <>
            <h2 className="font-fraunces italic text-[19px] text-ink mt-9">Pas encore donné</h2>
            <p className="text-[12.5px] text-ink-mute mb-3">
              Imprimé, mais personne n’est venu chercher la marchandise. Rien n’est dû.
            </p>
            {attente.map(f => (
              <Ligne key={f.id} ton="border-l-line">
                <div className="text-[14.5px] font-bold text-ink">{propre(f.libelle || f.produit)}</div>
                <div className="text-[12px] text-ink-mute">
                  imprimé il y a {depuis(f.imprime_le)} · {qte(f.qty_prevue, f.unite)}
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <button
                    onClick={() => agir(f, 'donner')} disabled={busy === f.id}
                    className="rounded-full bg-ok text-cream px-5 py-2 text-[13px] font-bold
                               active:scale-95 transition disabled:opacity-50">
                    {busy === f.id ? '…' : '✓ Donné'}
                  </button>
                  <a
                    href={lienFeuille(f.id, true)} target="_blank" rel="noopener noreferrer"
                    className="text-[12px] text-ink-mute underline">
                    ouvrir la page du QR
                  </a>
                </div>
              </Ligne>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
