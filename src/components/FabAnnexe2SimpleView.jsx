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
import { Assemblage, CasesAFaire, Cases, Confirmation, Fiche, Fil, Onglets, Sortie } from './FabAnnexe2Simple'
import HistoriqueAnnexe from './HistoriqueAnnexe'
import { ChoixImpression, FeuillesImpression } from './ImpressionFournee'
import { loadFabAnnexe, loadToutFabAnnexe, loadArticlesFabAnnexe, loadHistoriqueAnnexe,
  decoupeDe, noeudDuChemin, defautDe, aCuireParDefaut, parGateauMere, peseesDe,
  declarer, envoyerAValider, repartirCuve, sansRendement, pressageDe,
  toutConsomme, relireRecettes, restesTheoriques } from '../lib/fabAnnexe'
import { dernierEcran, garderEcran } from '../lib/fabrication'
import { propre, qte } from '../lib/ecranSimple'
import { nouvelId, poserFeuilles, eteindreFeuille } from '../lib/feuilles'
import { lireLeScan, oublierLeScan } from '../lib/scanEntrant'
import { todayISO } from '../lib/dates'
import { prevusGardes, poserPrevu, figerPrevu, oublierPrevu } from '../lib/prevu'
import { feuillesAImprimer, feuillesDePlusieurs, cocheesParDefaut, cochablesAvec, assezEnStock, tetesDe } from '../lib/feuillesAImprimer'

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
  // ⚠️ LE QR OUVRE DIRECTEMENT LE BON ARTICLE (`?article=…`), et va droit à sa
  // déclaration (`&declarer=1`). Il n'y a plus qu'UNE façon de déclarer,
  // celle-ci — avec ses cuves, son verrou et le reste de la crème. Le scan
  // n'est qu'un raccourci vers elle.
  // ⚠️ ON REGARDE LE SCAN SANS LE PRENDRE (Layla, 2026-09-20 : « le cadre
  // marche, la crème m'envoie à la page à faire »).
  //
  // Je le consommais dans le corps du composant. Un rendu que React jette — et
  // il en jette — emportait la demande avec lui : elle était « prise » sans
  // jamais être appliquée, et l'écran ouvrait sa liste d'accueil sans un mot.
  // Le gâteau passait parce qu'il tombe juste du premier coup ; un composant,
  // non. On lit donc sans effacer, et on n'oublie qu'une fois posé.
  const [scan] = useState(lireLeScan)
  const [chemin, setChemin] = useState(() => (scan ? scan.chemin : []))
  const [droitALaDeclaration, setDroitALaDeclaration] = useState(!!scan?.declarer)
  useEffect(() => { if (scan) oublierLeScan() }, [scan])

  // ⚠️ ET SI ÇA N'ABOUTIT PAS, ON LE DIT. Retomber en silence sur l'accueil,
  // c'est ce qui a fait croire trois fois de suite que le scan « ne faisait
  // rien ». Le chemin part plein : s'il se vide, c'est qu'on n'y est pas
  // arrivé.
  const vise = scan?.chemin?.[scan.chemin.length - 1]
  useEffect(() => {
    if (vise && !chemin.length) {
      toast(`« ${propre(vise)} » n'a pas pu s'ouvrir : il n'est pas dans cette recette aujourd'hui.`)
    }
  }, [vise, chemin.length])
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
  // ⚠️ LES GÂTEAUX COCHÉS, pour monter leurs crèmes communes d'un coup
  // (Layla, 2026-09-16). Vide = l'écran d'avant, à la lettre.
  const [choisis, setChoisis] = useState([])
  const [assemblage, setAssemblage] = useState(false)
  // Le panneau « Tu imprimes quoi ? » ouvert depuis l'assemblage : on y coche
  // et on y corrige les quantités, exactement comme depuis une fiche.
  const [imprAssemble, setImprAssemble] = useState(null)
  // L'historique : un bouton, par date (Layla, 2026-09-09).
  const [histo, setHisto] = useState(null)
  const [histoOuvert, setHistoOuvert] = useState(false)
  // Le panneau d'impression : `null` = fermé. Sinon on y garde ce qui est
  // coché et la façon choisie, le temps d'appuyer sur Imprimer.
  const [impr, setImpr] = useState(null)
  // Ce qui part vraiment à l'imprimante, le temps de l'appel à `window.print`.
  const [feuillesPretes, setFeuillesPretes] = useState(null)
  // La feuille de sortie de stock à remplir à la main : vrai le temps de
  // l'impression. Elle n'appartient à aucun article — voir `imprimerSortie`.
  const [sortiePrete, setSortiePrete] = useState(false)
  // Le compteur d'impressions. C'est LUI qui déclenche le départ, et non le
  // contenu : celui-ci reste en place d'une fois sur l'autre (voir plus bas),
  // donc réimprimer la même chose ne changerait rien et rien ne partirait.
  const [tirage, setTirage] = useState(0)
  // ⚠️ CE QU'IL RESTE DE LA CRÈME (Layla, 2026-09-19). Vide = 0 partout, et
  // c'est voulu : « si 0, le reste de la crème théorique doit rentrer dans le
  // produit ». On racle la cuve, c'est le cas le plus fréquent.
  const [restes, setRestes] = useState({})
  /**
   * Poser la liasse, puis lancer l'impression. Les deux dans le même geste.
   *
   * ⚠️ ET ON RÉPOND AU DOIGT (règle de Layla, 2026-09-08 : « je ne sens pas que
   * j'ai cliqué, du coup j'appuie plusieurs fois »). Préparer l'aperçu d'une
   * cascade prend un moment — le navigateur doit mettre en page toutes les
   * feuilles — et pendant ce temps rien ne bouge à l'écran. On le dit donc tout
   * de suite, avant de rendre la main au navigateur.
   */
  const lancer = (quoi, sortie = false) => {
    navigator.vibrate?.(15)
    const combien = sortie ? 1 : (quoi || []).length
    toast(combien > 1
      ? `🖨 Préparation de ${combien} feuilles…`
      : '🖨 Préparation de la feuille…')
    // ⚠️ CHAQUE FEUILLE REÇOIT SON JETON ICI, avant de partir à l'imprimante :
    // c'est lui qui devient le QR du papier, et il ne doit rien attendre du
    // serveur — l'aperçu d'impression est déjà assez long comme ça. On pose
    // les feuilles côté serveur DERRIÈRE, sans bloquer. Réseau coupé : on perd
    // le suivi, jamais l'impression.
    const avecJeton = (quoi || []).map(f => ({ ...f, feuilleId: nouvelId() }))
    if (avecJeton.length) poserFeuilles(avecJeton, user?.id)
    setFeuillesPretes(sortie ? quoi : avecJeton)
    setSortiePrete(sortie)
    setTirage(t => t + 1)
  }

  /**
   * Imprimer ce que le portail contient, et ranger APRÈS.
   *
   * ⚠️ La classe sur <body> dit au CSS de retirer tout le reste du document.
   * Et on range à `afterprint`, pas après `print()` : sur iPad, `print()` rend
   * la main tout de suite, avant que la feuille soit partie — tout remettre en
   * place là, c'est imprimer du vide.
   *
   * ⚠️ ON N'IMPRIME QU'UNE FOIS LA LIASSE VRAIMENT POSÉE (Layla, 2026-09-18 :
   * « la page est blanche », sur téléphone). Demander les feuilles ne les pose
   * pas tout de suite : l'écran se redessine au tour suivant. L'ancien code
   * attendait 60 ms au hasard — assez sur un ordinateur, pas sur un téléphone,
   * plus lent et avec toute une cascade à poser. L'impression partait alors sur
   * un document où le reste était déjà caché et où les feuilles n'étaient pas
   * encore arrivées : DES PAGES BLANCHES.
   *
   * On attend donc deux vraies images d'affilée — la seconde n'arrive qu'une
   * fois la liasse peinte — et les polices avec, sinon le téléphone imprime des
   * lignes vides. Jamais de durée devinée.
   */
  useEffect(() => {
    if (!tirage) return undefined
    document.body.classList.add('impr-feuilles')
    let vivant = true
    // ⚠️ ON NE RETIRE PLUS LES FEUILLES DE LA PAGE (Layla, 2026-09-18 : « c'est
    // que la première page », alors que le bouton annonçait cinq feuilles).
    //
    // `afterprint` ne veut pas dire « c'est imprimé ». Sur iPhone, il arrive
    // quand le système PREND le document — pendant qu'il fabrique encore les
    // pages suivantes. On vidait la liasse à cet instant : elle disparaissait
    // sous ses pieds, et il ne restait que la première page, déjà fabriquée.
    //
    // Les feuilles restent donc en place ; elles ne coûtent rien, le CSS les
    // cache à l'écran. La prochaine impression les remplace.
    //
    // ⚠️ ET LA CLASSE NE PART PAS NON PLUS SUR `afterprint` (Layla,
    // 2026-09-18 : « je vois que des pages blanches »). Juste au-dessus d'elle,
    // dans `index.css`, dort une vieille règle : `body:not(.impr-feuilles) *
    // { visibility: hidden }`. Elle sert à l'autre façon d'imprimer de l'app
    // (celle qui montre une `.print-area`). Retirer la classe pendant que
    // l'iPhone fabrique encore son aperçu, c'est donc rendre TOUT invisible —
    // sans retirer la place : le bon nombre de pages, toutes vides. Exactement
    // ce qu'elle a vu.
    //
    // La classe ne gêne rien à l'écran (les deux règles vivent sous
    // `@media print`). On la garde donc jusqu'à ce que Layla soit VRAIMENT
    // revenue dans l'app — revenue sur l'onglet, ou un doigt posé dessus. On
    // n'écoute qu'après le départ de l'impression, pour qu'un focus d'avant ne
    // compte pas.
    const rendreLEcran = () => {
      for (const [cible, ev] of ecoutes) cible.removeEventListener(ev, rendreLEcran)
      document.body.classList.remove('impr-feuilles')
    }
    const ecoutes = [[window, 'focus'], [window, 'pointerdown'],
      [document, 'visibilitychange']]
    const ecouterLeRetour = () => {
      for (const [cible, ev] of ecoutes) cible.addEventListener(ev, rendreLEcran)
    }
    const partir = () => {
      if (!vivant) return
      window.print()
      ecouterLeRetour()
    }
    const apresLaPeinture = () =>
      requestAnimationFrame(() => requestAnimationFrame(partir))
    // ⚠️ ON N'ATTEND PLUS LES POLICES (Layla, 2026-09-18 : « ça tarde à
    // apparaître, même sur ordi »). `document.fonts.ready` attend TOUTES celles
    // de l'app — les quinze polices décoratives du Studio photos comprises —
    // alors que ces feuilles n'en utilisent aucune : elles sont écrites avec la
    // police du système. C'était une demi-seconde d'attente pour rien.
    //
    // Les deux images d'affilée suffisent : la seconde n'arrive qu'une fois la
    // liasse peinte, et c'est la seule chose qu'il fallait vraiment attendre.
    apresLaPeinture()
    return () => {
      vivant = false
      rendreLEcran()
    }
  }, [tirage])

  /** La feuille de sortie de stock, vierge — on l'imprime par paquets. */
  const imprimerSortie = () => lancer(null, true)

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
  const envoyerUn = (noeud, tete, qty, prevu = 0, restesDits = {}) => {
    const racine = noeud.produit === tete.produit
    // `prevu` : ce qu'on a VOULU faire. Les ingrédients le suivent, lui, et pas
    // le poids obtenu — voir `peseesPrevues`.
    if (racine) return envoyerAValider(tete, qty, user?.id, prevu, restesDits)
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

  const envoyer = async (noeud, tete, qty, cuitesReelles = null, pressees = 0, prevu = 0,
    restesDits = {}) => {
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
        r = await envoyerUn(noeud, tete, qty, prevu, restesDits)
      }
      if (r.erreur) toast(`Enregistré, mais Odoo a refusé : ${r.erreur}`)
      else {
        // ⚠️ ET LA LIGNE ROUGE S'ÉTEINT. Déclarer ici et scanner le QR, c'est
        // le MÊME travail : sans ce raccord, la fournée restait « à déclarer »
        // et la redéclarer la comptait deux fois — deux ordres Odoo.
        eteindreFeuille(noeud.produit, qty)
        // Plein écran, vert, une seconde et demie : ça ne se rate pas.
        setConfirme({ quoi: propre(noeud.libelle || noeud.produit), combien: qte(qty, noeud.unite) })
        setTimeout(() => setConfirme(null), 1500)
      }
      setSortie(null)
      setParTaille({})
      setRestes({})
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
        // Une préparation : ce qu'on vient d'en faire compte pour le dessus.
        // ⚠️ LA QUANTITÉ, pas juste la coche : « elle doit être égale. ou plus »
        // (Layla, 2026-09-19). Le stock d'Odoo ne monte qu'à la validation —
        // sans ce chiffre, une base faite il y a dix secondes compte pour rien.
        setFaits(f => ({ ...f, [noeud.produit]: { fois: 1, qty } }))
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

    // ---------- assembler plusieurs gâteaux ----------
    // ⚠️ LE THÈME, c'est le gâteau mère, et seul le catalogue « Déclarer » le
    // connaît (`pour`). On le recolle donc ici sur les cases de « À faire ».
    const themes = Object.fromEntries((tout || []).map(x => [x.produit, x.pour || []]))
    const avecTheme = (articles || []).map(a => ({ ...a, pour: themes[a.produit] || [] }))
    const cochables = cochablesAvec(avecTheme, choisis)
    const cocher = (p, on) =>
      setChoisis(x => (on ? [...x, p] : x.filter(y => y !== p)))
    // Les fiches complètes des gâteaux cochés : sans elles, pas de cascade à
    // additionner. Elles arrivent par `precharger`, déclenché au premier clic.
    const pretes = choisis.map(p => details[p]).filter(Boolean)
    // ⚠️ `quantites` passe dans le calcul : un chiffre corrigé dans le panneau
    // d'impression se fige, et tout ce qui en dépend suit — comme sur la fiche.
    const feuillesChoisies = pretes.length === choisis.length && choisis.length
      ? feuillesDePlusieurs(
        pretes.map(a => ({ noeud: a, qty: quantites[a.produit] ?? prevus[a.produit]?.q ?? a.tournee })),
        quantites)
      : []
    // ⚠️ Coché d'avance : ce dont il n'y a pas assez — même règle que le
    // panneau d'une fiche. Les gâteaux cochés, eux, le sont toujours : c'est ce
    // qu'on est venu faire.
    const cochesAssemble = (() => {
      const d = Object.fromEntries(feuillesChoisies.map(f =>
        [f.produit, choisis.includes(f.produit) || !assezEnStock(f)]))
      return Object.fromEntries(feuillesChoisies.map(f =>
        [f.produit, imprAssemble?.choix?.[f.produit] ?? d[f.produit]]))
    })()
    const aImprimerAssemble = feuillesChoisies.filter(f => cochesAssemble[f.produit])
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader {...nav} />
        <div className="max-w-[1000px] mx-auto px-4 py-5 pb-28">
          {erreur && <p className="text-danger text-[14px] mb-3">{erreur}</p>}
          <Onglets onglet={onglet} onChange={k => { setOnglet(k); setGateau(null); setCherche('') }} />
          {/* LES TROIS OUTILS, EN PETITES CASES. « des petites cases » (Layla,
              2026-09-15) : ils prenaient trois pleines largeurs et repoussaient
              les gâteaux sous la ligne de flottaison. Ils tiennent maintenant
              sur une ligne, l'emoji au-dessus du mot.
              ⚠️ « Mettre à jour les recettes » est un outil d'entretien : il
              n'apparaît que pour l'admin, et la rangée se répartit alors entre
              deux cases au lieu de trois. */}
          <div className="flex gap-2 mb-4">
            {[
              { cle: 'fait', emoji: '🕓', mot: 'Ce qui a été fait',
                dit: 'Ce qui a été fait',
                badge: dujour > 0 ? dujour : null, onClick: () => setHistoOuvert(true) },
              { cle: 'sortie', emoji: '✍️', mot: 'Feuille de sortie',
                dit: 'Feuille de sortie de stock', onClick: imprimerSortie },
              ...(isAdmin(user) ? [{ cle: 'maj', emoji: '🔄',
                mot: relit ? 'Lecture…' : 'Mettre à jour',
                dit: 'Mettre à jour les recettes', onClick: majRecettes,
                off: relit }] : []),
            ].map(o => (
              // ⚠️ Le mot écrit est court pour tenir dans la case ; `aria-label`
              // garde la phrase entière, pour qui lit l'écran à voix haute.
              <button key={o.cle} onClick={o.onClick} disabled={o.off} aria-label={o.dit}
                className="flex-1 min-w-0 rounded-2xl border-2 border-cream-deep bg-cream-warm
                           px-1.5 py-2 text-center disabled:opacity-50">
                <span className="block text-[17px] leading-none">{o.emoji}</span>
                <span className="block text-[11.5px] font-bold text-ink-mute leading-tight mt-1">
                  {o.mot}
                  {o.badge && <b className="text-ink"> · {o.badge}</b>}
                </span>
              </button>
            ))}
          </div>
          {imprAssemble && (
            <ChoixImpression
              feuilles={feuillesChoisies}
              // ⚠️ LE CHOIX EXISTE AUSSI ICI (Layla, 2026-09-20 : « dans
              // imprimer, ça donne maintenant toujours imprimer la cascade,
              // pas juste la page même »). Ce panneau sortait tout, sans rien
              // demander — alors que celui des fiches propose les deux depuis
              // le début. Il s'ouvre sur la cascade, parce qu'on vient d'en
              // cocher plusieurs : c'est pour ça qu'on est là.
              mode={imprAssemble.mode || 'tout'}
              onMode={m => setImprAssemble(x => ({ ...x, mode: m }))}
              coches={cochesAssemble}
              tapes={quantites}
              sous={`pour ${choisis.length} gâteau${choisis.length > 1 ? 'x' : ''}`}
              onCoche={(p, v) => setImprAssemble(x => ({ ...x, choix: { ...(x.choix || {}), [p]: v } }))}
              onQuantite={(p, v) => poser(p, v)}
              onRendre={p => setQuantites(x => { const n = { ...x }; delete n[p]; return n })}
              onImprimer={() => {
                const quoi = imprAssemble.mode === 'seule'
                  ? tetesDe(feuillesChoisies) : aImprimerAssemble
                setImprAssemble(null)
                lancer(quoi)
              }}
              onFermer={() => setImprAssemble(null)} />
          )}
          {(feuillesPretes || sortiePrete) && (
            <FeuillesImpression feuilles={feuillesPretes} sortie={sortiePrete} />
          )}
          {histoOuvert && <HistoriqueAnnexe histo={histo} onFermer={() => setHistoOuvert(false)} />}
          {confirme && <Confirmation {...confirme} />}

          {onglet === 'faire' && (articles === null
            ? <Skeleton rows={4} />
            : <CasesAFaire articles={articles} onOuvrir={ouvrir}
                choisis={choisis} cochables={cochables}
                onCocher={(p, on) => { cocher(p, on); if (on) precharger([p]) }} />)}

          {/* ⚠️ LA BARRE NE PARAÎT QU'UNE FOIS QUELQUE CHOSE DE COCHÉ : sans
              case cochée, l'écran est exactement celui d'avant. */}
          {onglet === 'faire' && choisis.length > 0 && (
            <div className="fixed left-0 right-0 bottom-0 z-[60] px-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
              <div className="max-w-[1000px] mx-auto flex items-center gap-2
                              bg-bordeaux text-cream rounded-2xl px-4 py-3 shadow-2xl">
                <b className="text-[15px]">
                  {choisis.length} gâteau{choisis.length > 1 ? 'x' : ''} choisi{choisis.length > 1 ? 's' : ''}
                </b>
                <button onClick={() => setChoisis([])}
                  className="text-[12.5px] underline opacity-90">tout décocher</button>
                <button onClick={() => setAssemblage(true)}
                  disabled={!feuillesChoisies.length}
                  className="ml-auto text-[14px] font-bold disabled:opacity-60">
                  {feuillesChoisies.length ? "voir ce qu'il faut ›" : 'un instant…'}
                </button>
              </div>
            </div>
          )}

          {assemblage && (
            <Assemblage feuilles={feuillesChoisies} gateaux={choisis}
              aImprimer={aImprimerAssemble.length}
              onImprimer={() => { setAssemblage(false); setImprAssemble({ choix: {} }) }}
              onFermer={() => setAssemblage(false)}
              onOuvrir={f => {
                // ⚠️ On ouvre la préparation AVEC SON TOTAL : une cuve pour les
                // trois tartes, pas celle d'une seule.
                setAssemblage(false)
                setFaits({}); setCuites({})
                setQuantites({ [f.produit]: f.qty })
                setChemin([f.produit])
              }} />
          )}

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
  // ⚠️ ON NE JETTE PAS TOUT LE CHEMIN (Layla, 2026-09-20 : « ça n'emmène
  // toujours pas vers l'article, ça dit que ça le fait mais ça ne le fait
  // pas »). Une seule étape qui ne correspond plus à l'arbre du moment — la
  // recette a changé, ou le composant n'est plus demandé à cette quantité —
  // et on repartait à la liste d'accueil, comme si le scan n'avait rien dit.
  // On pèle une marche à la fois : au pire on arrive sur le gâteau, jamais
  // sur l'accueil.
  if (!noeud) { setChemin(c => (c.length > 1 ? c.slice(0, -1) : [])); return null }

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
   * couvrirait la feuille. Rien à temporiser ici : l'impression part d'elle-même
   * une fois la liasse peinte, panneau refermé compris (voir plus haut).
   */
  const lancerImpression = () => {
    // ⚠️ LES DEUX FAÇONS SORTENT LA MÊME FEUILLE. « quand j'imprime juste cette
    // fiche ça doit sortir de la même manière que la cascade » (Layla,
    // 2026-09-16). « Juste cette fiche » n'imprime donc plus l'écran tel quel :
    // elle imprime la feuille de la cascade, celle de l'article qu'on regarde
    // — avec sa demande à l'économat et son tableau à remplir, comme les autres.
    // La tête est la PREMIÈRE de la liste, c'est elle qu'on a sous les yeux —
    // elle l'était en dernier avant que le parent passe devant (voir `teteDe`).
    const quoi = impr?.mode === 'seule' ? tetesDe(feuilles) : aImprimer
    setImpr(null)
    lancer(quoi)
  }
  const decoupe = decoupeDe(noeud)
  // L'étape de mise en forme qu'on confirmera en validant — la base de flan.
  const pressage = pressageDe(noeud)

  /**
   * LE GESTE « C'EST FAIT », nommé pour pouvoir être REJOUÉ à l'identique
   * quand on arrive par le QR (Layla, 2026-09-20 : « scanne pour déclarer doit
   * t'emmener direct vers la page de c'est fait de cet article »).
   *
   * ⚠️ C'est lui qui décide s'il faut demander la découpe, le pressage, ou
   * rien du tout. Ouvrir l'écran de sortie à la main par-dessus, c'était
   * perdre ces règles-là pour tous ceux qui arrivent par le scan.
   */
  const gesteFait = () => {
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
  }

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
        {(feuillesPretes || sortiePrete) && (
          <FeuillesImpression feuilles={feuillesPretes} sortie={sortiePrete} />
        )}
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
                // La question du reste ne se pose qu'à la TOUTE FIN, sur
                // l'article qu'on est venu faire — jamais en plein milieu.
                restes={finale ? restesTheoriques(cible) : []}
                restesValeurs={restes}
                onReste={finale ? (p, v) => setRestes(x => ({ ...x, [p]: v })) : undefined}
                onTaille={finale && (brut.tailles || []).length
                  ? (p, n) => setParTaille(x => ({ ...x, [p]: n })) : undefined}
                onValider={() => (surEnfant
                  ? envoyer(noeud, tete, q, sortie.valeur)
                  : surPressage
                    ? envoyer(noeud, tete, q, null, sortie.valeur)
                    // ⚠️ `q` voyage à côté de ce qui est sorti : c'est lui
                    // qui décide des ingrédients (Layla, 2026-09-14).
                    // ⚠️ Et le reste de la crème part avec : c'est la seule
                    // chose que le pâtissier a VUE et DITE.
                    : envoyer(noeud, tete, sortie.valeur, null, 0, q, restes))} />
            )
          })()
          : (
            <div className={(feuillesPretes || sortiePrete) ? undefined : 'print-area'}>
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
              onFait={gesteFait}
              // ⚠️ ARRIVÉ PAR LE QR : c'est la FICHE qui appuie, parce qu'elle
              // seule connaît son verrou — « il me laisse le déclarer alors que
              // rien de la branche n'est validé » (Layla, 2026-09-20). Si un
              // composant manque, il ne se passe rien et l'écran le montre.
              autoFait={droitALaDeclaration && !sortie}
              onAutoFait={() => setDroitALaDeclaration(false)} />
            </div>
          )}
      </div>
    </div>
  )
}
