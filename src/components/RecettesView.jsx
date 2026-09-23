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
import { loadToutFabAnnexe, loadArticleFabAnnexe, loadArticlesFabAnnexe, parGateauMere,
  noeudDuChemin, defautDe, ingredientsPour, relireRecettes } from '../lib/fabAnnexe'
import { Clavier } from './FabAnnexe2Simple'
import { toast } from '../lib/toast'
import { quantitePour, qteRecette, recetteGardee, recettesGardees, garderLaRecette,
  garderDesRecettes, listeGardee, garderLaListe, toutOublier } from '../lib/recettes'
import { propre, uniteAffichee, enGrammes, enUnite } from '../lib/ecranSimple'

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
        {qteRecette(l.besoin, l.unite)}
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
  // ⚠️ ON PART DE CE QU'ON A DÉJÀ LU (Layla, 2026-09-23 : « que les recettes se
  // chargent une fois pour toutes […] comme ça c'est pas long »). La liste et
  // les recettes sont gardées dans le téléphone ; Odoo n'est rappelé que par le
  // bouton « Mettre à jour ».
  const [tout, setTout] = useState(listeGardee)
  const [cherche, setCherche] = useState('')
  const [erreur, setErreur] = useState('')
  const [maj, setMaj] = useState(false)
  // Le préchargement en fond : combien de recettes sont déjà prêtes.
  const [pretes, setPretes] = useState(0)
  // L'article ouvert, sa cascade, et l'échelle à laquelle on la lit.
  const [brut, setBrut] = useState(null)
  const [chemin, setChemin] = useState([])
  const [quantites, setQuantites] = useState({})
  // Ce que le clavier est en train de régler : null, ou la ligne visée.
  // `null` pour l'article de tête — c'est lui qu'on règle alors directement.
  const [clavier, setClavier] = useState(null)

  const chargerLaListe = useCallback(() => loadToutFabAnnexe()
    .then(l => { setTout(l); garderLaListe(l) })
    .catch(e => setErreur(e.message || String(e))), [])

  // Rien en mémoire : on va la chercher une fois. Ensuite, plus jamais tout seul.
  useEffect(() => { if (!listeGardee()) chargerLaListe() }, [chargerLaListe])

  /**
   * ⚠️ TOUT EST PRÊT AVANT QU'ELLE N'OUVRE (Layla, 2026-09-23 : « charge les
   * recettes pour que dès que j'ouvre, ça s'affiche systématiquement »).
   *
   * On ne charge donc plus au clic : dès que la liste est là, on va chercher
   * les recettes manquantes en fond, PAR PAQUETS DE DIX. Le serveur les calcule
   * ensemble — même cache de nomenclatures, mêmes stocks lus une fois — donc
   * dix d'un coup coûtent à peine plus qu'une seule ; cent une par une, c'était
   * deux minutes d'attente répartie sur toute la matinée.
   *
   * Ça ne se voit pas : l'écran reste utilisable, et une recette ouverte avant
   * son tour se charge toute seule, comme avant.
   */
  useEffect(() => {
    if (!tout || maj) return
    let vivant = true
    const deja = new Set(recettesGardees())
    const manquants = tout.map(a => a.produit).filter(p => p && !deja.has(p))
    if (!manquants.length) { queueMicrotask(() => vivant && setPretes(tout.length)); return }
    ;(async () => {
      setPretes(tout.length - manquants.length)
      for (let i = 0; i < manquants.length && vivant; i += 10) {
        try {
          const lot = await loadArticlesFabAnnexe(manquants.slice(i, i + 10))
          if (!vivant) return
          garderDesRecettes(lot)
          setPretes(p => p + lot.length)
        } catch {
          return   // réseau coupé : on s'arrête là, le clic ira les chercher
        }
      }
    })()
    return () => { vivant = false }
  }, [tout, maj])

  /**
   * ⚠️ LE BOUTON RÉPOND AU DOIGT (règle de Layla) : relire les recettes prend
   * plusieurs secondes chez Odoo, et pendant ce temps-là il faut VOIR qu'il se
   * passe quelque chose — sinon on appuie deux fois.
   *
   * On fait oublier au SERVEUR (il garde les nomenclatures une demi-heure), et
   * à l'app tout ce qu'elle avait gardé : la prochaine ouverture relira du frais.
   */
  const toutRecharger = async () => {
    if (maj) return
    navigator.vibrate?.(15)
    setMaj(true)
    try {
      await relireRecettes()
      toutOublier()
      setTout(null)
      setPretes(0)
      await chargerLaListe()
      toast('Recettes relues.')
    } catch (e) {
      toast(e.message || String(e))
    } finally {
      setMaj(false)
    }
  }

  const ouvrir = useCallback(async produit => {
    navigator.vibrate?.(10)
    setErreur('')
    setBrut(null)
    setChemin([produit])
    // ⚠️ ON REPART DE LA RECETTE D'ODOO à chaque ouverture : le chef compare
    // toujours à elle, jamais à l'échelle qu'il avait réglée la veille.
    setQuantites({})
    // Déjà lue : elle s'ouvre sans un aller-retour.
    const gardee = recetteGardee(produit)
    if (gardee) { setBrut(gardee); return }
    try {
      const a = await loadArticleFabAnnexe(produit)
      if (!a) { setErreur(`« ${propre(produit)} » n'a pas de recette lisible.`); setChemin([]); return }
      setBrut(a)
      garderLaRecette(produit, a)
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
        <AppHeader {...nav} />
        <div className="max-w-[620px] mx-auto px-4 py-4">
          <button onClick={() => (chemin.length > 1 ? setChemin(chemin.slice(0, -1)) : fermer())}
            className="text-[13px] text-bordeaux font-bold mb-3">
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
                  {qteRecette(q, noeud.unite)}
                </button>
              </div>

              {/* ⚠️ D'OÙ L'ON EST PARTI, TOUJOURS ÉCRIT. Une recette lue à une
                  autre échelle reste juste ; oublier de quelle fournée elle
                  vient, c'est se tromper de moitié sans s'en apercevoir. */}
              {regle && (
                <p className="text-[12px] text-ink-mute mt-1.5">
                  La recette d’Odoo est pour {qteRecette(parOdoo, noeud.unite)} ·{' '}
                  <button onClick={() => poser(parOdoo)}
                    className="text-bordeaux font-bold underline">y revenir</button>
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
                  valeur={Math.round(enGrammes(clavier.tete ? q : clavier.l.besoin,
                    clavier.tete ? noeud.unite : clavier.l.unite) * 100) / 100}
                  unite={uniteAffichee(clavier.tete ? noeud.unite : clavier.l.unite)}
                  onFermer={() => setClavier(null)}
                  onValider={n => {
                    if (clavier.tete) poser(enUnite(n, noeud.unite))
                    else echelleDepuis(clavier.l, enUnite(n, clavier.l.unite))
                    setClavier(null)
                  }} />
              )}
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
        <h1 className="font-fraunces italic text-[24px] text-ink mb-3">Recettes</h1>

        {erreur && (
          <p className="bg-bordeaux/10 border border-bordeaux text-bordeaux p-2.5 rounded-xl
                        mb-3 text-[12.5px]">{erreur}</p>
        )}

        <div className="flex items-center gap-2 mb-3">
          <input value={cherche} onChange={e => setCherche(e.target.value)}
            placeholder="Chercher une recette" aria-label="Chercher une recette"
            className="flex-1 min-w-0 bg-cream-warm border border-line rounded-xl px-3 py-2
                       text-[14px]" />
          {/* Les recettes ne se relisent QUE d'ici : c'est le prix de
              l'instantané, et c'est le choix de Layla. */}
          <button onClick={toutRecharger} disabled={maj}
            className={`flex-none rounded-xl px-3 py-2 text-[12.5px] font-extrabold
              ${maj ? 'bg-cream-deep text-ink-mute' : 'bg-cream-warm border border-line text-ink-soft'}`}>
            {maj ? 'en cours…' : '🔄 Mettre à jour'}
          </button>
        </div>

        {/* Ce qui se prépare en fond. Discret, et ça disparaît tout seul :
            l'écran reste utilisable pendant ce temps-là. */}
        {tout && pretes < tout.length && (
          <p className="text-[11.5px] text-ink-mute mb-2">
            Préparation des recettes… {pretes} / {tout.length}
          </p>
        )}

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
