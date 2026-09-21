import { useState, useEffect, useMemo, useRef } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { loadFabProdDepuis, depuisJours, delFabProd, datesDesOrdres, rattacherOrdre } from '../lib/fabricationProd'
import { quandFait } from '../lib/jourLisible'
import { loadOrdresAnnexe } from '../lib/fabricationAnnexe'
import { feuillesDuJour } from '../lib/feuilles'
import { loadManques, validerDansOdoo, annulerOrdre, loadSaisies, saveSaisies, loadStocksNegatifs, setFait, retrouverOf } from '../lib/fabrication'
import { canValiderAnnexe } from '../lib/auth'
import { versUnite } from '../lib/unites'
import { todayISO } from '../lib/dates'
import { AjoutIngredient } from './ValidationView'

// ====== « À valider Annexe » : la page dédiée ======
// Ce que l'annexe a marqué « c'est fait » attend ici sa confirmation dans Odoo.
// On ne force jamais sans une demande explicite. Réservée à perm_valider_annexe.
//
// L'écran est le JUMEAU de « À valider CD- » (ValidationView.jsx) : même mise en
// page, mêmes mots, mêmes gestes — seuls changent le titre, les articles, et
// deux choses propres à l'annexe :
//   - la quantité RÉELLEMENT produite ; l'ordre est clôturé dessus, sans reliquat ;
//   - un article déclaré dont l'ordre n'a pas pu être créé, signalé sans être
//     effaçable : ici on valide, on ne lance jamais de fabrication.

// Quantités produites et consommations corrigées : gardées côté serveur, donc
// retrouvées sur un autre appareil, et effacées à la validation.
const CLE_SAISIES = 'valider_annexe_saisies'

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })

// Odoo répond avec l'état de l'ordre, en anglais : « progress » ne dit rien à
// personne. On traduit, et surtout on dit quoi faire.
const enClair = m => ({
  progress: "commencé, mais pas terminé : un ingrédient n'était pas réservé. Refais « Valider » — s'il insiste, c'est qu'il en manque vraiment.",
  confirmed: "Odoo n'a pas pu le terminer : regarde ce qui manque, plus haut.",
  cancel: 'cet ordre a été annulé dans Odoo',
  draft: 'cet ordre est encore en brouillon dans Odoo',
  to_close: "Odoo le dit prêt à clôturer, mais ne l'a pas clôturé",
}[m] || m)
const norm = u => String(u || '').toLowerCase().replace(/^units?$/, 'u')
// A l'atelier on ne pese pas 1 234,56 g : les quantites s'affichent entieres.
const qte = (q, u) => (norm(u) === 'kg'
  ? `${nb(Math.round(q * 1000))} g`
  : `${nb(Math.round(q))} ${norm(u) === 'g' ? 'g' : u}`)
// ⚠️ TOUT PARLE EN GRAMMES, MÊME CE QUI VIENT EN KILOS (Layla, 2026-09-21 :
// « tous les ingrédients article dans l'app parlent en gr, même s'ils viennent
// en kilo »). Ces deux-là servent la case qu'on retape : elle affichait
// « produit sur 1,4 » — 1,4 quoi ? — juste sous un titre qui disait 1 400 g.
const enG = (q, u) => (norm(u) === 'kg' ? (Number(q) || 0) * 1000 : (Number(q) || 0))
const deG = (q, u) => (norm(u) === 'kg' ? (Number(q) || 0) / 1000 : (Number(q) || 0))
// Le mot affiché à côté de la case : un kilo se dit en grammes, et « Units »
// se dit « u » — c'est le mot d'Odoo, pas celui de l'atelier.
const motUnite = u => (norm(u) === 'kg' ? 'g' : norm(u))
// Les articles de l'annexe portent d'autres préfixes que ceux du cake design.
const propre = n => String(n || '')
  .replace(/^(E-|V-|MI-|N-|SM[.\- ]?|Sm[.\- ]?|SMT?[.\- ]?)\s*/i, '')
  .replace(/\s*(finition|production)\s*$/i, '').replace(/\s{2,}/g, ' ').trim()

/**
 * « └ pour Base CBS 23 cm » — le gâteau qui a demandé cette préparation.
 *
 * Elle lui est RÉSERVÉE : une autre taille ne s'en sert pas, elle refait la
 * sienne (Layla, 2026-09-10). Rien ne s'affiche quand la fournée a été
 * déclarée pour elle-même : la ligne dirait deux fois la même chose.
 */
export function PourQui({ pour }) {
  if (!pour) return null
  return (
    <div className="text-[11.5px] text-ink-mute">
      └ pour <b className="text-ink">{propre(pour)}</b>
    </div>
  )
}

const sansLesNoms = (obj, noms) =>
  Object.fromEntries(Object.entries(obj).filter(([n]) => !noms.has(n)))

