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
import { propre, qte } from '../lib/ecranSimple'
import { feuillesDuJour, aDeclarer, aDonner, donner, declarer, pasFaite, depuis, lienFeuille }
  from '../lib/feuilles'

/** Rouge au-delà de deux heures : 40 min c'est normal, 5 h se voit de loin. */
const enRetard = f => Date.now() - Date.parse(f.donne_le || 0) > 2 * 3600 * 1000

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
  const [saisie, setSaisie] = useState({})

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

  const agir = async (f, quoi) => {
    if (busy) return
    navigator.vibrate?.(15)
    setBusy(f.id)
    try {
      if (quoi === 'donner') await donner(f.id, user?.id)
      else if (quoi === 'pas-faite') await pasFaite(f.id)
      else {
        const q = Number(String(saisie[f.id] ?? f.qty_prevue ?? '').replace(',', '.'))
        if (!(q > 0)) { toast('Écris d’abord combien ça a sorti.'); setBusy(null); return }
        await declarer(f.id, q)
      }
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
              {f.donne_par ? `DONNÉ IL Y A ${depuis(f.donne_le).toUpperCase()}`
                : `RIEN À DEMANDER · IMPRIMÉ IL Y A ${depuis(f.imprime_le).toUpperCase()}`}
            </span>
            <div className="text-[15px] font-bold text-ink">{propre(f.libelle || f.produit)}</div>
            <div className="text-[12px] text-ink-mute">
              attendu {qte(f.qty_prevue, f.unite)}{f.pour ? ` · pour ${propre(f.pour)}` : ''}
            </div>

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <input
                type="text" inputMode="decimal"
                aria-label={`Quantité sortie de ${propre(f.libelle || f.produit)}`}
                value={saisie[f.id] ?? (f.qty_prevue ?? '')}
                onChange={e => setSaisie(s => ({ ...s, [f.id]: e.target.value.replace(/[^\d.,]/g, '') }))}
                className="w-[104px] text-right text-[17px] font-extrabold tabular-nums
                           rounded-xl px-3 py-2 border-2 border-bordeaux bg-cream" />
              <span className="text-[13px] font-bold text-ink-mute">{f.unite || ''}</span>
              <button
                onClick={() => agir(f, 'declarer')} disabled={busy === f.id}
                className="rounded-full bg-bordeaux text-cream px-5 py-2 text-[13px] font-bold
                           active:scale-95 transition disabled:opacity-50">
                {busy === f.id ? '…' : 'Déclarer'}
              </button>
              <button
                onClick={() => agir(f, 'pas-faite')} disabled={busy === f.id}
                className="rounded-full border border-line text-ink-soft px-4 py-2 text-[13px]
                           font-bold active:scale-95 transition disabled:opacity-50">
                Pas faite
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
