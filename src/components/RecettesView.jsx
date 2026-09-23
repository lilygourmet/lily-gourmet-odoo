// ============================================================
// RECETTES — l'écran du chef.
//
// « Le chef veut vérifier les recettes si elles sont bonnes avant de les
// faire » (Layla, 2026-09-23). Puis, quand je lui avais fait un écran où l'on
// corrigeait chaque ligne séparément : « non, les recettes s'affichent, je ne
// change rien. Je vois les quantités de chaque chose. Si j'ai l'habitude de
// bosser avec 1 000 g de sucre, je vais modifier ça et la suite suit, pour
// voir le ratio avec les autres. »
//
// ⚠️ C'EST UNE ÉCHELLE, PAS UNE CORRECTION. On ne touche pas à une ligne : on
// RÈGLE LA RECETTE ENTIÈRE à partir de celle qu'on connaît par cœur. Mettre
// 1 000 g de sucre là où Odoo en écrit 250, c'est lire toute la recette fois
// quatre — et voir d'un coup ce que ça fait aux autres ingrédients.
//
// ⚠️ ON NE DÉCLARE RIEN ICI, ET ON N'ÉCRIT RIEN DANS ODOO. Pas de bouton
// « c'est fait », pas de feuille, pas d'ordre de fabrication. C'est ce qui
// rend cet écran sans danger, et c'est le choix de Layla.
//
// ⚠️ ET IL NE DOIT PAS RESSEMBLER À FABRICATION ANNEXE 2 (Layla : « des
// fenêtres plus petites, un affichage différent, sans photo comme À
// déclarer »). Deux écrans jumeaux dont un seul engage la production, c'est
// une faute qui finit par arriver.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { loadToutFabAnnexe, loadArticleFabAnnexe, parGateauMere, noeudDuChemin,
  defautDe, ingredientsPour } from '../lib/fabAnnexe'
import { Clavier } from './FabAnnexe2Simple'
import { quantitePour } from '../lib/recettes'
import { propre, qte, uniteAffichee, enGrammes, enUnite } from '../lib/ecranSimple'

/** Une ligne de la liste : le nom, son unité, rien d'autre. */
function LigneArticle({ a, onOuvrir }) {
  return (
    <button
      onClick={() => onOuvrir(a.produit)}
      className="w-full flex items-center gap-2 bg-cream-warm border border-line border-l-4
                 border-l-gold rounded-xl px-3 py-2 mb-1 text-left active:bg-cream-deep transition">
      <span className="flex-1 min-w-0 text-[14px] font-bold text-ink truncate">
        {propre(a.libelle || a.produit)}
      </span>
      <span className="flex-none text-[11.5px] text-ink-mute">{uniteAffichee(a.unite)}</span>
      <span aria-hidden="true" className="flex-none text-[13px] text-bordeaux font-black">›</span>
    </button>
  )
}

/**
 * Une ligne d'ingrédient. Toucher sa quantité, c'est refaire TOUTE la recette
 * autour d'elle — pas corriger cette ligne-là.
 *
 * ⚠️ LE MÊME CLAVIER QUE FABRICATION ANNEXE 2 (Layla, 2026-09-23 : « la
 * manière d'insérer les chiffres n'est pas fluide, je veux que ce soit comme
 * sur Fabrication Annexe 2 »). Un champ de texte sur un téléphone, c'est le
 * clavier du système qui monte, qui cache la moitié de l'écran et qui ne sait
 * pas que le premier chiffre tapé doit REMPLACER la valeur proposée. On
 * réutilise donc son clavier, tel quel : même geste partout, et une correction
 * de comportement les corrige tous.
 */
function LigneIngredient({ l, onOuvrirClavier, onDescendre }) {
  return (
    <div className="flex items-center gap-2 bg-cream-warm border border-line rounded-xl
                    px-3 py-1.5 mb-1">
      <span className="flex-1 min-w-0 text-[13.5px] font-bold text-ink truncate">
        {propre(l.produit)}
      </span>
      <button onClick={onOuvrirClavier}
        aria-label={`Quantité de ${propre(l.produit)}`}
        className="flex-none text-[14px] font-black tabular-nums text-ink
                   border-b border-dashed border-ink-mute/50">
        {qte(l.besoin, l.unite)}
      </button>
      {/* Une préparation se descend : sa recette à elle est un écran plus bas. */}
      {l.fabrique && (
        <button onClick={onDescendre} aria-label={`Voir la recette de ${propre(l.produit)}`}
          className="flex-none text-[15px] text-bordeaux font-black px-1">›</button>
      )}
    </div>
  )
}

