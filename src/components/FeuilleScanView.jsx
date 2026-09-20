// ============================================================
// CE QUE LE QR OUVRE.
//
// Deux papiers, deux gestes, une seule page — c'est l'adresse qui tranche :
//   • `?feuille=…&don=1` → la demande à l'économat, qu'il a dans la main :
//     un seul bouton, « ✓ Donné », SANS connexion. C'est ce geste qui rend la
//     déclaration due, et il est assez simple pour tenir sur cette page.
//   • `?feuille=…`       → la feuille du pâtissier : elle ne déclare PAS, elle
//     l'emmène à l'écran qui sait tout faire (cuves, verrou, reste de la
//     crème). Une deuxième façon de déclarer, c'était une deuxième
//     comptabilité — et le même travail compté deux fois.
//
// ⚠️ Cette page ne demande aucun mot de passe : les mains sont farineuses. Le
// QR porte un jeton qui identifie LA FEUILLE, pas la personne — l'économe sait
// à qui il a donné, l'identité vient du comptoir. Le pâtissier, lui, devra être
// connecté à l'écran d'après : une fois le matin, ça tient 12 h.
//
// ⚠️ Cette page ne parle JAMAIS à Supabase en direct : tout passe par
// /api/fab-annexe, qui tient la clé de service et vérifie le jeton.
// ============================================================

import { useState, useEffect } from 'react'
import { lireFeuille, donner, etatFeuille, depuis, cheminDe } from '../lib/feuilles'
import { propre, qte } from '../lib/ecranSimple'

const Cadre = ({ children }) => (
  <div className="min-h-screen bg-cream flex items-start justify-center p-4 pt-8">
    <div className="w-full max-w-[420px]">{children}</div>
  </div>
)

const Gros = ({ children, ton = 'ink' }) => (
  <p className={`text-[17px] font-bold text-center py-10 text-${ton}`}>{children}</p>
)

