import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadMinMax, saveMinMax, loadStockMinMax } from '../lib/fabrication'
import { canSeeMinMaxCd } from '../lib/auth'
import { Interrupteur } from './Interrupteur'
import { parCategorieCd } from '../lib/categoriesCd'

// ====== « Mini / maxi CD » : les seuils que l'APP tient, plus Odoo ======
// Le 2026-09-08, les 55 règles de réapprovisionnement CD* d'Odoo ont été
// effacées : elles relançaient les mêmes fabrications chaque matin. Leurs 37
// vraies valeurs sont passées dans la table `cd_minmax`, et c'est l'app qui
// lance désormais ce qui passe sous son mini (cron de 5 h + bouton
// « Actualiser » de Fabrication CD).
//
// Sans cet écran, ces valeurs n'étaient modifiables que dans Supabase. Réservé
// aux admins : changer un mini change ce que l'atelier fabriquera demain.

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const propre = n => String(n || '').replace(/^\[[^\]]*\]\s*/, '').trim()

export default function MinMaxCdView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(null)
  const [stocks, setStocks] = useState({})
  const [erreur, setErreur] = useState(null)
  const [filtre, setFiltre] = useState('')
  const [enCours, setEnCours] = useState('')      // le produit en train d'être enregistré

  useEffect(() => {
    let vivant = true
    loadMinMax()
      .then(l => { if (vivant) setLignes(l) })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    // le stock vient d'Odoo, plus lentement : l'écran s'affiche sans l'attendre
    loadStockMinMax()
      .then(s => { if (vivant) setStocks(s) })
      .catch(() => { /* régler un seuil reste possible sans voir le stock */ })
    return () => { vivant = false }
  }, [])

  /**
   * TOUS les CD* d'Odoo, pas seulement ceux déjà réglés : « les mini/maxi CD
   * doivent maintenant comporter tous les CD* pour que je décide de leur
   * quantité » (Layla, 2026-09-13). Les articles jamais réglés apparaissent à
   * 0 / 0 — donc jamais relancés tout seuls — et ne sont écrits en base qu'au
   * moment où on leur donne un chiffre.
   *
   * La liste du stock vient d'Odoo et porte déjà tous les CD* : c'est elle qui
   * complète. Tant qu'elle n'est pas arrivée, on montre ce qu'on a.
   */
  const toutes = useMemo(() => {
    if (!lignes) return null
    const dejaLa = new Set(lignes.map(l => l.produit))
    const enPlus = Object.keys(stocks)
      .filter(nom => !dejaLa.has(nom))
      .map(nom => ({ produit: nom, mini: 0, maxi: 0,
        unite: stocks[nom]?.unite || 'u', actif: true, jamaisRegle: true }))
    return [...lignes, ...enPlus]
  }, [lignes, stocks])

  const visibles = useMemo(() => {
    const q = filtre.trim().toLowerCase()
    const l = toutes || []
    const filtres = q ? l.filter(x => propre(x.produit).toLowerCase().includes(q)) : l
    // Ce qui est réglé d'abord : ce sont les décisions de Layla, elles ne
    // doivent pas se noyer au milieu de trois cents articles à zéro.
    return filtres.slice().sort((a, b) => {
      const ra = (Number(a.mini) > 0 || Number(a.maxi) > 0) ? 0 : 1
      const rb = (Number(b.mini) > 0 || Number(b.maxi) > 0) ? 0 : 1
      return ra - rb || propre(a.produit).localeCompare(propre(b.produit), 'fr')
    })
  }, [toutes, filtre])

  /**
   * ⚠️ RANGÉ PAR CATÉGORIE (Layla, 2026-09-21 : « regrouper mini/maxi par
   * catégorie »). L'écran alignait 293 articles à la suite : on cherchait une
   * crème au beurre entre deux cadres de 40x40. Le rangement lit le TYPE dans
   * le nom — c'est son choix, et il vaut mieux que la catégorie d'Odoo, qui
   * range tout ça en quatre paquets dont un « All ».
   */
  const groupes = useMemo(() => parCategorieCd(visibles), [visibles])
  // Repliés par défaut : cinq dossiers se survolent, 293 lignes non. Une
  // recherche ouvre tout — on vient chercher un nom précis.
  const [ouverts, setOuverts] = useState(() => new Set())

  // On tape dans les cases sans rien envoyer : l'enregistrement se fait en
  // quittant la case, pour ne pas écrire à chaque touche.
  const changer = (produit, champ, valeur) => {
    setLignes(v => {
      const l = v || []
      // Un article jamais réglé n'existe pas encore dans la liste : on l'y met
      // au premier chiffre tapé, avec l'unité qu'Odoo lui donne.
      if (!l.some(x => x.produit === produit)) {
        return [...l, { produit, mini: 0, maxi: 0, unite: stocks[produit]?.unite || 'u',
          actif: true, [champ]: valeur }]
      }
      return l.map(x => (x.produit === produit
        ? { ...x, unite: stocks[produit]?.unite || x.unite, [champ]: valeur } : x))
    })
  }

  const enregistrer = async ligne => {
    setEnCours(ligne.produit)
    try {
      await saveMinMax(ligne, user?.id)
      toast.success(`${propre(ligne.produit)} : mini ${nb(ligne.mini)} · maxi ${nb(ligne.maxi)}`)
    } catch (e) {
      toast.error('Pas enregistré : ' + (e.message || e))
    }
    setEnCours('')
  }

  // ⚠️ LE 8ᵉ ENDROIT d'une permission : le verrou DANS l'écran. L'oublier, c'est
  // donner la permission, voir l'onglet apparaître… et tomber sur « réservé aux
  // administrateurs ». (Layla, 2026-09-16)
  if (!canSeeMinMaxCd(user)) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
        <p className="max-w-[560px] mx-auto px-4 py-16 text-center text-ink-mute text-[14px]">
          Cet écran demande une permission : changer un mini change ce que
          l'atelier fabriquera demain matin.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[820px] mx-auto px-4 py-5">
        <h1 className="font-fraunces italic text-[26px] font-medium mb-1">Mini / maxi CD</h1>
        {/* ⚠️ PLUS DE MODE D'EMPLOI, PLUS DE COMPTES (Layla, 2026-09-21) : le
            paragraphe et la ligne « 293 articles — dont 40 réglés, en tête de
            liste » sont partis. Les dossiers disent déjà combien ils portent et
            combien y sont réglés — et « en tête de liste » n'était même plus
            vrai depuis qu'on range par catégorie. */}

        {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3">{erreur}</div>}
        {!lignes && !erreur && <Skeleton rows={6} />}

        {lignes && (
          <>
            <input value={filtre} onChange={e => setFiltre(e.target.value)}
              placeholder="chercher un article…"
              className="w-full text-[13.5px] border border-line rounded-xl px-3 py-2 bg-white mb-3" />

            {groupes.map(g => {
              const ouvert = !!filtre.trim() || ouverts.has(g.cle)
              const regles = g.articles.filter(a => Number(a.mini) > 0 || Number(a.maxi) > 0).length
              return (
                <section key={g.cle} className="mb-2">
                  <button
                    onClick={() => setOuverts(s0 => {
                      const n = new Set(s0)
                      if (n.has(g.cle)) n.delete(g.cle); else n.add(g.cle)
                      return n
                    })}
                    aria-expanded={ouvert}
                    className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-cream-warm
                               border border-line text-left active:bg-cream-deep transition">
                    <span className="text-[20px] leading-none" aria-hidden="true">{g.emoji}</span>
                    <span className="text-[15px] font-extrabold">{g.nom}</span>
                    {regles > 0 && (
                      <span className="rounded-full bg-[#EAF3DE] text-ok text-[11px] font-bold px-2 py-0.5">
                        {regles} réglé{regles > 1 ? 's' : ''}
                      </span>
                    )}
                    <span className="ml-auto text-[12px] text-ink-mute tabular-nums">
                      {g.articles.length}
                    </span>
                    <span className="text-[13px] text-ink-mute">{ouvert ? '▾' : '▸'}</span>
                  </button>
                  {ouvert && <div className="mt-1.5">{g.articles.map(brut => {
              const st = stocks[brut.produit]
              // ⚠️ L'unité d'Odoo fait foi : c'est elle qui donne son sens au
              // stock affiché juste à côté, et donc aux chiffres qu'on tape.
              // Un « u » enregistré autrefois sur du kg se corrige tout seul
              // au prochain enregistrement (Layla, 2026-09-13).
              const l = st?.unite ? { ...brut, unite: st.unite } : brut
              const sousLeMini = st && Number(st.dispo) < Number(l.mini)
              return (
                <div key={l.produit}
                  className={'border rounded-xl px-3 py-2.5 mb-1.5 bg-white ' +
                    (sousLeMini ? 'border-l-4 border-l-bordeaux border-line' : 'border-line')}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
                      <div className="text-[14px] font-bold">{propre(l.produit)}</div>
                      <div className="text-[11.5px] text-ink-mute">
                        {st ? <>il en reste <b>{nb(st.dispo)} {l.unite}</b>{sousLeMini ? ' — sous le mini' : ''}</>
                          : 'stock en cours de lecture…'}
                        {l.jamaisRegle && <span className="text-ink-mute"> · jamais réglé</span>}
                      </div>
                    </div>
                    <label className="text-[11.5px] text-ink-mute">
                      mini<br />
                      <input type="number" min="0" step="any" inputMode="decimal" value={l.mini ?? ''}
                        onChange={e => changer(l.produit, 'mini', e.target.value)}
                        onBlur={() => enregistrer(l)}
                        className="w-[82px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                    </label>
                    <label className="text-[11.5px] text-ink-mute">
                      maxi<br />
                      <input type="number" min="0" step="any" inputMode="decimal" value={l.maxi ?? ''}
                        onChange={e => changer(l.produit, 'maxi', e.target.value)}
                        onBlur={() => enregistrer(l)}
                        className="w-[82px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                    </label>
                    <span className="text-[12px] text-ink-mute w-[28px]">{l.unite}</span>
                    {/* ⚠️ UN INTERRUPTEUR, PAS UN MOT (Layla, 2026-09-20 :
                        « compliqué, le truc de suivi, pause »). Le même que
                        dans Mini / maxi Annexe : c'est le même geste, ça doit
                        se ressembler. */}
                    <Interrupteur
                      on={l.actif !== false}
                      onClick={() => {
                        const actif = !(l.actif !== false)
                        changer(l.produit, 'actif', actif)
                        enregistrer({ ...l, actif })
                      }}
                      titre={l.actif !== false
                        ? 'L’app le relance quand il passe sous son mini'
                        : 'L’app se tait — les chiffres, eux, restent'}>
                      Me le proposer
                    </Interrupteur>
                    {enCours === l.produit && <span className="text-[11.5px] text-bordeaux">enregistrement…</span>}
                  </div>
                </div>
              )
})}</div>}
                </section>
              )
            })}

            {visibles.length === 0 && (
              <p className="py-10 text-center text-ink-mute text-[14px]">Aucun article de ce nom.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
