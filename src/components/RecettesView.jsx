// ============================================================
// RECETTES — l'écran du chef.
//
// « Le chef veut vérifier les recettes si elles sont bonnes avant de les
// faire. Crée un nouvel onglet qui liste toutes les recettes […] et que le
// pâtissier ne peut pas [en] faire : juste il va changer un ingrédient ou une
// quantité pour lui sortir la recette » (Layla, 2026-09-23).
//
// ⚠️ ON NE DÉCLARE RIEN ICI, ET ON N'ÉCRIT RIEN DANS ODOO. Pas de bouton
// « c'est fait », pas de feuille, pas d'ordre de fabrication. Ses changements
// vivent dans son écran et s'effacent quand il referme : c'est exactement ce
// qui rend cet écran sans danger, et c'est le choix de Layla.
//
// ⚠️ ET IL NE DOIT PAS RESSEMBLER À FABRICATION ANNEXE 2 (Layla : « des
// fenêtres plus petites, un affichage différent, sans photo comme À
// déclarer »). Deux écrans jumeaux dont un seul engage la production, c'est
// une faute qui finit par arriver. D'où : pas de photo, des lignes serrées,
// pas de gros chiffre au milieu.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { loadToutFabAnnexe, loadArticleFabAnnexe, parGateauMere, noeudDuChemin,
  defautDe, ingredientsPour } from '../lib/fabAnnexe'
import { recetteEssai, nbEssais } from '../lib/recettes'
import { propre, qte, uniteAffichee } from '../lib/ecranSimple'

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
 * Une ligne d'ingrédient, qui s'ouvre sur place quand on la touche.
 *
 * Pas de fenêtre par-dessus : on reste dans la recette, et on voit tout de
 * suite ce que le changement donne au milieu des autres lignes.
 */
function LigneIngredient({ l, onEssai, onDescendre }) {
  const [edite, setEdite] = useState(false)
  const [nom, setNom] = useState('')
  const [q, setQ] = useState('')

  const ouvrir = () => {
    setNom(l.produit)
    setQ(String(l.besoin ?? ''))
    setEdite(true)
  }
  const garder = () => { onEssai({ nom, qty: q }); setEdite(false) }

  if (edite) {
    return (
      <div className="bg-cream-warm border border-bordeaux rounded-xl px-2.5 py-2 mb-1">
        <input value={nom} onChange={e => setNom(e.target.value)} aria-label="Ingrédient"
          className="w-full bg-cream border border-line rounded-lg px-2 py-1.5 text-[13.5px]" />
        <div className="flex items-center gap-2 mt-1.5">
          <input value={q} onChange={e => setQ(e.target.value)} inputMode="decimal"
            aria-label="Quantité"
            className="flex-1 min-w-0 bg-cream border border-line rounded-lg px-2 py-1.5
                       text-[15px] font-bold tabular-nums" />
          <span className="text-[12px] text-ink-mute">{uniteAffichee(l.unite)}</span>
          <button onClick={garder}
            className="rounded-lg bg-bordeaux text-cream px-3 py-1.5 text-[13px] font-extrabold">
            OK
          </button>
          <button onClick={() => setEdite(false)}
            className="rounded-lg border border-line text-ink-mute px-2.5 py-1.5 text-[13px]">
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 mb-1
                     ${l.essai ? 'bg-gold/10 border-gold' : 'bg-cream-warm border-line'}`}>
      <button onClick={ouvrir} className="flex-1 min-w-0 text-left">
        <span className="block text-[13.5px] font-bold text-ink truncate">
          {propre(l.produit)}
        </span>
        {/* Ce que dit Odoo, gardé sous les yeux : c'est la question qu'il vient
            se poser, il ne peut pas y répondre sans la vraie valeur. */}
        {l.essai && (
          <span className="block text-[11px] text-ink-mute truncate">
            Odoo dit : {propre(l.essai.produit)} · {qte(l.essai.besoin, l.unite)}
          </span>
        )}
      </button>
      <button onClick={ouvrir}
        className="flex-none text-[14px] font-black tabular-nums text-ink">
        {qte(l.besoin, l.unite)}
      </button>
      <span aria-hidden="true" className="flex-none text-[12px] text-ink-mute">✏️</span>
      {/* Une préparation se descend : sa recette à elle est un écran plus bas. */}
      {l.fabrique && (
        <button onClick={onDescendre} aria-label="Voir sa recette"
          className="flex-none text-[15px] text-bordeaux font-black px-1">›</button>
      )}
    </div>
  )
}

export default function RecettesView({ user, onLogout, onNavigate, activeView }) {
  const [tout, setTout] = useState(null)
  const [cherche, setCherche] = useState('')
  const [erreur, setErreur] = useState('')
  // L'article ouvert, sa cascade, et où l'on en est dedans.
  const [brut, setBrut] = useState(null)
  const [chemin, setChemin] = useState([])
  const [quantites, setQuantites] = useState({})
  const [essais, setEssais] = useState({})

  useEffect(() => {
    loadToutFabAnnexe().then(setTout).catch(e => setErreur(e.message || String(e)))
  }, [])

  const ouvrir = useCallback(async produit => {
    navigator.vibrate?.(10)
    setErreur('')
    setBrut(null)
    setChemin([produit])
    // ⚠️ ON REPART DE LA VRAIE RECETTE à chaque ouverture (choix assumé) : le
    // chef compare toujours à Odoo, jamais à ce qu'il avait tapé la veille.
    setEssais({})
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

  const fermer = () => { setChemin([]); setBrut(null); setEssais({}); setQuantites({}) }

  const nav = { user, onLogout, onNavigate, activeView }

  // ---------- LA FICHE ----------
  if (chemin.length) {
    const { noeud } = brut ? noeudDuChemin(brut, chemin, quantites) : { noeud: null }
    const q = noeud ? (quantites[noeud.produit] ?? defautDe(noeud)) : 0
    const vraies = noeud ? ingredientsPour(noeud, q) : []
    const lignes = recetteEssai(vraies, essais)
    const changees = nbEssais(vraies, essais)

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

              <div className="flex items-center gap-2 mt-3 mb-3">
                <label className="text-[12.5px] text-ink-soft" htmlFor="qte">pour</label>
                <input id="qte" value={q} inputMode="decimal"
                  onChange={e => {
                    const v = Number(String(e.target.value).replace(',', '.'))
                    setQuantites(x => ({ ...x, [noeud.produit]: Number.isFinite(v) ? v : 0 }))
                  }}
                  className="w-24 bg-cream-warm border border-line rounded-lg px-2 py-1.5
                             text-[16px] font-black tabular-nums" />
                <span className="text-[12.5px] text-ink-soft">{uniteAffichee(noeud.unite)}</span>
                {changees > 0 && (
                  <button onClick={() => setEssais({})}
                    className="print:hidden ml-auto text-[12px] text-bordeaux font-bold underline">
                    Remettre la vraie recette
                  </button>
                )}
              </div>

              {!lignes.length && (
                <p className="text-[13.5px] text-ink-soft">Aucun ingrédient : Odoo n’a pas de recette pour ça.</p>
              )}
              {lignes.map((l, i) => (
                <LigneIngredient key={l.produit + i} l={l}
                  onEssai={e => setEssais(x => ({ ...x, [(l.essai?.produit) || l.produit]: e }))}
                  onDescendre={() => setChemin([...chemin, l.produit])} />
              ))}

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
      <b className="text-ink">Essai seulement.</b> Tu peux changer un ingrédient ou une
      quantité pour voir ce que ça donne — Odoo n’est pas touché, et l’atelier
      continue avec la vraie recette.
    </p>
  )
}
