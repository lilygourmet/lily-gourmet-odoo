// ============================================================
// IMPRIMER LA FOURNÉE.
//
// Le 🖨 garde ses deux métiers (Layla, 2026-09-14) :
//   • « Juste cette fiche » — ce que le bouton faisait jusqu'ici ;
//   • « Tout ce qui manque » — une feuille par chose à fabriquer, de la plus
//     profonde à la tête, parce qu'on ne monte pas le crunchy avant d'avoir
//     le crumble.
//
// Deux écrans dans ce fichier : le PANNEAU qui demande quoi imprimer, et les
// FEUILLES elles-mêmes, invisibles à l'écran et seules visibles sur le papier.
// ============================================================
import { Fragment } from 'react'
import { createPortal } from 'react-dom'
import { qte, propre, nb, uniteAffichee, enGrammes, enUnite } from '../lib/ecranSimple'
import { assezEnStock, aDemander, aBesoinDeLEconomat } from '../lib/feuillesAImprimer'

/**
 * Le panneau « Tu imprimes quoi ? ».
 *
 * Les quantités se corrigent ICI, avant d'imprimer — « des fois j'aime bien
 * modifier les quantités avant » (Layla). Elles s'écrivent dans la même table
 * que la fiche : changer la tête refait tout le dessous, un chiffre tapé à la
 * main se fige, et le ↺ le rend à l'app. Aucune règle en double.
 */
