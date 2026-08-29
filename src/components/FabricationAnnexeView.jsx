import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { todayISO } from '../lib/dates'
import { loadFabProd, addFabProd, delFabProd, loadNoms, loadHistorique } from '../lib/fabricationProd'
import { loadArbreAnnexe, loadMasques, masquer, demasquer } from '../lib/fabricationAnnexe'
import { dernierEcran, garderEcran } from '../lib/fabrication'

const ATELIER = 'annexe'
const nb = v => Number(Number(v || 0).toFixed(2)).toLocaleString('fr-FR')
const propre = n => String(n || '')
  .replace(/^(E-|V-|MI-|N-|SM[.\- ]?|Sm[.\- ]?|SMT?[.\- ]?)\s*/i, '')
  .replace(/\s*(finition|production)\s*$/i, '').trim()
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
function courtNom(nom) {
  const t = propre(nom)
  const fin = (t.match(/\(([^()]*)\)\s*$/) || [])[1]
  if (!fin || /^\s*\d+\s*$/.test(fin)) return t
  return t.replace(/\s*\([^()]*\)\s*$/, '').trim() || t
}

function Vignette({ nom, photo, taille, rond }) {
  const style = { width: taille, height: taille, borderRadius: rond || 12 }
  // `contain` et non `cover` : la photo entière doit tenir dans le carré,
  // sinon on ne voit qu'un morceau du gâteau
  if (photo) {
    return (
      <span className="shrink-0 grid place-items-center bg-cream-warm overflow-hidden" style={style}>
        <img src={photo} alt="" className="w-full h-full object-contain" />
      </span>
    )
  }
  return (
    <span className="grid place-items-center font-serif italic text-cream shrink-0"
      style={{ ...style, background: couleur(nom), fontSize: taille * 0.42 }}>
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
  const minmax = (arbre && arbre.minmax) || {}
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
  const cascade = (nom, besoin, prof, out, vus) => {
    if (prof > 4 || vus.has(nom)) return out
    vus.add(nom)
    const r = recettes[nom]
    const b = besoins[nom] !== undefined ? besoins[nom] : besoin
    out.push({ nom, besoin: b, prof })
    if (!r || b <= 0) return out
    const n = r.sortQty ? b / r.sortQty : 1
    for (const l of r.lignes) {
      if (!l.fabrique || !recettes[l.produit]) continue
      // un stock négatif veut dire que l'inventaire est en retard, pas qu'il
      // faut en produire 7 766 : on le compte comme zéro
      const manque = Math.max(0, l.qty * n - Math.max(0, stocks[l.produit] || 0))
      if (manque > 0.001) cascade(l.produit, Math.ceil(manque), prof + 1, out, vus)
    }
    return out
  }
  const travailDe = mere => {
    const out = []
    for (const e of enfantsDe(mere)) {
      const b = besoins[e] !== undefined ? besoins[e] : besoinDeBase(e)
      if (b > 0) cascade(e, b, 1, out, new Set())
    }
    return out
  }
  const besoinDe = nom => (besoins[nom] !== undefined ? besoins[nom] : besoinDeBase(nom))

  // les gâteaux qui ont du travail : quelque chose manque dans leur chaîne
  const aFaire = useMemo(() => {
    if (!arbre) return []
    return (arbre.racines || [])
      .filter(m => !caches.includes(m))
      .map(m => ({ mere: m, lignes: travailDe(m) }))
      .filter(x => x.lignes.length)
  }, [arbre, caches, besoins, stocks, minmax])

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

  const ouvrirFiche = (nom, depuis) => {
    setPile(p => (depuis ? [...p, depuis] : []))
    setSaisie(nom)
    const r = recettes[nom]
    const b = besoins[nom] !== undefined ? besoins[nom] : besoinDeBase(nom)
    setFois(b > 0 && r && r.sortQty ? Math.max(0.5, Math.ceil((b / r.sortQty) * 2) / 2) : 1)
  }

  const ouvrirFicheSimple = nom => {
    setSaisie(nom)
    const r = recettes[nom]
    const b = besoins[nom] !== undefined ? besoins[nom] : besoinDeBase(nom)
    setFois(b > 0 && r && r.sortQty ? Math.max(0.5, Math.ceil((b / r.sortQty) * 2) / 2) : 1)
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

  const poser = (nom, v) => setBesoins(b => ({ ...b, [nom]: Math.max(0, Number(v) || 0) }))

  return (
    <div className="min-h-[100dvh] bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-[860px] mx-auto px-3 py-4 pb-28 print:p-0 print:max-w-none">
        <div className="flex gap-2 mb-4 print:hidden">
          {[['besoins', 'Ce qu\'il faut faire'], ['declarer', 'Déclarer ce qu\'on a fait']].map(([v, t]) => (
            <button key={v} onClick={() => { setVue(v); setSaisie(null); setPile([]) }}
              className={'flex-1 py-3 rounded-2xl text-[14.5px] font-extrabold border-2 flex items-center justify-center gap-2 ' +
                (vue === v ? 'bg-bordeaux border-bordeaux text-cream' : 'bg-white border-line text-ink-mute')}>
              {t}
              {v === 'besoins' && aFaire.length > 0 && (
                <span className={'rounded-full px-2 py-0.5 text-[12.5px] ' +
                  (vue === v ? 'bg-white/25' : 'bg-danger text-white')}>{aFaire.length}</span>
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
            {!aFaire.length && (
              <p className="text-center text-ink-mute text-[14px] py-10">Rien à faire aujourd'hui.</p>
            )}
            <div className="grid gap-2.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
              {aFaire.map(({ mere, lignes }) => {
                // « 5 à faire » ne dit pas quoi : on nomme chaque taille et sa
                // quantité, c'est ça que le pâtissier a besoin de lire
                const directs = lignes.filter(l => l.prof === 1)
                return (
                  <button key={mere} onClick={() => ouvrirFiche(mere)}
                    className="relative bg-white border-2 border-danger rounded-[14px] overflow-hidden text-left">
                    <span className="absolute top-0 left-0 right-0 h-1 z-10" style={{ background: NIVEAU[0] }} />
                    <span className="block w-full aspect-square overflow-hidden">
                      <Vignette nom={mere} photo={photoDe(mere)} taille={400} rond={0} />
                    </span>
                    <span className="block px-2 pt-1.5 text-[12px] font-bold leading-tight">{propre(mere)}</span>
                    <span className="block px-2 pb-2 pt-1">
                      {directs.slice(0, 3).map(l => (
                        <span key={l.nom} className="flex items-baseline gap-1.5 text-[11.5px] leading-tight mb-0.5">
                          <b className="text-danger font-extrabold">{nb(l.besoin)}</b>
                          <span className="text-ink-soft truncate">{courtNom(l.nom)}</span>
                        </span>
                      ))}
                      {directs.length > 3 && (
                        <span className="block text-[11px] text-ink-mute">+ {directs.length - 3} autres</span>
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
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

            <div className="grid gap-2.5 print:hidden"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))' }}>
              {liste.map(nom => {
                const fait = combienDe[nom] || 0
                return (
                  <button key={nom} onClick={() => ouvrirFiche(nom)}
                    className={'relative bg-white border rounded-[14px] overflow-hidden text-left ' +
                      (fait ? 'border-2 border-ok' : 'border-line')}>
                    <span className="absolute top-0 left-0 right-0 h-1 z-10"
                      style={{ background: NIVEAU[0] }} />
                    <span className="block w-full aspect-square overflow-hidden">
                      <Vignette nom={nom} photo={photoDe(nom)} taille={400} rond={0} />
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
                    <span className="block px-2 py-1.5 text-[12px] font-bold leading-tight">{propre(nom)}</span>
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
                  <span className="text-[17px] font-extrabold text-ok whitespace-nowrap">{nb(l.qty)} {l.unite}</span>
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
        const estMere = (arbre && (arbre.racines || []).includes(saisie))
        return (
        <div className="fixed inset-0 z-[70] bg-ink/55 flex items-end justify-center print:hidden"
          onPointerDown={e => { if (e.target === e.currentTarget) { setSaisie(null); setPile([]) } }}>
          <div className="bg-cream w-full max-w-[540px] rounded-t-[22px] p-4 pb-6 h-[82dvh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-3">
              {pile.length > 0 && (
                <button onClick={() => { const p = [...pile]; const r = p.pop(); setPile(p); ouvrirFicheSimple(r) }}
                  className="w-10 h-10 shrink-0 border border-line bg-white rounded-xl grid place-items-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-bordeaux fill-none" strokeWidth="2.4">
                    <path d="M15 5l-7 7 7 7" /></svg>
                </button>
              )}
              <Vignette nom={saisie} photo={photoDe(saisie)} taille={58} rond={15} />
              <b className="text-[18px] leading-tight flex-1 min-w-0">{propre(saisie)}</b>
            </div>
            {pile.length > 0 && (
              <p className="text-[12px] text-ink-mute -mt-1 mb-3">
                pour faire <b>{propre(pile[pile.length - 1])}</b>
              </p>
            )}

            {vue === 'besoins' && minmax[saisie] && minmax[saisie].min > 0 && (stocks[saisie] || 0) < minmax[saisie].min && (
              <div className="bg-[#FCEEE8] border border-[#f0cfc5] rounded-2xl px-3.5 py-3 mb-2.5 flex items-center gap-3">
                <b className="text-[27px] font-extrabold text-danger leading-none">{nb(stocks[saisie] || 0)}</b>
                <span className="text-[12.5px] text-danger leading-snug">
                  il en reste <b>{nb(stocks[saisie] || 0)}</b><br />
                  il en faut au moins <b>{nb(minmax[saisie].min)}</b>, jusqu'à <b>{nb(minmax[saisie].max)}</b>
                </span>
              </div>
            )}

            {vue === 'besoins' && (() => {
              const travail = (aFaire.find(x => x.mere === saisie) || {}).lignes
              if (!travail || !travail.length) return null
              return (
                <div className="bg-white border border-danger rounded-2xl overflow-hidden mb-2.5">
                  <div className="bg-[#FCEEE8] px-3.5 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-danger border-b border-[#f0cfc5]">
                    Ce qu'il manque
                  </div>
                  {travail.map(l => (
                    <button key={l.nom} onClick={() => ouvrirFiche(l.nom, saisie)}
                      className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 border-b border-[#f4eee2] last:border-0 active:bg-cream-warm"
                      style={{ paddingLeft: 14 + (l.prof - 1) * 16 }}>
                      <b className="text-[19px] font-extrabold text-danger min-w-[62px] text-right">{nb(l.besoin)}</b>
                      <span className="flex-1 min-w-0 text-[14px]">
                        {courtNom(l.nom)}
                        {l.prof > 1 && <span className="block text-[11px] text-[#b58f3c] font-bold">pour celui du dessus</span>}
                      </span>
                      <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-bordeaux fill-none shrink-0" strokeWidth="2.6">
                        <path d="M9 5l7 7-7 7" /></svg>
                    </button>
                  ))}
                </div>
              )
            })()}

            {vue === 'besoins' && saisie && !aFaire.some(x => x.mere === saisie) && (() => {
              const b = besoinDe(saisie)
              const r = recettes[saisie]
              const f2 = r && r.sortQty ? b / r.sortQty : 0
              const rond = Math.ceil(f2 * 2) / 2
              const collee = r && r.sortQty ? Math.round(rond * r.sortQty) : b
              return (
                <div className="bg-white border border-line rounded-2xl p-2.5 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11.5px] font-extrabold uppercase tracking-wide text-ink-mute flex-1">
                      à faire
                    </span>
                    <button onClick={() => poser(saisie, b - 1)}
                      className="w-9 h-10 border border-line rounded-[10px] bg-white text-[20px] font-extrabold text-bordeaux leading-none">−</button>
                    <input type="number" value={b} onChange={e => poser(saisie, e.target.value)}
                      className="w-[76px] h-10 border border-line rounded-[10px] text-center text-[18px] font-extrabold bg-white outline-none focus:border-bordeaux" />
                    <button onClick={() => poser(saisie, b + 1)}
                      className="w-9 h-10 border border-line rounded-[10px] bg-white text-[20px] font-extrabold text-bordeaux leading-none">+</button>
                  </div>
                  {Math.abs(f2 - rond) > 0.01 && (
                    <button onClick={() => { poser(saisie, collee); setFois(Math.max(0.5, rond)) }}
                      className="w-full mt-2 border border-[#b58f3c] text-[#b58f3c] bg-white rounded-[10px] py-2 text-[12.5px] font-extrabold">
                      arrondir à {nb(rond)} fois → {collee}
                    </button>
                  )}
                </div>
              )
            })()}

            {!estMere && (
            <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-2.5 mb-2.5">
              <button onClick={() => setFois(f => Math.max(0.5, f > 1 ? f - 1 : f - 0.5))}
                className="w-14 h-14 shrink-0 border-2 border-line rounded-2xl text-[27px] font-extrabold text-bordeaux leading-none">−</button>
              <div className="flex-1 text-center">
                <input type="number" step="0.5" min="0.5" value={fois}
                  onChange={e => setFois(Math.max(0.5, Number(e.target.value) || 0.5))}
                  className="w-full bg-transparent border-0 outline-none text-center text-[36px] font-extrabold text-ink p-0" />
                <span className="text-[11.5px] text-ink-mute font-bold">fois la recette</span>
              </div>
              <button onClick={() => setFois(f => (f < 1 ? f + 0.5 : f + 1))}
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
                  const contenu = (
                    <>
                      <span className="text-[17px] font-extrabold min-w-[96px] text-right">
                        {l.tailles ? l.tailles.map(x => nb(x * fois)).join(' / ') : nb(l.qty * fois)} {l.unite}
                      </span>
                      <span className={'text-[14px] flex-1 min-w-0 ' + (l.fabrique ? 'text-bordeaux font-bold' : '')}>
                        {propre(l.produit)}
                      </span>
                      {ouvrable && (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-bordeaux fill-none shrink-0" strokeWidth="2.6">
                          <path d="M9 5l7 7-7 7" /></svg>
                      )}
                    </>
                  )
                  return ouvrable ? (
                    <button key={i} onClick={() => ouvrirFiche(l.produit, saisie)}
                      className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 border-b border-[#f4eee2] last:border-0 active:bg-cream-warm">
                      {contenu}
                    </button>
                  ) : (
                    <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-[#f4eee2] last:border-0">
                      {contenu}
                    </div>
                  )
                })}
              </div>
            )}

            {!estMere && recettes[saisie] && (
              <div className="bg-[#EAF3DE] border border-[#cfe0b8] rounded-2xl px-3.5 py-3 flex items-baseline gap-2.5">
                <b className="text-[23px] font-extrabold text-ok">
                  {nb(recettes[saisie].sortQty * fois)} {recettes[saisie].sortUnite}
                </b>
                <span className="text-[12.5px] text-ok">en sortie</span>
              </div>
            )}
            {!estMere && !recettes[saisie] && (
              <p className="text-[12.5px] text-[#854F0B]">Pas de recette dans Odoo : on note seulement les fournées.</p>
            )}

            {!estMere && (
              <button onClick={() => noter(saisie, fois)}
                className="w-full mt-3 py-4 rounded-2xl bg-ok text-white text-[17px] font-extrabold flex items-center justify-center gap-2.5">
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
