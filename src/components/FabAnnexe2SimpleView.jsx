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
import { hasValidJwt, isAdmin } from '../lib/auth'
import { CasesAFaire, Cases, Confirmation, Fiche, Fil, Onglets, Sortie } from './FabAnnexe2Simple'
import HistoriqueAnnexe from './HistoriqueAnnexe'
import { ChoixImpression, FeuillesImpression } from './ImpressionFournee'
import { loadFabAnnexe, loadToutFabAnnexe, loadArticlesFabAnnexe, loadHistoriqueAnnexe,
  decoupeDe, noeudDuChemin, defautDe, aCuireParDefaut, parGateauMere, peseesDe,
  declarer, envoyerAValider, repartirCuve, sansRendement, pressageDe,
  toutConsomme, relireRecettes } from '../lib/fabAnnexe'
import { dernierEcran, garderEcran } from '../lib/fabrication'
import { propre, qte } from '../lib/ecranSimple'
import { todayISO } from '../lib/dates'
import { prevusGardes, poserPrevu, figerPrevu, oublierPrevu } from '../lib/prevu'
import { feuillesAImprimer, cocheesParDefaut } from '../lib/feuillesAImprimer'

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
  // Ce qu'on a décidé de faire. On part travailler, on revient — même le
  // lendemain — le chiffre est toujours là. Il ne part qu'avec
  // « réinitialiser », ou quand l'article est déclaré. (Layla, 2026-09-11.)
  const [prevus, setPrevus] = useState(prevusGardes)
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
  // Le panneau d'impression : `null` = fermé. Sinon on y garde ce qui est
  // coché et la façon choisie, le temps d'appuyer sur Imprimer.
  const [impr, setImpr] = useState(null)
  // Ce qui part vraiment à l'imprimante, le temps de l'appel à `window.print`.
  const [feuillesPretes, setFeuillesPretes] = useState(null)

  const ouvert = chemin[0] || null
  const nav = { user, onLogout, onNavigate, activeView }
  const recharger = () => setTour(t => t + 1)

  /**
   * « Je ne veux pas attendre 30 min » (Layla, 2026-09-14). Le serveur garde
   * les recettes une demi-heure ; ce bouton les lui fait oublier tout de suite.
   *
   * ⚠️ Vider le serveur ne suffit pas : les fiches déjà ouvertes sont gardées
   * ICI, dans `details`. Sans les jeter aussi, le bouton ne changerait rien à
   * l'écran.
   */
  const [relit, setRelit] = useState(false)
  const majRecettes = async () => {
    if (relit) return
    setRelit(true)
    try {
      await relireRecettes()
      setDetails({})
      recharger()
      toast.success('Recettes relues chez Odoo')
    } catch (e) {
      toast.error(enClairErreur(e))
    } finally {
      setRelit(false)
    }
  }

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
  // ⚠️ LE PRÉVU N'EST RETENU QUE POUR L'ARTICLE DE TÊTE.
  //
  // Il est rangé par NOM D'ARTICLE, sans savoir de quelle recette il vient —
  // et il traverse les jours, exprès (« si c'est le lendemain ça restera
  // toujours le 25 »). Appliqué à un composant, il débordait donc d'une
  // recette sur l'autre : la crème au beurre citron en demandait 1 658 g de
  // nature, et sa fiche en proposait 2 762,87 — le chiffre figé d'un autre
  // gâteau. « ou d'une crème au beurre nature d'une autre recette figé »
  // (Layla, 2026-09-15).
  //
  // Une décision de Layla porte sur CE QU'ELLE VIENT FAIRE — « 25 Royal
  // Chocolat ». Ce qu'un composant demande, c'est la recette qui le dit, et
  // elle seule. Un chiffre tapé sur un composant vaut le temps de la visite
  // (`quantites`), plus longtemps.
  const poser = (produit, q) => {
    const v = Math.max(0, Math.round(q * 1000) / 1000)
    setQuantites(x => ({ ...x, [produit]: v }))
    // « Il faut le garder tant que réinitialiser n'a pas été noté » (Layla).
    if (produit === chemin[0]) setPrevus(poserPrevu(produit, v))
  }

  /**
   * On quitte la fiche : le travail commence, le chiffre se fige.
   *
   * ⚠️ Et s'il n'a jamais été touché, le chiffre PROPOSÉ devient le décidé.
   * Sans ça, celui qu'on n'avait pas tapé soi-même se recalculait au retour :
   * on part faire la crème, on la déclare, et le tronc framboise ne proposait
   * plus 25 mais autre chose. (Layla, 2026-09-11 : « je suis sorti de la page,
   * je suis revenu, le 25 a disparu ».)
   */
  const figer = (q = 0) => {
    const tete = chemin[0]
    if (!tete) return
    if (!prevus[tete] && q > 0) poserPrevu(tete, q)
    setPrevus(figerPrevu(tete))
  }

  // ---------- déclarer ----------
  /**
   * Ce qui part vers « À valider Annexe ». Une préparation part avec ce qu'on
   * a RÉELLEMENT pesé (`peseesDe`) : sans ça, Odoo recalcule les ingrédients
   * au prorata du poids obtenu, et un sirop qui rend moins aurait consommé
   * moins de café que ce qu'on a mis dedans.
   */
  const envoyerUn = (noeud, tete, qty, prevu = 0) => {
    const racine = noeud.produit === tete.produit
    // `prevu` : ce qu'on a VOULU faire. Les ingrédients le suivent, lui, et pas
    // le poids obtenu — voir `peseesPrevues`.
    if (racine) return envoyerAValider(tete, qty, user?.id, prevu)
    const fois = noeud.tourneeTaille > 0 ? qty / noeud.tourneeTaille : 1
    return declarer({
      produit: noeud.produit, unite: noeud.unite, fois, qty,
      // ⚠️ Un composant dont il ne manque presque rien part avec ce qu'il en
      // RESTE : la recette dirait 100 g de pécan quand il n'y en a que 97.
      ajustements: { ...peseesDe(noeud, fois), ...toutConsomme(noeud) },
      // Faite DEPUIS ce gâteau, donc réservée à lui : une autre taille
      // redemandera la sienne (Layla, 2026-09-10).
      pour: tete.produit,
    }, user?.id)
  }

  /** Ce qu'on cuit : le chiffre réglé à la main, sinon ce qui manque. */
  const aCuire = (noeud, decoupe) => cuites[noeud.produit] ?? aCuireParDefaut(decoupe.enfant)

  const envoyer = async (noeud, tete, qty, cuitesReelles = null, pressees = 0, prevu = 0) => {
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
      // ⚠️ Le PRESSAGE aussi part AVANT : l'ordre du gâteau consomme les
      // bases, et une base qui n'existe pas laisserait le sablé crispy
      // éternellement en stock. (Layla, 2026-09-11.)
      const presse = pressees > 0 ? pressageDe(noeud) : null
      if (presse) {
        const r0 = await envoyerUn(presse, tete, pressees)
        if (r0?.erreur) toast(`Odoo a refusé ${propre(presse.produit)} : ${r0.erreur}`)
      }
      // ⚠️ D'AUTRES TAILLES montées avec la même cuve : chacune doit porter SA
      // part de crème, pas la cuve entière. Le serveur calcule les parts ; on
      // déclare les ordres un par un, jamais de front (un ordre orphelin chez
      // Odoo ne se rattrape pas). (Layla, 2026-09-11.)
      const autres = Object.entries(parTaille).filter(([, n]) => Number(n) > 0)
      let r
      if (noeud.produit === tete.produit && autres.length) {
        // `q` est le PRÉVU : le nombre pour lequel la cuve a été préparée.
        // C'est lui qui décide de la crème, pas `qty` (ce qui est sorti).
        const ordres = await repartirCuve(tete.produit, {
          [tete.produit]: qty, ...Object.fromEntries(autres.map(([p, n]) => [p, Number(n)])),
        }, q)
        for (const o of ordres) {
          const x = await declarer({ produit: o.produit, qty: o.qty, unite: o.unite,
            ajustements: o.ajustements }, user?.id)
          if (x.erreur) toast(`Odoo a refusé ${propre(o.produit)} : ${x.erreur}`)
          if (o.lance) r = x
        }
        r = r || { erreur: null }
      } else {
        r = await envoyerUn(noeud, tete, qty, prevu)
      }
      if (r.erreur) toast(`Enregistré, mais Odoo a refusé : ${r.erreur}`)
      else {
        // Plein écran, vert, une seconde et demie : ça ne se rate pas.
        setConfirme({ quoi: propre(noeud.libelle || noeud.produit), combien: qte(qty, noeud.unite) })
        setTimeout(() => setConfirme(null), 1500)
      }
      setSortie(null)
      setParTaille({})
      setChemin(chemin.slice(0, -1))
      // ⚠️ On n'oublie QUE le prévu de ce qu'on vient de déclarer. Avant,
      // c'était toujours celui du gâteau : déclarer la crème légère faisait
      // retomber le gâteau de 25 à 13, alors qu'« il est censé rester à 25
      // jusqu'à ce que je finisse ma recette » (Layla, 2026-09-11).
      setPrevus(oublierPrevu(noeud.produit))
      if (noeud.produit === tete.produit) {
        // L'article de tête est parti : la séance est finie, on repart propre.
        setFaits({}); setQuantites({}); setCuites({})
      } else {
        // Une préparation : elle compte comme faite pour débloquer le dessus.
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
          {isAdmin(user) && (
            <button onClick={majRecettes} disabled={relit}
              className="w-full mb-4 rounded-2xl border-2 border-cream-deep bg-cream-warm
                         py-3 text-[15px] font-bold text-ink-mute disabled:opacity-50">
              {relit ? 'Lecture chez Odoo…' : '🔄 Mettre à jour les recettes'}
            </button>
          )}
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
  // Seul le prévu de la TÊTE entre dans le calcul — voir `poser`. Y verser
  // tous les prévus, c'était faire entrer dans cette recette des chiffres
  // décidés dans une autre.
  const prevuTete = prevus[chemin[0]]?.q
  const choisies = { ...(prevuTete !== undefined ? { [chemin[0]]: prevuTete } : {}), ...quantites }
  const { tete, noeud } = noeudDuChemin(brut, chemin, choisies)
  if (!noeud) { setChemin([]); return null }

  const estTete = noeud.produit === tete.produit
  const q = quantites[noeud.produit]
    ?? (estTete ? prevus[noeud.produit]?.q : undefined)
    ?? defautDe(noeud)
  // Les gâteaux que l'article de tête sert. Seul le catalogue « Déclarer » les
  // connaît (`pour`) ; la fiche, ouverte article par article, ne les a pas.
  const gateauxMere = (tout || []).find(x => x.produit === tete.produit)?.pour || []

  // ---------- imprimer la fournée ----------
  // Les feuilles se recalculent à chaque frappe dans le panneau : elles lisent
  // `choisies`, la même table que la fiche. Un chiffre tapé à la main s'y
  // range, donc il se fige ; le ↺ l'en retire et l'app reprend la main.
  const feuilles = impr ? feuillesAImprimer(noeud, q, choisies) : []
  // ⚠️ On ne garde QUE les cases touchées à la main. Le reste se redéduit du
  // stock à chaque frappe : baisser la quantité du gâteau doit pouvoir faire
  // repasser un composant en « tu en as assez », et le décocher tout seul.
  const coches = (() => {
    const d = cocheesParDefaut(feuilles)
    return Object.fromEntries(feuilles.map(f =>
      [f.produit, impr?.choix?.[f.produit] ?? d[f.produit]]))
  })()
  const aImprimer = feuilles.filter(f => coches[f.produit])

  /**
   * On ferme le panneau AVANT d'imprimer : il est en position fixe, il
   * couvrirait la feuille. Le navigateur a besoin d'un tour de boucle pour
   * repeindre, d'où le `setTimeout` — sans lui, Safari imprime le panneau.
   */
  const lancerImpression = () => {
    const seule = impr?.mode === 'seule'
    const quoi = aImprimer
    setImpr(null)
    // L'ANCIENNE FAÇON, inchangée : la fiche telle qu'elle est à l'écran, par
    // la zone `print-area`. C'est ce que « comme d'habitude » veut dire.
    if (seule) { setTimeout(() => window.print(), 60); return }
    setFeuillesPretes(quoi)
    // ⚠️ La classe sur <body> dit au CSS de retirer tout le reste du document
    // pendant l'impression. Sans elle, les feuilles seraient « invisibles »
    // sous l'ancienne règle — et surtout tassées sur une seule page.
    document.body.classList.add('impr-feuilles')
    // ⚠️ ON RANGE À `afterprint`, PAS APRÈS `print()`. Sur iPad, `print()`
    // rend la main tout de suite, avant que la feuille soit partie : tout
    // remettre en place là, c'est imprimer du vide.
    const ranger = () => {
      window.removeEventListener('afterprint', ranger)
      document.body.classList.remove('impr-feuilles')
      setFeuillesPretes(null)
    }
    window.addEventListener('afterprint', ranger)
    setTimeout(() => window.print(), 60)
  }
  const decoupe = decoupeDe(noeud)
  // L'étape de mise en forme qu'on confirmera en validant — la base de flan.
  const pressage = pressageDe(noeud)

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader {...nav} />
      <div className="max-w-[680px] mx-auto px-4 py-4 pb-28">
        {/* Le fil d'Ariane et le bouton d'impression sur la même ligne. Les
            deux disparaissent à l'impression : la feuille ne porte que la
            recette telle qu'elle est à l'écran (Layla, 2026-09-11). */}
        <div className="flex items-start justify-between gap-3 print:hidden">
          <Fil chemin={chemin} onRetour={() => { figer(q); setSortie(null); setChemin(chemin.slice(0, -1)) }} />
          {sortie === null && (
            <button onClick={() => setImpr({ mode: 'seule', choix: {} })}
              className="shrink-0 rounded-xl border border-cream-deep bg-cream-warm px-3 py-2
                         text-[13px] font-bold text-ink-soft">
              🖨 Imprimer
            </button>
          )}
        </div>
        {confirme && <Confirmation {...confirme} />}
        {impr && (
          <ChoixImpression
            feuilles={feuilles} mode={impr.mode} coches={coches} tapes={quantites}
            onMode={m => setImpr(x => ({ ...x, mode: m }))}
            onCoche={(p, v) => setImpr(x => ({ ...x, choix: { ...(x.choix || {}), [p]: v } }))}
            onQuantite={(p, v) => poser(p, v)}
            onRendre={p => setQuantites(x => { const n = { ...x }; delete n[p]; return n })}
            onImprimer={lancerImpression}
            onFermer={() => setImpr(null)} />
        )}
        {feuillesPretes && <FeuillesImpression feuilles={feuillesPretes} />}
        {sortie !== null
          ? (() => {
            // La question porte soit sur l'article, soit sur ce qu'on vient de
            // CUIRE pour lui (la plaque, le sablé). Deux quantités, deux vraies
            // réponses (Layla, 2026-09-11).
            const surEnfant = sortie.pour === 'enfant'
            // La MISE EN FORME : « combien de bases tu as pressées ? », posée
            // en validant le gâteau au lieu d'obliger à entrer dans l'étape.
            const surPressage = sortie.pour === 'pressage'
            const cible = surEnfant ? decoupe.enfant : surPressage ? pressage : noeud
            // L'étape FINALE : l'article qu'on est venu faire, pas un de ses
            // morceaux. C'est la seule qui rassemble tous les composants.
            const finale = !surEnfant && !surPressage && cible.produit === tete.produit
            return (
              <Sortie noeud={cible} valeur={sortie.valeur} envoi={envoi}
                question={surPressage ? 'Tu en as pressé combien ?' : undefined}
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
                onValider={() => (surEnfant
                  ? envoyer(noeud, tete, q, sortie.valeur)
                  : surPressage
                    ? envoyer(noeud, tete, q, null, sortie.valeur)
                    // ⚠️ `q` voyage à côté de ce qui est sorti : c'est lui
                    // qui décide des ingrédients (Layla, 2026-09-14).
                    : envoyer(noeud, tete, sortie.valeur, null, 0, q))} />
            )
          })()
          : (
            <div className={feuillesPretes ? undefined : 'print-area'}>
            {/* ⚠️ À L'IMPRESSION SEULEMENT : D'OÙ VIENT CETTE FICHE.
                Sur une feuille posée au plan de travail, « Crème au beurre »
                ne dit ni laquelle ni pour quel gâteau — et l'écran, lui, a le
                fil d'Ariane juste au-dessus. « montrer l'article mère dans
                l'impression pour qu'on sache de quelle crème au beurre il
                s'agit » (Layla, 2026-09-14).
                Deux lignes : le chemin parcouru, puis les gâteaux que cet
                article sert (le catalogue « Déclarer » les connaît). */}
            <div className="hidden print:block text-[9pt] text-ink-mute mb-1 leading-snug">
              {chemin.length > 1 && <div>{chemin.map(propre).join(' › ')}</div>}
              {gateauxMere.length > 0 && <div>pour : {gateauxMere.map(propre).join(' · ')}</div>}
            </div>
            <Fiche noeud={noeud} quantite={q} onQuantite={v => poser(noeud.produit, v)}
              cuites={decoupe ? aCuire(noeud, decoupe) : undefined}
              onCuites={decoupe
                ? v => setCuites(x => ({ ...x, [noeud.produit]: Math.max(0, Math.round(v)) }))
                : undefined}
              faits={faits} envoi={envoi}
              verrouille={!!prevus[tete.produit]?.fige && noeud.produit === tete.produit}
              onLiberer={(estTete ? prevus[noeud.produit] : quantites[noeud.produit] !== undefined)
                ? () => {
                  if (estTete) setPrevus(oublierPrevu(noeud.produit))
                  setQuantites(x => { const n = { ...x }; delete n[noeud.produit]; return n })
                } : undefined}
              onOuvrir={p => { figer(q); setChemin([...chemin, p]) }}
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
                // La MISE EN FORME se confirme ici, pas dans une étape à part :
                // « tu as validé flan ; le crispy y est, combien de base tu as
                // coupé ? » (Layla, 2026-09-11). Le nombre qu'il faut est déjà
                // rempli — on peut en presser plus si on veut de l'avance.
                if (pressage) {
                  return setSortie({ pour: 'pressage', valeur: Math.ceil(pressage.besoin) })
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
