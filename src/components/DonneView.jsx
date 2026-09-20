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
import { PhotoFeuille, GrosseQuantite, Bande, Rien, TeteCascade, Quand } from './FeuilleVisuel'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { propre } from '../lib/ecranSimple'
import { feuillesDuJour, aDonner, aReprendre, enRetour, donner, retourRecu, parCascade, donneEtSolde } from '../lib/feuilles'

/**
 * Une fournée, EN UNE LIGNE : photo, nom, chiffre — et le geste à droite.
 *
 * ⚠️ PLUS PETIT (Layla, 2026-09-20 : « diminue la taille »). La fiche haute
 * avec sa photo de 86 px et son bouton pleine largeur ne montrait que deux
 * fournées à l'écran ; il en arrive douze certains matins.
 *
 * ⚠️ Hors du composant, sans quoi React la prend pour un autre composant à
 * chaque relecture (toutes les 30 s) et recharge toutes les photos.
 */
/** Le dernier geste posé sur cette fournée, et quand. */
const dernierGeste = f => {
  if (f.declare_le) return { iso: f.declare_le, quoi: '✓ déclaré' }
  if (f.pas_faite_le) return { iso: f.pas_faite_le, quoi: '↩ repris' }
  if (f.retour_le) return { iso: f.retour_le, quoi: 'rendu' }
  return { iso: f.donne_le, quoi: 'donné' }
}

function Ligne({ f, bord, couleur, quoi, busy, onAgir }) {
  const dedans = (
    <>
      <span className="flex-1 min-w-0 flex items-center gap-2.5 p-2">
        <PhotoFeuille f={f} className="w-12 h-12 rounded-lg flex-none" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold leading-tight text-ink truncate">
            {propre(f.libelle || f.produit)}
          </span>
          <GrosseQuantite f={f} compact />
          {/* « Quand on donne, on écrit en dessous la date » (Layla,
              2026-09-20) : la liste remonte une semaine, l'heure seule ne
              suffirait pas à savoir de quel jour on parle. Et c'est le DERNIER
              geste qui s'écrit — donné, rendu, déclaré, repris — sans quoi
              l'historique daterait tout du moment où la marchandise est
              sortie. */}
          <Quand {...dernierGeste(f)} />
        </span>
      </span>
      {!!onAgir && (
        <span className={`flex-none w-16 ${couleur} text-cream text-[22px] font-extrabold
                          grid place-items-center`}>
          {busy === f.id ? '…' : '✓'}
        </span>
      )}
    </>
  )

  const habit = `flex items-stretch w-full text-left bg-cream-warm border border-line
                 border-l-4 ${bord} rounded-xl overflow-hidden mb-1.5`

  // Rien à faire dessus (le déjà-donné, l'historique) : pas un bouton.
  if (!onAgir) return <div className={habit}>{dedans}</div>

  // ⚠️ TOUTE LA LIGNE SERT (Layla, 2026-09-20 : « je n'arrive pas à cocher un
  // article, il fait que bouger »). Seule la bande verte de 64 px répondait :
  // toucher la photo ou le nom ne faisait rien, et l'écran se contentait de
  // glisser sous le doigt. Le ✓ reste, mais comme repère, pas comme cible.
  return (
    <button
      type="button" onClick={() => onAgir(f, quoi)} disabled={busy === f.id}
      aria-label={`${quoi === 'donner' ? 'Donné' : 'Repris'} : ${propre(f.libelle || f.produit)}`}
      className={`${habit} active:brightness-95 transition disabled:opacity-50`}>
      {dedans}
    </button>
  )
}

/**
 * Une pile de fournées, rangée par cascade.
 *
 * ⚠️ DEUX SENS DE LECTURE, ET ILS VIENNENT D'ELLE (Layla, 2026-09-20) : ce
 * qu'on SERT se range « à l'horizontal » — une grille qui se remplit de gauche
 * à droite, pour voir d'un coup tout ce qu'on lui demande ; ce qu'on REGARDE
 * (déjà donné, historique) reste « à la verticale », une ligne après l'autre.
 */
function Cascades({ feuilles, horizontal, ...reste }) {
  return (
    <div className={horizontal ? 'grid sm:grid-cols-2 sm:gap-x-4' : ''}>
      {parCascade(feuilles).map(g => (
        <div key={g.tete}>
          <TeteCascade g={g} />
          {g.feuilles.map(f => <Ligne key={f.id} f={f} {...reste} />)}
        </div>
      ))}
    </div>
  )
}

export default function DonneView({ user, onLogout, onNavigate, activeView }) {
  const [feuilles, setFeuilles] = useState(null)
  const [erreur, setErreur] = useState('')
  const [busy, setBusy] = useState(null)
  // ⚠️ REPLIÉ PAR DÉFAUT (Layla, 2026-09-20 : « le point 3, comme un
  // historique »). La trace existe, elle n'encombre pas le travail en cours.
  const [histoOuvert, setHistoOuvert] = useState(false)

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
  const histo = feuilles ? donneEtSolde(feuilles) : []
  const rienDuTout = feuilles && !attente.length && !sortis.length && !retours.length && !histo.length

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
            <Cascades feuilles={attente} bord="border-l-gold" couleur="bg-ok"
              quoi="donner" busy={busy} onAgir={agir} horizontal />
          </>
        )}

        {/* ---- ce que le pâtissier rend : le seul geste de l'économe ---- */}
        {!!retours.length && (
          <>
            <Bande emoji="↩️" titre="On te rend" n={retours.length} ton="bg-bordeaux/10 text-bordeaux" />
            <Cascades feuilles={retours} bord="border-l-bordeaux" couleur="bg-bordeaux"
              quoi="retour" busy={busy} onAgir={agir} horizontal />
          </>
        )}

        {/* ---- ce qui est dehors : pour savoir, pas pour agir ---- */}
        {!!sortis.length && (
          <>
            <Bande emoji="✅" titre="Déjà donné" n={sortis.length} ton="bg-success-bg text-success" />
            <Cascades feuilles={sortis} bord="border-l-ok" />
          </>
        )}

        {/* ---- l'historique du jour : soldé, donc replié ---- */}
        {!!histo.length && (
          <>
            <button
              type="button" onClick={() => setHistoOuvert(o => !o)}
              aria-expanded={histoOuvert}
              className="w-full text-left active:opacity-70 transition">
              <Bande emoji="🗂" titre={`Historique ${histoOuvert ? '▾' : '▸'}`}
                n={histo.length} ton="bg-cream-deep text-ink-mute" />
            </button>
            {histoOuvert && (
              <div className="opacity-70">
                <Cascades feuilles={histo} bord="border-l-line" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
