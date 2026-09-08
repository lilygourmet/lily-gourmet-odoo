import { useState, useEffect } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadFabAnnexe, loadArticleFabAnnexe, photoFabAnnexe, bloquants, declares, noeudAu,
  declarer, envoyerAValider, tourneesSuggerees, pourFois, peseesDe } from '../lib/fabAnnexe'
import { estModeTest } from '../lib/modeTest'
import { frappe } from '../lib/frappe'

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
  return <img src={photoFabAnnexe(photo)} alt="" onError={() => setRate(true)}
    className={`${taille} object-cover bg-cream-deep`} />
}

// Un gâteau occupe souvent plusieurs lignes du catalogue : le Citron Framboise
// en a quatre (le montage, puis la finition en 3 tailles). On les rassemble
// sous le nom du gâteau vendu, que leur photo désigne déjà.
function parGateau(articles) {
  const groupes = []
  for (const a of articles || []) {
    const cle = a.photo || a.produit
    let g = groupes.find(x => x.cle === cle)
    if (!g) {
      g = { cle, nom: String(a.photo || a.libelle).replace(/^E-\s*/, '').trim(), articles: [] }
      groupes.push(g)
    }
    g.articles.push(a)
  }
  return groupes
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

const Titre = ({ children }) => (
  <div className="px-4 pt-3 pb-1 text-[11.5px] font-extrabold uppercase tracking-wide text-ink-mute">{children}</div>
)

// ------------------------------------------------------------
// Une quantité qu'on peut retaper. Toute la recette se remet à l'échelle
// autour (choix de Layla, « version A ») : mettre 1,5 kg de sucre là où la
// recette en veut 1,2, c'est faire une recette et demie — pas forcer sur le
// sucre.
// ------------------------------------------------------------
function LigneQte({ nom, valeur, unite, onValeur, gras }) {
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
      <span className={`flex-1 min-w-0 text-[14px] ${gras ? 'font-extrabold' : ''}`}>{nom}</span>
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
  const [articles, setArticles] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [tour, setTour] = useState(0)
  // Où on est : [] = la liste, ['Tiramisu'] = l'article, ['Tiramisu', 'Biscuit
  // indiv', 'Biscuit plaque'] = on est descendu deux fois.
  const [chemin, setChemin] = useState([])
  // Ce que le pâtissier a déclaré dans cette séance : { produit: { fois } }
  const [faits, setFaits] = useState({})
  const [sortie, setSortie] = useState(null)
  // Verrou contre le double appui : une création d'ordre Odoo prend
  // plusieurs secondes, et deux appuis feraient deux ordres.
  const [envoi, setEnvoi] = useState(false)
  // Combien de tournées le pâtissier a décidé de faire, par article.
  const [foisPar, setFoisPar] = useState({})
  // Le détail d'un article (sa cascade) n'arrive qu'à son ouverture.
  const [details, setDetails] = useState({})
  const ouvert = chemin[0] || null

  const recharger = () => setTour(t => t + 1)
  useEffect(() => {
    let vivant = true
    loadFabAnnexe()
      .then(l => { if (vivant) { setArticles(l); setErreur(null) } })
      .catch(e => { if (vivant) { setErreur(e.message || String(e)); setArticles([]) } })
    return () => { vivant = false }
  }, [tour])

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
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader {...nav} />
        <div className="max-w-[1000px] mx-auto px-4 py-5 pb-28">
          <h1 className="font-serif italic text-[26px] leading-tight">Fabrication Annexe 2</h1>
          <p className="text-[12.5px] text-ink-mute mb-4">
            Seul ce qui est sous le mini apparaît. Stock du Stock Prod annexe.
          </p>

          {erreur && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-[13px] text-danger">
              {erreur}
              <button onClick={recharger} className="ml-3 underline font-bold">Réessayer</button>
            </div>
          )}
          {!articles && !erreur && <Skeleton rows={3} />}

          {!erreur && articles?.length === 0 && (
            <div className="rounded-2xl border border-cream-deep bg-cream-warm py-14 text-center">
              <div className="text-[40px] mb-2">✨</div>
              <div className="font-bold text-[16px]">Tout est au niveau</div>
              <div className="text-[12.5px] text-ink-mute">Rien à fabriquer</div>
            </div>
          )}

          {parGateau(articles).map(g => (
            <section key={g.cle} className="mb-5">
              {g.articles.length > 1 && (
                <h2 className="font-serif italic text-[17px] text-bordeaux mb-1.5">{g.nom}</h2>
              )}
              <div className="grid gap-2.5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
                {g.articles.map(a => (
                  <CarteArticle key={a.produit} a={a} onOuvrir={() => setChemin([a.produit])} />
                ))}
              </div>
            </section>
          ))}
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
  const fois = faits[noeud.produit]?.fois ?? noeud.tournees ?? 1
  const majFois = f => setFaits(x => ({ ...x, [noeud.produit]: { fois: Math.max(0.01, Math.round(f * 10000) / 10000), brouillon: true } }))

  // ---------- « combien ça a donné ? » ----------
  // Vaut pour l'article de tête comme pour une préparation : ce qui sort d'une
  // fournée n'est jamais tout à fait ce que la recette annonce. Les
  // ingrédients, eux, restent ceux qu'on a pesés (Layla, 2026-09-08).
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
        sous={racine ? 'Tournée montée' : `Recette × ${nb(fois)}`}>
        <div className="px-4 py-6 text-center">
          <div className="text-[15px] font-bold">
            {racine
              ? `Combien de ${propre(article.libelle).toLowerCase()} sont sortis ?`
              : 'Combien ça a donné, au final ?'}
          </div>
          <div className="text-[12px] text-ink-mute mb-4">
            {racine ? 'La tournée en fait environ' : 'La recette en annonce'} {qte(prevu, cible.unite)}
          </div>
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
            onClick={async () => {
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
            }}
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
        ? `Tournée de ${qte(article.tournee, article.unite)}`
        : noeud.besoin > noeud.stock
          ? `Il en faut ${qte(noeud.besoin - noeud.stock, noeud.unite)} pour ${propre(parent)}`
          : `Tu en as ${qte(noeud.stock, noeud.unite)} — pour prendre de l'avance`}>

      {racine && (
        <>
          <div className="flex items-center gap-2 px-4 pb-3 flex-wrap">
            <span className="text-[12px] text-ink-mute mr-1">Je fais</span>
            {[0.5, 1, 1.5, 2, 3].map(f => {
              const on = foisArticle === f
              const pieces = Math.round(brut.tournee * f)
              return (
                <button key={f} onClick={() => setFoisPar(x => ({ ...x, [brut.produit]: f }))}
                  className={`rounded-xl px-3 py-2 text-[12.5px] font-extrabold border
                    ${on ? 'bg-bordeaux text-cream border-bordeaux' : 'bg-cream-warm text-ink-soft border-cream-deep'}`}>
                  {f === 0.5 ? '½' : f === 1.5 ? '1½' : f} tournée{f > 1 ? 's' : ''}
                  <span className={`block text-[11px] font-bold ${on ? 'text-cream/80' : 'text-ink-mute'}`}>
                    {pieces} {brut.unite}
                  </span>
                </button>
              )
            })}
          </div>
        <div className="px-4 pb-3">
          {/* La barre va jusqu'au MAXI : en couleur le stock, en vert ce qui est
              déjà déclaré du jour, et ce qui reste sombre est à faire. */}
          <div className="h-2.5 rounded-full bg-cream-deep overflow-hidden flex">
            <div className={article.etat === 'rupture' ? 'bg-danger' : 'bg-gold'}
              style={{ width: `${Math.min(100, (article.stock / article.maxi) * 100)}%` }} />
            {article.dejaFait > 0 && (
              <div className="bg-success"
                style={{ width: `${Math.min(100, (article.dejaFait / article.maxi) * 100)}%` }} />
            )}
          </div>
          <div className="flex justify-between text-[11px] text-ink-mute mt-1.5">
            <span>En stock : <b className="text-ink">{qte(article.stock, article.unite)}</b></span>
            {article.dejaFait > 0 && (
              <span className="text-success font-bold">fait {qte(article.dejaFait, article.unite)}</span>
            )}
            <span>mini {nb(article.mini)}</span><span>maxi {nb(article.maxi)}</span>
          </div>
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
            <button onClick={() => majFois(Math.max(0.5, fois - 0.5))} disabled={fois <= 0.5}
              className="w-11 h-11 rounded-xl border border-cream-deep bg-cream-warm
                         text-[22px] font-extrabold text-bordeaux leading-none disabled:opacity-35">−</button>
            <div className="flex-1 text-center">
              <div className="text-[15px] font-extrabold">
                {fois === 0.5 ? '½' : nb(fois)} tournée{fois > 1 ? 's' : ''}
              </div>
              <div className="text-[11.5px] text-ink-mute">
                {qte((noeud.tourneeTaille || 1) * fois, noeud.unite)}
                {fois !== noeud.tournees && noeud.tournees
                  ? ` · conseillé : ${nb(noeud.tournees)}` : ''}
              </div>
            </div>
            <button onClick={() => majFois(fois + 0.5)}
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
                  <div className="text-[13px] font-extrabold">{c.tournees} tournée{c.tournees > 1 ? 's' : ''}</div>
                  <div className="text-[11px] text-ink-mute">= {qte(c.produira, c.unite)}</div>
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
            {racine ? 'Tout y est'
              : fois === noeud.tournees ? "Recette d'origine" : `Recette × ${nb(fois)}`}
            {!racine && noeud.besoin <= noeud.stock && (
              <div className="text-[11.5px] text-ink-mute mt-0.5">Tu n'en as pas besoin maintenant</div>
            )}
          </div>
          <button
            onClick={() => setSortie(String(racine
              ? article.tournee
              : Math.round((noeud.tourneeTaille || 1) * fois * 100) / 100))}
            className="rounded-xl px-4 py-3 text-[13.5px] font-extrabold bg-bordeaux text-cream">
            C'est fait →
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
        <div className="text-[10.5px] text-ink-mute">
          en stock {qte(a.stock, a.unite)}
          {a.dejaFait > 0 && (
            <span className="block text-success font-bold">déjà fait {qte(a.dejaFait, a.unite)}</span>
          )}
        </div>
        <div className="mt-auto pt-1 text-[11.5px] font-extrabold text-gold leading-tight">
          {sug === 0.5 ? '½' : sug === 1.5 ? '1½' : sug}× · {qte(a.tournee * sug, a.unite)}
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
