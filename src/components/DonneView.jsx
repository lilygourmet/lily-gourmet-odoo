// ============================================================
// « DONNÉ » — l'onglet de l'économe.
//
// « Sépare l'onglet À déclarer de celui de donné de l'économat, qui doit
// afficher que les éléments donné pour être rendu » (Layla, 2026-09-20).
//
// Deux métiers, deux écrans : le pâtissier doit DÉCLARER ce qu'il a fait,
// l'économe suit CE QU'IL A SORTI de sa réserve et peut le reprendre. Les
// mélanger, c'était proposer « Rendue » sur des fournées dont il n'avait rien
// donné — « rendue n'est pas à rendre », et elle avait raison.
//
// ⚠️ IL NE DÉCIDE PAS DES RETOURS (Layla, 2026-09-20 : « c'est le pâtissier qui
// décide »). Celui qui a la marchandise entre les mains est le seul à savoir
// qu'il ne la fera pas ; l'économe, lui, ne peut confirmer qu'une chose — qu'il
// l'a bien récupérée dans sa réserve. J'avais d'abord laissé l'économe fermer
// des lignes tout seul : il aurait soldé de la marchandise sans rien avoir vu
// revenir.
//
// ⚠️ ET ON NE LIT PAS ICI (Layla, 2026-09-20 : « trop compliqué pour quelqu'un
// qui ne lit pas / facilite le visuel »). Les trois paragraphes d'explication
// sont partis : une photo, deux mots, un gros chiffre, un bouton pleine
// largeur. Ce qui ne sert qu'à SAVOIR — le déjà-donné — passe en vignettes :
// pas la même place que ce qui demande un geste.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { PhotoFeuille, GrosseQuantite, Bande, Rien } from './FeuilleVisuel'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { propre, qte } from '../lib/ecranSimple'
import { feuillesDuJour, aDonner, aReprendre, enRetour, donner, retourRecu } from '../lib/feuilles'

/**
 * Une fournée qui attend un geste : photo, gros chiffre, UN bouton.
 *
 * ⚠️ Hors du composant — redéfinie à chaque rendu, React la prenait pour un
 * autre composant et rechargeait les photos à chaque relecture (toutes les
 * minutes).
 */
function Fiche({ f, bord, couleur, mot, quoi, busy, onAgir }) {
  return (
    <div className={`bg-cream-warm border border-line border-l-[6px] ${bord} rounded-3xl
                     overflow-hidden shadow-sm mb-3`}>
      <div className="flex gap-3 p-3">
        <PhotoFeuille f={f} className="w-[86px] h-[86px] rounded-2xl flex-none" />
        <div className="min-w-0 flex flex-col justify-center gap-1">
          <div className="text-[18px] font-extrabold leading-tight text-ink">
            {propre(f.libelle || f.produit)}
          </div>
          <GrosseQuantite f={f} />
          {f.pour && (
            <div className="text-[12.5px] text-ink-mute truncate">→ {propre(f.pour)}</div>
          )}
        </div>
      </div>
      <button
        onClick={() => onAgir(f, quoi)} disabled={busy === f.id}
        className={`w-full ${couleur} text-cream py-4 text-[19px] font-extrabold
                    active:brightness-90 transition disabled:opacity-50`}>
        {busy === f.id ? '…' : mot}
      </button>
    </div>
  )
}

export default function DonneView({ user, onLogout, onNavigate, activeView }) {
  const [feuilles, setFeuilles] = useState(null)
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(null)

  const relire = useCallback(() => {
    feuillesDuJour().then(setFeuilles).catch(e => setErreur(e.message || String(e)))
  }, [])

  useEffect(() => {
    relire()
    // Les pâtissiers déclarent pendant qu'il sert : la liste se rafraîchit
    // seule, écran visible.
    const t = setInterval(() => { if (!document.hidden) relire() }, 60 * 1000)
    return () => clearInterval(t)
  }, [relire])

  const agir = async (f, quoi) => {
    if (busy) return
    navigator.vibrate?.(15)
    if (quoi === 'retour' && !await confirmDialog(
      `Tu as bien récupéré « ${propre(f.libelle || f.produit)} » dans ta réserve ?`,
      { confirmLabel: 'Oui, récupérée' })) return
    setBusy(f.id)
    try {
      if (quoi === 'donner') await donner(f.id, user?.id)
      else await retourRecu(f.id)
      relire()
    } catch (e) { toast('Erreur : ' + (e.message || e)) }
    finally { setBusy(null) }
  }

  const nav = { user, onLogout, onNavigate, activeView }
  const attente = feuilles ? aDonner(feuilles) : []
  const sortis = feuilles ? aReprendre(feuilles) : []
  const retours = feuilles ? enRetour(feuilles) : []
  const rienDuTout = feuilles && !attente.length && !sortis.length && !retours.length

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      <div className="max-w-[820px] mx-auto px-4 py-5">
        <h1 className="font-fraunces italic text-[26px] text-ink">Donné</h1>

        {erreur && (
          <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded-2xl mb-4 text-[13px]">
            {erreur}
          </div>
        )}
        {!feuilles && !erreur && <Skeleton />}

        {rienDuTout && <div className="mt-6"><Rien emoji="🌙" mot="Rien dehors" /></div>}

        {/* ---- ce qu'on lui demande ---- */}
        {!!attente.length && (
          <>
            <Bande emoji="🤲" titre="À donner" n={attente.length} ton="bg-gold-pale text-gold" />
            {attente.map(f => (
              <Fiche key={f.id} f={f} bord="border-l-gold" couleur="bg-ok" mot="✓ Donné"
                quoi="donner" busy={busy} onAgir={agir} />
            ))}
          </>
        )}

        {/* ---- ce que le pâtissier rend : le seul geste de l'économe ---- */}
        {!!retours.length && (
          <>
            <Bande emoji="↩️" titre="On te rend" n={retours.length} ton="bg-bordeaux/10 text-bordeaux" />
            {retours.map(f => (
              <Fiche key={f.id} f={f} bord="border-l-bordeaux" couleur="bg-bordeaux" mot="✓ Repris"
                quoi="retour" busy={busy} onAgir={agir} />
            ))}
          </>
        )}

        {/* ---- ce qui est dehors : pour savoir, pas pour agir ---- */}
        {!!sortis.length && (
          <>
            <Bande emoji="✅" titre="Déjà donné" n={sortis.length} ton="bg-success-bg text-success" />
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2.5">
              {sortis.map(f => (
                <div key={f.id} className="bg-cream-warm border border-line rounded-2xl overflow-hidden">
                  <PhotoFeuille f={f} className="w-full aspect-square" />
                  <div className="px-2 pt-1.5 pb-2">
                    <div className="text-[12px] font-bold leading-tight text-ink">
                      {propre(f.libelle || f.produit)}
                    </div>
                    <div className="text-[12px] font-semibold text-ink-mute tabular-nums">
                      {qte(f.qty_prevue, f.unite)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