export default function ValidationAnnexeView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(null)
  const [sel, setSel] = useState([])
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [resultats, setResultats] = useState(null)
  const [confirmer, setConfirmer] = useState(false)
  const [tour, setTour] = useState(0)
  // Les compteurs faux de l'annexe, en colonne à droite : la réponse à
  // « pourquoi ça me dit qu'il manque alors que la matière est là ».
  const [negatifs, setNegatifs] = useState([])

  useEffect(() => {
    let vivant = true
    loadStocksNegatifs('annexe')
      .then(l => { if (vivant) setNegatifs(l) })
      .catch(() => { /* un compteur non lu ne doit pas gêner la validation */ })
    return () => { vivant = false }
  }, [tour])
  const [ouvert, setOuvert] = useState(null)      // l'ordre dont on note les consommations
  // ⚠️ LES FEUILLES DU JOUR, pour retrouver la CASCADE IMPRIMÉE (Layla,
  // 2026-09-21 : « dans valider, c'est regroupé par cascade imprimée, que je
  // trouve les liaisons »). Chaque papier porte le numéro de sa liasse : tout
  // ce qui est sorti de l'imprimante ensemble se retrouve ensemble ici.
  const [feuilles, setFeuilles] = useState(null)

  const [cherche, setCherche] = useState(null)    // la déclaration dont on cherche l'ordre
  const [faites, setFaites] = useState({})        // ordre -> quantité vraiment produite
  // Quand chaque ordre a été marqué fait à l'atelier : jour ET heure
  // (Layla, 2026-09-19). On valide parfois deux jours après la fournée.
  const [quandFaits, setQuandFaits] = useState({})
  const [notes, setNotes] = useState({})          // { ordre: { idLigne: quantité } }
  const [ajouts, setAjouts] = useState({})        // { ordre: [ingrédients ajoutés à la main] }

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        // ⚠️ Le JOURNAL d'abord — il vient de Supabase et répond en un
        // clin d'œil — puis TOUT le reste de front. L'écran enchaînait trois
        // lectures d'Odoo l'une après l'autre : deux secondes d'attente pour
        // un travail qui en prend une. (Layla, 2026-09-10 : « l'affichage est
        // très lent ».)
        //
        // Une semaine, pas le seul jour : ce qui a été déclaré hier et pas
        // validé doit rester sous les yeux. Les ordres déjà validés ou annulés
        // sont écartés juste après, comme avant.
        const pOrdres = loadOrdresAnnexe()
        const pGardees = loadSaisies(CLE_SAISIES).catch(() => ({}))
        const journal = await loadFabProdDepuis(depuisJours(7), 'annexe')
        if (!vivant) return
        // Les états ET les recettes de tous les ordres déclarés, en UNE lecture
        // lancée sans attendre les ordres ouverts.
        const pDetail = loadManques([...new Set((journal || [])
          .map(d => d.ordre).filter(Boolean))])
        const [arbre, gardees, detailJournal] = await Promise.all([pOrdres, pGardees, pDetail])
        if (!vivant) return
        const parNom = new Map((detailJournal || []).map(d => [d.name, d]))
        const ordres = arbre.ordres || {}
        // un ordre par article déclaré, sans doublon ; et ce qui n'a PAS
        // d'ordre reste visible et signalé — sinon du travail déclaré
        // disparaîtrait sans que personne le sache.
        const parOrdre = new Map()
        const sans = new Map()
        const ouvertsParNom = new Map(Object.values(ordres).map(o => [o.name, o]))
        // ⚠️ Odoo COUPE un ordre en deux dès qu'on valide moins que prévu :
        // WHPDX/MO/21178 devient 21178-001 (ce qui est fait) + 21178-002 (le
        // reste), et le numéro d'origine n'existe plus. L'app le cherchait sous
        // son ancien nom, ne le trouvait pas, en concluait qu'il était validé —
        // et le reliquat disparaissait de l'écran. Vécu le 2026-09-03 :
        // 93 « SM- cadre citron meringuée » perdus de vue.
        const morceauOuvert = new Map()
        for (const o of Object.values(ordres)) {
          const coupe = String(o.name || '').match(/^(.+)-\d+$/)
          if (coupe && !morceauOuvert.has(coupe[1])) morceauOuvert.set(coupe[1], o)
        }
        // ⚠️ `arbre.ordres` est rangé PAR PRODUIT : un seul ordre par article.
        // Quand deux ordres existent pour le même produit — celui créé par la
        // déclaration et un autre lancé par Odoo — le second écrase le premier,
        // et la déclaration se retrouvait ignorée en silence. Vécu le 09/09 :
        // WHPDX/MO/21333 (biscuit amande gingembre, déclaré par l'atelier)
        // effacé par WHPDX/MO/21335. On demande donc leur état à Odoo pour tous
        // les ordres du journal que l'arbre ne connaît pas.
        for (const o of detailJournal || []) {
          if (ouvertsParNom.has(o.name) || morceauOuvert.has(o.name)) continue
          if (['draft', 'confirmed', 'progress', 'to_close'].includes(o.etat)) {
            ouvertsParNom.set(o.name, { name: o.name, qty: o.qty, state: o.etat })
          }
        }
        for (const d of journal || []) {
          // La déclaration sait à quel ordre elle se rattache. S'il n'est plus
          // ouvert, c'est qu'il a été validé (ou annulé) : il n'y a plus rien à
          // faire — sans ça l'écran réclamait d'en créer un deuxième pour du
          // travail déjà validé.
          if (d.ordre) {
            // On accepte le morceau resté ouvert quand Odoo a coupé l'ordre.
            const encoreLa = ouvertsParNom.get(d.ordre) || morceauOuvert.get(d.ordre)
            if (!encoreLa) continue
            // La clé est le nom RÉEL d'aujourd'hui : c'est lui qu'on enverra à
            // Odoo, l'ancien numéro n'existe plus.
            // `prevu` = ce qu'Odoo avait programmé ; `declare` = ce que
            // l'annexe dit avoir fait. C'est le DÉCLARÉ qui fait foi : Odoo
            // programme souvent tout seul (règle de réapprovisionnement) une
            // quantité qui n'a rien à voir. Vécu le 04/09 : 9 425 g déclarés,
            // l'écran proposait les 7 680 g de l'ordre WHPDX/MO/21184.
            if (!parOrdre.has(encoreLa.name)) {
              // `pour` : le gâteau pour lequel la préparation a été faite. Il
              // est réservé à lui, l'écran le dit (Layla, 2026-09-10).
              parOrdre.set(encoreLa.name, { name: encoreLa.name, article: d.article, pour: d.pour || null, prevu: encoreLa.qty, declare: 0, demande: encoreLa.qty, etat: encoreLa.state, unite: encoreLa.unite || '' })
            }
            const e = parOrdre.get(encoreLa.name)
            // ⚠️ DEUX UNITÉS SE CROISENT ICI. Le journal compte dans l'unité de
            // l'ARTICLE (la crème citron gingembre est en kilos) ; l'ordre Odoo,
            // lui, est dans l'unité de sa RECETTE (des grammes). Mélangées, la
            // ligne affichait « 14 g » pour 14,328 kg — et c'est ce chiffre-là
            // qui serait parti à la validation. (Layla, 2026-09-11.)
            e.declare = Math.round((e.declare
              + versUnite(Number(d.qty) || 0, d.unite, e.unite)) * 100) / 100
            e.demande = e.declare > 0 ? e.declare : e.prevu
            continue
          }
          // ⚠️ On NE RACCROCHE PLUS une déclaration à un ordre d'Odoo qui
          // traînerait pour le même article. « Je ne veux plus qu'il cherche des
          // ordres ou qu'il lie à des ordres dans Odoo : l'app crée ses propres
          // ordres » — Layla, le 2026-09-04. Une déclaration sans ordre reste
          // sans ordre, et se voit comme telle.
          const p = sans.get(d.article) || { article: d.article, pour: d.pour || null, qty: 0, unite: d.unite, ids: [], quand: 0 }
          p.qty += Number(d.qty) || 0
          p.ids.push(d.id)
          p.quand = Math.max(p.quand, new Date(d.fait_le || 0).getTime() || 0)
          sans.set(d.article, p)
        }
        const base = [...parOrdre.values()]
        const orphelins = [...sans.values()].map(p => ({
          name: 'sans-ordre:' + p.article, article: p.article, pour: p.pour, sansOrdre: true, ids: p.ids,
          // « tout juste déclaré » : calculé ICI, au chargement, pas au rendu.
          toutRecent: Date.now() - p.quand < 120000,
          demande: Math.round(p.qty * 100) / 100, unite: p.unite, manques: [], lignes: [],
        }))
        if (!base.length) { setLignes(orphelins); return }
        // Presque tout est déjà là ; il ne reste à demander que les morceaux
        // qu'Odoo a coupés, dont le nom diffère de celui du journal.
        const aLire = base.map(x => x.name).filter(n => !parNom.has(n))
        if (aLire.length) {
          for (const d of await loadManques(aLire)) parNom.set(d.name, d)
          if (!vivant) return
        }
        // ⚠️ LE « POUR » DU JOURNAL GAGNE (Layla, 2026-09-21 : « la mousse est
        // liée à quel article dans validation ? »). Odoo, lui, ne connaît que
        // l'origine de l'ordre — souvent rien, ou sa propre marque. La
        // déclaration, elle, sait pour QUEL gâteau la fournée a été faite :
        // c'est ce lien-là qu'on cherche, et c'est aussi lui qui range l'écran
        // par famille. L'écrasement le perdait en silence.
        const out = [
          ...base.map(b => {
            const odoo = parNom.get(b.name) || { manques: [], lignes: [] }
            return { ...b, ...odoo, pour: b.pour || odoo.pour || null }
          }),
          ...orphelins,
        ]
        setLignes(out)
        // ⚠️ RIEN N'EST COCHÉ D'AVANCE — même règle qu'« À valider CD- » :
        // « tout est décoché. et je coche comme je veux » (Layla, 2026-09-19).
        setSel([])
        // Les dates de déclaration, pour les afficher (la validation les relit
        // de son côté : deux lectures, mais c'est le même carnet et c'est peu).
        datesDesOrdres(out.map(x => x.name)).then(d => { if (vivant) setQuandFaits(d || {}) }).catch(() => { })
        // On garde ce qui a déjà été tapé (plafonné à la demande, qui a pu
        // baisser dans Odoo) et on ne remplit par la recette que le reste.
        const vivants = new Set(out.map(x => x.name))
        // Ce qui est tapé à l'instant l'emporte sur ce qui vient du serveur.
        setFaites(f => {
          const dep = { ...(gardees.faites || {}), ...f }
          return Object.fromEntries(out.map(x =>
            [x.name, dep[x.name] === undefined ? x.demande : Math.min(x.demande, dep[x.name])]))
        })
        // Les ordres partis de la liste (validés ailleurs, annulés) n'ont plus
        // de saisie à garder : sinon elle ressortirait des mois plus tard.
        setNotes(n => {
          const dep = { ...(gardees.notes || {}), ...n }
          return Object.fromEntries(Object.entries(dep).filter(([nom]) => vivants.has(nom)))
        })
        setAjouts(a => {
          const dep = { ...(gardees.ajouts || {}), ...a }
          return Object.fromEntries(Object.entries(dep).filter(([nom]) => vivants.has(nom)))
        })
      } catch (e) { if (vivant) setErreur(e.message || String(e)) }
    })()
    return () => { vivant = false }
  }, [tour])

  // Enregistrement retardé : pas un appel par touche du clavier, et jamais avant
  // d'avoir la liste (on écraserait avec du vide).
  const perdu = useRef(false)
  useEffect(() => {
    if (!lignes) return undefined
    const t = setTimeout(() => {
      saveSaisies(CLE_SAISIES, { faites, notes, ajouts })
        .then(() => { perdu.current = false })
        // Le silence a coûté une demi-journée : quand ça ne s'enregistre pas,
        // il faut le dire. Une seule fois, pas à chaque frappe.
        .catch(() => {
          if (perdu.current) return
          perdu.current = true
          toast.error('Tes quantités ne sont PAS enregistrées : elles seront perdues en quittant l\'écran.')
        })
    }, 900)
    return () => clearTimeout(t)
  }, [lignes, faites, notes, ajouts])

  const choisis = useMemo(() => (lignes || []).filter(l => sel.includes(l.name)), [lignes, sel])
  // Un ingrédient qui manque est parfois fabriqué par un AUTRE ordre de la même
  // liste : il ne manque pas, il attend juste sa validation. Vécu le 04/09 :
  // « il manque 7 680 g de crème au beurre citron » alors que les 9 425 g
  // venaient d'être faits, dans un ordre encore à valider juste au-dessus.
  const cleArticle = n => String(n || '').replace(/^\[[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase()
  const producteurDe = useMemo(() => {
    const m = new Map()
    for (const l of lignes || []) if (l.article && !l.sansOrdre) m.set(cleArticle(l.article), l.name)
    return m
  }, [lignes])
  // L'ordre dans lequel envoyer : ce qui FABRIQUE avant ce qui CONSOMME.
  // Sans ça, valider les deux d'un coup échouait sur le second.
  const rangerParDependance = (liste) => {
    const parNom = new Map(liste.map(l => [l.name, l]))
    const vus = new Set(); const sortie = []
    const poser = (l, chemin) => {
      if (!l || vus.has(l.name) || chemin.has(l.name)) return
      chemin.add(l.name)
      for (const c of l.lignes || []) {
        const four = producteurDe.get(cleArticle(c.produit))
        if (four && four !== l.name) poser(parNom.get(four), chemin)
      }
      chemin.delete(l.name)
      if (!vus.has(l.name)) { vus.add(l.name); sortie.push(l) }
    }
    for (const l of liste) poser(l, new Set())
    return sortie
  }

  /**
   * LES LIGNES RANGÉES PAR FAMILLE DE DÉCLARATION (Layla, 2026-09-21).
   *
   * La famille, c'est ce POUR QUOI la fournée a été déclarée : la crème, la
   * génoise et le cadre citron partent ensemble parce qu'ils ont été faits
   * ensemble. Le gâteau lui-même n'a pas de « pour » — il EST la famille, et
   * se range donc sous son propre nom, avec tout ce qu'il a réclamé.
   *
   * ⚠️ Ça ne demande rien à Odoo : le lien est déjà dans la déclaration. J'étais
   * d'abord passé par le catalogue (le gâteau vendu de l'article) — une lecture
   * de plus, et un rangement qui ne disait pas ce qui avait été fait ensemble.
   *
   * Les familles les plus fournies d'abord : c'est là qu'est le travail.
   */
  /**
   * De quel papier vient cet article, et donc de quelle cascade.
   *
   * ⚠️ Un même article peut avoir été imprimé dans DEUX liasses le même jour
   * (deux gâteaux qui réclament la même crème). On prend d'abord celle qui a
   * été DÉCLARÉE — c'est le travail qu'on valide — puis la plus récente.
   */
  const cascadeDe = useMemo(() => {
    const par = new Map()
    const rang = f => (f.declare_le ? 2 : 1)
    for (const f of feuilles || []) {
      if (!f.liasse) continue
      const vu = par.get(f.produit)
      const mieux = !vu || rang(f) > rang(vu.f)
        || (rang(f) === rang(vu.f) && String(f.imprime_le) > String(vu.f.imprime_le))
      if (mieux) {
        par.set(f.produit, {
          f,
          liasse: f.liasse,
          // La tête de la cascade : le gâteau qu'on est parti faire.
          tete: (f.chemin || [])[0] || f.pour || f.produit,
        })
      }
    }
    return par
  }, [feuilles])

  const groupes = useMemo(() => {
    const par = new Map()
    for (const l of lignes || []) {
      // La cascade imprimée d'abord : c'est elle qui montre les liaisons.
      // Sans papier (déclaré à la main, ou d'un autre jour), on retombe sur ce
      // POUR QUOI la fournée a été faite, puis sur l'article lui-même.
      const c = cascadeDe.get(l.article)
      const cle = c ? c.liasse : (l.pour || l.article)
      const nom = c ? c.tete : (l.pour || l.article)
      if (!par.has(cle)) par.set(cle, { cle, nom, lignes: [] })
      par.get(cle).lignes.push(l)
    }
    return [...par.values()].sort((a, b) =>
      b.lignes.length - a.lignes.length || a.nom.localeCompare(b.nom, 'fr'))
  }, [lignes, cascadeDe])

  /**
   * LE MÊME ARTICLE DÉCLARÉ PLUSIEURS FOIS AUJOURD'HUI.
   *
   * « J'ai deux mousses. Comment je sais si ça a été cliqué par erreur ? J'ai
   * peur que le pâtissier fasse que cliquer sans réfléchir » (Layla,
   * 2026-09-21). Et elle avait raison de demander : le même jour, les biscuits
   * gianduja ont été déclarés deux fois à 43 minutes d'intervalle, par deux
   * personnes — pendant que les deux mousses, elles, étaient séparées de six
   * heures et de quantités différentes, donc bien réelles.
   *
   * L'écran ne tranche pas à sa place : il MONTRE que l'article revient, avec
   * les heures. C'est elle qui sait si l'atelier a vraiment fait deux cuves.
   */
  const revientPlusieursFois = useMemo(() => {
    const par = new Map()
    for (const l of lignes || []) {
      const k = cleArticle(l.article)
      if (!par.has(k)) par.set(k, [])
      par.get(k).push(l)
    }
    return new Map([...par].filter(([, v]) => v.length > 1))
  }, [lignes])

  const prets = choisis.filter(l => !l.manques.length && !l.sansOrdre)
  const bloques = choisis.filter(l => l.manques.length && !l.sansOrdre)
  const manquesCumules = [...new Map(bloques.flatMap(l => l.manques).map(m => [m.produit, m])).values()]

  // Produire 20 sur 31 ne consomme pas la matière de 31 : chaque composant
  // suit la proportion, sauf celui qui a été corrigé à la main.
  const aConsommer = (l, c) => {
    const saisi = (notes[l.name] || {})[c.id]
    if (saisi !== undefined && saisi !== '') return Number(saisi)
    const faite = faites[l.name] ?? l.demande
    const part = l.demande > 0 ? faite / l.demande : 1
    return Math.round(c.besoin * part * 100) / 100
  }

  useEffect(() => {
    let vivant = true
    // Lecture de NOTRE base, pas d'Odoo : elle ne coûte presque rien.
    feuillesDuJour()
      .then(f => { if (vivant) setFeuilles(f) })
      .catch(() => setFeuilles([]))
    return () => { vivant = false }
  }, [tour])

  const poser = (n, v, max) =>
    setFaites(f => ({ ...f, [n]: Math.max(0, Math.min(max, Number(v) || 0)) }))

  // Annuler l'ordre dans Odoo. Demande délibérée : même un ordre lancé par
  // Odoo lui-même part. Il n'est pas effacé, il passe en « annulé ».
  async function annuler(l) {
    const ok = await confirmDialog(
      `Annuler l'ordre ${l.name} — ${propre(l.article)} ?\n\n`
      + "Il passera en « annulé » dans Odoo et sortira de cette liste. Rien ne sera fabriqué.",
      { confirmLabel: "Annuler l'ordre", danger: true })
    if (!ok) return
    try {
      const r = await annulerOrdre([l.name], user?.id)
      // Un ordre qui sert une COMMANDE ne s'annule pas : la déclaration part,
      // l'ordre reste, et l'article revient dans « ce qu'il faut faire ».
      const cmd = r && r.commandes && r.commandes[l.name]
      if (cmd) {
        await setFait({ name: l.name }, false, user?.id)
        setLignes(v => (v || []).filter(x => x.name !== l.name))
        setSel(v => v.filter(n => n !== l.name))
        toast.success(`Déclaration retirée. L'ordre reste : il sert la commande ${cmd}.`)
      } else if (r && r.annules) {
        setLignes(v => (v || []).filter(x => x.name !== l.name))
        setSel(v => v.filter(n => n !== l.name))
        toast.success(l.name + ' annulé dans Odoo')
      } else toast.error((r && r.refuses && r.refuses[0]) || "Odoo a refusé l'annulation")
    } catch (e) { toast.error(e.message || String(e)) }
  }

  // Une déclaration dont l'ordre n'a jamais pu être créé : elle ne mène nulle
  // part. On la retire, sans rien toucher dans Odoo (il n'y a rien à toucher).
  /**
   * ⚠️ ON REGARDE AVANT D'ACCUSER (Layla, 2026-09-21). Les ordres du tiramisu
   * existaient (21702, 21703) : seul leur numéro n'était pas revenu se coller
   * sur la ligne. L'écran disait « refais-le », et deux ordres de plus sont
   * nés pour le même travail. Ce bouton va le chercher chez Odoo et le
   * rattache — sans jamais prendre un ordre déjà rattaché ailleurs.
   */
  async function retrouverLOrdre(l) {
    setCherche(l.name)
    try {
      const dejaPris = (lignes || []).map(x => x.name).filter(n => !String(n).startsWith('sans-ordre:'))
      const t = await retrouverOf({
        produit: l.article, qty: l.demande, jour: todayISO(), exclure: dejaPris,
      })
      if (!t) { toast('Aucun ordre ne correspond chez Odoo. Là, il faut vraiment le refaire.'); return }
      for (const id of l.ids || []) await rattacherOrdre(id, t.name, false)
      toast.success(`Retrouvé : ${t.name}`)
      setLignes(null); setTour(v => v + 1)
    } catch (e) { toast.error(e.message || String(e)) }
    finally { setCherche(null) }
  }

  async function retirerDeclaration(l) {
    const ok = await confirmDialog(
      `Retirer la déclaration « ${propre(l.article)} » (${qte(l.demande, l.unite)}) ?\n\n`
      + "Rien n'existe dans Odoo pour elle. Elle disparaîtra simplement de cette liste.",
      { confirmLabel: 'Retirer', danger: true })
    if (!ok) return
    try {
      for (const id of l.ids || []) await delFabProd(id)
      setLignes(v => (v || []).filter(x => x.name !== l.name))
      toast.success('Déclaration retirée.')
    } catch (e) { toast.error(e.message || String(e)) }
  }

  async function lancer(forcer) {
    // ⚠️ FORCER PREND TOUTE LA SÉLECTION (Layla, 2026-09-21 : « forcer, plus
    // inclure les valider sélection »). Avant, il ne partait qu'avec les
    // bloqués : sur cinq lignes cochées dont trois prêtes, il fallait appuyer
    // DEUX fois — forcer, puis valider — pour une seule intention. Les prêtes
    // passent de toute façon sans rien forcer.
    const cibles = rangerParDependance(forcer ? [...prets, ...bloques] : prets).map(l => l.name)
    if (!cibles.length || envoi) return
    setEnvoi(true)
    const produits = {}
    const quantites = {}
    for (const n of cibles) {
      produits[n] = faites[n]
      const l = (lignes || []).find(x => x.name === n)
      const conv = {}
      for (const c of (l?.lignes || [])) {
        const q = aConsommer(l, c)
        if (q >= 0) conv[c.id] = q
      }
      if (Object.keys(conv).length) quantites[n] = conv
    }
    // Ce que la recette ne prévoyait pas, et qui a pourtant été utilisé.
    const enPlus = {}
    for (const n of cibles) {
      const liste = (ajouts[n] || []).filter(a => Number(a.qty) > 0)
      if (liste.length) enPlus[n] = liste.map(a => ({ produit: a.produit, uom: a.uom, qty: Number(a.qty) }))
    }
    try {
      // La production compte pour le jour où elle a été FAITE, pas pour celui
      // où on la valide : on retrouve la date de chaque déclaration, tous jours
      // confondus. (Layla, 2026-09-09.)
      const dates = await datesDesOrdres(cibles).catch(() => ({}))
      const res = await validerDansOdoo(cibles, forcer, user?.id, quantites, enPlus, produits, dates)
      setResultats(res)
      // Ce qui est validé n'a plus rien à faire dans la liste. Ce qui a échoué
      // y reste, avec son message : c'est encore à traiter.
      const faits = new Set(res.filter(r => r.ok).map(r => r.name))
      if (faits.size) {
        setLignes(l => (l || []).filter(x => !faits.has(x.name)))
        setSel(s2 => s2.filter(n => !faits.has(n)))
        setFaites(f => sansLesNoms(f, faits))
        setNotes(n => sansLesNoms(n, faits))
        setAjouts(a => sansLesNoms(a, faits))
        toast.success(faits.size + (faits.size > 1 ? ' ordres validés' : ' ordre validé') + ' dans Odoo')
      }
    } catch (e) { toast.error(e.message || String(e)) }
    setEnvoi(false)
  }

  // Écrire dans Odoo est irréversible : l'écran ne s'ouvre pas sur un simple lien.
  if (!canValiderAnnexe(user)) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
        <p className="max-w-[520px] mx-auto mt-10 px-4 text-center text-[14px] text-ink-mute">
          Cet écran valide des fabrications dans Odoo. Il demande la permission « Valider Annexe ».
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      {/* Deux colonnes sur ordinateur : la validation à gauche, les compteurs
          faux de l'annexe à droite. Sur téléphone la colonne passe dessous. */}
      <div className="mx-auto px-4 py-5 max-w-[1010px] grid gap-6 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div>
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="font-fraunces italic text-[26px] font-medium">À valider Annexe</h1>
          <button onClick={() => { setLignes(null); setResultats(null); setTour(v => v + 1) }}
            className="ml-auto bg-white border border-line rounded-xl px-3 py-2 text-[13px] text-ink-soft">↻ Actualiser</button>
        </div>
        <p className="text-[12.5px] text-ink-mute mb-3">
          Ce que l'annexe a marqué « c'est fait » et qui attend sa confirmation dans Odoo. L'ordre est clôturé sur la quantité produite : ce qui n'a pas été fait n'est pas reporté.
        </p>

        {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3">{erreur}</div>}
        {!lignes && !erreur && <Skeleton rows={4} />}
        {envoi && <p className="text-center text-ink-mute py-8">Validation en cours dans Odoo…</p>}

        {resultats && !envoi && (
          <>
            {resultats.map(r => (
              <div key={r.name} className={'rounded-xl px-3.5 py-3 mb-2 ' +
                (r.ok ? 'bg-[#EAF3DE] border border-[#cfe0b8]' : 'bg-[#FCEEE8] border border-[#f0c9c9]')}>
                <b className="text-[14.5px]">{r.ok ? '✓' : '✗'} {r.name}</b>
                <div className="text-[12.5px] text-ink-soft">
                  {r.ok ? 'validé dans Odoo' : enClair(r.message)}
                  {r.reliquat && ` · reste ${nb(r.reliquat)} en reliquat`}
                </div>
              </div>
            ))}
            <button onClick={() => { setLignes(null); setResultats(null); setTour(v => v + 1) }}
              className="w-full bg-bordeaux text-cream rounded-2xl py-3.5 text-[15px] font-bold mt-2">Terminer</button>
          </>
        )}

        {lignes && !resultats && !envoi && lignes.length === 0 && (
          <div className="py-14 text-center text-ink-mute text-[14px] bg-cream-warm rounded-xl">
            Rien à valider pour le moment.<br />
            <span className="text-[12.5px]">Ce que l'équipe marque « c'est fait » dans Fabrication Annexe arrive ici.</span>
          </div>
        )}

        {lignes && !resultats && !envoi && groupes.map(g => (
          <section key={g.cle} className="mb-3">
            {/* Un seul gâteau ? Pas de titre : il n'apprend rien. */}
            {groupes.length > 1 && (
              <div className="flex items-center gap-2 mb-1.5 mt-1">
                <span className="text-[13.5px] font-extrabold">{propre(g.nom)}</span>
                <span className="text-[11.5px] text-ink-mute tabular-nums">{g.lignes.length}</span>
                <span className="flex-1 border-t border-line" />
                <button
                  onClick={() => setSel(v => {
                    const siens = g.lignes.map(x => x.name)
                    const tout = siens.every(n => v.includes(n))
                    return tout ? v.filter(n => !siens.includes(n)) : [...new Set([...v, ...siens])]
                  })}
                  className="text-[11.5px] font-bold text-bordeaux">
                  tout cocher
                </button>
              </div>
            )}
            {g.lignes.map(l => {
          // Déclaré, mais aucun ordre ouvert dans Odoo. L'ordre se crée au moment
          // du « c'est fait » dans Fabrication Annexe, jamais ici : cet écran
          // valide, il ne lance pas de fabrication. On le signale quand même —
          // sans ça, du travail déclaré disparaîtrait sans que personne le sache.
          if (l.sansOrdre) {
            return (
              <div key={l.name} className="border border-line rounded-xl mb-2 overflow-hidden border-l-4 border-l-[#d9a441]">
                <div className="flex items-center gap-3 px-3.5 py-3 bg-white">
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-bold">{propre(l.article)} — {qte(l.demande, l.unite)}</div>
                    <PourQui pour={l.pour} />
                    {/* La déclaration s'enregistre AVANT que l'ordre parte dans
                        Odoo : pendant quelques secondes elle est légitimement
                        « sans ordre ». Accuser tout de suite était faux — vécu
                        le 2026-09-04 sur le Voile mangue passion, dont l'ordre
                        existait bel et bien. */}
                    <div className="text-[11.5px] text-ink-mute">
                      {l.toutRecent
                        ? 'Son ordre est en train de partir dans Odoo. Rafraîchis dans quelques secondes.'
                        : "Son numéro n'est pas revenu. Cherche-le avant de refaire le travail."}
                    </div>
                  </div>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-[#FFF7E0] text-[#854F0B]">
                    sans ordre
                  </span>
                </div>
                <div className="border-t border-line px-3.5 py-2 flex gap-2">
                  {!l.toutRecent && (
                    <button onClick={() => retrouverLOrdre(l)} disabled={cherche === l.name}
                      className="rounded-lg px-3 py-2 text-[12.5px] font-bold border border-bordeaux
                                 bg-white text-bordeaux disabled:opacity-50">
                      {cherche === l.name ? 'je cherche…' : '🔎 retrouver son ordre'}
                    </button>
                  )}
                  <button onClick={() => retirerDeclaration(l)}
                    className="ml-auto rounded-lg px-3 py-2 text-[12.5px] font-bold border border-danger bg-white text-danger">
                    retirer cette déclaration
                  </button>
                </div>
              </div>
            )
          }

          const on = sel.includes(l.name)
          const faite = faites[l.name] ?? l.demande
          const reste = Math.max(0, l.demande - faite)
          // ⚠️ DEUX LIGNES, UN SEUL BOUTON (Layla, 2026-09-21 : « trop de
          // boutons, trop d'écriture, c'est long »). La carte en faisait cinq :
          // titre, numéro, fait le, prévu le, pastille — puis une rangée pour
          // « refuser » et une autre pour « consommé ». Rien n'a changé dans le
          // fonctionnement : le liseré de gauche dit ce que disait la pastille,
          // la croix fait ce que faisait le bouton rouge, et la pastille
          // « consommé » ouvre le même repli.
          return (
            <div key={l.name} className={'border border-line rounded-xl mb-1.5 overflow-hidden border-l-4 ' +
              (l.manques.length ? 'border-l-[#d9a441]' : 'border-l-[#7ba05b]')}>
              <div className="flex items-center gap-2.5 px-3 py-2.5 bg-white">
                <input type="checkbox" checked={on} className="w-6 h-6 accent-[#993556] flex-shrink-0"
                  aria-label={propre(l.article)}
                  onChange={e => setSel(v => (e.target.checked ? [...v, l.name] : v.filter(x => x !== l.name)))} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15.5px] font-bold leading-tight">{propre(l.article)}</div>
                  <PourQui pour={l.pour} />
                </div>
                {/* Le seul chiffre qu'on touche : sous le pouce, pas trois
                    rangées plus bas. */}
                <input type="number" min="0" max={Math.round(enG(l.demande, l.unite))} step="any"
                  inputMode="decimal"
                  aria-label={`Produit de ${propre(l.article)}`}
                  value={Math.round(enG(faite, l.unite) * 100) / 100}
                  onChange={e => poser(l.name, deG(e.target.value, l.unite), l.demande)}
                  className="w-[86px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                <span className="text-[11.5px] text-ink-mute whitespace-nowrap">
                  {motUnite(l.unite)} / {qte(l.demande, l.unite)}
                </span>
                <button onClick={() => annuler(l)} title="Refuser · annuler l'ordre"
                  aria-label={`Refuser ${propre(l.article)}`}
                  className="text-ink-mute text-[16px] px-1 leading-none">✕</button>
              </div>

              {/* Ce qui manque, en une ligne par ingrédient. */}
              {l.manques.length > 0 && (
                <div className="px-3 pb-2 pl-[44px] text-[12.5px] text-[#854F0B]">
                  {l.manques.map((m, i) => {
                    const four = producteurDe.get(cleArticle(m.produit))
                    return (
                      <div key={i}>
                        il manque <b className="text-ink">{qte(m.manque, m.unite)}</b> de {propre(m.produit)}
                        {four && four !== l.name && (
                          <span className="text-[#3d6f8e]"> · attend <b className="font-mono">{four}</b></span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {reste > 0 && (
                <div className="px-3 pb-2 pl-[44px] text-[11.5px] font-bold text-[#854F0B]">
                  {qte(reste, l.unite)} non fait{reste > 1 ? 's' : ''}
                </div>
              )}

              {/* ⚠️ Deux fois le même article dans la journée : on le DIT, avec
                  les heures et les quantités. À elle de savoir si l'atelier a
                  vraiment fait deux cuves — l'app ne devine pas à sa place. */}
              {(revientPlusieursFois.get(cleArticle(l.article)) || []).length > 1 && (
                <div className="px-3 pb-2 pl-[44px] text-[11.5px] text-[#854F0B]">
                  ⚠️ déclaré {revientPlusieursFois.get(cleArticle(l.article)).length} fois aujourd’hui —{' '}
                  {revientPlusieursFois.get(cleArticle(l.article))
                    .map(x => `${quandFaits[x.name] ? quandFait(quandFaits[x.name]).replace(/^.*à /, '') : '?'} (${qte(x.demande, x.unite)})`)
                    .join(' · ')}
                </div>
              )}

              {/* La ligne grise : tout ce qui ne se touche pas. */}
              <div className="px-3 pb-2 pl-[44px] flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-ink-mute font-mono">
                  {l.name}
                  {quandFaits[l.name] ? ` · fait ${quandFait(quandFaits[l.name])}` : ''}
                  {l.quand ? ` · prévu le ${new Date(String(l.quand).replace(' ', 'T') + 'Z')
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : ''}
                </span>
                {(l.lignes || []).length > 0 && (
                  <button onClick={() => setOuvert(ouvert === l.name ? null : l.name)}
                    className="ml-auto text-[11.5px] font-bold text-bordeaux border border-line
                               rounded-full px-2.5 py-0.5 bg-cream">
                    {ouvert === l.name ? '▾' : '▸'} consommé
                  </button>
                )}
              </div>

              {(l.lignes || []).length > 0 && (
                <div>
                  {ouvert === l.name && (
                    <div className="px-3.5 pb-3">
                      <p className="text-[12px] text-ink-mute mb-2">
                        Corrige les quantités si tu n'as pas utilisé exactement la recette.
                        Ferme sans rien changer pour garder ce qui est prévu.
                      </p>
                      {l.lignes.map(c => (
                        <div key={c.id} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-[#f0e8db] last:border-0">
                          <span className="flex-1 text-[13.5px] min-w-0">
                            {propre(c.produit)}
                            <span className="block text-[11px] text-ink-mute">
                              {/* ⚠️ En grammes ici aussi : un ingrédient qui
                                  vient en kilos s'écrivait « 0,2 kg » au milieu
                                  de voisins en grammes. */}
                              recette : {qte(c.besoin, c.unite)}
                              {faite !== l.demande && (notes[l.name] || {})[c.id] === undefined
                                && ' · ajusté pour ' + qte(faite, l.unite)}
                            </span>
                          </span>
                          <input type="number" min="0" step="any" inputMode="decimal"
                            aria-label={`Consommé de ${propre(c.produit)}`}
                            value={Math.round(enG(aConsommer(l, c), c.unite) * 100) / 100}
                            onChange={e => setNotes(n => ({
                              ...n,
                              [l.name]: {
                                ...(n[l.name] || {}),
                                [c.id]: e.target.value === '' ? '' : deG(e.target.value, c.unite),
                              },
                            }))}
                            className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                          <span className="text-[12px] text-ink-mute w-[26px]">{motUnite(c.unite)}</span>
                        </div>
                      ))}

                      {(ajouts[l.name] || []).map((a, i) => (
                        <div key={'a' + i} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-[#f0e8db]">
                          <span className="flex-1 text-[13.5px] min-w-0 text-bordeaux">{propre(a.nom)}</span>
                          <input type="number" min="0" step="any" inputMode="decimal" value={a.qty}
                            onChange={e => setAjouts(m => ({
                              ...m,
                              [l.name]: (m[l.name] || []).map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                            }))}
                            className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                          <span className="text-[12px] text-ink-mute w-[26px]">{a.unite}</span>
                          <button onClick={() => setAjouts(m => ({
                            ...m, [l.name]: (m[l.name] || []).filter((_, j) => j !== i),
                          }))} className="text-ink-mute text-[15px] px-1" title="retirer">✕</button>
                        </div>
                      ))}

                      <AjoutIngredient onChoisir={a => setAjouts(m => ({
                        ...m,
                        [l.name]: [...(m[l.name] || []), { produit: a.id, nom: a.nom, uom: a.uom, unite: a.unite, qty: '' }],
                      }))} />

                      <div className="flex gap-2 mt-2.5 flex-wrap">
                        <button onClick={() => setOuvert(null)}
                          className="rounded-lg px-3 py-2 text-[12.5px] font-bold border border-line bg-white text-ink-soft">
                          fermer sans changer
                        </button>
                        <span className="ml-auto" />
                        {(notes[l.name] || ajouts[l.name]) && (
                          <button onClick={() => {
                            setNotes(n => { const s2 = { ...n }; delete s2[l.name]; return s2 })
                            setAjouts(m => { const s2 = { ...m }; delete s2[l.name]; return s2 })
                          }}
                            className="rounded-lg px-3 py-2 text-[12.5px] font-bold border border-line bg-white text-ink-mute">
                            revenir à la recette
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
          </section>
        ))}

        {lignes && lignes.length > 0 && !resultats && !envoi && (
          <>
            <div className="text-[12.5px] text-ink-soft my-3">
              {choisis.length} sélectionné(s) · {prets.length} prêt(s), {bloques.length} à forcer
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => lancer(false)} disabled={!prets.length}
                className={'flex-1 min-w-[200px] rounded-2xl py-3.5 text-[15px] font-bold ' +
                  (prets.length ? 'bg-bordeaux text-cream' : 'bg-white border border-line text-ink-mute')}>
                Valider la sélection{prets.length ? ` (${prets.length})` : ''}
              </button>
              <button onClick={() => setConfirmer(true)} disabled={!bloques.length}
                className={'rounded-2xl py-3.5 px-4 text-[13.5px] font-bold border bg-white ' +
                  (bloques.length ? 'border-danger text-danger' : 'border-line text-ink-mute')}>
                Tout forcer{choisis.length ? ` (${prets.length + bloques.length})` : ''}
              </button>
            </div>
            <p className="text-[11.5px] text-ink-mute text-center mt-3">
              L'ordre est <b className="text-[#854F0B]">clôturé sur la quantité produite</b>. Ce qui n'a pas été fait n'est pas reporté : à refaire, on le redéclare depuis Fabrication Annexe.
            </p>
          </>
        )}
        </div>

        {/* Les compteurs faux de l'ANNEXE : les articles « SM » dont Odoo compte
            moins que zéro. Un stock négatif compte comme zéro disponible —
            c'est lui qui fait dire « il manque » alors que la matière est là. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="bg-white border border-line rounded-2xl overflow-hidden">
            <div className="px-3.5 pt-3 pb-2 border-b border-line">
              <b className="text-[14px]">⚠️ Compteurs faux</b>
              <span className="text-[12px] text-ink-mute tabular-nums"> · {negatifs.length}</span>
              <p className="text-[11.5px] text-ink-mute mt-1 leading-snug">
                Odoo en compte moins que zéro. C'est ce qui fait dire « il manque »
                alors que la matière est là.
              </p>
            </div>
            {negatifs.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-ink-mute text-[13px]">Aucun — tout est à zéro ou au-dessus.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
                {negatifs.map(a => (
                  <div key={a.produit} className="flex items-baseline gap-2 px-3.5 py-1.5 border-b border-dashed border-[#f0e8db] last:border-0">
                    <span className="flex-1 min-w-0 text-[12.5px]">{propre(a.produit)}</span>
                    <b className="text-[12.5px] text-danger whitespace-nowrap tabular-nums">{qte(a.qty, a.unite)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmer && (
        <div className="fixed inset-0 z-[80] bg-ink/50 flex items-center justify-center p-4"
          onPointerDown={e => { if (e.target === e.currentTarget) setConfirmer(false) }}>
          <div className="bg-white rounded-2xl p-4 max-w-[420px]">
            <b className="text-[16px]">Forcer la validation ?</b>
            <p className="text-[13px] text-ink-soft mt-1 mb-2">
              {prets.length > 0 && (
                <>Les <b>{prets.length}</b> prêtes partent aussi. </>
              )}
              Odoo enregistrera la fabrication même si le stock ne suit pas. Il manque :
            </p>
            {manquesCumules.map((m, i) => (
              <div key={i} className="text-[13.5px]">• <b>{qte(m.manque, m.unite)}</b> de {propre(m.produit)}</div>
            ))}
            <p className="text-[12px] text-ink-mute mt-2">Le stock de ces articles deviendra négatif dans Odoo.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setConfirmer(false); lancer(true) }}
                className="flex-1 bg-danger text-cream rounded-xl py-3 text-[14px] font-bold">Forcer</button>
              <button onClick={() => setConfirmer(false)} className="rounded-xl py-3 px-4 text-[14px] border border-line">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
