import { useState, useEffect, useRef } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadFabAnnexe, loadToutFabAnnexe, loadArticleFabAnnexe, photoFabAnnexe,
  loadHistoriqueAnnexe, parJour, bloquants, declares, parGateauMere, noeudAu,
  declarer, envoyerAValider, tourneesSuggerees, pourFois, peseesDe, foisDuNoeud } from '../lib/fabAnnexe'
import { estModeTest } from '../lib/modeTest'
import { frappe } from '../lib/frappe'
import { todayISO } from '../lib/dates'
import { dernierEcran, garderEcran } from '../lib/fabrication'

// ============================================================
// « Fabrication Annexe 2 » — la refonte, article par article.
//
// Trois idées, et rien d'autre :
//   1. L'écran ne montre QUE le travail. Au-dessus du mini, l'article
//      disparaît. Écran vide = rien à faire.
//   2. On ne fabrique jamais « ce qui manque » : toujours une tournée
//      entière. Qu'il reste 6 tiramisus ou 60, c'est la tournée de 140.
//   3. Impossible de dire « c'est fait » tant qu'un composant fabriqué
//      manque — à N'IMPORTE QUEL niveau. Pour valider le biscuit indiv il
//      faut la plaque ; si la plaque manque aussi, il la fait d'abord.
//      (Demande de Layla, 2026-09-07.)
//
// D'où un seul écran, qui se rappelle lui-même : l'article, son composant,
// le composant de son composant… Tous se comportent pareil.
// ============================================================

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })

// Ceux à qui on NE demande PAS « combien ça a donné ? ». Ils sortent toujours
// le compte annoncé par la recette : la question ne faisait que ralentir
// l'atelier (Layla, 2026-09-09). Couvre aussi les bases de flan, par « flan ».
const SANS_RENDEMENT = /flan|cheese\s*cake|biscuit|g[ée]noise/i
const sansRendement = nom => SANS_RENDEMENT.test(String(nom || ''))
// À l'atelier on ne pèse pas 201,04 g : grammes et pièces en entiers, seuls
// les kg gardent leurs décimales.
const qte = (v, u) => {
  const n = Number(v) || 0
  if (!/^kg$/i.test(String(u || '').trim())) return `${nb(Math.round(n))} ${u || ''}`.trim()
  // Personne ne pèse « 0,06 kg » de gélatine : sous le kilo, on dit 57 g.
  return n < 1 ? `${nb(Math.round(n * 1000))} g` : `${nb(Math.round(n * 100) / 100)} kg`
}
const propre = n => String(n || '')
  .replace(/^(SM[.\- ]?|MP[.\- ]?|E-)\s*/i, '').replace(/\s{2,}/g, ' ').trim()

// Vert = on l'a, orange = à fabriquer, beige = figé (la mousse).
const Pastille = ({ etat }) => (
  <span className={`w-7 h-7 rounded-lg shrink-0 grid place-items-center text-white text-[13px] font-extrabold
    ${etat === 'ok' ? 'bg-success' : etat === 'fige' ? 'bg-ink-mute' : 'bg-gold'}`}>
    {etat === 'ok' ? '✓' : etat === 'fige' ? '∞' : '!'}
  </span>
)

// ------------------------------------------------------------
// Ce que le pâtissier pèse n'est pas toujours ce qu'Odoo compte. La gélatine
// se travaille en « masse gélatine » : une part de poudre pour six d'eau. La
// recette Odoo ne connaît que la poudre — l'eau n'y figure pas — alors qu'à
// l'atelier on pèse la masse. On affiche donc la masse (× 7), sous son nom.
// (Layla, 2026-09-07.) Odoo, lui, continue de ne déduire que la poudre.
// ------------------------------------------------------------
const REGLES_ATELIER = [
  { quand: /gelatine en poudre/i, nom: 'Masse gélatine', facteur: 7 },
]
const regleAtelier = produit => REGLES_ATELIER.find(r => r.quand.test(produit || ''))
const nomAtelier = produit => regleAtelier(produit)?.nom || propre(produit)
const facteurAtelier = produit => regleAtelier(produit)?.facteur || 1

function Vignette({ photo, libelle, taille = 'w-14 h-14 rounded-xl shrink-0', gros }) {
  const [rate, setRate] = useState(false)
  if (!photo || rate) {
    return (
      <div className={`${taille} bg-cream-deep grid place-items-center
                       font-serif italic text-ink-mute ${gros ? 'text-[40px]' : 'text-[22px]'}`}>
        {String(libelle || '?').trim().charAt(0).toUpperCase()}
      </div>
    )
  }
  // ⚠️ « lazy » : l'onglet « Déclarer » affiche 278 tuiles. Toutes les photos
  // d'un coup, ce sont plusieurs mégaoctets sur la tablette de l'atelier — le
  // navigateur ne charge que ce qui approche de l'écran.
  return <img src={photoFabAnnexe(photo)} alt="" onError={() => setRate(true)}
    loading="lazy" decoding="async"
    className={`${taille} object-cover bg-cream-deep`} />
}

// Un gâteau occupe souvent plusieurs lignes du catalogue : le Citron Framboise
// en a quatre (le montage, puis la finition en 3 tailles). On les rassemble
// sous le nom du gâteau vendu, que leur photo désigne déjà.
// Du plus petit au plus grand : l'individuel, puis les parts, puis les
// diamètres. Ce qui n'annonce aucune taille (un cadre, une plaque) ferme la
// marche, par ordre alphabétique. (Layla, 2026-09-09 : « les SM classés par
// taille ».)
function rangTaille(nom) {
  const n = String(nom || '').toLowerCase()
  if (/\bindiv/.test(n)) return 0
  const pers = n.match(/(\d+)\s*p(?:ers)?\b/)
  if (pers) return Number(pers[1])
  const cm = n.match(/(\d+)\s*cm\b/)
  if (cm) return 100 + Number(cm[1])
  // « Le Citron Framboise (1) / (5) / (10) » : la taille est entre parenthèses
  // au bout du nom. Sans cette règle l'ordre était alphabétique — 1, 10, 5.
  const par = n.match(/\((\d+)\)\s*$/)
  if (par) return Number(par[1])
  return 1000
}

// L'URGENCE : à quel point on est descendu sous le mini du Stock Prod.
// 0 = plus rien, 1 = pile au mini. Plus c'est bas, plus ça presse. Un article
// sans mini ne presse que s'il est à zéro. (Layla, 2026-09-09.)
const urgence = a => {
  const mini = Number(a?.mini) || 0
  const stock = Number(a?.stock) || 0
  if (mini > 0) return Math.max(0, stock / mini)
  return stock > 0 ? 1 : 0
}

