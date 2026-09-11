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
import { enClairErreur } from '../lib/erreurs'
import { hasValidJwt } from '../lib/auth'
import { CasesAFaire, Cases, Confirmation, Fiche, Fil, Onglets, Sortie } from './FabAnnexe2Simple'
import HistoriqueAnnexe from './HistoriqueAnnexe'
import { loadFabAnnexe, loadToutFabAnnexe, loadArticlesFabAnnexe, loadHistoriqueAnnexe,
  decoupeDe, noeudDuChemin, defautDe, aCuireParDefaut, parGateauMere, peseesDe,
  declarer, envoyerAValider, repartirCuve, sansRendement } from '../lib/fabAnnexe'
import { dernierEcran, garderEcran } from '../lib/fabrication'
import { propre, qte } from '../lib/ecranSimple'
import { todayISO } from '../lib/dates'
import { prevusDuJour, poserPrevu, figerPrevu, oublierPrevu } from '../lib/prevu'

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
  // Ce qu'on a décidé de faire, gardé pour la journée : on part travailler, on
  // revient, le chiffre est toujours là. (Layla, 2026-09-11.)
  const [prevus, setPrevus] = useState(() => prevusDuJour(todayISO()))
  const [quantites, setQuantites] = useState({})
  const [cuites, setCuites] = useState({})
  const [faits, setFaits] = useState({})
  const [sortie, setSortie] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  // Ce qu'on vient d'enregistrer, le temps de le montrer en grand.
  const [confirme, setConfirme] = useState(null)
  // Les autres tailles montées avec la même cuve : { produit: combien }.
  const [parTaille, setParTaille] = useState({})
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

  // Au MILLIÈME, pas au centième : en kilos, 0,01 c'est 10 grammes — taper
  // 2 605 g serait revenu à 2 610. (Layla, 2026-09-11 : « attention à la
  // conversion ».)
  const poser = (produit, q) => {
    const v = Math.max(0, Math.round(q * 1000) / 1000)
    setQuantites(x => ({ ...x, [produit]: v }))
    // ⚠️ On ne garde QUE le chiffre de l'article de tête : c'est lui qui
    // commande la recette. Les quantités des composants se recalculent.
    if (produit === (chemin[0] || null)) setPrevus(poserPrevu(todayISO(), produit, v))
  }

  /** On quitte la fiche : le travail commence, le chiffre se fige. */
  const figer = () => {
    const tete = chemin[0]
    if (tete && prevus[tete] && !prevus[tete].fige) setPrevus(figerPrevu(todayISO(), tete))
  }

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

  /** Ce qu'on cuit : le chiffre réglé à la main, sinon ce qui manque. */
  const aCuire = (noeud, decoupe) => cuites[noeud.produit] ?? aCuireParDefaut(decoupe.enfant)

  const envoyer = async (noeud, tete, qty, cuitesReelles = null) => {
    if (!(qty > 0) || envoi) return
    // ⚠️ Le jeton de connexion dure 12 h. Sur une tablette allumée toute la
    // journée il expire en plein travail : l'écran a l'air normal, mais plus
    // rien ne s'enregistre. On le dit AVANT de tenter, pas après avoir échoué.
    if (!hasValidJwt()) {
      toast('Ta session a expiré : déconnecte-toi et reconnecte-toi, puis recommence.')
      return
    }
    navigator.vibrate?.(15)
    setEnvoi(true)
    try {
      // ⚠️ La plaque AVANT ce qu'on en coupe, et jamais les deux de front :
      // l'ordre des biscuits consomme les plaques, et un ordre orphelin dans
      // Odoo ne se rattrape pas tout seul.
      const decoupe = decoupeDe(noeud)
      const nbCuites = cuitesReelles ?? (decoupe ? aCuire(noeud, decoupe) : 0)
      if (decoupe && nbCuites > 0) {
        const r = await envoyerUn(decoupe.enfant, tete, nbCuites)
        if (r?.erreur) toast(`Odoo a refusé les plaques : ${r.erreur}`)
      }
      // ⚠️ D'AUTRES TAILLES montées avec la même cuve : chacune doit porter SA
      // part de crème, pas la cuve entière. Le serveur calcule les parts ; on
      // déclare les ordres un par un, jamais de front (un ordre orphelin chez
      // Odoo ne se rattrape pas). (Layla, 2026-09-11.)
      const autres = Object.entries(parTaille).filter(([, n]) => Number(n) > 0)
      let r
      if (noeud.produit === tete.produit && autres.length) {
        const ordres = await repartirCuve(tete.produit, {
          [tete.produit]: qty, ...Object.fromEntries(autres.map(([p, n]) => [p, Number(n)])),
        })
        for (const o of ordres) {
          const x = await declarer({ produit: o.produit, qty: o.qty, unite: o.unite,
            ajustements: o.ajustements }, user?.id)
          if (x.erreur) toast(`Odoo a refusé ${propre(o.produit)} : ${x.erreur}`)
          if (o.lance) r = x
        }
        r = r || { erreur: null }
      } else {
        r = await envoyerUn(noeud, tete, qty)
      }
      if (r.erreur) toast(`Enregistré, mais Odoo a refusé : ${r.erreur}`)
      else {
        // Plein écran, vert, une seconde et demie : ça ne se rate pas.
        setConfirme({ quoi: propre(noeud.libelle || noeud.produit), combien: qte(qty, noeud.unite) })
        setTimeout(() => setConfirme(null), 1500)
      }
      setSortie(null)
      setParTaille({})
      // Déclaré : le prévu a fait son travail, il ne doit plus commander demain.
      setPrevus(oublierPrevu(todayISO(), tete.produit))
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
      toast(enClairErreur(e))
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
          {confirme && <Confirmation {...confirme} />}

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
  // Le prévu du jour sert de quantité de départ : il a décidé de la recette.
  const choisies = { ...Object.fromEntries(Object.entries(prevus).map(([p, v]) => [p, v.q])), ...quantites }
  const { tete, noeud } = noeudDuChemin(brut, chemin, choisies)
  if (!noeud) { setChemin([]); return null }

  const q = quantites[noeud.produit] ?? prevus[noeud.produit]?.q ?? defautDe(noeud)
  const decoupe = decoupeDe(noeud)

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      <div className="max-w-[680px] mx-auto px-4 py-4 pb-28">
        {/* Le fil d'Ariane et le bouton d'impression sur la même ligne. Les
            deux disparaissent à l'impression : la feuille ne porte que la
            recette telle qu'elle est à l'écran (Layla, 2026-09-11). */}
        <div className="flex items-start justify-between gap-3 print:hidden">
          <Fil chemin={chemin} onRetour={() => { figer(); setSortie(null); setChemin(chemin.slice(0, -1)) }} />
          {sortie === null && (
            <button onClick={() => window.print()}
              className="shrink-0 rounded-xl border border-cream-deep bg-cream-warm px-3 py-2
                         text-[13px] font-bold text-ink-soft">
              🖨 Imprimer
            </button>
          )}
        </div>
        {confirme && <Confirmation {...confirme} />}
        {sortie !== null
          ? (() => {
            // La question porte soit sur l'article, soit sur ce qu'on vient de
            // CUIRE pour lui (la plaque, le sablé). Deux quantités, deux vraies
            // réponses (Layla, 2026-09-11).
            const surEnfant = sortie.pour === 'enfant'
            const cible = surEnfant ? decoupe.enfant : noeud
            // L'étape FINALE : l'article qu'on est venu faire, pas un de ses
            // morceaux. C'est la seule qui rassemble tous les composants.
            const finale = !surEnfant && cible.produit === tete.produit
            const fois = cible.tourneeTaille > 0
              ? (surEnfant ? sortie.valeur : q) / cible.tourneeTaille : 1
            return (
              <Sortie noeud={cible} valeur={sortie.valeur} envoi={envoi}
                onValeur={v => setSortie(x => ({ ...x, valeur: v }))}
                // Une CUVE ne se divise pas : ce qu'on n'a pas monté en grand
                // finit en plus petit.
                //
                // ⚠️ La question ne se pose qu'à la TOUTE FIN — sur l'article
                // qu'on est venu faire, celui qui rassemble tous les autres.
                // Elle apparaissait aussi en plein milieu, pendant qu'on
                // déclarait une crème ou un fond : « cette question-là, elle
                // doit être posée complètement à la fin, pas dans les petites
                // étapes » (Layla, 2026-09-11).
                tailles={finale ? (brut.tailles || []) : null}
                nomCuve={brut.figesNom}
                prevu={finale ? q : 0}
                parTaille={parTaille}
                onTaille={finale && (brut.tailles || []).length
                  ? (p, n) => setParTaille(x => ({ ...x, [p]: n })) : undefined}
                // Ce qui sort du stock : la dose RÉELLEMENT pesée, celle qu'on
                // impose à l'ordre Odoo. Seulement pour une préparation — un
                // montage, lui, laisse Odoo recalculer au prorata de sa sortie.
                pesees={cible.produit === tete.produit ? null : peseesDe(cible, fois)}
                onValider={() => (surEnfant
                  ? envoyer(noeud, tete, q, sortie.valeur)
                  : envoyer(noeud, tete, sortie.valeur))} />
            )
          })()
          : (
            <div className="print-area">
            <Fiche noeud={noeud} quantite={q} onQuantite={v => poser(noeud.produit, v)}
              cuites={decoupe ? aCuire(noeud, decoupe) : undefined}
              onCuites={decoupe
                ? v => setCuites(x => ({ ...x, [noeud.produit]: Math.max(0, Math.round(v)) }))
                : undefined}
              faits={faits} envoi={envoi}
              verrouille={!!prevus[tete.produit]?.fige && noeud.produit === tete.produit}
              onLiberer={() => {
                setPrevus(oublierPrevu(todayISO(), tete.produit))
                setQuantites(x => { const n = { ...x }; delete n[tete.produit]; return n })
              }}
              onOuvrir={p => { figer(); setChemin([...chemin, p]) }}
              onFait={() => {
                // Une DÉCOUPE : si on a cuit quelque chose, on demande combien
                // il en est vraiment sorti — « il faudrait qu'il demande
                // combien il en a fait de ce sablé crispy » (Layla,
                // 2026-09-11). Si on n'a rien cuit (c'était au frigo), rien à
                // demander : seules les pièces partent.
                if (decoupe) {
                  const nb = aCuire(noeud, decoupe)
                  if (nb > 0 && !sansRendement(decoupe.enfant.produit)) {
                    return setSortie({ pour: 'enfant', valeur: nb })
                  }
                  return envoyer(noeud, tete, q)
                }
                // On ne demande « combien ça a donné ? » que quand la réponse
                // peut surprendre : un biscuit sort toujours son compte.
                if (sansRendement(noeud.libelle || noeud.produit)) return envoyer(noeud, tete, q)
                setSortie({ pour: 'article', valeur: q })
              }} />
            </div>
          )}
      </div>
    </div>
  )
}
