// ============================================================
// 🗑 REBUT — ce qu'on jette, et qui l'a jeté.
//
// « Celui qui a la perm des rebuts / crée un onglet rebut » (Layla,
// 2026-09-22), après avoir voulu décider du sort d'un reste de cuve : « 140
// Subleme en rebut ? ou à intégrer dans le reste ».
//
// ⚠️ ODOO A DÉJÀ SA PLACE POUR ÇA, et l'équipe s'en sert tous les jours : huit
// rebuts le jour même, chacun avec son numéro SP/…. Cet écran n'ouvre donc pas
// un deuxième registre — il montre CELUI D'ODOO et sait y écrire. Une table à
// nous, c'aurait été deux vérités qui divergent.
//
// ⚠️ JETER NE SE RATTRAPE PAS depuis l'app : la marchandise sort du stock pour
// de bon. D'où la permission dédiée, et la confirmation qui nomme l'article et
// la quantité.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { Rien } from './FeuilleVisuel'
import { propre, qte } from '../lib/ecranSimple'
import { photoFabAnnexe } from '../lib/fabAnnexe'
import { canRebuts } from '../lib/auth'
import { loadRebuts, parJourRebut } from '../lib/rebuts'
import { nomDuJour } from '../lib/feuilles'

/** Une ligne jetée : ce que c'était, combien, et son numéro chez Odoo. */
function LigneRebut({ r }) {
  return (
    <div className="flex items-center gap-2.5 p-2 mb-1.5 bg-cream-warm border border-line
                    border-l-4 border-l-danger rounded-xl">
      <img src={photoFabAnnexe(r.produit)} alt="" loading="lazy"
        onError={e => { e.currentTarget.style.visibility = 'hidden' }}
        className="w-12 h-12 rounded-lg object-cover bg-cream-deep flex-none" />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold leading-tight text-ink truncate">
          {propre(r.produit)}
        </span>
        <span className="block text-[18px] font-extrabold tabular-nums leading-none text-danger">
          {qte(r.qty, r.unite)}
        </span>
        <span className="block text-[11px] text-ink-mute font-mono truncate">
          {r.name}
          {r.quand ? ` · ${String(r.quand).slice(11, 16)}` : ''}
          {r.motif && r.motif !== 'Lily Gourmet' ? ` · ${r.motif}` : ''}
        </span>
      </span>
    </div>
  )
}

export default function RebutView({ user, onLogout, onNavigate, activeView }) {
  const [rebuts, setRebuts] = useState(null)
  const [erreur, setErreur] = useState('')
  const nav = { user, onLogout, onNavigate, activeView }

  const relire = useCallback(() => {
    loadRebuts(14).then(setRebuts).catch(e => setErreur(e.message || String(e)))
  }, [])
  useEffect(() => { relire() }, [relire])

  // ⚠️ La permission garde l'écran ENTIER, pas seulement le bouton : l'onglet
  // ne s'affiche déjà pas sans elle, mais un lien direct, lui, n'a pas d'onglet.
  if (!canRebuts(user)) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader {...nav} />
        <div className="max-w-[820px] mx-auto px-4 py-10">
          <Rien quoi="Tu n’as pas le droit de jeter." />
        </div>
      </div>
    )
  }

  const jours = parJourRebut(rebuts || [])
  const total = (rebuts || []).length

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      <div className="max-w-[820px] mx-auto px-4 py-5">
        {erreur && (
          <div className="mb-3 rounded-xl bg-danger-bg border border-danger p-3 text-[13px] text-danger">
            {erreur}
          </div>
        )}
        {rebuts === null && !erreur && <Skeleton />}

        {rebuts !== null && !total && (
          <Rien quoi="Rien n’a été jeté ces deux dernières semaines." />
        )}

        {jours.map(j => (
          <div key={j.jour}>
            <div className="flex items-center gap-2 mt-4 mb-1.5">
              <span className="text-[13px] font-extrabold text-ink-soft">
                📅 {nomDuJour(j.jour)}
              </span>
              <span className="text-[12px] text-ink-mute">
                {j.lignes.length} ligne{j.lignes.length > 1 ? 's' : ''}
              </span>
            </div>
            {j.lignes.map(r => <LigneRebut key={r.name} r={r} />)}
          </div>
        ))}

        {/* ⚠️ On ne dit ce chiffre qu'en bas, et sans le commenter : « ce qu'on
            jette » se regarde, ça ne se reproche pas à quelqu'un en haut de
            son écran. */}
        {!!total && (
          <p className="mt-5 text-[12px] text-ink-mute text-center">
            {total} rebut{total > 1 ? 's' : ''} sur 14 jours · tenus par Odoo
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * LE CHOIX DE LA FIN D'UN DISPATCH : garder le reste, ou le jeter.
 *
 * « Je devrais décider ce que j'en fais — par exemple 140 Subleme en rebut ?
 * ou à intégrer dans le reste » (Layla, 2026-09-22).
 *
 * ⚠️ Il ne s'affiche QUE s'il reste quelque chose, et QUE pour qui a le droit
 * de jeter. Sans la permission, l'écran reste exactement comme avant : le
 * reste retourne au frigo, sans qu'on demande.
 */
export function ChoixDuReste({ reste, unite, sur, onJeter, envoi }) {
  if (!(reste > 0) || !onJeter) return null
  return (
    <div className="mt-3 rounded-2xl border border-line bg-cream-warm p-3">
      <div className="text-[13px] text-ink-soft">
        Il t’en reste <b className="text-ink">{qte(reste, unite)}</b> — tu en fais quoi ?
      </div>
      <div className="flex gap-2 mt-2">
        <div className="flex-1 rounded-xl border-[1.5px] border-success bg-success-bg
                        px-3 py-2.5 text-[13.5px] font-bold text-success text-center">
          🧊 Je le garde
        </div>
        <button type="button" onClick={onJeter} disabled={envoi}
          className="flex-1 rounded-xl border-[1.5px] border-danger bg-cream-warm
                     px-3 py-2.5 text-[13.5px] font-bold text-danger disabled:opacity-50">
          🗑 Au rebut
        </button>
      </div>
      <div className="text-[11.5px] text-ink-mute mt-1.5">
        Gardé, il revient demain dans « À finir ». Jeté, il sort du stock{sur ? ` de ${sur}` : ''} pour de bon.
      </div>
    </div>
  )
}
