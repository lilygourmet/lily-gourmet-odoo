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
import { qte, propre, nb, uniteAffichee, enGrammes, enUnite } from '../lib/ecranSimple'

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
  onImprimer, onFermer,
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
          <button onClick={onFermer}
            className="ml-auto bg-cream-warm rounded-lg px-3 py-1.5 text-[12.5px]">fermer</button>
        </div>

        <div className="px-4 pt-3 flex-shrink-0">
          <div className="grid grid-cols-2 gap-1.5 bg-cream-deep rounded-2xl p-1">
            {[['seule', 'Juste cette fiche', "comme d'habitude"],
              ['tout', 'Tout ce qui manque', 'la cascade entière']].map(([k, t, s]) => (
              <button key={k} onClick={() => onMode(k)} aria-pressed={mode === k}
                className={`rounded-xl py-2.5 px-2 text-[13.5px] font-bold leading-tight
                  ${mode === k ? 'bg-cream-warm text-bordeaux shadow-sm' : 'text-ink-mute'}`}>
                {t}<span className="block font-normal text-[11.5px] opacity-80">{s}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 flex-1 overflow-y-auto overscroll-contain">
          {visibles.map(f => {
            const on = seule || !!coches[f.produit]
            const p = seule ? 0 : profondeurDe(f)
            const tape = f.produit in tapes
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
                  <span className={`block text-[14.5px] leading-tight
                    ${on ? 'font-bold' : 'text-ink-mute'}`}>{propre(f.libelle)}</span>
                  <span className="block text-[12px] text-ink-mute">
                    {f.stock > 0.001 ? `il en reste ${qte(f.stock, f.unite)}` : 'rien en stock'}
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
export function FeuillesImpression({ feuilles }) {
  return (
    <div className="print-area hidden print:block">
      {feuilles.map(f => <Feuille key={f.produit} f={f} />)}
    </div>
  )
}

function Feuille({ f }) {
  const u = uniteAffichee(f.unite)
  return (
    <article className="feuille-impr">
      {/* D'où vient cette feuille : sur le plan de travail, « Crème au beurre »
          ne dit ni laquelle ni pour quel gâteau. */}
      {f.chemin.length > 1 && (
        <div className="fi-chemin">{f.chemin.map(propre).join(' › ')}</div>
      )}
      <h2 className="fi-titre">{propre(f.libelle)}</h2>
      <div className="fi-qty">{qte(f.qty, f.unite)} à faire</div>

      <div className="fi-lab">Ce qu'il faut</div>
      {f.ingredients.map((i, n) => (
        <div key={i.produit + n} className="fi-ing">
          <span>{propre(i.produit)}</span>
          <b>{qte(i.besoin, i.unite)}</b>
        </div>
      ))}

      {/* LE CADRE À REMPLIR. Le stock d'avant est imprimé, ce qui est sorti se
          note au crayon. Le nom est répété en gros : « oui je ressaisis le
          soir » (Layla, 2026-09-14) — il faut retrouver l'écran vite. */}
      <div className="fi-cadre">
        <div className="fi-lab">À remplir après la fournée</div>
        <div className="fi-cadre-nom">{propre(f.libelle)}</div>
        <div className="fi-champ">
          <span>En stock avant de commencer</span>
          <b>{qte(f.stock, f.unite)}</b>
        </div>
        <div className="fi-champ">
          <span>Il en est sorti</span>
          <i className="fi-trait" /><b className="fi-u">{u}</b>
        </div>
        <div className="fi-champ fi-duo">
          <span>Par</span><i className="fi-trait" />
          <span>à</span><i className="fi-trait" />
        </div>
      </div>
    </article>
  )
}