export default function RecettesView({ user, onLogout, onNavigate, activeView }) {
  const [tout, setTout] = useState(null)
  const [cherche, setCherche] = useState('')
  const [erreur, setErreur] = useState('')
  // L'article ouvert, sa cascade, et l'échelle à laquelle on la lit.
  const [brut, setBrut] = useState(null)
  const [chemin, setChemin] = useState([])
  const [quantites, setQuantites] = useState({})
  // Ce que le clavier est en train de régler : null, ou la ligne visée.
  // `null` pour l'article de tête — c'est lui qu'on règle alors directement.
  const [clavier, setClavier] = useState(null)

  useEffect(() => {
    loadToutFabAnnexe().then(setTout).catch(e => setErreur(e.message || String(e)))
  }, [])

  const ouvrir = useCallback(async produit => {
    navigator.vibrate?.(10)
    setErreur('')
    setBrut(null)
    setChemin([produit])
    // ⚠️ ON REPART DE LA RECETTE D'ODOO à chaque ouverture : le chef compare
    // toujours à elle, jamais à l'échelle qu'il avait réglée la veille.
    setQuantites({})
    try {
      const a = await loadArticleFabAnnexe(produit)
      if (!a) { setErreur(`« ${propre(produit)} » n'a pas de recette lisible.`); setChemin([]); return }
      setBrut(a)
    } catch (e) {
      setErreur(e.message || String(e))
      setChemin([])
    }
  }, [])

  const fermer = () => { setChemin([]); setBrut(null); setQuantites({}); setClavier(null) }

  const nav = { user, onLogout, onNavigate, activeView }

  // ---------- LA FICHE ----------
  if (chemin.length) {
    const { noeud } = brut ? noeudDuChemin(brut, chemin, quantites) : { noeud: null }
    // ⚠️ CE QUE DIT ODOO SE LIT SUR LA RECETTE NON RÉGLÉE. Le prendre sur le
    // nœud courant, c'était le voir suivre l'échelle : « la recette d'Odoo est
    // pour 20 u » juste après avoir demandé 20 — et plus moyen d'y revenir.
    const { noeud: origine } = brut ? noeudDuChemin(brut, chemin, {}) : { noeud: null }
    const parOdoo = origine ? defautDe(origine) : 0
    const q = noeud ? (quantites[noeud.produit] ?? parOdoo) : 0
    const lignes = noeud ? ingredientsPour(noeud, q) : []
    const regle = noeud && q !== parOdoo

    const poser = v => setQuantites(x => ({ ...x, [noeud.produit]: v }))
    // Toucher un ingrédient, c'est régler la recette entière sur lui.
    const echelleDepuis = (l, voulu) => {
      const n = quantitePour({ quantite: q, besoinActuel: l.besoin, besoinVoulu: voulu })
      if (n !== null) poser(n)
    }

    return (
      <div className="min-h-screen bg-cream">
        <div className="print:hidden"><AppHeader {...nav} /></div>
        <div className="max-w-[620px] mx-auto px-4 py-4">
          <button onClick={() => (chemin.length > 1 ? setChemin(chemin.slice(0, -1)) : fermer())}
            className="print:hidden text-[13px] text-bordeaux font-bold mb-3">
            ← {chemin.length > 1 ? propre(chemin[chemin.length - 2]) : 'Toutes les recettes'}
          </button>

          {!brut && <Skeleton />}
          {brut && !noeud && (
            <p className="text-[13.5px] text-ink-soft">Cette étape n’est plus dans la recette.</p>
          )}

          {noeud && (
            <>
              <h1 className="font-fraunces italic text-[21px] text-ink leading-tight">
                {propre(noeud.libelle || noeud.produit)}
              </h1>

              <div className="flex items-center gap-2 mt-3">
                <span className="text-[12.5px] text-ink-soft">pour</span>
                <button onClick={() => setClavier({ tete: true })} id="qte"
                  aria-label="Quantité à faire"
                  className="bg-cream-warm border border-line rounded-lg px-3 py-1.5
                             text-[17px] font-black tabular-nums">
                  {qte(q, noeud.unite)}
                </button>
              </div>

              {/* ⚠️ D'OÙ L'ON EST PARTI, TOUJOURS ÉCRIT. Une recette lue à une
                  autre échelle reste juste ; oublier de quelle fournée elle
                  vient, c'est se tromper de moitié sans s'en apercevoir. */}
              {regle && (
                <p className="text-[12px] text-ink-mute mt-1.5">
                  La recette d’Odoo est pour {qte(parOdoo, noeud.unite)} ·{' '}
                  <button onClick={() => poser(parOdoo)}
                    className="print:hidden text-bordeaux font-bold underline">y revenir</button>
                </p>
              )}

              <p className="text-[11.5px] text-ink-mute mt-3 mb-1.5">
                Touche une quantité : toute la recette se remet à cette échelle.
              </p>

              {!lignes.length && (
                <p className="text-[13.5px] text-ink-soft">
                  Aucun ingrédient : Odoo n’a pas de recette pour ça.
                </p>
              )}
              {lignes.map((l, i) => (
                <LigneIngredient key={l.produit + i} l={l}
                  onOuvrirClavier={() => setClavier({ l })}
                  onDescendre={() => setChemin([...chemin, l.produit])} />
              ))}

              {/* ⚠️ TOUT SE TAPE EN GRAMMES, comme tout s'affiche en grammes
                  (Layla, 2026-09-23). La recette d'Odoo écrit parfois des kilos ;
                  les convertir de tête au-dessus d'une balance, c'est le facteur
                  mille qui revient. La conversion ne vit donc qu'ici. */}
              {clavier && (
                <Clavier
                  titre={clavier.tete ? 'À faire' : propre(clavier.l.produit)}
                  valeur={enGrammes(clavier.tete ? q : clavier.l.besoin,
                    clavier.tete ? noeud.unite : clavier.l.unite)}
                  unite={uniteAffichee(clavier.tete ? noeud.unite : clavier.l.unite)}
                  onFermer={() => setClavier(null)}
                  onValider={n => {
                    if (clavier.tete) poser(enUnite(n, noeud.unite))
                    else echelleDepuis(clavier.l, enUnite(n, clavier.l.unite))
                    setClavier(null)
                  }} />
              )}

              <button onClick={() => window.print()}
                className="print:hidden w-full mt-4 rounded-2xl bg-bordeaux text-cream py-3
                           text-[15px] font-extrabold active:scale-95 transition">
                🖨 Imprimer cette recette
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // ---------- LA LISTE ----------
  const groupes = tout ? parGateauMere(tout, cherche, true) : []

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      <div className="max-w-[620px] mx-auto px-4 py-4">
        <h1 className="font-fraunces italic text-[24px] text-ink">Recettes</h1>
        <Bandeau />

        {erreur && (
          <p className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-2.5 rounded-xl
                        mb-3 text-[12.5px]">{erreur}</p>
        )}

        <input value={cherche} onChange={e => setCherche(e.target.value)}
          placeholder="Chercher une recette" aria-label="Chercher une recette"
          className="w-full bg-cream-warm border border-line rounded-xl px-3 py-2
                     text-[14px] mb-3" />

        {!tout && !erreur && <Skeleton />}
        {tout && !groupes.length && (
          <p className="text-[13.5px] text-ink-soft">Rien qui corresponde.</p>
        )}

        {groupes.map(g => (
          <div key={g.nom} className="mb-3">
            <p className="text-[11px] uppercase tracking-wide text-ink-mute font-extrabold mb-1">
              {propre(g.nom)}
            </p>
            {g.articles.map(a => <LigneArticle key={a.produit} a={a} onOuvrir={ouvrir} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * ⚠️ IL DOIT ÊTRE IMPOSSIBLE DE CROIRE QU'ON A CHANGÉ LA RECETTE. C'est le
 * seul vrai risque de cet écran : deux écrans qui se ressemblent, un seul qui
 * engage la production.
 */
function Bandeau() {
  return (
    <p className="bg-gold/15 border border-gold rounded-xl px-3 py-2 my-3 text-[12.5px] text-ink-soft">
      <b className="text-ink">Pour regarder seulement.</b> Change la quantité d’un
      ingrédient et toute la recette se remet à cette échelle — Odoo n’est pas
      touché, et l’atelier continue avec la vraie recette.
    </p>
  )
}
