// ============================================================
// « Fabrication Annexe 2 », version simplifiée — l'écran complet.
//
// Il ne remplace rien : la tablette choisit. L'interrupteur est en bas de la
// liste, dans l'écran (Layla, 2026-09-10) — on essaie, et on revient d'un
// appui si ça ne va pas.
//
// Trois écrans en tout, jamais plus :
//   1. les cases — une photo, un chiffre
//   2. la fiche — combien on en fait, ce qu'il faut, « c'est fait »
//   3. « il en est sorti combien ? » — le chiffre réel, puis c'est parti
//
// Les composants d'affichage vivent dans `FabAnnexe2Simple.jsx` ; ici, on
// charge, on navigue, on déclare.
// ============================================================
import { useState, useEffect } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { CasesAFaire, Fiche, Fil, Sortie } from './FabAnnexe2Simple'
import { loadFabAnnexe, loadArticleFabAnnexe, decoupeDe, noeudDuChemin, defautDe,
  peseesDe, declarer, envoyerAValider, sansRendement } from '../lib/fabAnnexe'
import { dernierEcran, garderEcran } from '../lib/fabrication'

export default function FabAnnexe2SimpleView({ user, onLogout, onNavigate, activeView, onBasculer }) {
  const [articles, setArticles] = useState(() => dernierEcran('fab_annexe2'))
  const [details, setDetails] = useState(() =>
    Object.fromEntries((dernierEcran('fab_annexe2') || []).map(a => [a.produit, a])))
  const [chemin, setChemin] = useState([])
  const [quantites, setQuantites] = useState({})
  const [cuites, setCuites] = useState({})
  const [faits, setFaits] = useState({})
  const [sortie, setSortie] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [tour, setTour] = useState(0)

  const ouvert = chemin[0] || null
  const nav = { user, onLogout, onNavigate, activeView }
  const recharger = () => setTour(t => t + 1)

  useEffect(() => {
    let vivant = true
    loadFabAnnexe()
      .then(l => {
        if (!vivant) return
        setArticles(l)
        garderEcran('fab_annexe2', l)
        setDetails(d => ({ ...d, ...Object.fromEntries(l.map(a => [a.produit, a])) }))
        setErreur(null)
      })
      .catch(e => { if (vivant) { setErreur(e.message || String(e)); setArticles([]) } })
    return () => { vivant = false }
  }, [tour])

  useEffect(() => {
    if (!ouvert || details[ouvert]) return
    let vivant = true
    loadArticleFabAnnexe(ouvert)
      .then(a => {
        if (!vivant) return
        if (!a) { setErreur(`« ${ouvert} » n'est plus suivi.`); setChemin([]); return }
        setDetails(d => ({ ...d, [ouvert]: a }))
      })
      .catch(e => { if (vivant) { setErreur(e.message || String(e)); setChemin([]) } })
    return () => { vivant = false }
  }, [ouvert, details])

  const poser = (produit, q) =>
    setQuantites(x => ({ ...x, [produit]: Math.max(0, Math.round(q * 100) / 100) }))

  // ---------- déclarer ----------
  /**
   * Ce qui part vers « À valider Annexe ». Une préparation part avec ce qu'on
   * a RÉELLEMENT pesé (`peseesDe`) : sans ça, Odoo recalcule les ingrédients
   * au prorata du poids obtenu, et un sirop qui rend moins aurait consommé
   * moins de café que ce qu'on a mis dedans.
   */
  const envoyerUn = (noeud, tete, qty) => {
    const racine = noeud.produit === tete.produit
    if (racine) return envoyerAValider(tete, qty, user?.id)
    const fois = noeud.tourneeTaille > 0 ? qty / noeud.tourneeTaille : 1
    return declarer({
      produit: noeud.produit, unite: noeud.unite, fois, qty,
      ajustements: peseesDe(noeud, fois),
    }, user?.id)
  }

  const envoyer = async (noeud, tete, qty) => {
    if (!(qty > 0) || envoi) return
    navigator.vibrate?.(15)
    setEnvoi(true)
    try {
      // ⚠️ La plaque AVANT ce qu'on en coupe, et jamais les deux de front :
      // l'ordre des biscuits consomme les plaques, et un ordre orphelin dans
      // Odoo ne se rattrape pas tout seul.
      const decoupe = decoupeDe(noeud)
      const nbCuites = decoupe ? (cuites[noeud.produit] ?? defautDe(decoupe.enfant)) : 0
      if (decoupe && nbCuites > 0) {
        const r = await envoyerUn(decoupe.enfant, tete, nbCuites)
        if (r?.erreur) toast(`Odoo a refusé les plaques : ${r.erreur}`)
      }
      const r = await envoyerUn(noeud, tete, qty)
      toast(r.erreur ? `Enregistré, mais Odoo a refusé : ${r.erreur}` : 'C\'est noté ✓')
      setSortie(null)
      setFaits(f => ({ ...f, [noeud.produit]: { fois: 1 } }))
      setChemin(chemin.slice(0, -1))
      recharger()
    } catch (e) {
      toast('Échec : ' + (e.message || e))
    } finally { setEnvoi(false) }
  }

  // ---------- la liste ----------
  if (!chemin.length) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader {...nav} />
        <div className="max-w-[1000px] mx-auto px-4 py-5 pb-28">
          {erreur && <p className="text-danger text-[14px] mb-3">{erreur}</p>}
          {articles === null ? <Skeleton rows={4} />
            : <CasesAFaire articles={articles} onOuvrir={p => setChemin([p])} />}
          <button onClick={onBasculer}
            className="w-full mt-10 py-3 text-[13px] text-ink-mute font-bold">
            revenir à l'ancien écran
          </button>
        </div>
      </div>
    )
  }

  // ---------- la fiche ----------
  const brut = details[ouvert]
  if (!brut) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader {...nav} />
        <div className="max-w-[1000px] mx-auto px-4 py-5"><Skeleton rows={3} /></div>
      </div>
    )
  }
  const { tete, noeud } = noeudDuChemin(brut, chemin, quantites)
  if (!noeud) { setChemin([]); return null }

  const q = quantites[noeud.produit] ?? defautDe(noeud)
  const decoupe = decoupeDe(noeud)

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      <div className="max-w-[680px] mx-auto px-4 py-4 pb-28">
        <Fil chemin={chemin} onRetour={() => { setSortie(null); setChemin(chemin.slice(0, -1)) }} />
        {sortie !== null
          ? (
            <Sortie noeud={noeud} valeur={sortie} envoi={envoi}
              onValeur={v => setSortie(v)}
              onValider={() => envoyer(noeud, tete, sortie)} />
          )
          : (
            <Fiche noeud={noeud} quantite={q} onQuantite={v => poser(noeud.produit, v)}
              cuites={decoupe ? (cuites[noeud.produit] ?? defautDe(decoupe.enfant)) : undefined}
              onCuites={decoupe
                ? v => setCuites(x => ({ ...x, [noeud.produit]: Math.max(0, Math.round(v)) }))
                : undefined}
              faits={faits} onOuvrir={p => setChemin([...chemin, p])}
              onFait={() => {
                // On ne demande « combien ça a donné ? » que quand la réponse
                // peut surprendre. Un biscuit sort son compte ; une découpe
                // vient d'être comptée deux fois à la main.
                if (decoupe || sansRendement(noeud.libelle || noeud.produit)) {
                  return envoyer(noeud, tete, q)
                }
                setSortie(q)
              }} />
          )}
      </div>
    </div>
  )
}
