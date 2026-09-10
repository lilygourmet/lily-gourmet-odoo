// ============================================================
// « Fabrication Annexe 2 », version simplifiée.
//
// Pour des gens qui lisent peu : une photo, un gros chiffre, et rien d'autre.
// Trois règles tenues du début à la fin (Layla, 2026-09-10) :
//   • une photo vaut mieux qu'un nom
//   • un chiffre vaut mieux qu'une phrase
//   • une seule chose à faire par écran
//
// Ce qui a disparu par rapport à l'ancien écran : le mot « tournée », les
// mini/maxi, la jauge, « recette d'origine », « tu n'en as pas besoin
// maintenant », « quantité figée », « en attente de validation ». Tout ce qui
// n'aide pas à faire le geste.
//
// Ce qui reste : le STOCK — « on peut voir si erreur » — et sous chaque gros
// chiffre, ce qu'il veut dire en vrai : « 4 plaques · 2 800 g en tout ».
// ============================================================
import { enClair, enfantsDe, declares, bloquants } from '../lib/fabAnnexe'
import { nb, qte, propre } from '../lib/ecranSimple'

/** La photo d'un article, servie par Odoo. */
const photoDe = nom => '/api/fab-annexe?photo=' + encodeURIComponent(nom)

/**
 * L'accueil : ce qu'il y a à faire, en cases. Une photo, un nom court, et le
 * nombre à faire dans une pastille rouge. Pas de titre de section, pas d'état,
 * pas de mini ni de maxi — c'est le réglage de Layla, pas le travail de
 * l'atelier.
 */
export function CasesAFaire({ articles, onOuvrir }) {
  const liste = articles || []
  if (!liste.length) {
    return (
      <p className="text-center text-[19px] font-bold text-ink-mute py-20">
        Rien à faire pour l'instant
      </p>
    )
  }
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {liste.map(a => (
        <button key={a.produit} onClick={() => onOuvrir(a.produit)}
          className="text-left rounded-2xl border border-cream-deep bg-cream-warm overflow-hidden
                     shadow-sm active:scale-[0.98] transition-transform">
          <div className="relative">
            <img src={photoDe(a.photo || a.produit)} alt="" loading="lazy"
              className="w-full aspect-square object-cover bg-cream-deep" />
            <span className="absolute left-2 top-2 rounded-full bg-danger text-cream
                             px-3 py-1 text-[19px] font-extrabold tabular-nums">
              {nb(Math.round(a.reste || a.tournee || 0))}
            </span>
          </div>
          <div className="px-3 py-2 text-[16px] font-bold leading-tight">
            {propre(a.libelle || a.produit)}
          </div>
        </button>
      ))}
    </div>
  )
}

/**
 * La fiche : combien on en fait, et ce qu'il faut pour ça.
 *
 * Le gros chiffre est la QUANTITÉ, jamais un nombre de tournées. Dessous, la
 * même chose en vrai. Chaque ingrédient porte son stock — pour voir une erreur
 * — et ce qui manque porte son propre bouton « à faire › », parce que c'est à
 * l'atelier de choisir par où commencer.
 */
export function Fiche({ noeud, quantite, onQuantite, faits, onOuvrir, onFait }) {
  const enfants = enfantsDe(noeud)
  const dejaFaits = declares(faits)
  const bloque = bloquants(noeud, dejaFaits)
  const pas = /^(g|kg)$/i.test(String(noeud.unite || '').trim())
    ? (/(^kg$)/i.test(noeud.unite) ? 0.5 : 50) : 1
  const dit = enClair(noeud, quantite)

  return (
    <div>
      <div className="flex items-center gap-3">
        <img src={photoDe(noeud.photo || noeud.produit)} alt="" loading="lazy"
          className="w-16 h-16 rounded-2xl object-cover bg-cream-deep shrink-0" />
        <div className="text-[22px] font-extrabold leading-[1.1]">
          {propre(noeud.libelle || noeud.produit)}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-5">
        <button onClick={() => onQuantite(Math.max(pas, quantite - pas))}
          disabled={quantite <= pas} aria-label="Moins"
          className="w-16 h-16 rounded-3xl border-2 border-cream-deep bg-cream-warm
                     text-[34px] font-extrabold text-bordeaux leading-none disabled:opacity-30">−</button>
        <div className="min-w-[130px] text-center font-extrabold tabular-nums text-[54px] leading-none">
          {nb(quantite)}
        </div>
        <button onClick={() => onQuantite(quantite + pas)} aria-label="Plus"
          className="w-16 h-16 rounded-3xl border-2 border-cream-deep bg-cream-warm
                     text-[34px] font-extrabold text-bordeaux leading-none">+</button>
      </div>
      <div className="text-center text-[15px] text-ink-mute mt-1">
        {noeud.unite === 'u' ? 'à faire' : `${noeud.unite} à faire`}
      </div>
      {dit && <div className="text-center text-[15px] font-bold text-bordeaux mt-0.5">{dit}</div>}

      <div className="mt-5">
        {(enfants || []).map((c, i) => {
          const fait = c.dejaFait > 0 || dejaFaits.includes(c.produit)
          const manque = !c.ok && !fait && c.fabrique
          return (
            <div key={c.produit + i}
              className="flex items-center gap-3 py-3 border-t border-cream-deep">
              <span className={`w-3 h-3 rounded shrink-0 ${manque ? 'bg-danger' : 'bg-success'}`} />
              <span className={`flex-1 min-w-0 text-[17px] ${manque ? 'text-danger font-bold' : ''}`}>
                {propre(c.produit)}
                <span className="block text-[12.5px] text-ink-mute font-normal">
                  {fait ? 'fait à l\'instant' : `en stock ${qte(c.stock, c.unite)}`}
                </span>
              </span>
              {manque
                ? (
                  <button onClick={() => onOuvrir(c.produit)}
                    className="shrink-0 rounded-xl border-2 border-danger text-danger
                               px-3 py-2 text-[14px] font-extrabold">à faire ›</button>
                )
                : <span className="shrink-0 text-[19px] font-extrabold tabular-nums">
                  {qte(c.besoin, c.unite)}
                </span>}
            </div>
          )
        })}
      </div>

      <button onClick={onFait} disabled={bloque.length > 0}
        className={`w-full mt-6 rounded-2xl py-5 text-[20px] font-extrabold
          ${bloque.length ? 'bg-cream-deep text-ink-mute' : 'bg-success text-cream'}`}>
        C'est fait
      </button>
    </div>
  )
}

/** Le fil : « Tiramisu 15 cm › Biscuit cuillère ». Deux mots, pas cinq niveaux. */
export function Fil({ chemin, onRetour }) {
  if (!chemin.length) return null
  return (
    <button onClick={onRetour} className="text-[13px] text-ink-mute font-bold mb-3 text-left">
      ← {chemin.map(propre).join(' › ')}
    </button>
  )
}
