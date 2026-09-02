import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { todayISO } from '../lib/dates'
import { loadFabProd, addFabProd, delFabProd, loadNoms, loadHistorique } from '../lib/fabricationProd'
import { loadArbreAnnexe, loadMasques, masquer, demasquer } from '../lib/fabricationAnnexe'
import { dernierEcran, garderEcran } from '../lib/fabrication'
import { loadStockProdCatalog } from '../lib/stockProd'
import { poidsUnite, versUnite } from '../lib/unites'

const ATELIER = 'annexe'
const nb = v => Number(Number(v || 0).toFixed(2)).toLocaleString('fr-FR')
// A l'atelier on ne pese pas 201,04 g et on ne monte pas 2,3 gateaux : les
// grammes et les pieces s'affichent en nombres ENTIERS. Seuls les kg gardent
// 2 decimales, sinon on perdrait 10 g de precision a chaque ligne.
const nbQ = (v, u) => (/^kg$/i.test(String(u || '').trim())
  ? nb(Math.round((Number(v) || 0) * 100) / 100)
  : nb(Math.round(Number(v) || 0)))
const propre = n => String(n || '')
  .replace(/^(E-|V-|MI-|N-|SM[.\- ]?|Sm[.\- ]?|SMT?[.\- ]?)\s*/i, '')
  .replace(/\s*(finition|production)\s*$/i, '').replace(/\s{2,}/g, ' ').trim()
const jourLisible = j => new Date(j + 'T12:00:00')
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const heure = t => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

// bordeaux = le gâteau, or = sa préparation, gris = la préparation de la préparation
const NIVEAU = ['#993556', '#b58f3c', '#9a8b7a', '#9a8b7a']

// Une vignette tant qu'il n'y a pas de photo : l'initiale sur un fond dont la
// couleur découle du nom, pour que chaque article reste reconnaissable.
const couleur = n => {
  let h = 0
  for (let i = 0; i < String(n).length; i += 1) h = (h * 31 + String(n).charCodeAt(i)) % 360
  return `hsl(${h} 32% 62%)`
}

// Sous « Suprême amande », inutile de répéter le parfum à chaque ligne :
// « 15 cm Vitrine (Praliné Amandes caramélisées) » se lit « 15 cm Vitrine ».
// On garde en revanche les parenthèses qui sont un nombre de parts — « (10) »
// est une taille, pas un parfum.
// Deux informations sont noyees dans le nom Odoo et disparaissent dans les
// « ... » des petites cases : la TAILLE (« ... 10 pers », « ... indiv ») et le
// « Pr » qui distingue l'entremets FINI de son montage. On les sort en
// etiquettes, avant la quantite, pour savoir exactement ce qui manque.
// « buche » n'est une taille qu'en fin de nom : au milieu c'est le gateau
// lui-meme (« Pr Buche chocolat 10 pers » est un 10 pers, pas une buche).
const TAILLES = [
  [/\bindiv\.?\b/i, () => 'INDIV'],
  [/\b(\d+)\s*pers\.?\b/i, m => m[1] + ' PERS'],
  [/\b(\d+)\s*cm\b/i, m => m[1] + ' CM'],
  [/\b(\d+)\s*p\b/i, m => m[1] + ' PERS'],
  [/\bunit[e\u00e9]\b/i, () => 'UNITE'],
  [/\bbuche\s*$/i, () => 'BUCHE'],
]
function taille(nom) {
  const t = String(nom || '')
  for (const [re, lab] of TAILLES) {
    const m = t.match(re)
    if (m) return lab(m)
  }
  return null
}
// « Pr » seul devant le nom = l'entremets fini. « Praline », « Preparation »
// ne doivent pas etre pris : on exige un espace derriere.
const estPr = nom => /^Pr\s/i.test(propre(nom))
// Un « cadre » sort 46, 88 ou 243 pièces d'un coup : il se compte en
// cadres ENTIERS, on ne monte pas 1,8 cadre.
const estCadre = nom => /\bcadres?\b/i.test(String(nom || ''))

function courtNom(nom) {
  let t = propre(nom).replace(/^Pr\s+/i, '')
  for (const [re] of TAILLES) {
    if (re.test(t)) { t = t.replace(re, ' '); break }
  }
  t = t.replace(/\s{2,}/g, ' ').trim() || propre(nom)
  const fin = (t.match(/\(([^()]*)\)\s*$/) || [])[1]
  if (!fin || /^\s*\d+\s*$/.test(fin)) return t
  return t.replace(/\s*\([^()]*\)\s*$/, '').trim() || t
}

// Les deux etiquettes qui disent QUOI manque : « PR » (l'entremets fini,
// glace) et la taille. Toujours avant la quantite, jamais tronquees.
function Etiquettes({ nom, petit }) {
  const t = taille(nom)
  const pr = estPr(nom)
  if (!pr && !t) return null
  const base = 'shrink-0 font-extrabold uppercase tracking-wide rounded '
    + (petit ? 'text-[9px] px-1' : 'text-[9.5px] px-1 py-px')
  return (
    <>
      {pr && <b className={base + ' text-cream bg-bordeaux'}>PR</b>}
      {t && <b className={base + ' text-bordeaux bg-cream-warm border border-line'}>{t}</b>}
    </>
  )
}

// Certaines unités d'Odoo portent leur poids dans leur nom : « Tournée (3 kg) ».
// Sans le lire, un besoin de 5 250 g devient « 5 250 tournées » au lieu de 1,75.
function Vignette({ nom, photo, taille, rond, plein }) {
  // `plein` : la vignette prend toute la place du carré. Sans ça elle gardait
  // une taille fixe de 400 px dans une carte de 112 px, et l'on ne voyait que
  // le coin de la photo.
  const style = plein
    ? { width: '100%', height: '100%', borderRadius: rond === 0 ? 0 : (rond || 12) }
    : { width: taille, height: taille, borderRadius: rond === 0 ? 0 : (rond || 12) }
  if (photo) {
    return (
      <span className="shrink-0 grid place-items-center bg-cream-warm overflow-hidden" style={style}>
        {/* la photo entière tient dans le carré, avec un peu d'air autour */}
        <img src={photo} alt="" className="w-full h-full object-contain p-1" />
      </span>
    )
  }
  return (
    <span className="grid place-items-center font-serif italic text-cream shrink-0"
      style={{ ...style, background: couleur(nom), fontSize: (plein ? 44 : taille) * 0.42 }}>
      {propre(nom).slice(0, 1).toUpperCase()}
    </span>
  )
}

