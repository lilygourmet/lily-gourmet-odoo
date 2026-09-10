// ============================================================
// « Fabrication Annexe 2 », version simplifiée — l'écran complet.
//
// Il a remplacé l'ancien écran le 2026-09-11, après essai à l'atelier. Les
// deux règles qui n'existaient que là-bas ont été reprises ici : la MASSE
// GÉLATINE (×7) et l'historique par date. L'ancien code reste dans git.
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
import { CasesAFaire, Cases, Fiche, Fil, Onglets, Sortie } from './FabAnnexe2Simple'
import HistoriqueAnnexe from './HistoriqueAnnexe'
import { loadFabAnnexe, loadToutFabAnnexe, loadArticlesFabAnnexe, loadHistoriqueAnnexe,
  decoupeDe, noeudDuChemin, defautDe, parGateauMere, peseesDe, declarer,
  envoyerAValider, sansRendement } from '../lib/fabAnnexe'
import { dernierEcran, garderEcran } from '../lib/fabrication'
import { todayISO } from '../lib/dates'

/**
 * La photo d'une préparation : celle de SON GÂTEAU (E-, MI-, V-), pas la
 * sienne. « Mettre les photos des SM liées au E- ou MI- ou V- » (Layla,
 * 2026-09-11) — une crème ou un biscuit photographié seul ne se reconnaît pas,
 * le gâteau si.
 *
 * Effet de bord bienvenu : 52 photos de gâteaux au lieu de 284 photos
 * d'articles, donc bien plus de coups dans le cache du navigateur.
 */
const photoGateau = a => (a.pour && a.pour[0]) || a.photo || a.produit