export default function FeuilleScanView() {
  const params = new URLSearchParams(window.location.search)
  const id = params.get('feuille') || ''
  const estEconome = params.get('don') === '1'

  const [f, setF] = useState(null)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [fini, setFini] = useState('')
  // Ce qui attend encore l'économe pour CE gâteau. On ne coche rien à sa
  // place — on lui dit juste de ne pas refermer le tiroir trop vite.
  const [reste, setReste] = useState(0)

  useEffect(() => {
    lireFeuille(id)
      .then(setF)
      .catch(e => setErreur(e.message || String(e)))
  }, [id])

  const faire = async () => {
    if (envoi) return
    navigator.vibrate?.(15)
    setEnvoi(true)
    try {
      const r = await donner(id, null)
      setF(r.feuille); setReste(r.reste || 0); setFini('donne')
    } catch (e) { setErreur(e.message || String(e)) }
    finally { setEnvoi(false) }
  }

  if (!id) return <Cadre><Gros ton="bordeaux">Ce lien ne dit pas quelle feuille.</Gros></Cadre>
  if (erreur && !f) return <Cadre><Gros ton="bordeaux">{erreur}</Gros></Cadre>
  if (!f) return <Cadre><Gros ton="ink-mute">Un instant…</Gros></Cadre>

  const etat = etatFeuille(f)
  const nom = propre(f.libelle || f.produit)
  const attendu = qte(f.qty_prevue, f.unite)

  // ---- ce qui est fait ne propose plus rien ----
  if (fini || etat === 'declaree' || etat === 'pas-faite') {
    const dit = fini === 'donne' || (!fini && etat === 'imprimee')
      ? { t: '✓ Donné', s: `${nom} — le pâtissier doit maintenant déclarer.`, c: 'ok' }
      : (fini === 'pas-faite' || etat === 'pas-faite')
        ? { t: 'Rendue à l’économe', s: `${nom} — rien ne sera compté.`, c: 'ink-mute' }
        : { t: '✓ Déclaré', s: `${nom} · ${qte(f.declare_qty, f.unite)}`, c: 'ok' }
    return (
      <Cadre>
        <div className="bg-cream-warm border-2 border-line rounded-3xl p-7 text-center">
          <p className={`text-[26px] font-extrabold text-${dit.c}`}>{dit.t}</p>
          <p className="text-[14px] text-ink-soft mt-2">{dit.s}</p>
          {fini === 'donne' && reste > 0 && (
            <p className="text-[15px] font-bold text-gold mt-4">
              ⚠️ Encore {reste} demande{reste > 1 ? 's' : ''} pour ce gâteau — scanne-les aussi.
            </p>
          )}
          <p className="text-[12px] text-ink-mute mt-6">Tu peux fermer cette page.</p>
        </div>
      </Cadre>
    )
  }

  // ---- l'économe : un seul bouton ----
  if (estEconome) {
    return (
      <Cadre>
        <div className="bg-cream-warm border border-line rounded-3xl p-6">
          <p className="text-[11px] font-extrabold tracking-widest text-ink-mute uppercase">Demande à l’économat</p>
          <h1 className="font-fraunces italic text-[25px] text-ink mt-1 leading-tight">{nom}</h1>
          <p className="text-[15px] text-ink-soft mt-1">pour <b>{attendu}</b></p>
          <p className="text-[12.5px] text-ink-mute mt-3">
            imprimé il y a {depuis(f.imprime_le)}{f.pour ? ` · pour ${propre(f.pour)}` : ''}
          </p>

          <button
            onClick={faire}
            disabled={envoi}
            className="w-full mt-7 rounded-2xl bg-ok text-cream py-5 text-[19px] font-extrabold
                       active:scale-95 transition disabled:opacity-50">
            {envoi ? '…' : '✓ Donné'}
          </button>
          <p className="text-[12px] text-ink-mute text-center mt-3">
            À partir de là, la déclaration est due.
          </p>
          {erreur && <p className="text-[13px] text-bordeaux text-center mt-3">{erreur}</p>}
        </div>
      </Cadre>
    )
  }

  // ---- le pâtissier : on l'emmène à l'écran qui sait tout faire ----
  //
  // ⚠️ LE SCAN N'EST PLUS UNE DEUXIÈME FAÇON DE DÉCLARER (Layla, 2026-09-19 :
  // « j'aimerai simplifier pour tout le monde »). L'écran « c'est fait » gère
  // les cuves, les plaques cuites, le pressage, les ajustements, le verrou des
  // composants et le reste de la crème — des mois de règles. Une page de scan
  // qui déclare toute seule, c'était une deuxième comptabilité, plus pauvre, et
  // la garantie de compter deux fois le même travail.
  //
  // Le QR devient donc un RACCOURCI : il ouvre le bon article, dans le bon
  // écran. Le prix, et je l'ai dit à Layla : le pâtissier doit être connecté —
  // une fois le matin, ça tient 12 h. L'économe, lui, garde son geste sans mot
  // de passe, parce que le sien est simple : donné, ou pas donné.
  // ⚠️ AUCUNE PAGE D'ATTENTE (Layla, 2026-09-20 : « scanne pour déclarer doit
  // t'emmener DIRECT vers la page de c'est fait de cet article »). Une page
  // intermédiaire avec un bouton, c'est un geste de plus au plan de travail —
  // et on en a déjà retiré partout ailleurs.
  //
  // Et il n'y a rien d'autre à proposer : une fournée qu'on n'a pas faite reste
  // simplement due (« c'est systématique gardé »), et « rendue à l'économe » se
  // dit en fin de service dans l'onglet ✍️ À déclarer — pas la main dans la
  // farine.
  return (
    <Cadre>
      <p className="text-[15px] font-bold text-center py-16 text-ink-mute">
        On t’emmène à {nom}…
      </p>
      <CommeSiOnAvaitScanne chemin={cheminDe(f)} />
    </Cadre>
  )
}

/** Emmener, une seule fois, sans rien demander. */
function CommeSiOnAvaitScanne({ chemin }) {
  useEffect(() => {
    navigator.vibrate?.(15)
    // ⚠️ ON EMMÈNE PAR LE CHEMIN ENTIER. Une crème n'est pas au catalogue des
    // articles suivis : la nommer seule ne l'ouvre pas, il faut descendre
    // depuis son gâteau — « Cadre Citron › Crème au beurre › Crème citron ».
    window.location.replace('/?view=fabrication-annexe-2&declarer=1&chemin='
      + encodeURIComponent(JSON.stringify(chemin)))
  }, [chemin])
  return null
}
