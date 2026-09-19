// ============================================================
// CE QUE LE QR OUVRE.
//
// Deux papiers, deux gestes, une seule page — c'est l'adresse qui tranche :
//   • `?feuille=…&don=1` → la demande à l'économat, qu'il a dans la main :
//     un seul bouton, « ✓ Donné ». C'est ce geste qui rend la déclaration due.
//   • `?feuille=…`       → la feuille de recette du pâtissier : « combien ça
//     t'a sorti ? », le chiffre attendu déjà écrit.
//
// ⚠️ AUCUNE CONNEXION. Les mains sont farineuses, on ne tape pas un mot de
// passe au plan de travail. Le QR porte un jeton qui identifie LA FEUILLE, et
// l'app sait déjà qui c'est : c'est elle qui a imprimé, et l'économe a donné.
// L'identité vient du comptoir, pas d'un écran de connexion.
//
// ⚠️ Cette page ne parle JAMAIS à Supabase en direct : tout passe par
// /api/fab-annexe, qui tient la clé de service et vérifie le jeton.
// ============================================================

import { useState, useEffect } from 'react'
import { lireFeuille, donner, declarer, pasFaite, etatFeuille, depuis } from '../lib/feuilles'
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
  const [sortie, setSortie] = useState('')
  const [fini, setFini] = useState('')

  useEffect(() => {
    lireFeuille(id)
      .then(x => {
        setF(x)
        // Le chiffre attendu est déjà écrit : il ne le corrige que s'il diffère.
        setSortie(x?.qty_prevue != null ? String(x.qty_prevue) : '')
      })
      .catch(e => setErreur(e.message || String(e)))
  }, [id])

  const faire = async (quoi) => {
    if (envoi) return
    navigator.vibrate?.(15)
    setEnvoi(true)
    try {
      if (quoi === 'donner') { const r = await donner(id, null); setF(r.feuille); setFini('donne') }
      else if (quoi === 'pas-faite') { const r = await pasFaite(id); setF(r.feuille); setFini('pas-faite') }
      else {
        const q = Number(String(sortie).replace(',', '.'))
        if (!(q > 0)) { setErreur('Écris d’abord combien ça t’a sorti.'); setEnvoi(false); return }
        const r = await declarer(id, q)
        setF(r.feuille); setFini('declare')
      }
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
        ? { t: 'Noté : pas faite', s: `${nom} — rien ne sera compté.`, c: 'ink-mute' }
        : { t: '✓ Déclaré', s: `${nom} · ${qte(f.declare_qty, f.unite)}`, c: 'ok' }
    return (
      <Cadre>
        <div className="bg-cream-warm border-2 border-line rounded-3xl p-7 text-center">
          <p className={`text-[26px] font-extrabold text-${dit.c}`}>{dit.t}</p>
          <p className="text-[14px] text-ink-soft mt-2">{dit.s}</p>
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
            onClick={() => faire('donner')}
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

  // ---- le pâtissier : combien ça t'a sorti ? ----
  const pasEncoreDonne = etat === 'imprimee'
  return (
    <Cadre>
      <div className="bg-cream-warm border border-line rounded-3xl p-6">
        <h1 className="font-fraunces italic text-[25px] text-ink leading-tight">{nom}</h1>
        {f.donne_le
          ? <p className="text-[12.5px] text-ink-mute mt-1">donné il y a {depuis(f.donne_le)}</p>
          : <p className="text-[12.5px] text-gold mt-1">l’économe n’a pas encore validé — tu peux quand même déclarer</p>}

        <p className="text-[11px] font-extrabold tracking-widest text-ink-soft uppercase mt-6">
          Combien ça t’a sorti ?
        </p>
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text" inputMode="decimal"
            value={sortie}
            onChange={e => setSortie(e.target.value.replace(/[^\d.,]/g, ''))}
            aria-label="Quantité sortie"
            className="flex-1 min-w-0 text-right text-[30px] font-extrabold tabular-nums
                       rounded-2xl px-4 py-3 border-2 border-bordeaux bg-cream" />
          <span className="text-[19px] font-bold text-ink-soft">{f.unite || ''}</span>
        </div>
        <p className="text-[12px] text-ink-mute mt-2">
          Prévu : {attendu}. Corrige seulement si c’est différent.
        </p>

        <button
          onClick={() => faire('declarer')}
          disabled={envoi}
          className="w-full mt-6 rounded-2xl bg-bordeaux text-cream py-5 text-[19px] font-extrabold
                     active:scale-95 transition disabled:opacity-50">
          {envoi ? '…' : 'C’est fait'}
        </button>

        {/* ⚠️ LA PORTE DE SORTIE. Sans elle, ils cesseraient de passer par
            l'économe — et on perdrait la trace qu'on cherche à construire. */}
        <button
          onClick={() => faire('pas-faite')}
          disabled={envoi}
          className="w-full mt-2 rounded-2xl border border-line text-ink-soft py-3 text-[14px]
                     font-bold active:scale-95 transition disabled:opacity-50">
          Pas faite
        </button>

        {pasEncoreDonne && (
          <p className="text-[11.5px] text-ink-mute text-center mt-4">
            Cette feuille n’est pas encore passée par l’économe.
          </p>
        )}
        {erreur && <p className="text-[13px] text-bordeaux text-center mt-3">{erreur}</p>}
      </div>
    </Cadre>
  )
}