export default function FabricationAnnexeView({ user, onLogout, onNavigate, activeView }) {
  const [vue, setVue] = useState('besoins')       // besoins | declarer
  const [jour, setJour] = useState(todayISO())
  const [arbre, setArbre] = useState(() => dernierEcran('annexe'))
  const [erreur, setErreur] = useState(null)
  const [journal, setJournal] = useState(null)
  const [saisie, setSaisie] = useState(null)
  const [pile, setPile] = useState([])        // d'où l'on vient dans les fiches
  const [fois, setFois] = useState(1)
  const [besoins, setBesoins] = useState({})      // besoins modifiés à la main
  const [noms, setNoms] = useState({})
  const [caches, setCaches] = useState([])
  const [catalogue, setCatalogue] = useState(null)   // les mini/maxi de « Stock Prod Annexe »
  const [voirPlus, setVoirPlus] = useState(false)
  const [histo, setHisto] = useState(null)
  const [voirHisto, setVoirHisto] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    let vivant = true
    loadArbreAnnexe()
      .then(a => { if (vivant) { setArbre(a); garderEcran('annexe', a); setErreur(null) } })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    loadNoms().then(n => { if (vivant) setNoms(n) }).catch(() => { })
    loadMasques().then(m => { if (vivant) setCaches(m) }).catch(() => { })
    // Les mini/maxi de l'onglet « Stock Prod Annexe » font foi : c'est là que
    // Layla les règle. Ceux d'Odoo ne servent qu'aux articles absents.
    loadStockProdCatalog('annexe').then(c => { if (vivant) setCatalogue(c) }).catch(() => { })
    return () => { vivant = false }
  }, [])

  useEffect(() => {
    let vivant = true
    loadFabProd(jour, ATELIER)
      .then(l => { if (vivant) setJournal(l) })
      .catch(() => { if (vivant) setJournal([]) })
    return () => { vivant = false }
  }, [jour])

  const recettes = (arbre && arbre.recettes) || {}
  const stocks = (arbre && arbre.stocks) || {}
  const minmax = useMemo(() => {
    const base = { ...((arbre && arbre.minmax) || {}) }
    for (const c of catalogue || []) {
      if (!c.actif) continue
      const min = Number(c.stock_min) || 0
      if (!(min > 0)) continue
      const max = c.stock_max != null ? Number(c.stock_max) : (base[c.product_name] || {}).max
      base[c.product_name] = { min, max: max > min ? max : min }
    }
    return base
  }, [arbre, catalogue])
  const photoDe = n => (arbre && arbre.photos && arbre.photos[n]
    ? `/api/freezer-list?mode=photo&id=${arbre.photos[n]}` : '')

  const enfantsDe = nom => {
    const r = recettes[nom]
    if (!r) return []
    return [...new Set(r.lignes.filter(l => l.fabrique && recettes[l.produit]).map(l => l.produit))]
  }

  // ===== ce qu'il faut faire, en cascade =====
  // pour faire le gâteau il faut sa préparation ; si elle manque aussi, elle
  // apparaît en dessous avec son propre besoin, et ainsi de suite
  const besoinDeBase = nom => {
    const mm = minmax[nom]
    const st = Math.max(0, stocks[nom] || 0)
    if (!mm || !(mm.min > 0) || st >= mm.min) return 0
    return Math.max(0, (mm.max || mm.min) - st)
  }
  // convertit une quantité vers l'unité dans laquelle Odoo compte cet article
  const uniteDe = nom => String((recettes[nom] && recettes[nom].sortUnite) || '').trim()
  // Un besoin s'arrondit dans SON unité : au centième pour des kilos, à
  // l'entier pour des grammes ou des pièces. Math.round() écrasait à zéro
  // tout besoin inférieur à un demi-kilo.
  const arrondiBesoin = (nom, q) => (/^kg$/i.test(uniteDe(nom))
    ? Math.round((Number(q) || 0) * 1000) / 1000
    : Math.round(Number(q) || 0))
  // toute la chaîne passe par src/lib/unites.js (testé)
  const versUniteDe = (nom, qty, uniteLigne) => versUnite(qty, uniteLigne, uniteDe(nom))
  // une tournée ne se coupe pas en deux : on arrondit au-dessus
  const arrondiUtile = (nom, q) => {
    const r = recettes[nom]
    return (r && poidsUnite(r.sortUnite)) ? Math.ceil(q * 100) / 100 : Math.ceil(q)
  }

  const cascade = (nom, besoin, prof, out, vus, tete) => {
    if (prof > 4 || vus.has(nom)) return out
    vus.add(nom)
    const r = recettes[nom]
    const b = besoins[nom] !== undefined ? besoins[nom] : besoin
    out.push({ nom, besoin: b, prof, tete: tete || nom })
    if (!r || b <= 0) return out
    const n = r.sortQty ? b / r.sortQty : 1
    // Une fiche Odoo liste parfois le même ingrédient une fois par taille :
    // additionner toutes les lignes gonflerait le besoin. On regroupe et on
    // retient la plus grande quantité.
    for (const l of regrouper(r.lignes)) {
      if (!l.fabrique || !recettes[l.produit]) continue
      const parFois = l.tailles ? Math.max(...l.tailles) : l.qty
      // La recette demande « 250 g » d'un article qu'Odoo compte en
      // « Tournée (3 kg) » : sans convertir, on comparerait des grammes à des
      // tournées et le besoin serait mille fois trop grand.
      const besoinLigne = versUniteDe(l.produit, parFois * n, l.unite)
      // un stock négatif veut dire que l'inventaire est en retard, pas qu'il
      // faut en produire 7 766 : on le compte comme zéro
      const manque = Math.max(0, besoinLigne - Math.max(0, stocks[l.produit] || 0))
      if (manque > 0.001) cascade(l.produit, arrondiUtile(l.produit, manque), prof + 1, out, vus, tete || nom)
    }
    return out
  }
  // Tout ce qui se fabrique sous ce gâteau, à n'importe quelle profondeur.
  const touteLaDescendance = (nom, prof = 0, vus = new Set(), out = []) => {
    if (prof > 5) return out
    for (const e of enfantsDe(nom)) {
      if (vus.has(e)) continue
      vus.add(e)
      out.push({ nom: e, prof: prof + 1 })
      touteLaDescendance(e, prof + 1, vus, out)
    }
    return out
  }
  // On ne s'occupe que des articles suivis dans « Stock Prod Annexe » : c'est
  // la liste que Layla tient. Un article qu'elle n'y a pas activé n'a rien à
  // faire ici, même si Odoo lui connaît un minimum.
  const suivis = useMemo(() => {
    const out = new Set()
    for (const c of catalogue || []) {
      if (!c.actif) continue
      out.add(c.product_name)
      out.add(String(c.product_name).replace(/\s*\([^()]*\)\s*$/, '').trim())
    }
    return out
  }, [catalogue])
  const estSuivi = nom => !suivis.size
    || suivis.has(nom) || suivis.has(String(nom).replace(/\s*\([^()]*\)\s*$/, '').trim())

  const travailDe = mere => {
    const out = []
    const vus = new Set()
    // On part de tout article qui est sous SON PROPRE minimum, où qu'il soit
    // dans l'arbre : « Pistache fleur d'oranger indiv » a son seuil à lui, il
    // doit remonter même si le gâteau au-dessus n'en réclame pas.
    for (const { nom, prof } of touteLaDescendance(mere)) {
      if (vus.has(nom)) continue
      if (!estSuivi(nom)) continue
      const b = besoins[nom] !== undefined ? besoins[nom] : besoinDeBase(nom)
      if (b > 0) cascade(nom, b, Math.min(prof, 3), out, vus, nom)
    }
    return out
  }
  const besoinDe = nom => (besoins[nom] !== undefined ? besoins[nom] : besoinDeBase(nom))

  // les gâteaux qui ont du travail : quelque chose manque dans leur chaîne
  // À quel point ça presse : ce qui est tombé à zéro (ou dans le négatif)
  // passe devant ce qui frôle seulement son minimum.
  const urgenceDe = nom => {
    const mm = minmax[nom]
    if (!mm || !(mm.min > 0)) return 0
    return (mm.min - (stocks[nom] || 0)) / mm.min
  }
  const aFaire = useMemo(() => {
    if (!arbre) return []
    return (arbre.racines || [])
      .filter(m => !caches.includes(m))
      .map(m => {
        const lignes = travailDe(m)
        return { mere: m, lignes, urgence: Math.max(0, ...lignes.map(l => urgenceDe(l.nom))) }
      })
      .filter(x => x.lignes.length)
      // à manque égal (tout le monde à zéro), le plus gros volume passe devant
      .sort((a, b) => b.urgence - a.urgence
        || b.lignes.reduce((t, l) => t + l.besoin, 0) - a.lignes.reduce((t, l) => t + l.besoin, 0)
        || b.lignes.length - a.lignes.length)
  }, [arbre, caches, besoins, stocks, minmax])

  // Une case par ARTICLE a fabriquer, pas une case par gateau : les tailles
  // d'un meme gateau ne doivent plus etre empilees au meme endroit. On garde
  // la mere sur la case pour savoir de quel gateau il s'agit.
  const casesAFaire = useMemo(() => {
    const out = []
    const vus = new Set()
    for (const { mere, lignes } of aFaire) {
      for (const l of lignes.filter(x => x.tete === x.nom)) { out.push({ mere, l }); vus.add(l.nom) }
    }
    // Un semi-fini sous son minimum qui n'entre dans AUCUN gâteau suivi
    // n'apparaissait nulle part : « SM- Cookies ch B », 176 à faire, invisible.
    // Ce qui compte c'est le SM-, la mère n'est qu'un repère.
    for (const nom of Object.keys(minmax)) {
      if (vus.has(nom) || caches.includes(nom) || !estSuivi(nom)) continue
      const b = besoinDeBase(nom)
      if (b > 0) out.push({ mere: null, l: { nom, besoin: arrondiUtile(nom, b), tete: nom, prof: 1 } })
    }
    return out.sort((a, b) => urgenceDe(b.l.nom) - urgenceDe(a.l.nom) || b.l.besoin - a.l.besoin)
  }, [aFaire, stocks, minmax, caches, suivis])

  // ===== ce qu'on a fait =====
  const liste = useMemo(() => {
    if (!arbre) return []
    const cherche = q.trim().toLowerCase()
    if (cherche.length >= 2) {
      const tous = [...new Set([...Object.keys(recettes), ...Object.keys(arbre.combien || {})])]
      return tous.filter(n => propre(n).toLowerCase().includes(cherche) || n.toLowerCase().includes(cherche))
        .slice(0, 40)
    }
    return (arbre.racines || []).filter(n => !caches.includes(n))
  }, [arbre, caches, q])

  const combienDe = useMemo(() => {
    const m = {}
    for (const l of journal || []) m[l.article] = (m[l.article] || 0) + 1
    return m
  }, [journal])

  // Ce qu'il faut vraiment : la recette POUR le besoin, pas arrondie à la
  // fournée entière. Sauf si l'article se fait par tournée — l'app le sait en
  // regardant ce que l'atelier a produit sur un an.
  const foisPour = (nom, b) => {
    const r = recettes[nom]
    if (!(b > 0) || !r || !r.sortQty) return 1
    // le besoin arrive déjà dans l'unité de l'article (voir versUniteDe)
    const brut = b / r.sortQty
    // un article compté en tournées se fait par tournées entières
    if (poidsUnite(r.sortUnite)) return Math.max(1, Math.ceil(brut))
    // On ne remonte plus le besoin à la « tournée habituelle » : ça donnait
    // 40 là où il en fallait 21, et trois chiffres différents à l'écran.
    // Le pâtissier tape la quantité qu'il veut dans le compteur.
    // Ce qui se compte en PIÈCES ne se coupe pas en morceaux : on ne monte pas
    // 0,47 entremets. Vérifié sur un an d'ordres Odoo — les articles en « u »
    // sont toujours produits par nombres entiers (3, 4, 6, 20, 28…), alors que
    // les crèmes et glaçages en grammes se font à la quantité voulue (0,05 ;
    // 0,43 ; 1,15…). 242 recettes sur 315 en pièces n'ont pas assez d'ordres
    // pour qu'une tournée soit détectée : sans cette règle, elles proposaient
    // un nombre à virgule.
    // un cadre ne se coupe pas : on arrondit au cadre entier au-dessus
    if (estCadre(nom)) return Math.max(1, Math.ceil(brut - 0.001))
    if (String(r.sortUnite || '').trim().toLowerCase() === 'u') {
      const pieces = Math.max(1, Math.ceil(b - 0.001))
      return Math.round((pieces / r.sortQty) * 1000) / 1000
    }
    return Math.max(0.01, Math.round(brut * 100) / 100)
  }
  // `besoinConnu` : la quantité calculée par la cascade (« il faut 5 040 g de
  // crème praliné »). Sans elle, la fiche repartait du minimum de l'article —
  // souvent absent — et proposait une fournée entière de 7 052 g.
  // Un article dont la recette tient en UNE seule ligne fabriquee n'est qu'une
  // etape de decoupe : « Biscuit pistache 10 pers » = 0,86 plaque, 9 parts en
  // sortie. Cette fiche-la n'apprend rien, on va droit a la vraie recette en
  // convertissant le besoin au passage.
  const sansEtapeInutile = (nom, besoin) => {
    let n = nom
    let b = (besoin !== undefined && besoin > 0)
      ? besoin
      : (besoins[n] !== undefined ? besoins[n] : besoinDeBase(n))
    for (let i = 0; i < 4; i++) {
      const r = recettes[n]
      if (!r) break
      const lg = regrouper(r.lignes || [])
      if (lg.length !== 1) break
      const l = lg[0]
      if (!l.fabrique || !recettes[l.produit]) break
      const fois = r.sortQty ? b / r.sortQty : 1
      const q = (l.tailles ? Math.max(...l.tailles) : l.qty) * fois
      b = versUniteDe(l.produit, q, l.unite)
      n = l.produit
    }
    return { nom: n, besoin: b }
  }

  const ouvrirFiche = (nom, depuis, besoinConnu) => {
    const cible = sansEtapeInutile(nom, besoinConnu)
    setPile(p => (depuis ? [...p, depuis] : []))
    setSaisie(cible.nom)
    const b = cible.besoin > 0
      ? cible.besoin
      : (besoins[cible.nom] !== undefined ? besoins[cible.nom] : besoinDeBase(cible.nom))
    if (cible.besoin > 0 && besoins[cible.nom] === undefined) {
      setBesoins(x => ({ ...x, [cible.nom]: arrondiBesoin(cible.nom, cible.besoin) }))
    }
    setFois(foisPour(cible.nom, b))
  }

  const ouvrirFicheSimple = nom => {
    setSaisie(nom)
    const b = besoins[nom] !== undefined ? besoins[nom] : besoinDeBase(nom)
    setFois(foisPour(nom, b))
  }

  const noter = async (nom, combienFois) => {
    const f = Number(combienFois) || 1
    const r = recettes[nom]
    const qte = r ? Math.round(r.sortQty * f * 100) / 100 : f
    const u = r ? r.sortUnite : 'u'
    try {
      const ligne = await addFabProd(jour, nom, qte, u, user?.id, f, ATELIER)
      setJournal(l => [...(l || []), ligne])
      setBesoins(b => ({ ...b, [nom]: 0 }))
      setSaisie(null)
      setPile([])
      setHisto(null)
      toast.success(propre(nom) + ' — ' + nb(f) + ' fois')
    } catch (e) { toast.error('Impossible d\'enregistrer : ' + (e.message || e)) }
  }

  const retirerLigne = async id => {
    try {
      await delFabProd(id)
      setJournal(l => (l || []).filter(x => x.id !== id))
      setHisto(null)
    } catch (e) { toast.error('Impossible de retirer : ' + (e.message || e)) }
  }

  const cacher = async (nom, ev) => {
    ev.stopPropagation()
    try { await masquer(nom, user?.id); setCaches(c => [...c, nom]) }
    catch (e) { toast.error('Impossible de ranger : ' + (e.message || e)) }
  }
  const remettre = async nom => {
    try {
      await demasquer(nom)
      setCaches(c => c.filter(x => x !== nom))
      setArbre(a => (a && (a.ecartees || []).includes(nom)
        ? { ...a, racines: [...a.racines, nom], ecartees: a.ecartees.filter(x => x !== nom) }
        : a))
      toast.success('Article ajouté')
    } catch (e) { toast.error('Impossible de remettre : ' + (e.message || e)) }
  }


  return (
    <div className="min-h-[100dvh] bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-[860px] mx-auto px-3 py-4 pb-28 print:p-0 print:max-w-none">
        <div className="flex gap-2 mb-4 print:hidden">
          {[['besoins', 'Ce qu\'il faut faire'], ['declarer', 'Déclarer ce qu\'on a fait'], ['histo', 'Historique']].map(([v, t]) => (
            <button key={v} onClick={() => {
              setVue(v); setSaisie(null); setPile([])
              if (v === 'histo' && !histo) loadHistorique(60, ATELIER).then(setHisto).catch(() => setHisto([]))
            }}
              className={'flex-1 py-3 rounded-2xl text-[14.5px] font-extrabold border-2 flex items-center justify-center gap-2 ' +
                (vue === v ? 'bg-bordeaux border-bordeaux text-cream' : 'bg-white border-line text-ink-mute')}>
              {t}
              {v === 'besoins' && casesAFaire.length > 0 && (
                <span className={'rounded-full px-2 py-0.5 text-[12.5px] ' +
                  (vue === v ? 'bg-white/25' : 'bg-danger text-white')}>{casesAFaire.length}</span>
              )}
            </button>
          ))}
        </div>

        {erreur && (
          <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3 print:hidden">
            Impossible de lire Odoo : {erreur}
          </div>
        )}
        {!arbre && !erreur && <Skeleton rows={5} />}

        {/* ===================== CE QU'IL FAUT FAIRE ===================== */}
        {vue === 'besoins' && arbre && (
          <div className="print:hidden">
            {!casesAFaire.length && (
              <p className="text-center text-ink-mute text-[14px] py-10">Rien à faire aujourd'hui.</p>
            )}
            <div className="grid gap-2.5 items-start"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {casesAFaire.map(({ mere, l }) => {
                const enRupture = (stocks[l.nom] || 0) <= 0
                return (
                  <button key={(mere || '') + '|' + l.nom} onClick={() => ouvrirFiche(l.nom)}
                    className="relative bg-white border-2 border-danger rounded-[14px] overflow-hidden text-left">
                    <span className="absolute top-0 left-0 right-0 h-1 z-10" style={{ background: NIVEAU[0] }} />
                    <span className="block w-full aspect-square overflow-hidden">
                      <Vignette nom={l.nom} photo={photoDe(l.nom) || (mere ? photoDe(mere) : '')} plein rond={0} />
                    </span>
                    <span className={'absolute top-3 left-2.5 right-2.5 rounded-full px-3 py-1.5 text-[11.5px] font-extrabold text-center text-white shadow-md '
                      + (enRupture ? 'bg-danger' : 'bg-[#854F0B]')}>
                      {enRupture ? 'rupture' : 'à remplir'}
                    </span>
                    {mere && courtNom(mere).toLowerCase() !== courtNom(l.nom).toLowerCase() && (
                      <span className="block px-2 pt-1.5 text-[10.5px] text-ink-mute leading-tight">
                        pour {courtNom(mere)}
                      </span>
                    )}
                    <span className="flex items-center flex-wrap gap-1 px-2 pt-1.5">
                      <Etiquettes nom={l.nom} petit />
                      <b className="text-[19px] font-extrabold text-danger leading-none">{nbQ(l.besoin, recettes[l.nom] && recettes[l.nom].sortUnite)}</b>
                    </span>
                    <span className="block px-2 pt-1 text-[12px] font-bold leading-tight">{courtNom(l.nom)}</span>
                    <span className="block px-2 pb-2 pt-1 text-[10.5px] leading-tight text-ink-mute">
                      il en reste {nbQ(stocks[l.nom] || 0, recettes[l.nom] && recettes[l.nom].sortUnite)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ===================== HISTORIQUE ===================== */}
        {vue === 'histo' && (
          <>
            <div className="flex items-center gap-2 mb-3 print:hidden">
              <div className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-2.5">
                <input type="date" value={jour}
                  onChange={e => { setJournal(null); setJour(e.target.value) }}
                  className="w-full bg-transparent border-0 outline-none text-[15px] font-extrabold text-ink" />
              </div>
              <button onClick={() => window.print()} title="Imprimer la feuille du jour"
                className="h-[48px] shrink-0 border border-line bg-white rounded-2xl px-4 flex items-center gap-2 text-[13.5px] font-extrabold text-ink-soft">
                <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-ink-soft fill-none" strokeWidth="1.7">
                  <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /></svg>
                Imprimer
              </button>
            </div>

            <div className="print:hidden">
              {!journal && <Skeleton rows={2} />}
              {journal && !journal.length && (
                <div className="bg-white border border-dashed border-line rounded-2xl py-6 text-center text-ink-mute text-[14px]">
                  Rien n'a été fait ce jour-là.
                </div>
              )}
              {journal && journal.map(l => (
                <div key={l.id} className="flex items-center gap-3 bg-white border border-line rounded-2xl px-3 py-2.5 mb-2">
                  <Vignette nom={l.article} photo={photoDe(l.article)} taille={46} rond={11} />
                  <span className="flex-1 min-w-0 text-[14.5px] font-semibold leading-tight">
                    {propre(l.article)}
                    <span className="block text-[11.5px] text-ink-mute font-normal mt-0.5">
                      {nb(l.fois || 1)} fois{noms[l.fait_par] ? ' · ' + noms[l.fait_par] : ''} · {heure(l.fait_le)}
                    </span>
                  </span>
                  <span className="text-[17px] font-extrabold text-ok whitespace-nowrap">{nbQ(l.qty, l.unite)} {l.unite}</span>
                  <button onClick={() => retirerLigne(l.id)} title="Annuler cette ligne"
                    className="w-9 h-9 shrink-0 border border-line rounded-xl grid place-items-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-danger fill-none" strokeWidth="2.6"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2.5 mt-7 mb-3 print:hidden">
              <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-bordeaux">Les autres jours</span>
              <span className="flex-1 h-0.5 bg-line" />
            </div>
            <div className="print:hidden">
              {!histo && <Skeleton rows={3} />}
              {histo && !histo.length && <p className="text-[13.5px] text-ink-mute">Rien encore.</p>}
              {histo && histo.map(h => (
                <button key={h.jour} onClick={() => { setJournal(null); setJour(h.jour) }}
                  className={'w-full text-left bg-white border rounded-xl px-3.5 py-2.5 mb-1.5 flex items-baseline gap-3 ' +
                    (h.jour === jour ? 'border-bordeaux' : 'border-line')}>
                  <span className="text-[14px] font-bold flex-1">{jourLisible(h.jour)}</span>
                  <span className="text-[12.5px] text-ink-soft">{h.lignes.length} fait{h.lignes.length > 1 ? 's' : ''}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ===================== DÉCLARER ===================== */}
        {vue === 'declarer' && (
          <>
            <div className="flex items-center gap-2 mb-3 print:hidden">
              <div className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-2.5">
                <input type="date" value={jour}
                  onChange={e => { setJournal(null); setSaisie(null); setJour(e.target.value) }}
                  className="w-full bg-transparent border-0 outline-none text-[15px] font-extrabold text-ink" />
              </div>
              <button onClick={() => window.print()} title="Imprimer"
                className="w-[48px] h-[48px] shrink-0 border border-line bg-white rounded-2xl grid place-items-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-ink-soft fill-none" strokeWidth="1.7">
                  <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /></svg>
              </button>
              <button onClick={() => { setVoirHisto(v => !v); if (!histo) loadHistorique(60, ATELIER).then(setHisto).catch(() => setHisto([])) }}
                title="Historique"
                className={'w-[48px] h-[48px] shrink-0 rounded-2xl grid place-items-center border ' +
                  (voirHisto ? 'bg-bordeaux border-bordeaux' : 'bg-white border-line')}>
                <svg viewBox="0 0 24 24" className={'w-5 h-5 fill-none ' + (voirHisto ? 'stroke-cream' : 'stroke-ink-soft')} strokeWidth="1.7">
                  <path d="M12 8v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v4h4" /></svg>
              </button>
            </div>

            {voirHisto && (
              <div className="mb-4 print:hidden">
                {!histo && <Skeleton rows={2} />}
                {histo && !histo.length && <p className="text-[13.5px] text-ink-mute">Rien encore.</p>}
                {histo && histo.map(h => (
                  <button key={h.jour} onClick={() => { setJournal(null); setJour(h.jour) }}
                    className={'w-full text-left bg-white border rounded-xl px-3.5 py-2.5 mb-1.5 flex items-baseline gap-3 ' +
                      (h.jour === jour ? 'border-bordeaux' : 'border-line')}>
                    <span className="text-[14px] font-bold flex-1">{jourLisible(h.jour)}</span>
                    <span className="text-[12.5px] text-ink-soft">{h.lignes.length} fait{h.lignes.length > 1 ? 's' : ''}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="relative mb-3.5 print:hidden">
              <svg viewBox="0 0 24 24"
                className="w-5 h-5 stroke-ink-mute fill-none absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un article"
                className="w-full bg-white border border-line rounded-2xl pl-11 pr-11 py-2.5 text-[15px] outline-none focus:border-bordeaux" />
              {q && (
                <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center">
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-ink-mute fill-none" strokeWidth="2.4">
                    <path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </div>

            <div className="grid gap-2.5 items-start print:hidden"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {liste.map(nom => {
                const fait = combienDe[nom] || 0
                const st = stocks[nom]
                return (
                  <button key={nom} onClick={() => ouvrirFiche(nom)}
                    className={'relative bg-white border rounded-[14px] overflow-hidden text-left ' +
                      (fait ? 'border-2 border-ok' : 'border-line')}>
                    <span className="absolute top-0 left-0 right-0 h-1 z-10"
                      style={{ background: NIVEAU[0] }} />
                    <span className="block w-full aspect-square overflow-hidden">
                      <Vignette nom={nom} photo={photoDe(nom)} plein rond={0} />
                    </span>
                    {fait > 0 && (
                      <span className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-ok grid place-items-center">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-white fill-none" strokeWidth="3.4"><path d="M4 13l5 5L20 7" /></svg>
                      </span>
                    )}
                    {!q.trim() && (
                      <span onClick={ev => cacher(nom, ev)} title="ranger"
                        className="absolute bottom-8 right-1.5 w-7 h-7 rounded-full bg-white/90 border border-line grid place-items-center">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 stroke-ink-mute fill-none" strokeWidth="2.4">
                          <path d="M6 6l12 12M18 6L6 18" /></svg>
                      </span>
                    )}
                    {(estPr(nom) || taille(nom)) && (
                      <span className="flex items-center flex-wrap gap-1 px-2 pt-1.5">
                        <Etiquettes nom={nom} petit />
                      </span>
                    )}
                    <span className="block px-2 pt-1.5 text-[12px] font-bold leading-tight">{courtNom(nom)}</span>
                    <span className="block px-2 pb-2 pt-1 text-[10.5px] leading-tight text-ink-mute">
                      {st === undefined ? '\u00a0' : 'il en reste ' + nbQ(st, uniteDe(nom)) + ' ' + uniteDe(nom)}
                    </span>
                  </button>
                )
              })}
            </div>

            {!q.trim() && arbre && (
              <button onClick={() => setVoirPlus(v => !v)}
                className="w-full mt-3 py-3 rounded-2xl bg-white border border-dashed border-line text-[13.5px] font-bold text-bordeaux print:hidden">
                + ajouter un article
              </button>
            )}
            {voirPlus && arbre && (
              <div className="mt-3 print:hidden">
                {[...new Set([...caches, ...(arbre.ecartees || [])])].sort().map(n => (
                  <div key={n} className="flex items-center gap-3 bg-white border border-line rounded-xl px-3 py-2.5 mb-1.5">
                    <Vignette nom={n} photo={photoDe(n)} taille={38} rond={10} />
                    <span className="flex-1 text-[13.5px] min-w-0">{propre(n)}</span>
                    <button onClick={() => remettre(n)}
                      className="border border-line rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-bordeaux">ajouter</button>
                  </div>
                ))}
                {![...caches, ...(arbre.ecartees || [])].length && (
                  <p className="text-[13.5px] text-ink-mute">Tout est déjà affiché.</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2.5 mt-7 mb-3 print:hidden">
              <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-bordeaux">Aujourd'hui</span>
              <span className="flex-1 h-0.5 bg-line" />
            </div>
            <div className="print:hidden">
              {!journal && <Skeleton rows={2} />}
              {journal && !journal.length && (
                <div className="bg-white border border-dashed border-line rounded-2xl py-6 text-center text-ink-mute text-[14px]">
                  Tape ce que tu as fait.
                </div>
              )}
              {journal && journal.map(l => (
                <div key={l.id} className="flex items-center gap-3 bg-white border border-line rounded-2xl px-3 py-2.5 mb-2">
                  <Vignette nom={l.article} photo={photoDe(l.article)} taille={46} rond={11} />
                  <span className="flex-1 min-w-0 text-[14.5px] font-semibold leading-tight">
                    {propre(l.article)}
                    <span className="block text-[11.5px] text-ink-mute font-normal mt-0.5">
                      {nb(l.fois || 1)} fois{noms[l.fait_par] ? ' · ' + noms[l.fait_par] : ''} · {heure(l.fait_le)}
                    </span>
                  </span>
                  <span className="text-[17px] font-extrabold text-ok whitespace-nowrap">{nbQ(l.qty, l.unite)} {l.unite}</span>
                  <button onClick={() => retirerLigne(l.id)}
                    className="w-9 h-9 shrink-0 border border-line rounded-xl grid place-items-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-danger fill-none" strokeWidth="2.6"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* la feuille imprimée */}
        <div className="hidden print:block print-area">
          <h2 className="font-serif italic text-[20px] mb-0.5">Fabrication Annexe</h2>
          <p className="text-[12px] text-ink-soft mb-3">{jourLisible(jour)}</p>
          {(journal || []).length === 0 ? <p className="text-[12.5px]">Rien ce jour-là.</p> : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase w-[60px]">Heure</th>
                  <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase">Article</th>
                  <th className="text-right border-b-2 border-ink py-1.5 text-[10.5px] uppercase w-[70px]">Fois</th>
                  <th className="text-right border-b-2 border-ink py-1.5 text-[10.5px] uppercase w-[100px]">Sortie</th>
                  <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase w-[110px]">Par qui</th>
                </tr>
              </thead>
              <tbody>
                {(journal || []).map(l => (
                  <tr key={l.id}>
                    <td className="border-b border-[#ddd] py-1.5 px-1">{heure(l.fait_le)}</td>
                    <td className="border-b border-[#ddd] py-1.5 px-1">{propre(l.article)}</td>
                    <td className="border-b border-[#ddd] py-1.5 px-1 text-right font-bold">{nb(l.fois || 1)}</td>
                    <td className="border-b border-[#ddd] py-1.5 px-1 text-right">{nb(l.qty)} {l.unite}</td>
                    <td className="border-b border-[#ddd] py-1.5 px-1 text-[11.5px]">{noms[l.fait_par] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* la fiche : combien de fois, et la recette qui suit */}
      {saisie && (() => {
        // le gâteau vendu n'est pas fabriqué à l'annexe : on n'y montre que ce
        // qui manque, pas sa recette de montage ni le compteur de fournées
        // Cacher la recette d'un gateau vendu ne vaut que pour « ce qu'il faut
        // faire » : dans « declarer ce qu'on a fait » la liste n'est FAITE que
        // de racines, la regle y supprimait la nomenclature, le compteur et le
        // bouton « C'est fait » — l'onglet devenait vide.
        const estMere = vue === 'besoins' && (arbre && (arbre.racines || []).includes(saisie))
        return (
        <div className="fixed inset-0 z-[70] bg-ink/55 flex items-end sm:items-center justify-center p-0 sm:p-4 print:hidden"
          onPointerDown={e => { if (e.target === e.currentTarget) { setSaisie(null); setPile([]) } }}>
          <div className="bg-cream w-full max-w-[540px] rounded-t-[22px] sm:rounded-[22px] max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 px-4 pt-4 pb-1">
            <div className="flex items-center gap-3 mb-3">
              {pile.length > 0 && (
                <button onClick={() => { const p = [...pile]; const r = p.pop(); setPile(p); ouvrirFicheSimple(r) }}
                  className="w-10 h-10 shrink-0 border border-line bg-white rounded-xl grid place-items-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-bordeaux fill-none" strokeWidth="2.4">
                    <path d="M15 5l-7 7 7 7" /></svg>
                </button>
              )}
              <Vignette nom={saisie} photo={photoDe(saisie)} taille={58} rond={15} />
              <b className="text-[18px] leading-tight flex-1 min-w-0">
                {courtNom(saisie)}
                <span className="ml-2 inline-flex align-middle gap-1">
                  <Etiquettes nom={saisie} />
                </span>
              </b>
            </div>
            {pile.length > 0 && (
              <p className="text-[12px] text-ink-mute -mt-1 mb-2">
                pour faire <b>{courtNom(pile[pile.length - 1])}</b>
              </p>
            )}
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-2">

            {vue === 'besoins' && minmax[saisie] && minmax[saisie].min > 0 && (stocks[saisie] || 0) < minmax[saisie].min && (
              <div className={'rounded-2xl px-3.5 py-3 mb-2.5 flex items-center gap-3 border '
                + ((stocks[saisie] || 0) <= 0 ? 'bg-[#FCEEE8] border-[#f0cfc5]' : 'bg-[#FFF7E0] border-[#e6d3a3]')}>
                <b className={'text-[27px] font-extrabold leading-none '
                  + ((stocks[saisie] || 0) <= 0 ? 'text-danger' : 'text-[#854F0B]')}>
                  {nbQ(besoinDe(saisie), uniteDe(saisie))}
                </b>
                <span className={'text-[12.5px] leading-snug '
                  + ((stocks[saisie] || 0) <= 0 ? 'text-danger' : 'text-[#854F0B]')}>
                  <b className="text-[15px]">à faire</b><br />
                  il en reste {nbQ(stocks[saisie] || 0, uniteDe(saisie))} {uniteDe(saisie)}
                </span>
              </div>
            )}


            {!estMere && recettes[saisie] && recettes[saisie].sortQty > 0 && (() => {
              const r = recettes[saisie]
              const u = String(r.sortUnite || '').trim()
              const cadre = estCadre(saisie)
              const brut = r.sortQty * fois
              const qte = cadre ? Math.max(1, Math.ceil(fois - 0.001))
                : (/^kg$/i.test(u) ? Math.round(brut * 100) / 100 : Math.round(brut))
              // on avance par pas utiles : 100 g, 0,5 kg, 1 pièce, 1 cadre
              const pas = cadre ? 1 : (/^(g|gr)$/i.test(u) ? 100 : (/^kg$/i.test(u) ? 0.5 : 1))
              const poser = v => setFois(cadre
                ? Math.max(1, Math.ceil((Number(v) || 0) - 0.001))
                : Math.max(0.01, (Number(v) || 0) / r.sortQty))
              return (
                <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-2.5 mb-2.5">
                  <button onClick={() => poser(Math.max(pas, qte - pas))}
                    className="w-14 h-14 shrink-0 border-2 border-line rounded-2xl text-[27px] font-extrabold text-bordeaux leading-none">−</button>
                  <div className="flex-1 text-center min-w-0">
                    <input type="number" min="0" step={pas} value={qte}
                      onChange={e => poser(e.target.value)}
                      className="sans-fleches w-full bg-transparent border-0 outline-none text-center text-[36px] font-extrabold text-ink p-0" />
                    <span className="block text-[12px] text-ink-soft font-extrabold">
                      {cadre ? (qte > 1 ? 'cadres à produire' : 'cadre à produire') : u + ' à produire'}
                    </span>
                    <span className="block text-[10.5px] text-ink-mute">
                      {cadre
                        ? '= ' + nbQ(r.sortQty * qte, u) + ' ' + u
                        : '≈ ' + nb(fois) + ' fois la recette'}
                    </span>
                  </div>
                  <button onClick={() => poser(qte + pas)}
                    className="w-14 h-14 shrink-0 border-2 border-line rounded-2xl text-[27px] font-extrabold text-bordeaux leading-none">+</button>
                </div>
              )
            })()}

            {!estMere && !(recettes[saisie] && recettes[saisie].sortQty > 0) && (
            <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-2.5 mb-2.5">
              <button onClick={() => setFois(f => Math.max(0.01, f > 1 ? f - 1 : Math.round((f - 0.25) * 100) / 100))}
                className="w-14 h-14 shrink-0 border-2 border-line rounded-2xl text-[27px] font-extrabold text-bordeaux leading-none">−</button>
              <div className="flex-1 text-center">
                <input type="number" step="0.25" min="0.01" value={fois}
                  onChange={e => setFois(Math.max(0.01, Number(e.target.value) || 0.01))}
                  className="sans-fleches w-full bg-transparent border-0 outline-none text-center text-[36px] font-extrabold text-ink p-0" />
                <span className="text-[11.5px] text-ink-mute font-bold">fournées</span>
              </div>
              <button onClick={() => setFois(f => (f < 1 ? Math.round((f + 0.25) * 100) / 100 : f + 1))}
                className="w-14 h-14 shrink-0 border-2 border-line rounded-2xl text-[27px] font-extrabold text-bordeaux leading-none">+</button>
            </div>
            )}

            {!estMere && recettes[saisie] && recettes[saisie].lignes.length > 0 && (
              <div className="bg-white border border-line rounded-2xl overflow-hidden mb-2.5">
                <div className="bg-cream-warm px-3.5 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-soft border-b border-line">
                  Ce qu'il faut
                </div>
                {regrouper(recettes[saisie].lignes).map((l, i) => {
                  // un ingrédient qui se fabrique lui-même : on peut entrer
                  // dans sa recette pour la faire à son tour
                  const ouvrable = l.fabrique && recettes[l.produit]
                  // Ce qui est DÉJÀ couvert par le stock : le pâtissier n'a
                  // plus à ouvrir l'article pour le vérifier. Il reste
                  // ouvrable s'il veut en lire la recette.
                  const stockLa = stocks[l.produit]
                  const besoinLigne = versUnite(
                    (l.tailles ? Math.max(...l.tailles) : l.qty) * fois, l.unite, uniteDe(l.produit))
                  const couvert = stockLa !== undefined && besoinLigne > 0 && stockLa >= besoinLigne - 1e-9
                  const contenu = (
                    <>
                      <span className="text-[17px] font-extrabold min-w-[96px] text-right">
                        {l.tailles ? l.tailles.map(x => nbQ(x * fois, l.unite)).join(' / ') : nbQ(l.qty * fois, l.unite)} {l.unite}
                      </span>
                      <span className={'text-[14px] flex-1 min-w-0 ' + (l.fabrique ? 'text-bordeaux font-bold' : '')}>
                        {courtNom(l.produit)}
                        {stockLa !== undefined && (
                          <span className={'block text-[10.5px] '
                            + (couvert ? 'text-ok font-extrabold'
                              : (stockLa || 0) <= 0 ? 'text-danger font-normal' : 'text-ink-mute font-normal')}>
                            {couvert
                              ? 'en stock · ' + nbQ(stockLa, uniteDe(l.produit)) + ' ' + uniteDe(l.produit)
                              : (stockLa || 0) <= 0
                                ? 'rupture'
                                : 'il en reste ' + nbQ(stockLa, uniteDe(l.produit)) + ' ' + uniteDe(l.produit)}
                          </span>
                        )}
                      </span>
                      {ouvrable && (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-bordeaux fill-none shrink-0" strokeWidth="2.6">
                          <path d="M9 5l7 7-7 7" /></svg>
                      )}
                    </>
                  )
                  return ouvrable ? (
                    <button key={i}
                      onClick={() => {
                        // le stock est dans l'unité de l'article, la ligne dans
                        // la sienne : on convertit avant de soustraire.
                        const q = (l.tailles ? Math.max(...l.tailles) : l.qty) * fois
                        const besoin = versUniteDe(l.produit, q, l.unite)
                        ouvrirFiche(l.produit, saisie, Math.max(0, besoin - Math.max(0, stocks[l.produit] || 0)))
                      }}
                      className={'w-full text-left flex items-center gap-3 px-3.5 py-2.5 border-b border-[#f4eee2] last:border-0 active:bg-cream-warm '
                        + (couvert ? 'bg-[#F3F8EC]' : '')}>
                      {contenu}
                    </button>
                  ) : (
                    <div key={i} className={'flex items-center gap-3 px-3.5 py-2.5 border-b border-[#f4eee2] last:border-0 '
                      + (couvert ? 'bg-[#F3F8EC]' : '')}>
                      {contenu}
                    </div>
                  )
                })}
              </div>
            )}

            {!estMere && recettes[saisie] && poidsUnite(recettes[saisie].sortUnite) && (
              <p className="mb-2.5 border border-[#b58f3c] text-[#b58f3c] bg-[#FBF3DF] rounded-2xl px-3.5 py-2.5 text-[12.5px] font-bold">
                Cet article se compte en {recettes[saisie].sortUnite} : il se fait par tournées entières.
              </p>
            )}


            {!estMere && recettes[saisie] && poidsUnite(recettes[saisie].sortUnite) && (
              <div className="bg-[#EAF3DE] border border-[#cfe0b8] rounded-2xl px-3.5 py-3 flex items-baseline gap-2.5">
                <b className="text-[23px] font-extrabold text-ok">
                  {nbQ(recettes[saisie].sortQty * fois, recettes[saisie].sortUnite)} {recettes[saisie].sortUnite}
                </b>
                <span className="text-[12.5px] text-ok">
                  en sortie
                  {poidsUnite(recettes[saisie].sortUnite) && (
                    <> · {nbQ(recettes[saisie].sortQty * fois * poidsUnite(recettes[saisie].sortUnite), 'g')} g</>
                  )}
                </span>
              </div>
            )}
            {!estMere && !recettes[saisie] && (
              <p className="text-[12.5px] text-[#854F0B]">Pas de recette dans Odoo : on note seulement les fournées.</p>
            )}

            </div>

            <div className="flex-shrink-0 px-4 pt-3 pb-4 border-t border-line">
            {!estMere && (
              <button onClick={() => noter(saisie, fois)}
                className="w-full py-4 rounded-2xl bg-ok text-white text-[17px] font-extrabold flex items-center justify-center gap-2.5">
                <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-white fill-none" strokeWidth="3"><path d="M4 13l5 5L20 7" /></svg>
                C'est fait
              </button>
            )}
            <button onClick={() => { setSaisie(null); setPile([]) }}
              className="w-full mt-2 py-3 rounded-2xl bg-white border border-line text-ink-mute text-[14.5px] font-bold">
              fermer
            </button>
            </div>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

// Une fiche Odoo peut lister le même ingrédient une fois par taille de gâteau.
// On le montre une seule fois, avec toutes ses quantités : « 20 / 80 / 120 g ».
function regrouper(lignes) {
  const out = []
  const vus = new Map()
  for (const l of lignes) {
    const cle = l.produit + '|' + l.unite
    if (vus.has(cle)) {
      const d = vus.get(cle)
      if (!d.tailles) d.tailles = [d.qty]
      if (!d.tailles.includes(l.qty)) d.tailles.push(l.qty)
      continue
    }
    const d = { ...l }
    vus.set(cle, d)
    out.push(d)
  }
  return out
}