export default function FabAnnexe2SimpleView({ user, onLogout, onNavigate, activeView }) {
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
  // « Déclarer » : tout ce que l'annexe sait faire, pour venir dire ce qu'on a
  // fabriqué même quand rien ne le réclamait. On y descend par gâteau, comme
  // dans l'ancien écran (Layla, 2026-09-09).
  const [onglet, setOnglet] = useState('faire')
  const [tout, setTout] = useState(() => dernierEcran('fab_annexe2_tout'))
  const [cherche, setCherche] = useState('')
  const [gateau, setGateau] = useState(null)
  // L'historique : un bouton, par date (Layla, 2026-09-09).
  const [histo, setHisto] = useState(null)
  const [histoOuvert, setHistoOuvert] = useState(false)

  const ouvert = chemin[0] || null
  const nav = { user, onLogout, onNavigate, activeView }
  const recharger = () => setTour(t => t + 1)

  useEffect(() => {
    let vivant = true
    loadHistoriqueAnnexe().then(h => { if (vivant) setHisto(h) }).catch(() => {})
    return () => { vivant = false }
  }, [tour])

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

  // Le catalogue complet part avec le reste, sans attendre le clic sur
  // l'onglet : quand elle y arrive, il est déjà là.
  useEffect(() => {
    let vivant = true
    loadToutFabAnnexe()
      .then(l => { if (vivant) { setTout(l); garderEcran('fab_annexe2_tout', l) } })
      .catch(() => { /* « À faire » n'a pas à en souffrir */ })
    return () => { vivant = false }
  }, [tour])

  useEffect(() => {
    if (!ouvert || details[ouvert]) return
    let vivant = true
    loadArticlesFabAnnexe([ouvert])
      .then(([a]) => {
        if (!vivant) return
        if (!a) { setErreur(`« ${ouvert} » n'est plus suivi.`); setChemin([]); return }
        setDetails(d => ({ ...d, [ouvert]: a }))
      })
      .catch(e => { if (vivant) { setErreur(e.message || String(e)); setChemin([]) } })
    return () => { vivant = false }
  }, [ouvert, details])

  /**
   * Charger d'avance les fiches d'un gâteau qu'on vient d'ouvrir dans
   * « Déclarer ». Une fiche coûte 1,4 seconde ; demandées ensemble, elles
   * coûtent à peine plus qu'une — et le clic devient instantané.
   *
   * En silence : si ça rate, le clic rechargera la fiche comme avant.
   */
  const precharger = noms => {
    const manquants = noms.filter(n => !details[n]).slice(0, 12)
    if (!manquants.length) return
    loadArticlesFabAnnexe(manquants)
      .then(l => setDetails(d => ({ ...d, ...Object.fromEntries(l.map(a => [a.produit, a])) })))
      .catch(() => { /* le clic s'en chargera */ })
  }

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
      // Faite DEPUIS ce gâteau, donc réservée à lui : une autre taille
      // redemandera la sienne (Layla, 2026-09-10).
      pour: tete.produit,
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
      setChemin(chemin.slice(0, -1))
      if (noeud.produit === tete.produit) {
        // L'article de tête est parti : la séance est finie, on repart propre.
        setFaits({}); setQuantites({}); setCuites({})
      } else {
        // Une préparation : elle compte comme faite pour débloquer le dessus,
        // et sa quantité reste réglée si on y revient.
        setFaits(f => ({ ...f, [noeud.produit]: { fois: 1 } }))
      }
      recharger()
    } catch (e) {
      toast('Échec : ' + (e.message || e))
    } finally { setEnvoi(false) }
  }

  // ---------- la liste ----------
  if (!chemin.length) {
    // Dès qu'on tape, on cherche PARTOUT — les préparations comprises : on vient
    // chercher un composant précis, pas parcourir les gâteaux.
    const groupes = onglet === 'declarer' ? parGateauMere(tout, cherche) : []
    const ouvertG = cherche.trim() ? null : groupes.find(g => g.nom === gateau)
    // ⚠️ Un article qui sert à DEUX gâteaux est rangé sous les deux : mis à
    // plat, il apparaissait deux fois dans la recherche (« Sirop Imbibage cake
    // citron » ×2). Une case par article, pas une par usage.
    const trouves = cherche.trim()
      ? [...new Map(groupes.flatMap(g => g.articles).map(a => [a.produit, a])).values()]
      : null
    const ouvrir = p => { setFaits({}); setQuantites({}); setCuites({}); setChemin([p]) }
    const dujour = (histo || []).filter(l => (l.jour || todayISO()) === todayISO()).length
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader {...nav} />
        <div className="max-w-[1000px] mx-auto px-4 py-5 pb-28">
          {erreur && <p className="text-danger text-[14px] mb-3">{erreur}</p>}
          <Onglets onglet={onglet} onChange={k => { setOnglet(k); setGateau(null); setCherche('') }} />
          <button onClick={() => setHistoOuvert(true)}
            className="w-full mb-4 rounded-2xl border-2 border-cream-deep bg-cream-warm
                       py-3 text-[15px] font-bold text-ink-mute">
            🕓 Ce qui a été fait
            {dujour > 0 && <span className="text-ink"> · {dujour}</span>}
          </button>
          {histoOuvert && <HistoriqueAnnexe histo={histo} onFermer={() => setHistoOuvert(false)} />}

          {onglet === 'faire' && (articles === null
            ? <Skeleton rows={4} />
            : <CasesAFaire articles={articles} onOuvrir={ouvrir} />)}

          {onglet === 'declarer' && (
            <>
              <input value={cherche} onChange={e => setCherche(e.target.value)}
                placeholder="Chercher" aria-label="Chercher"
                className="w-full h-14 rounded-2xl border-2 border-cream-deep bg-cream-warm
                           px-4 mb-4 text-[17px] outline-none focus:border-bordeaux" />
              {tout === null && <Skeleton rows={3} />}
              {trouves && (
                <Cases vide="Rien à ce nom-là."
                  items={trouves.map(a => ({ cle: a.produit, photo: photoGateau(a), libelle: a.libelle }))}
                  onOuvrir={ouvrir} />
              )}
              {!trouves && ouvertG && (
                <>
                  <button onClick={() => setGateau(null)}
                    className="text-[14px] text-ink-mute font-bold mb-3">← Tous les gâteaux</button>
                  <Cases vide="Rien ici."
                    items={ouvertG.articles.map(a => ({ cle: a.produit, photo: ouvertG.photo || photoGateau(a), libelle: a.libelle }))}
                    onOuvrir={ouvrir} />
                </>
              )}
              {!trouves && !ouvertG && tout !== null && (
                <Cases vide="Rien à déclarer."
                  items={groupes.map(g => ({ cle: g.nom, photo: g.photo, libelle: g.nom }))}
                  onOuvrir={nom => {
                    setGateau(nom)
                    // Ses tailles seront prêtes avant qu'on tape dessus.
                    precharger((groupes.find(g => g.nom === nom)?.articles || []).map(a => a.produit))
                  }} />
              )}
            </>
          )}
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
              // Ce qui sort du stock : la dose RÉELLEMENT pesée, celle qu'on
              // impose à l'ordre Odoo. Seulement pour une préparation — un
              // montage, lui, laisse Odoo recalculer au prorata de sa sortie.
              pesees={noeud.produit === tete.produit ? null
                : peseesDe(noeud, noeud.tourneeTaille > 0 ? q / noeud.tourneeTaille : 1)}
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