function parGateau(articles) {
  const groupes = []
  for (const a of articles || []) {
    const cle = a.photo || a.produit
    let g = groupes.find(x => x.cle === cle)
    if (!g) {
      g = { cle, photo: a.photo, nom: String(a.photo || a.libelle).replace(/^E-\s*/, '').trim(), articles: [] }
      groupes.push(g)
    }
    g.articles.push(a)
  }
  for (const g of groupes) {
    // Dans un gâteau, l'ordre reste celui des TAILLES : on monte du plus petit
    // au plus grand, c'est ainsi qu'on travaille.
    g.articles.sort((x, y) => rangTaille(x.produit) - rangTaille(y.produit)
      || String(x.produit).localeCompare(String(y.produit), 'fr'))
    g.ruptures = g.articles.filter(a => a.etat === 'rupture').length
    // Un gâteau est aussi pressant que son article le plus bas sous son mini.
    g.urgence = Math.min(...g.articles.map(urgence))
  }
  // Les gâteaux, eux, sont classés par URGENCE : le plus descendu sous son mini
  // arrive en premier, c'est par lui qu'on commence la journée.
  return groupes.sort((a, b) => a.urgence - b.urgence
    || String(a.nom).localeCompare(String(b.nom), 'fr'))
}

// ------------------------------------------------------------
// Un pavé de calculette. À l'atelier on tape avec les doigts, parfois farinés,
// souvent sur tablette : le clavier du système saute, met une virgule là où on
// veut un point, et cache la moitié de l'écran. Ici chaque touche pousse un
// chiffre à droite, comme sur une caisse.
// ------------------------------------------------------------
function Pave({ onTouche }) {
  const T = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '←']
  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {T.map(t => (
        <button key={t} onClick={() => onTouche(t)} type="button"
          className={`h-14 rounded-xl border font-extrabold text-[22px] font-serif
            ${t === '←' ? 'border-cream-deep bg-cream-deep/40 text-ink-soft'
                        : 'border-cream-deep bg-cream-warm text-ink'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

// Ce qui est déjà passé aujourd'hui, et par qui. Deux personnes travaillent
// souvent en même temps à l'annexe : sans ça, l'une refait ce que l'autre vient
// de faire.
/**
 * L'historique des déclarations, rangé par date — une fenêtre qu'on ouvre.
 * Fenêtre en `vh` et en trois zones figé/défile/figé : sur la tablette, `dvh`
 * déborde et le bas devient inatteignable. (Layla, 2026-09-09.)
 */
function Historique({ histo, onFermer }) {
  const jours = parJour(histo)
  return (
    <div className="fixed inset-0 z-[70] bg-ink/40 flex items-start justify-center p-3 pt-10"
      onPointerDown={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-cream rounded-2xl w-full max-w-[560px] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2 flex-shrink-0 border-b border-cream-deep">
          <b className="text-[16px]">🕓 Ce qui a été déclaré</b>
          <button onClick={onFermer}
            className="ml-auto bg-cream-warm rounded-lg px-3 py-1.5 text-[12.5px]">fermer</button>
        </div>
        <div className="px-4 py-3 flex-1 overflow-y-auto overscroll-contain">
          {!jours.length && (
            <p className="text-center text-[13px] text-ink-mute py-10">Rien ces 7 derniers jours.</p>
          )}
          {jours.map(([jour, lignes]) => (
            <div key={jour} className="mb-4">
              <div className="text-[12.5px] font-bold text-bordeaux mb-1.5 pb-1 border-b border-cream-deep">
                {jour === todayISO() ? "Aujourd'hui" : jourLong(jour)}
                <span className="font-normal text-ink-mute"> · {lignes.length}</span>
              </div>
              {lignes.map(l => (
                <div key={l.id} className="flex items-baseline gap-2.5 py-1.5 border-b border-cream-deep/40 last:border-0">
                  <span className="text-[11px] text-ink-mute font-mono shrink-0">{heure(l.fait_le)}</span>
                  <span className="flex-1 min-w-0 text-[12.5px] leading-tight">{propre(l.article)}</span>
                  <span className="text-[12px] font-extrabold whitespace-nowrap">{qte(l.qty, l.unite)}</span>
                  {l.qui && <span className="text-[11px] text-ink-mute whitespace-nowrap">{l.qui.split(' ')[0]}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const jourLong = j =>
  new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

const heure = t => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

const Titre = ({ children }) => (
  <div className="px-4 pt-3 pb-1 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-mute">{children}</div>
)

// ------------------------------------------------------------
// Une quantité qu'on peut retaper. Toute la recette se remet à l'échelle
// autour (choix de Layla, « version A ») : mettre 1,5 kg de sucre là où la
// recette en veut 1,2, c'est faire une recette et demie — pas forcer sur le
// sucre.
// ------------------------------------------------------------
function LigneQte({ nom, valeur, unite, onValeur, gras, sous }) {
  const suffixe = ' ' + unite
  const brut = qte(valeur, unite)
  const affiche = brut.endsWith(suffixe) ? brut.slice(0, -suffixe.length) : brut
  const [txt, setTxt] = useState(affiche)
  const [vu, setVu] = useState(affiche)
  if (affiche !== vu) { setVu(affiche); setTxt(affiche) }

  const valider = () => {
    if (txt === affiche) return          // rien tapé : pas de recalcul
    const v = Number(String(txt).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'))
    if (!(v > 0)) { setTxt(affiche); return }
    onValeur(v)
  }
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex-1 min-w-0">
        <span className={`text-[14px] ${gras ? 'font-extrabold' : ''}`}>{nom}</span>
        {/* Le repère à la pièce : « 160 g par u ». Sans lui on ne lisait que le
            total, et il fallait diviser de tête pour savoir ce que mange UNE
            pièce (Layla, 2026-09-09). */}
        {sous && <span className="block text-[11px] text-ink-mute">{sous}</span>}
      </span>
      <input value={txt} inputMode="decimal" aria-label={'Quantité de ' + nom}
        onChange={e => setTxt(e.target.value)} onBlur={valider}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className={`w-[86px] h-10 text-right px-2 rounded-lg border bg-cream-warm text-ink
          text-[15px] font-bold focus:outline-none focus:border-bordeaux
          ${gras ? 'border-gold border-2' : 'border-cream-deep'}`} />
      <span className="text-[12px] text-ink-mute w-5">{unite}</span>
    </div>
  )
}

function Recette({ noeud, fois, onFois }) {
  const parRecette = noeud.tourneeTaille || 1
  return (
    <div className="divide-y divide-cream-deep/50">
      {(noeud.recette || []).map((l, i) => {
        const f = facteurAtelier(l.produit)
        return (
          <LigneQte key={i} nom={nomAtelier(l.produit)} valeur={l.qty * fois * f} unite={l.unite}
            sous={parRecette ? `${qte((l.qty * f) / parRecette, l.unite)} par ${noeud.unite}` : null}
            onValeur={v => onFois(v / f / l.qty)} />
        )
      })}
      <div className="bg-gold/10">
        <LigneQte gras nom={`${propre(noeud.produit)} obtenu`}
          valeur={parRecette * fois} unite={noeud.unite}
          onValeur={v => onFois(v / parRecette)} />
      </div>
    </div>
  )
}

export default function FabAnnexe2View({ user, onLogout, onNavigate, activeView }) {
  // On affiche tout de suite la dernière liste connue, puis on la remplace dès
  // qu'Odoo répond : l'écran ne part plus d'un squelette vide à chaque retour.
  // (Layla, 2026-09-09 : « rends l'onglet plus rapide ».)
  const [articles, setArticles] = useState(() => dernierEcran('fab_annexe2'))
  const [erreur, setErreur] = useState(null)
  const [tour, setTour] = useState(0)
  // Où on est : [] = la liste, ['Tiramisu'] = l'article, ['Tiramisu', 'Biscuit
  // indiv', 'Biscuit plaque'] = on est descendu deux fois.
  const [chemin, setChemin] = useState([])
  // Ce que le pâtissier a déclaré dans cette séance : { produit: { fois } }
  const [faits, setFaits] = useState({})
  const [sortie, setSortie] = useState(null)
  const [gateau, setGateau] = useState(null)
  const [qteTxt, setQteTxt] = useState(null)
  const [histoOuvert, setHistoOuvert] = useState(false)
  // Verrou contre le double appui : une création d'ordre Odoo prend
  // plusieurs secondes, et deux appuis feraient deux ordres.
  const [envoi, setEnvoi] = useState(false)
  // Combien de tournées le pâtissier a décidé de faire, par article.
  const [foisPar, setFoisPar] = useState({})
  // « À faire » ne montre que ce qui est sous son mini ; « Déclarer » montre
  // tout ce que l'annexe sait faire, pour venir dire ce qu'on a fabriqué.
  const [onglet, setOnglet] = useState('faire')
  const [tout, setTout] = useState(() => dernierEcran('fab_annexe2_tout'))
  const [cherche, setCherche] = useState('')
  const [histo, setHisto] = useState(null)
  // Le détail d'un article (sa cascade) n'arrive qu'à son ouverture.
  const [details, setDetails] = useState({})
  const ouvert = chemin[0] || null
  // Ce qu'on est déjà allé chercher d'avance, pour ne pas y retourner.
  const precharges = useRef(new Set())

  const recharger = () => { precharges.current.clear(); setTour(t => t + 1) }
  useEffect(() => {
    let vivant = true
    loadHistoriqueAnnexe().then(h => { if (vivant) setHisto(h) }).catch(() => {})
    return () => { vivant = false }
  }, [tour])

  useEffect(() => {
    let vivant = true
    loadFabAnnexe()
      .then(l => { if (vivant) { setArticles(l); garderEcran('fab_annexe2', l); setErreur(null) } })
      .catch(e => { if (vivant) { setErreur(e.message || String(e)); setArticles([]) } })
    return () => { vivant = false }
  }, [tour])

  // Le catalogue complet part en même temps que « À faire », sans attendre le
  // clic sur l'onglet : quand elle y arrive, il est déjà là.
  useEffect(() => {
    let vivant = true
    loadToutFabAnnexe()
      .then(l => { if (vivant) { setTout(l); garderEcran('fab_annexe2_tout', l) } })
      .catch(() => { /* l'onglet « À faire » n'a pas à en souffrir */ })
    return () => { vivant = false }
  }, [tour])

  // Les fiches des premiers articles à faire sont chargées d'avance : quand on
  // clique, la recette est déjà là au lieu d'un squelette d'une seconde.
  // Trois suffisent — au-delà on ferait travailler Odoo pour rien.
  useEffect(() => {
    for (const a of (articles || []).slice(0, 3)) {
      if (precharges.current.has(a.produit)) continue
      precharges.current.add(a.produit)
      loadArticleFabAnnexe(a.produit)
        .then(d => { if (d) setDetails(x => (x[a.produit] ? x : { ...x, [a.produit]: d })) })
        .catch(() => { precharges.current.delete(a.produit) })
    }
  }, [articles])

  useEffect(() => {
    if (!ouvert || details[ouvert]) return
    let vivant = true
    loadArticleFabAnnexe(ouvert)
      .then(a => {
        if (!vivant) return
        // Rien à afficher (l'article vient d'être retiré du catalogue) : on
        // le dit et on revient, plutôt que de laisser tourner le squelette.
        if (!a) { setErreur(`« ${ouvert} » n'est plus suivi.`); setChemin([]); return }
        setDetails(d => ({ ...d, [ouvert]: a }))
      })
      .catch(e => { if (vivant) { setErreur(e.message || String(e)); setChemin([]) } })
    return () => { vivant = false }
  }, [ouvert, details])

  const nav = { user, onLogout, onNavigate, activeView }

  // ---------- la liste ----------
  if (chemin.length === 0) {
    // « Déclarer » s'ouvre sur les gâteaux, pas sur les 140 articles : on
    // choisit son gâteau, puis sa taille. Une recherche saute l'étape et
    // montre les articles directement. (Layla, 2026-09-09.)
    const dujour = (histo || []).filter(l => (l.jour || todayISO()) === todayISO()).length
    const groupes = onglet === 'declarer' ? parGateauMere(tout, cherche) : []
    const ouvertG = cherche.trim() ? null : groupes.find(g => g.nom === gateau)
    const vus = cherche.trim() ? groupes : ouvertG ? [ouvertG] : []
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader {...nav} />
        <div className="max-w-[1000px] mx-auto px-4 py-5 pb-28">
          <div className="flex items-center gap-2">
            <h1 className="flex-1 font-serif italic text-[26px] leading-tight">Fabrication Annexe 2</h1>
            <button onClick={() => setHistoOuvert(true)}
              className="rounded-xl border border-cream-deep bg-cream-warm px-3 py-2 text-[12.5px] font-bold">
              🕓 Historique
              {dujour > 0 && <span className="text-ink-mute font-normal"> · {dujour}</span>}
            </button>
          </div>

          <div className="flex gap-2 my-3">
            {/* Changer d'onglet remet la liste des gâteaux : les deux se
                parcourent pareil et partagent le même « gâteau ouvert ». */}
            {[['faire', 'À faire'], ['declarer', 'Déclarer']].map(([k, t]) => (
              <button key={k} onClick={() => { setOnglet(k); setGateau(null) }}
                className={`flex-1 rounded-2xl py-3 text-[14px] font-extrabold border-2
                  ${onglet === k ? 'bg-bordeaux border-bordeaux text-cream'
                                 : 'bg-cream-warm border-cream-deep text-ink-mute'}`}>
                {t}
                {k === 'faire' && articles?.length > 0 && (
                  <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[12px]
                    ${onglet === k ? 'bg-cream/25' : 'bg-danger text-cream'}`}>{articles.length}</span>
                )}
              </button>
            ))}
          </div>

          {erreur && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] text-danger">
              {erreur}
              <button onClick={recharger} className="ml-3 underline font-bold">Réessayer</button>
            </div>
          )}
          {onglet === 'faire' && !articles && !erreur && <Skeleton rows={3} />}

          {onglet === 'faire' && !erreur && articles?.length === 0 && (
            <div className="rounded-2xl border border-cream-deep bg-cream-warm py-14 text-center">
              <div className="text-[40px] mb-2">✨</div>
              <div className="font-bold text-[16px]">Tout est au niveau</div>
              <div className="text-[12.5px] text-ink-mute">Rien à fabriquer</div>
            </div>
          )}

          {onglet === 'declarer' && (
            <>
              <input value={cherche} onChange={e => setCherche(e.target.value)}
                placeholder="Chercher — crème, sirop, biscuit…" aria-label="Chercher un article"
                className="w-full h-11 rounded-xl border border-cream-deep bg-cream-warm px-3
                           text-[15px] text-ink outline-none focus:border-bordeaux mb-3" />
              {!tout && !erreur && <Skeleton rows={4} />}

              {!cherche.trim() && !ouvertG && (
                <div className="grid gap-2.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
                  {groupes.map(g => (
                    <button key={g.nom} onClick={() => setGateau(g.nom)}
                      className="text-left rounded-2xl border border-cream-deep bg-cream-warm
                                 overflow-hidden shadow-sm hover:border-bordeaux/40 flex flex-col">
                      <Vignette photo={g.photo} libelle={g.nom} gros taille="w-full aspect-square" />
                      <div className="px-2 py-1.5 flex flex-col gap-0.5 flex-1">
                        <div className="text-[12px] font-extrabold leading-[1.25]">
                          {g.nom.replace(/^(E-|MI-|V-)\s*/, '')}
                        </div>
                        <div className="mt-auto pt-0.5 text-[10.5px] text-ink-mute">
                          {g.articles.length} article{g.articles.length > 1 ? 's' : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {ouvertG && (
                <button onClick={() => setGateau(null)}
                  className="text-[13px] text-ink-mute font-bold mb-3">← Tous les gâteaux</button>
              )}

              {vus.map(g => (
                <section key={g.nom} className="mb-5">
                  <h2 className="flex items-center gap-2.5 mb-2">
                    <Vignette photo={g.photo} libelle={g.nom}
                      taille="w-10 h-10 rounded-lg shrink-0" />
                    <span className="flex-1 min-w-0 font-serif italic text-[17px] text-bordeaux leading-tight">
                      {g.nom.replace(/^(E-|MI-|V-)\s*/, '')}
                    </span>
                    <span className="text-[12px] text-ink-mute">{g.articles.length}</span>
                  </h2>
                  <div className="grid gap-2.5"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
                    {g.articles.map(a => (
                      <button key={a.produit} onClick={() => setChemin([a.produit])}
                        className="text-left rounded-2xl border border-cream-deep bg-cream-warm
                                   overflow-hidden shadow-sm hover:border-bordeaux/40 flex flex-col">
                        <div className="relative">
                          <Vignette photo={a.photo} libelle={propre(a.produit)} gros
                            taille="w-full aspect-square" />
                          <span className={`absolute top-1 left-1 w-2.5 h-2.5 rounded-full ring-2 ring-cream-warm
                            ${a.stock > 0 ? 'bg-success' : 'bg-ink-mute/50'}`}
                            title={a.stock > 0 ? 'il y en a en stock' : 'à zéro'} />
                        </div>
                        <div className="px-2 py-1.5 flex flex-col gap-0.5 flex-1">
                          <div className="text-[12px] font-extrabold leading-[1.25]">{propre(a.produit)}</div>
                          <div className="mt-auto pt-0.5 text-[10.5px] text-ink-mute">
                            {qte(a.stock, a.unite)} en stock
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {tout && !groupes.length && (
                <p className="text-center text-[13px] text-ink-mute py-8">Rien à ce nom-là.</p>
              )}
            </>
          )}

          {histoOuvert && <Historique histo={histo} onFermer={() => setHistoOuvert(false)} />}

          {/* « À faire » se parcourt comme « Déclarer » : les GÂTEAUX d'abord,
              puis les SM du gâteau ouvert, classés par taille, puis la recette.
              Avant, les SM de tous les gâteaux étaient à plat sur un seul écran.
              (Layla, 2026-09-09.) */}
          {onglet === 'faire' && articles?.length > 0 && (() => {
            const groupes = parGateau(articles)
            const ouvert = groupes.find(g => g.cle === gateau)
            if (!ouvert) {
              return (
                <div className="grid gap-2.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
                  {groupes.map(g => (
                    <button key={g.cle} onClick={() => setGateau(g.cle)}
                      className="text-left rounded-2xl border border-cream-deep bg-cream-warm
                                 overflow-hidden shadow-sm hover:border-bordeaux/40 flex flex-col">
                      <Vignette photo={g.photo} libelle={g.nom} gros taille="w-full aspect-square" />
                      <div className="px-2 py-1.5 flex flex-col gap-0.5 flex-1">
                        <div className="text-[12px] font-extrabold leading-[1.25]">{g.nom}</div>
                        <div className="mt-auto pt-0.5 text-[10.5px] text-ink-mute">
                          {g.articles.length} à faire
                          {g.ruptures > 0 && (
                            <span className="block text-danger font-bold">
                              {g.ruptures} rupture{g.ruptures > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            }
            return (
              <>
                <button onClick={() => setGateau(null)}
                  className="text-[13px] text-ink-mute font-bold mb-3">← Tous les gâteaux</button>
                <h2 className="flex items-center gap-2.5 mb-2">
                  <Vignette photo={ouvert.photo} libelle={ouvert.nom} taille="w-10 h-10 rounded-lg shrink-0" />
                  <span className="flex-1 min-w-0 font-serif italic text-[17px] text-bordeaux leading-tight">
                    {ouvert.nom}
                  </span>
                  <span className="text-[12px] text-ink-mute">{ouvert.articles.length}</span>
                </h2>
                <div className="grid gap-2.5"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
                  {ouvert.articles.map(a => (
                    <CarteArticle key={a.produit} a={a} onOuvrir={() => setChemin([a.produit])} />
                  ))}
                </div>
              </>
            )
          })()}
        </div>
      </div>
    )
  }

  const brut = details[ouvert]
  if (!brut) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader {...nav} />
        <div className="max-w-[640px] mx-auto px-4 py-5 pb-28">
          <button onClick={() => setChemin([])} className="text-[13px] text-ink-mute font-bold mb-3">← Retour</button>
          <Skeleton rows={4} />
        </div>
      </div>
    )
  }
  const foisArticle = foisPar[brut.produit] ?? tourneesSuggerees(brut)
  const { article, noeud, parent } = noeudAu([pourFois(brut, foisArticle)], chemin)
  if (!noeud) { setChemin([]); return null }

  const racine = chemin.length === 1
  const enfants = racine ? noeud.composants : noeud.enfants
  const bloque = bloquants(noeud, declares(faits))
  // Un figé qui se FABRIQUE reste un composant à part entière : on peut
  // l'ouvrir, et il bloque tant qu'il n'est pas fait (la crème au beurre
  // praliné). Seuls les figés achetés se lisent en liste — c'est la mousse.
  const figes = (enfants || []).filter(c => c.fige && !c.fabrique)
  const autres = (enfants || []).filter(c => c.fabrique)
  // Les matières premières achetées : rien à fabriquer, rien à cliquer, mais
  // elles font partie de la recette — sans l'eau du robinet, on ne la fait pas.
  const achetes = (enfants || []).filter(c => !c.fige && !c.fabrique)
  const fois = faits[noeud.produit]?.fois ?? foisDuNoeud(noeud)
  const majFois = f => setFaits(x => ({ ...x, [noeud.produit]: { fois: Math.max(0.01, Math.round(f * 10000) / 10000), brouillon: true } }))
  // Un article à quantité FIGÉE se règle en QUANTITÉ, pas en tournées : sa
  // recette est écrite pour une unité, « une tournée » n'y veut rien dire.
  // Le pas suit l'unité — 10 g, 100 g de kg, 1 pièce (Layla, 2026-09-09).
  const parRecette = noeud.tourneeTaille || 1
  const aLaQte = !!noeud.aLaQuantite
  const pasFois = aLaQte
    ? (noeud.unite === 'u' ? 1 : /^kg$/i.test(noeud.unite) ? 0.1 : 10) / parRecette
    : 0.5

  // Envoyer la fournée à « À valider ». Sorti du bouton pour être appelé aussi
  // par « C'est fait » quand on ne pose pas la question du rendement.
  const envoyer = async (n) => {
    if (!(n > 0) || envoi) return
    // Le bouton répond au doigt AVANT de parler à Odoo : la création
    // d'un ordre prend plusieurs secondes (règle de Layla).
    navigator.vibrate?.(15)
    setEnvoi(true)
    try {
      const r = racine
        ? await envoyerAValider(article, n, user?.id)
        : await declarer({
            produit: noeud.produit, unite: noeud.unite, fois, qty: n,
            ajustements: peseesDe(noeud, fois),
          }, user?.id)
      toast(r.erreur
        ? `Enregistré, mais Odoo a refusé : ${r.erreur}`
        : `${racine ? article.libelle : propre(noeud.produit)} : en attente dans « À valider Annexe »`)
      setSortie(null)
      if (racine) { setFaits({}); setChemin([]) }
      else { setFaits(f => ({ ...f, [noeud.produit]: { fois } })); setChemin(chemin.slice(0, -1)) }
      setDetails({}); recharger()
    } catch (e) {
      toast('Échec : ' + (e.message || e))
    } finally { setEnvoi(false) }
  }

  // ---------- « combien ça a donné ? » ----------
  // Vaut pour l'article de tête comme pour une préparation : ce qui sort d'une
  // fournée n'est jamais tout à fait ce que la recette annonce. Les
  // ingrédients, eux, restent ceux qu'on a pesés (Layla, 2026-09-08).
  //
  // ⚠️ SAUF pour les articles de `SANS_RENDEMENT` : flans, cheesecakes,
  // biscuits, génoises et bases de flan sortent toujours le compte annoncé,
  // la question était une perte de temps (Layla, 2026-09-09). Pour eux,
  // « C'est fait » envoie directement la quantité prévue.
  if (sortie !== null) {
    const cible = racine ? article : noeud
    const prevu = racine ? article.tournee : Math.round((noeud.tourneeTaille || 1) * fois * 100) / 100
    const n = Number(String(sortie).replace(',', '.')) || 0
    const ecart = Math.round((n - prevu) * 100) / 100
    // À la pièce on ajuste par 1 ; au gramme, par 10 — sinon il faut cent appuis.
    const pas = cible.unite === 'u' ? 1 : /^kg$/i.test(cible.unite) ? 0.1 : 10
    const arrondi = v => Math.round(Math.max(0, v) * 100) / 100
    return (
      <Cadre {...nav} onRetour={() => setSortie(null)} photo={racine ? article.photo : null}
        titre={racine ? article.libelle : propre(noeud.produit)}
        sous={racine ? 'Tournée montée'
          : aLaQte ? `Pour ${qte(parRecette * fois, noeud.unite)}` : `Recette × ${nb(fois)}`}>
        <div className="px-4 py-6 text-center">
          <div className="text-[15px] font-bold">
            {racine
              ? `Combien de ${propre(article.libelle).toLowerCase()} sont sortis ?`
              : 'Combien ça a donné, au final ?'}
          </div>
          {/* Sur une tournée montée, on ne rappelle plus ce qu'elle « fait
              environ » : la question suffit (Layla, 2026-09-09). La recette
              d'une préparation, elle, reste annoncée — c'est le repère de
              celui qui pèse. */}
          {!racine && (
            <div className="text-[12px] text-ink-mute mb-4">
              La recette en annonce {qte(prevu, cible.unite)}
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => setSortie(String(arrondi(n - pas)))} type="button"
              aria-label={`Retirer ${pas}`}
              className="px-4 py-4 rounded-xl border border-cream-deep bg-cream-warm
                         text-[26px] font-extrabold text-bordeaux leading-none">−</button>
            <input value={sortie} inputMode="decimal" aria-label="Quantité obtenue"
              onChange={e => setSortie(e.target.value.replace(/[^\d.,]/g, ''))}
              className="w-[150px] h-[64px] rounded-xl border-2 border-bordeaux bg-cream-warm
                         text-center font-serif text-[32px] text-ink focus:outline-none" />
            <button onClick={() => setSortie(String(arrondi(n + pas)))} type="button"
              aria-label={`Ajouter ${pas}`}
              className="px-4 py-4 rounded-xl border border-cream-deep bg-cream-warm
                         text-[26px] font-extrabold text-bordeaux leading-none">+</button>
          </div>
          <div className="text-[12.5px] text-ink-mute mt-1 mb-1">{cible.unite}</div>
          <Pave onTouche={t => setSortie(v => frappe(v, t))} />
          <div className="h-3" />
          <div className="text-[12.5px] text-ink-mute mb-4 min-h-[18px]">
            {n === 0 ? '' : ecart === 0 ? 'Pile ce qui était prévu.'
              : <><b className="text-gold">{qte(Math.abs(ecart), cible.unite)} de {ecart > 0 ? 'plus' : 'moins'}</b> que prévu.</>}
          </div>

          {!racine && (
            <div className="text-left rounded-xl border border-cream-deep bg-cream-warm mb-4">
              <div className="px-3 pt-2.5 pb-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-mute">
                Ce qui sort du stock — ce que tu as pesé
              </div>
              {Object.entries(peseesDe(noeud, fois)).map(([nom, q]) => (
                <div key={nom} className="flex items-baseline gap-3 px-3 py-1.5 border-t border-cream-deep/50">
                  <span className="flex-1 min-w-0 text-[13px]">{nomAtelier(nom)}</span>
                  <span className="text-[13px] font-extrabold">
                    {nb(q * facteurAtelier(nom))} {noeud.recette.find(l => l.produit === nom)?.unite}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button disabled={!(n > 0) || envoi}
            onClick={() => envoyer(n)}
            className="w-full rounded-xl py-4 text-[15px] font-extrabold bg-success text-cream disabled:opacity-40">
            {envoi ? 'Envoi en cours…' : estModeTest() ? 'Envoyer (mode test)' : 'Envoyer à « À valider »'}
          </button>
        </div>
      </Cadre>
    )
  }

  // ---------- un nœud : l'article, ou n'importe quel composant ----------
  return (
    <Cadre {...nav} onRetour={() => setChemin(chemin.slice(0, -1))}
      photo={racine ? article.photo : null}
      titre={racine ? article.libelle : propre(noeud.produit)}
      sous={racine
        // Toujours « Tournée de … », jamais « Je fais X · N tournées » : le
        // second doublait le compteur juste en dessous, et Layla l'a fait
        // retirer (2026-09-09).
        // ⚠️ `brut`, pas `article` : `pourFois` a multiplié `article.tournee`
        // par le nombre de tournées choisi. Écrire « Tournée de 28 u » pour
        // deux tournées de 14 serait faux — c'est le piège corrigé le matin
        // même par l'autre session, à ne pas rouvrir.
        ? `Tournée de ${qte(brut.tournee, brut.unite)}`
        : noeud.besoin > noeud.stock
          ? `Il en faut ${qte(noeud.besoin - noeud.stock, noeud.unite)} pour ${propre(parent)}`
          : `Tu en as ${qte(noeud.stock, noeud.unite)} — pour prendre de l'avance`}>

      {racine && (
        <>
          <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
            <span className="text-[12px] text-ink-mute mr-1">Je fais</span>
            {[0.5, 1, 1.5, 2, 3].map(f => {
              const on = foisArticle === f
              // ⚠️ `qte` et non un arrondi : une tournée de 5,55 kg
              // affichait « 6 kg » pour une entière et « 3 kg » pour
              // une demie. (Vu le 2026-09-09.)
              const pieces = qte(brut.tournee * f, brut.unite)
              return (
                <button key={f}
                  onClick={() => { setQteTxt(null); setFoisPar(x => ({ ...x, [brut.produit]: f })) }}
                  className={`rounded-xl px-3 py-2 text-[12.5px] font-extrabold border
                    ${on ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-cream-warm text-ink-soft border-cream-deep'}`}>
                  {f === 0.5 ? '½' : f === 1.5 ? '1½' : f} tournée{f > 1 ? 's' : ''}
                  <span className={`block text-[11px] font-bold ${on ? 'text-cream/80' : 'text-ink-mute'}`}>
                    {pieces}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Un compte de tournées ne tombe pas toujours juste : on tape la
              quantité voulue, et toute la cascade suit. (Layla, 2026-09-09.) */}
          <div className="flex items-center gap-2 px-4 pb-3">
            <span className="text-[12px] text-ink-mute">ou je produis</span>
            <input inputMode="decimal" aria-label="Quantité à produire"
              value={qteTxt?.produit === brut.produit ? qteTxt.txt : nb(article.tournee)}
              onChange={e => {
                const txt = e.target.value.replace(/[^\d.,]/g, '')
                setQteTxt({ produit: brut.produit, txt })
                const q = Number(txt.replace(',', '.'))
                if (q > 0 && brut.tournee > 0) {
                  setFoisPar(x => ({ ...x, [brut.produit]: q / brut.tournee }))
                }
              }}
              className="w-24 h-11 rounded-xl border-2 border-bordeaux bg-cream-warm text-center
                         font-serif text-[19px] text-ink outline-none" />
            <span className="text-[12px] text-ink-mute">{brut.unite}</span>
          </div>

        <div className="px-4 pb-3">
          {/* La barre de progression et sa ligne « En stock · mini · maxi » ont
              été retirées (Layla, 2026-09-09) : la fiche sert à fabriquer, pas
              à consulter des seuils. Ce qui a déjà été fait dans la journée
              reste dit, parce que ça change ce qu'il reste à faire. */}
          {article.dejaFait > 0 && (
            <div className="text-[12px] text-success font-bold">
              déjà fait {qte(article.dejaFait, article.unite)}
            </div>
          )}
          {article.dejaFait > 0 && article.reste > 0 && (
            <div className="text-[12px] text-ink-soft mt-1.5">
              Il reste <b className="text-gold">{qte(article.reste, article.unite)}</b> pour atteindre le maxi.
            </div>
          )}
        </div>
        </>
      )}

      {/* Un composant se fabrique : combien de fois, et sa recette qu'on peut
          retaper. Le « ×2 » est là parce que doubler une recette est le geste
          le plus courant de l'atelier (Layla, 2026-09-08). */}
      {!racine && (
        <>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-cream-deep/60">
            <button onClick={() => majFois(Math.max(pasFois, fois - pasFois))} disabled={fois <= pasFois}
              className="w-11 h-11 rounded-xl border border-cream-deep bg-cream-warm
                         text-[22px] font-extrabold text-bordeaux leading-none disabled:opacity-35">−</button>
            <div className="flex-1 text-center">
              <div className="text-[15px] font-extrabold">
                {aLaQte
                  ? qte(parRecette * fois, noeud.unite)
                  : `${fois === 0.5 ? '½' : nb(fois)} tournée${fois > 1 ? 's' : ''}`}
              </div>
              <div className="text-[11.5px] text-ink-mute">
                {aLaQte ? 'à la quantité' : qte(parRecette * fois, noeud.unite)}
                {fois !== foisDuNoeud(noeud)
                  ? ` · conseillé : ${aLaQte
                      ? qte(parRecette * foisDuNoeud(noeud), noeud.unite)
                      : nb(foisDuNoeud(noeud))}` : ''}
              </div>
            </div>
            <button onClick={() => majFois(fois + pasFois)}
              className="w-11 h-11 rounded-xl border border-cream-deep bg-cream-warm
                         text-[22px] font-extrabold text-bordeaux leading-none">+</button>
            <button onClick={() => majFois(fois * 2)}
              className="h-11 px-3 rounded-xl border border-gold bg-gold/10
                         text-[13px] font-extrabold text-gold">×2</button>
          </div>
          <Recette noeud={noeud} fois={fois} onFois={majFois} />
        </>
      )}

      {figes.length > 0 && (
        <>
          <Titre>{article.figesNom} — quantité figée</Titre>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-cream-deep/25">
            <Pastille etat="fige" />
            <div className="flex-1 min-w-0 text-[14px]">
              {article.figesNom}
              <div className="text-[11.5px] text-ink-mute mt-0.5">
                Pour la tournée entière — ne bouge pas avec la sortie réelle
              </div>
            </div>
          </div>
          {/* Sa recette, dépliée : c'est lui qui la monte, il lui faut les
              quantités. Un même ingrédient cité deux fois dans la nomenclature
              (le sucre) est additionné : on le pèse une seule fois. */}
          {figes.map((f, i) => (
            <div key={f.produit + i}
              className="flex items-baseline gap-3 pl-14 pr-4 py-2 bg-cream-deep/10 border-t border-cream-deep/30">
              <span className="flex-1 min-w-0 text-[13.5px]">{nomAtelier(f.produit)}</span>
              <span className="text-[14px] font-extrabold">
                {qte(f.besoin * facteurAtelier(f.produit), f.unite)}
              </span>
            </div>
          ))}
        </>
      )}

      {autres.length > 0 && <Titre>{racine ? 'Les composants' : "Ce qu'il faut avoir"}</Titre>}
      {autres.map(c => {
        // « fait » vient du serveur (ce qui est déclaré du jour), pas de la
        // mémoire de l'écran : sortir de la page et revenir ne l'efface plus.
        const fait = c.dejaFait > 0 || declares(faits).includes(c.produit)
        const ok = c.ok || fait
        return (
          <button key={c.produit}
            onClick={() => setChemin([...chemin, c.produit])}
            className="w-full flex items-center gap-3 px-4 py-3 border-t border-cream-deep/60 text-left
                       hover:bg-cream-deep/20">
            <Pastille etat={ok ? 'ok' : 'manque'} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px]">{propre(c.produit)}</div>
              <div className="text-[11.5px] text-ink-mute mt-0.5">
                {fait
                  ? <span className="text-success font-bold">
                      {c.dejaFait > 0 ? `${qte(c.dejaFait, c.unite)} fait` : 'fait'} · en attente de validation
                    </span>
                  : <>stock {qte(c.stock, c.unite)} · il en faut {qte(c.besoin, c.unite)}
                    {c.fige && <span className="text-ink-mute"> · quantité figée</span>}</>}
              </div>
            </div>
            {ok
              ? <span className="text-[11.5px] text-ink-mute shrink-0">recette</span>
              : (
                <div className="text-right shrink-0">
                  {/* Un article à quantité figée ne se compte pas en tournées :
                      on en fait exactement ce qui manque (Layla, 2026-09-09). */}
                  {c.aLaQuantite || c.fige ? (
                    <>
                      <div className="text-[11px] text-ink-mute">à faire</div>
                      <div className="text-[13px] font-extrabold">{qte(c.produira, c.unite)}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-[13px] font-extrabold">{c.tournees} tournée{c.tournees > 1 ? 's' : ''}</div>
                      <div className="text-[11px] text-ink-mute">= {qte(c.produira, c.unite)}</div>
                    </>
                  )}
                </div>
              )}
            <span className={`text-[17px] ${ok ? 'text-ink-mute/50' : 'text-ink-mute'}`}>›</span>
          </button>
        )
      })}

      {achetes.length > 0 && (
        <>
          <Titre>Aussi dans la recette</Titre>
          {achetes.map((f, i) => (
            <div key={f.produit + i}
              className="flex items-baseline gap-3 px-4 py-2 border-t border-cream-deep/40">
              <span className="flex-1 min-w-0 text-[13.5px]">{nomAtelier(f.produit)}</span>
              <span className="text-[14px] font-extrabold">
                {qte(f.besoin * facteurAtelier(f.produit), f.unite)}
              </span>
            </div>
          ))}
        </>
      )}

      {/* LE MONTAGE, tout en bas : ce que demande UNE pièce. Le reste de la
          fiche parle de la tournée entière — utile pour sortir le stock, mais
          celui qui monte a besoin de sa dose à lui. « 1 Citron Framboise (5) =
          391 g de crème légère, 1 fond… » (Layla, 2026-09-09).
          Les quantités FIGÉES y figurent — Layla les cite en premier dans son
          exemple : la cuve part en entier sur la tournée, mais celui qui monte
          veut savoir ce qu'il en met sur une pièce. Elles sont marquées comme
          telles pour qu'on ne les prenne pas pour une dose à peser à part. */}
      {racine && (() => {
        // ⚠️ `article.tournee` est DÉJÀ le total : `pourFois` l'a multiplié par
        // le nombre de tournées, comme les besoins. Le remultiplier donnait la
        // moitié des quantités (195 g au lieu de 391 g).
        const total = Number(article.tournee) || 0
        const lignes = [...autres, ...figes, ...achetes].filter(c => Number(c.besoin) > 0)
        if (!(total > 0) || !lignes.length) return null
        return (
          <>
            <Titre>Le montage — pour 1 {propre(article.libelle)}</Titre>
            {lignes.map((c, i) => (
              <div key={'m' + c.produit + i}
                className="flex items-baseline gap-3 px-4 py-2 border-t border-cream-deep/40">
                <span className="flex-1 min-w-0 text-[13.5px]">
                  {nomAtelier(c.produit)}
                  {c.fige && <span className="text-[11px] text-ink-mute"> · figé</span>}
                </span>
                <span className="text-[14px] font-extrabold">
                  {qte((c.besoin * facteurAtelier(c.produit)) / total, c.unite)}
                </span>
              </div>
            ))}
          </>
        )
      })()}

      {bloque.length > 0 ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-cream-deep/40 border-t border-cream-deep">
          <div className="flex-1 text-[13px] font-bold text-ink-mute">
            Fais d'abord : {bloque.map(propre).join(', ')}
          </div>
          <button disabled className="rounded-xl px-4 py-3 text-[13.5px] font-extrabold
                                      bg-ink-mute/30 text-ink-mute cursor-not-allowed">
            🔒 C'est fait
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 bg-gold/10 border-t border-gold/30">
          <div className="flex-1 text-[13px]">
            {/* Plus de « Tout y est » sur une tournée montée : le bouton dit
                déjà quoi faire (Layla, 2026-09-09). */}
            {racine ? ''
              : aLaQte ? `Pour ${qte(parRecette * fois, noeud.unite)}`
              : fois === noeud.tournees ? "Recette d'origine" : `Recette × ${nb(fois)}`}
            {!racine && noeud.besoin <= noeud.stock && (
              <div className="text-[11.5px] text-ink-mute mt-0.5">Tu n'en as pas besoin maintenant</div>
            )}
          </div>
          <button disabled={envoi}
            onClick={() => {
              const prevu = racine
                ? article.tournee
                : Math.round((noeud.tourneeTaille || 1) * fois * 100) / 100
              // Flans, cheesecakes, biscuits, génoises, bases de flan : on ne
              // demande pas le rendement, on envoie la quantité prévue.
              if (sansRendement(racine ? article.libelle : noeud.produit)) return envoyer(prevu)
              setSortie(String(prevu))
            }}
            className="rounded-xl px-4 py-3 text-[13.5px] font-extrabold bg-bordeaux text-cream disabled:opacity-40">
            {envoi ? 'Envoi…' : "C'est fait →"}
          </button>
        </div>
      )}
    </Cadre>
  )
}

// ------------------------------------------------------------
function CarteArticle({ a, onOuvrir }) {
  // Ce qu'il faudrait pour remonter au maxi — une suggestion, modifiable
  // une fois l'article ouvert.
  const sug = tourneesSuggerees(a)
  // Sous le titre « Le Citron Framboise », une tuile n'a pas à répéter le nom du
  // gâteau : seule la fin du libellé distingue les lignes entre elles.
  const court = a.libelle.includes(' · ') ? a.libelle.split(' · ').slice(1).join(' · ') : null
  return (
    <button onClick={onOuvrir}
      className="text-left rounded-2xl border border-cream-deep bg-cream-warm overflow-hidden
                 shadow-sm hover:border-bordeaux/40 flex flex-col">
      <div className="relative">
        <Vignette photo={a.photo} libelle={a.libelle} gros taille="w-full aspect-square" />
        <span className={`absolute top-1 left-1 w-2.5 h-2.5 rounded-full ring-2 ring-cream-warm
          ${a.etat === 'rupture' ? 'bg-danger' : 'bg-gold'}`}
          title={a.etat === 'rupture' ? 'Rupture' : 'À refaire'} />
        <div className="absolute bottom-0 inset-x-0 h-1 bg-cream-deep/80">
          <div className={`h-full ${a.etat === 'rupture' ? 'bg-danger' : 'bg-gold'}`}
            style={{ width: `${Math.min(100, Math.round((a.stock / a.maxi) * 100))}%` }} />
        </div>
      </div>

      <div className="px-2 py-1.5 flex flex-col gap-0.5 flex-1">
        <div className="text-[12px] font-extrabold leading-[1.25]">{court || a.libelle}</div>
        {/* Quatre lignes, pas une de plus : le titre, l'état, ce qu'il reste,
            ce qu'il faut faire. Les mini/maxi et le nombre de tournées ont été
            retirés — ils encombraient sans servir au coup d'œil (Layla,
            2026-09-09). L'urgence, elle, se lit à la position dans la liste. */}
        <div className={`text-[10.5px] font-extrabold leading-tight
          ${a.etat === 'rupture' ? 'text-danger' : 'text-gold'}`}>
          {a.etat === 'rupture' ? 'Rupture' : 'À refaire'}
        </div>
        <div className="text-[10.5px] text-ink-mute leading-tight">
          en stock {qte(a.stock, a.unite)}
          {a.dejaFait > 0 && (
            <span className="block text-success font-bold">déjà fait {qte(a.dejaFait, a.unite)}</span>
          )}
        </div>
        <div className="mt-auto pt-1 text-[11.5px] font-extrabold text-gold leading-tight">
          à faire {qte(a.tournee * sug, a.unite)}
        </div>
      </div>
    </button>
  )
}

function Cadre({ children, onRetour, photo, titre, sous, user, onLogout, onNavigate, activeView }) {
  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[640px] mx-auto px-4 py-5 pb-28">
        <button onClick={onRetour} className="text-[13px] text-ink-mute font-bold mb-3">← Retour</button>
        <div className="rounded-2xl border border-cream-deep bg-cream-warm overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 p-3">
            {titre && <Vignette photo={photo} libelle={titre} taille="w-14 h-14 rounded-xl shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-extrabold leading-tight">{titre}</div>
              <div className="text-[12px] text-ink-mute mt-0.5">{sous}</div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
