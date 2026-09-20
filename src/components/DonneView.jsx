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
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { propre, qte } from '../lib/ecranSimple'
import { feuillesDuJour, aDonner, aReprendre, enRetour, donner, retourRecu, depuis } from '../lib/feuilles'

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

  const Carte = ({ f, children, ton }) => (
    <div className={`bg-cream-warm border border-line border-l-4 ${ton} rounded-2xl p-3 mb-2`}>
      <div className="text-[15px] font-bold text-ink">{propre(f.libelle || f.produit)}</div>
      <div className="text-[12px] text-ink-mute">
        {qte(f.qty_prevue, f.unite)}{f.pour ? ` · pour ${propre(f.pour)}` : ''}
      </div>
      {children}
    </div>
  )

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      <div className="max-w-[820px] mx-auto px-4 py-5">
        <h1 className="font-fraunces italic text-[26px] text-ink">Donné</h1>
        <p className="text-[12.5px] text-ink-mute mb-4">
          Ce que tu as sorti de la réserve, et ce qu’on te demande encore.
        </p>

        {erreur && (
          <div className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-3 rounded-2xl mb-4 text-[13px]">
            {erreur}
          </div>
        )}
        {!feuilles && !erreur && <Skeleton />}

        {/* ---- ce qu'on lui demande ---- */}
        {!!attente.length && (
          <>
            <h2 className="font-fraunces italic text-[19px] text-ink mt-2">À donner</h2>
            <p className="text-[12.5px] text-ink-mute mb-3">
              Le plus simple reste de scanner le papier qu’on te tend.
            </p>
            {attente.map(f => (
              <Carte key={f.id} f={f} ton="border-l-gold">
                <button
                  onClick={() => agir(f, 'donner')} disabled={busy === f.id}
                  className="mt-3 rounded-full bg-ok text-cream px-5 py-2 text-[13px] font-bold
                             active:scale-95 transition disabled:opacity-50">
                  {busy === f.id ? '…' : '✓ Donné'}
                </button>
              </Carte>
            ))}
          </>
        )}

        {/* ---- ce que le pâtissier rend : le seul geste de l'économe ---- */}
        {!!retours.length && (
          <>
            <h2 className="font-fraunces italic text-[19px] text-ink mt-8">On te rend</h2>
            <p className="text-[12.5px] text-ink-mute mb-3">
              Le pâtissier ne fera pas ces fournées. Confirme quand la marchandise
              est revenue dans ta réserve.
            </p>
            {retours.map(f => (
              <Carte key={f.id} f={f} ton="border-l-gold">
                <div className="text-[11.5px] text-ink-mute mt-1">
                  rendu il y a {depuis(f.retour_le)}
                </div>
                <button
                  onClick={() => agir(f, 'retour')} disabled={busy === f.id}
                  className="mt-3 rounded-full bg-bordeaux text-cream px-5 py-2 text-[13px]
                             font-bold active:scale-95 transition disabled:opacity-50">
                  {busy === f.id ? '…' : '✓ Retourné'}
                </button>
              </Carte>
            ))}
          </>
        )}

        {/* ---- ce qui est dehors : pour savoir, pas pour agir ---- */}
        <h2 className="font-fraunces italic text-[19px] text-ink mt-8">Sorti de la réserve</h2>
        <p className="text-[12.5px] text-ink-mute mb-3">
          Donné, pas encore déclaré. Rien à faire ici : c’est le pâtissier qui
          rend, s’il doit rendre.
        </p>
        {feuilles && !sortis.length && (
          <div className="text-center py-8 text-ink-mute italic text-[14px]">
            Rien n’est sorti sans avoir été déclaré.
          </div>
        )}
        {sortis.map(f => (
          <Carte key={f.id} f={f} ton="border-l-ok">
            <div className="text-[11.5px] text-ink-mute mt-1">
              donné il y a {depuis(f.donne_le)}
            </div>
          </Carte>
        ))}
      </div>
    </div>
  )
}