export function ChoixImpression({
  feuilles, mode, onMode, coches, onCoche, tapes, onQuantite, onRendre,
  onImprimer, onFermer, sous,
}) {
  const seule = mode === 'seule'
  const visibles = seule ? feuilles.slice(-1) : feuilles
  const combien = seule ? 1 : feuilles.filter(f => coches[f.produit]).length
  // La tête est la DERNIÈRE feuille : c'est elle qui donne la profondeur.
  const profondeurDe = f => Math.max(0, f.chemin.length - 1)

  return (
    <div className="fixed inset-0 z-[70] bg-ink/40 flex items-start justify-center p-3 pt-10"
      onPointerDown={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-cream rounded-2xl w-full max-w-[520px] shadow-2xl
                      overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-4 pt-4 pb-3 flex-shrink-0 border-b border-cream-deep">
          <b className="text-[16px]">🖨 Tu imprimes quoi ?</b>
          {!!sous && <span className="text-[12.5px] text-ink-mute">{sous}</span>}
          <button onClick={onFermer}
            className="ml-auto bg-cream-warm rounded-lg px-3 py-1.5 text-[12.5px]">fermer</button>
        </div>

        {/* ⚠️ LES DEUX FAÇONS N'EXISTENT QUE DEPUIS UNE FICHE. Quand le panneau
            s'ouvre depuis plusieurs gâteaux cochés, il n'y a rien à choisir :
            c'est leur fournée entière ou rien. */}
        {!!onMode && (
        <div className="px-4 pt-3 flex-shrink-0">
          <div className="grid grid-cols-2 gap-1.5 bg-cream-deep rounded-2xl p-1">
            {[['seule', 'Juste cette fiche', 'cette recette seule'],
              ['tout', 'Tout ce qui manque', 'la cascade entière']].map(([k, t, s]) => (
              <button key={k} onClick={() => onMode(k)} aria-pressed={mode === k}
                className={`rounded-xl py-2.5 px-2 text-[13.5px] font-bold leading-tight
                  ${mode === k ? 'bg-cream-warm text-bordeaux shadow-sm' : 'text-ink-mute'}`}>
                {t}<span className="block font-normal text-[11.5px] opacity-80">{s}</span>
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="px-4 py-3 flex-1 overflow-y-auto overscroll-contain">
          {visibles.map(f => {
            const on = seule || !!coches[f.produit]
            const p = seule ? 0 : profondeurDe(f)
            const tape = f.produit in tapes
            // ⚠️ IL Y EN A DÉJÀ ASSEZ : rien à faire, donc rien à imprimer.
            // « ce qui est déjà en stock s'écrit en vert et non cliqué »
            // (Layla, 2026-09-15) — même langage que les cases de « À faire ».
            // Sur ce qui MANQUE, jamais sur la quantité proposée : quand il y
            // en a assez, l'app propose quand même une fournée (pour en faire
            // d'avance), et la ligne serait restée rouge et cochée.
            const assez = assezEnStock(f)
            return (
              <div key={f.produit}
                className="flex items-center gap-2.5 py-2 border-t border-cream-deep first:border-0"
                style={{ paddingLeft: p * 18 }}>
                <button type="button" role="checkbox" aria-checked={on} disabled={seule}
                  aria-label={propre(f.libelle)}
                  onClick={() => onCoche(f.produit, !on)}
                  className={`w-5 h-5 rounded-md border-2 shrink-0 grid place-items-center
                    text-[13px] font-extrabold leading-none
                    ${on ? 'bg-bordeaux border-bordeaux text-cream' : 'border-cream-deep text-transparent'}`}>
                  ✓
                </button>
                <span className="flex-1 min-w-0">
                  <span className={`block text-[14.5px] leading-tight font-bold
                    ${assez ? 'text-ok' : on ? '' : 'text-ink-mute font-normal'}`}>
                    {propre(f.libelle)}
                  </span>
                  <span className={`block text-[12px] ${assez ? 'text-ok' : 'text-ink-mute'}`}>
                    {f.stock > 0.001 ? `il en reste ${qte(f.stock, f.unite)}` : 'rien en stock'}
                    {/* Sert à deux endroits : on additionne, et on le dit. */}
                    {f.pour.length > 1 && (
                      <b className="text-bordeaux"> · pour {f.pour.length} recettes</b>
                    )}
                  </span>
                </span>
                {/* ⚠️ On tape des GRAMMES même quand Odoo compte en kilos —
                    même convention que partout ailleurs sur cet écran. */}
                <input
                  type="text" inputMode="decimal"
                  aria-label={`Quantité de ${propre(f.libelle)}`}
                  value={nb(enGrammes(f.qty, f.unite))}
                  onChange={e => {
                    const v = Number(String(e.target.value).replace(/[^\d.,]/g, '').replace(',', '.'))
                    onQuantite(f.produit, enUnite(Number.isFinite(v) ? Math.max(0, v) : 0, f.unite))
                  }}
                  className={`w-[76px] text-right text-[15px] font-bold tabular-nums rounded-lg
                    px-2 py-1.5 border-2 bg-cream-warm
                    ${tape ? 'border-bordeaux' : 'border-cream-deep'}
                    ${on ? '' : 'opacity-50'}`} />
                <span className="text-[12px] font-bold text-ink-mute w-3">
                  {uniteAffichee(f.unite)}
                </span>
                <button type="button" onClick={() => onRendre(f.produit)}
                  aria-label={`Rendre le chiffre proposé pour ${propre(f.libelle)}`}
                  className={`text-bordeaux text-[15px] px-0.5 ${tape ? '' : 'invisible'}`}>↺</button>
              </div>
            )
          })}
        </div>

        <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-cream-deep">
          <button onClick={onImprimer} disabled={!combien}
            className="w-full rounded-2xl bg-bordeaux text-cream py-3.5 text-[16px]
                       font-bold disabled:opacity-40">
            {combien <= 1 ? 'Imprimer 1 feuille' : `Imprimer ${combien} feuilles`}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * LES FEUILLES. Invisibles à l'écran, seules visibles sur le papier.
 *
 * Une par article, une par page — « une feuille par article et que ça fit en
 * une page » (Layla). Chacune dit d'où elle vient, ce qu'il faut peser, et se
 * termine par le cadre à remplir au crayon.
 */
export function FeuillesImpression({ feuilles, sortie }) {
  // ⚠️ POSÉES DIRECTEMENT DANS <body>, par un portail. C'est ce qui permet
  // « chaque recette sur une page » (Layla, 2026-09-15) : le CSS d'impression
  // retire alors tout le reste du document (`display: none`) au lieu de le
  // rendre seulement invisible, et les feuilles coulent dans le flux normal.
  // Dans l'ancienne façon, la zone imprimée était en position ABSOLUE — et un
  // bloc en position absolue ne se pagine pas : tout s'entassait sur une page.
  // La tête donne son nom et son nombre aux demandes d'économat : « pour
  // Cheesecake Exotique indiv · 80 pièces ».
  const tete = (feuilles || [])[(feuilles || []).length - 1]
  return createPortal(
    <div className="print-feuilles">
      {(feuilles || []).map(f => (
        <Fragment key={f.produit}>
          {/* ⚠️ LA DEMANDE PASSE AVANT LA RECETTE : on ne fabrique pas ce qu'on
              n'a pas encore été chercher. Les deux feuilles se suivent, pour
              qu'on prenne la crème au moment de faire la crème (Layla). */}
          {aBesoinDeLEconomat(f) && <FeuilleEconomat f={f} tete={tete} />}
          <Feuille f={f} />
        </Fragment>
      ))}
      {sortie && <FeuilleSortie />}
    </div>,
    document.body,
  )
}

/**
 * LA DEMANDE À L'ÉCONOMAT — le papier qu'on tend à l'économe.
 *
 * Rien que ce que l'annexe ne fabrique pas elle-même, avec une colonne vide où
 * il note ce qu'il a servi, et la signature du PÂTISSIER en bas : c'est lui qui
 * a pris (Layla, 2026-09-16).
 *
 * Une feuille par recette, « pour l'instant » : on prend la crème au moment de
 * faire la crème, plutôt que tout sortir d'un coup en début de journée.
 */
function FeuilleEconomat({ f, tete }) {
  return (
    <article className="feuille-impr feuille-economat">
      <p className="fe-lab">Demande à l'économat</p>
      <h2 className="fe-titre">{propre(f.libelle)}</h2>
      <p className="fe-qty">pour {qte(f.qty, f.unite)}</p>
      {tete && tete.produit !== f.produit && (
        <p className="fe-pour">{propre(tete.libelle)} · {qte(tete.qty, tete.unite)}</p>
      )}

      <div className="fe-sep" />
      <div className="fe-ligne">
        <span>Demandé par</span><i />
        <span>le</span><i className="fe-court" />
      </div>

      <table className="fe-table">
        <thead>
          <tr>
            <th>Ce qu'il faut</th>
            <th className="fe-n">Quantité</th>
            <th className="fe-servi">Servi</th>
          </tr>
        </thead>
        <tbody>
          {aDemander(f).map((i, n) => (
            <tr key={i.produit + n}>
              <td>{propre(i.produit)}</td>
              <td className="fe-n">{qte(i.besoin, i.unite)}</td>
              <td className="fe-servi" />
            </tr>
          ))}
        </tbody>
      </table>

      <div className="fe-sign">
        <div className="fe-case"><b>Signature du pâtissier</b><i /></div>
      </div>
    </article>
  )
}

/**
 * LA FEUILLE DE SORTIE DE STOCK, à remplir au stylo.
 *
 * Une par recette : un seul nom, un seul signataire (Layla, 2026-09-15).
 *
 * ⚠️ ELLE N'APPARTIENT À AUCUN ARTICLE — « non à l'extérieur de l'article, il
 * n'est pas lié à l'article » (Layla). On l'imprime depuis l'accueil, par
 * paquets, et les feuilles attendent à côté du congélateur. La recette
 * s'écrit donc à la main, comme le reste.
 */
function FeuilleSortie() {
  return (
    <article className="feuille-impr feuille-sortie">
      <h2 className="fs-titre">Sortie de stock</h2>

      <div className="fs-entete">
        <div className="fs-champ fs-grand"><b>Pour quelle recette</b><i /></div>
        <div className="fs-duo">
          <div className="fs-champ"><b>Nom de l'employé</b><i /></div>
          <div className="fs-champ fs-court"><b>Date</b><i /></div>
        </div>
      </div>

      <table className="fs-table">
        <thead>
          <tr><th>Ce qui a été pris</th><th className="fs-qte">Quantité</th></tr>
        </thead>
        <tbody>
          {Array.from({ length: 14 }, (_, n) => (
            <tr key={n}><td /><td className="fs-qte" /></tr>
          ))}
        </tbody>
      </table>

      <div className="fs-signature">
        <div className="fs-case"><b>Signature</b><i /></div>
      </div>
    </article>
  )
}

function Feuille({ f }) {
  const u = uniteAffichee(f.unite)
  return (
    <article className="feuille-impr">
      {/* 1. D'OÙ VIENT CETTE FEUILLE. Sur le plan de travail, « Crème au
             beurre » ne dit ni laquelle ni pour quel gâteau. */}
      <header className="fi-tete">
        {f.chemin.length > 1 && (
          <div className="fi-chemin">{f.chemin.slice(0, -1).map(propre).join(' › ')}</div>
        )}
        <h2 className="fi-titre">{propre(f.libelle)}</h2>
      </header>

      {/* 2. LA QUANTITÉ, seule au milieu de sa bande. C'est le chiffre qu'on
             vient chercher des yeux depuis l'autre bout du labo. */}
      <div className="fi-bande">
        <span className="fi-bande-lab">À faire</span>
        <span className="fi-bande-qty">{qte(f.qty, f.unite)}</span>
      </div>

      {/* 3. OÙ VA CETTE FOURNÉE, quand elle sert à plus d'un endroit. Sans
             cette ligne, le pâtissier fait 7 270 g de crème citron sans savoir
             pourquoi — et la prochaine fois il n'en refait que 3 480.
             « soit tu additionnes les mêmes crèmes en laissant une
             explication » (Layla, 2026-09-15). */}
      {f.pour.length > 1 && (
        <div className="fi-detail">
          {f.pour.map((p, n) => (
            <div key={p.nom + n}>
              <b>{qte(p.qty, f.unite)}</b> pour {propre(p.nom)}
            </div>
          ))}
        </div>
      )}

      {/* 4. LA RECETTE. Des pointillés jusqu'au chiffre : on suit la ligne du
             doigt sans se tromper de rang. */}
      <section className="fi-recette">
        <div className="fi-lab">Ce qu'il faut</div>
        {f.ingredients.map((i, n) => (
          <div key={i.produit + n} className="fi-ing">
            <span>{propre(i.produit)}</span>
            <i className="fi-pts" />
            <b>{qte(i.besoin, i.unite)}</b>
          </div>
        ))}
      </section>

      {/* 5. LE TABLEAU À REMPLIR, en bas de page. « Juste des chiffres à
             remplir, un tableau plus simple » (Layla, 2026-09-15) : ni titre,
             ni cadre, ni nom répété — il est déjà en haut de la feuille.
             ⚠️ TOUT est vide, « En stock » compris : « je ne veux pas voir la
             quantité de stock dans le carré du bas », « je veux l'écrire
             moi-même » (Layla, 2026-09-16). Le chiffre d'Odoo s'affiche encore
             à l'ÉCRAN, dans le panneau « Tu imprimes quoi ? » — c'est sur le
             PAPIER qu'il ne doit pas apparaître, pour être compté à la main. */}
      <table className="fi-table">
        <thead>
          <tr>
            <th>En stock</th>
            <th>Sorti ({u})</th>
            <th>Par</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td /><td /><td /><td />
          </tr>
        </tbody>
      </table>
    </article>
  )
}
