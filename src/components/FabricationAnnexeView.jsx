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
const propre = n => String(n || '').replace(/^(SM[.\- ]?|Sm[.\- ]?)/i, '').replace(/\s*(finition|production)\s*$/i, '').trim()
const jourLisible = j => new Date(j + 'T12:00:00')
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const heure = t => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

// Une vignette tant qu'il n'y a pas de photo : la première lettre sur un fond
// dont la couleur découle du nom, pour que chaque article reste reconnaissable.
const couleur = n => {
  let h = 0
  for (let i = 0; i < n.length; i += 1) h = (h * 31 + n.charCodeAt(i)) % 360
  return `hsl(${h} 32% 62%)`
}

function Vignette({ nom, taille }) {
  return (
    <span className="grid place-items-center font-serif italic text-cream"
      style={{ background: couleur(nom), width: taille, height: taille, fontSize: taille * 0.42 }}>
      {propre(nom).slice(0, 1).toUpperCase()}
    </span>
  )
}

export default function FabricationAnnexeView({ user, onLogout, onNavigate, activeView }) {
  const [jour, setJour] = useState(todayISO())
  const [arbre, setArbre] = useState(() => dernierEcran('annexe'))
  const [erreur, setErreur] = useState(null)
  const [journal, setJournal] = useState(null)
  const [chemin, setChemin] = useState([])        // où l'on est descendu
  const [saisie, setSaisie] = useState(null)      // l'article dont on ouvre la fiche
  const [fois, setFois] = useState(1)
  const [noms, setNoms] = useState({})
  const [caches, setCaches] = useState([])
  const [voirCaches, setVoirCaches] = useState(false)
  const [histo, setHisto] = useState(null)
  const [voirHisto, setVoirHisto] = useState(false)

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
  const enfantsDe = nom => {
    const r = recettes[nom]
    if (!r) return []
    return r.lignes.filter(l => l.fabrique && recettes[l.produit]).map(l => l.produit)
  }

  // La liste affichée : les racines, ou les morceaux de là où l'on est.
  const liste = useMemo(() => {
    if (!arbre) return []
    if (!chemin.length) return (arbre.racines || []).filter(n => !caches.includes(n))
    return enfantsDe(chemin[chemin.length - 1])
  }, [arbre, chemin, caches])

  const combienDe = useMemo(() => {
    const m = {}
    for (const l of journal || []) m[l.article] = (m[l.article] || 0) + 1
    return m
  }, [journal])

  const ouvrirFiche = nom => { setSaisie(nom); setFois(1) }

  const valider = async () => {
    const r = recettes[saisie]
    const q = r ? Math.round(r.sortQty * fois * 100) / 100 : fois
    const u = r ? r.sortUnite : 'u'
    try {
      const ligne = await addFabProd(jour, saisie, q, u, user?.id, fois, ATELIER)
      setJournal(l => [...(l || []), ligne])
      setSaisie(null)
      setHisto(null)
      toast.success(propre(saisie) + ' — ' + nb(fois) + ' fois')
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
    try { await demasquer(nom); setCaches(c => c.filter(x => x !== nom)) }
    catch (e) { toast.error('Impossible de remettre : ' + (e.message || e)) }
  }

  return (
    <div className="min-h-[100dvh] bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-[820px] mx-auto px-3 py-4 pb-28 print:p-0 print:max-w-none">
        <div className="flex items-center gap-2 mb-4 print:hidden">
          <div className="flex-1 bg-white border border-line rounded-2xl px-3.5 py-2.5">
            <input type="date" value={jour}
              onChange={e => { setJournal(null); setSaisie(null); setJour(e.target.value) }}
              className="w-full bg-transparent border-0 outline-none text-[16px] font-extrabold text-ink" />
          </div>
          <button onClick={() => window.print()} title="Imprimer"
            className="w-[52px] h-[52px] shrink-0 border border-line bg-white rounded-2xl grid place-items-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-ink-soft fill-none" strokeWidth="1.7">
              <path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z" /></svg>
          </button>
          <button onClick={() => { setVoirHisto(v => !v); if (!histo) loadHistorique(60, ATELIER).then(setHisto).catch(() => setHisto([])) }}
            title="Historique"
            className={'w-[52px] h-[52px] shrink-0 rounded-2xl grid place-items-center border ' +
              (voirHisto ? 'bg-bordeaux border-bordeaux' : 'bg-white border-line')}>
            <svg viewBox="0 0 24 24" className={'w-6 h-6 fill-none ' + (voirHisto ? 'stroke-cream' : 'stroke-ink-soft')} strokeWidth="1.7">
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

        {/* le fil : où l'on est, avec la flèche pour remonter */}
        {chemin.length > 0 && (
          <div className="flex items-center gap-2.5 mb-3.5 print:hidden">
            <button onClick={() => setChemin(c => c.slice(0, -1))}
              className="w-[46px] h-[46px] shrink-0 border border-line bg-white rounded-2xl grid place-items-center">
              <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] stroke-bordeaux fill-none" strokeWidth="2.4">
                <path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <span className="rounded-xl overflow-hidden shrink-0 flex">
              <Vignette nom={chemin[chemin.length - 1]} taille={46} />
            </span>
            <span className="text-[17px] font-extrabold leading-tight flex-1 min-w-0">
              {propre(chemin[chemin.length - 1])}
            </span>
          </div>
        )}

        {erreur && (
          <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3 print:hidden">
            Impossible de lire Odoo : {erreur}
          </div>
        )}
        {!arbre && !erreur && <Skeleton rows={5} />}

        {/* les cartes */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 print:hidden">
          {liste.map(nom => {
            const morceaux = enfantsDe(nom).length
            const fait = combienDe[nom] || 0
            return (
              <button key={nom} onClick={() => ouvrirFiche(nom)}
                className={'relative bg-white border rounded-[20px] overflow-hidden text-left ' +
                  (fait ? 'border-2 border-ok' : 'border-line')}>
                <span className="block aspect-square w-full overflow-hidden">
                  <Vignette nom={nom} taille={400} />
                </span>
                {fait > 0 && (
                  <span className="absolute top-2.5 right-2.5 w-[42px] h-[42px] rounded-full bg-ok grid place-items-center shadow-md">
                    <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-white fill-none" strokeWidth="3"><path d="M4 13l5 5L20 7" /></svg>
                  </span>
                )}
                {fait > 1 && (
                  <span className="absolute top-2.5 left-2.5 bg-ink/70 text-cream text-[14px] font-extrabold px-2.5 py-1 rounded-full">
                    {fait}
                  </span>
                )}
                {morceaux > 0 && (
                  <span onClick={ev => { ev.stopPropagation(); setChemin(c => [...c, nom]) }}
                    className="absolute bottom-[52px] left-2.5 bg-white/95 border border-line rounded-full px-2.5 py-1 flex items-center gap-1.5 text-[13px] font-extrabold text-bordeaux">
                    {morceaux}
                    <svg viewBox="0 0 24 24" className="w-[15px] h-[15px] stroke-bordeaux fill-none" strokeWidth="2.6"><path d="M9 5l7 7-7 7" /></svg>
                  </span>
                )}
                {!chemin.length && (
                  <span onClick={ev => cacher(nom, ev)} title="ranger"
                    className="absolute top-2.5 left-2.5 w-[34px] h-[34px] rounded-full bg-white/90 border border-line grid place-items-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-ink-mute fill-none" strokeWidth="2.4"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </span>
                )}
                <span className="block px-3 py-2.5 text-[15px] font-bold leading-tight">{propre(nom)}</span>
              </button>
            )
          })}
        </div>

        {arbre && !liste.length && (
          <p className="text-[13.5px] text-ink-mute py-6 text-center print:hidden">
            Rien ici. Reviens en arrière avec la flèche.
          </p>
        )}

        {/* ce qui a été fait aujourd'hui */}
        <div className="flex items-center gap-2.5 mt-8 mb-3 print:hidden">
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
              <span className="rounded-xl overflow-hidden shrink-0 flex"><Vignette nom={l.article} taille={52} /></span>
              <span className="flex-1 min-w-0 text-[15px] font-semibold leading-tight">
                {propre(l.article)}
                <span className="block text-[12px] text-ink-mute font-normal mt-0.5">
                  {nb(l.fois || 1)} fois{noms[l.fait_par] ? ' · ' + noms[l.fait_par] : ''} · {heure(l.fait_le)}
                </span>
              </span>
              <span className="text-[18px] font-extrabold text-ok whitespace-nowrap">{nb(l.qty)} {l.unite}</span>
              <button onClick={() => retirerLigne(l.id)}
                className="w-10 h-10 shrink-0 border border-line rounded-xl grid place-items-center">
                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-danger fill-none" strokeWidth="2.6"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
          ))}
        </div>

        {/* les articles rangés */}
        {!chemin.length && caches.length > 0 && (
          <div className="mt-8 print:hidden">
            <button onClick={() => setVoirCaches(v => !v)}
              className="text-[12.5px] font-bold text-ink-mute">
              {voirCaches ? '▾' : '▸'} {caches.length} article{caches.length > 1 ? 's' : ''} rangé{caches.length > 1 ? 's' : ''}
            </button>
            {voirCaches && (
              <div className="mt-2">
                {caches.map(n => (
                  <div key={n} className="flex items-center gap-3 bg-white border border-line rounded-xl px-3 py-2 mb-1.5">
                    <span className="flex-1 text-[13.5px] min-w-0">{propre(n)}</span>
                    <button onClick={() => remettre(n)} className="text-[12.5px] font-bold text-bordeaux">remettre</button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                  <th className="text-right border-b-2 border-ink py-1.5 text-[10.5px] uppercase w-[80px]">Fois</th>
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
      {saisie && (
        <div className="fixed inset-0 z-[70] bg-ink/55 flex items-end justify-center print:hidden"
          onPointerDown={e => { if (e.target === e.currentTarget) setSaisie(null) }}>
          <div className="bg-cream w-full max-w-[560px] rounded-t-[24px] p-4 pb-6 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-3">
              <span className="rounded-2xl overflow-hidden shrink-0 flex"><Vignette nom={saisie} taille={62} /></span>
              <b className="text-[19px] leading-tight">{propre(saisie)}</b>
            </div>

            <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-2.5 mb-2.5">
              <button onClick={() => setFois(f => Math.max(0.5, f > 1 ? f - 1 : f - 0.5))}
                className="w-16 h-16 shrink-0 border-2 border-line rounded-2xl text-[32px] font-extrabold text-bordeaux leading-none">−</button>
              <div className="flex-1 text-center">
                <b className="block text-[44px] font-extrabold leading-none">{nb(fois)}</b>
                <span className="text-[12.5px] text-ink-mute font-bold">fois la recette</span>
              </div>
              <button onClick={() => setFois(f => (f < 1 ? f + 0.5 : f + 1))}
                className="w-16 h-16 shrink-0 border-2 border-line rounded-2xl text-[32px] font-extrabold text-bordeaux leading-none">+</button>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-3.5">
              {[0.5, 1, 2, 3].map(n => (
                <button key={n} onClick={() => setFois(n)}
                  className={'py-3 text-[17px] font-extrabold border-2 rounded-2xl ' +
                    (fois === n ? 'bg-bordeaux border-bordeaux text-cream' : 'bg-white border-line text-ink-mute')}>
                  {n === 0.5 ? '½' : n}
                </button>
              ))}
            </div>

            {recettes[saisie] && recettes[saisie].lignes.length > 0 && (
              <div className="bg-white border border-line rounded-2xl overflow-hidden mb-3">
                <div className="bg-cream-warm px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft border-b border-line">
                  Ce qu'il faut
                </div>
                {recettes[saisie].lignes.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-[#f4eee2] last:border-0">
                    <span className="text-[19px] font-extrabold min-w-[104px] text-right">{nb(l.qty * fois)} {l.unite}</span>
                    <span className={'text-[15px] flex-1 min-w-0 ' + (l.fabrique ? 'text-bordeaux font-bold' : '')}>
                      {propre(l.produit)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {recettes[saisie] && (
              <div className="bg-[#EAF3DE] border border-[#cfe0b8] rounded-2xl px-3.5 py-3 mb-1 flex items-baseline gap-2.5">
                <b className="text-[26px] font-extrabold text-ok">
                  {nb(recettes[saisie].sortQty * fois)} {recettes[saisie].sortUnite}
                </b>
                <span className="text-[13.5px] text-ok">en sortie</span>
              </div>
            )}
            {!recettes[saisie] && (
              <p className="text-[12.5px] text-[#854F0B] mb-2">Pas de recette dans Odoo : on note seulement les fournées.</p>
            )}

            <button onClick={valider}
              className="w-full mt-3 py-4 rounded-2xl bg-ok text-white text-[19px] font-extrabold flex items-center justify-center gap-2.5">
              <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-white fill-none" strokeWidth="3"><path d="M4 13l5 5L20 7" /></svg>
              C'est fait
            </button>
            <button onClick={() => setSaisie(null)}
              className="w-full mt-2 py-3.5 rounded-2xl bg-white border border-line text-ink-mute text-[15px] font-bold">
              fermer
            </button>
          </div>
        </div>
      )}

      {journal && (
        <div className="lg-bottom-bar z-40 bg-white border-t border-line px-4 py-3 flex items-center gap-3 print:hidden">
          <b className="text-[16px] flex-1">
            {journal.length === 0 ? 'Rien fait' : journal.length + (journal.length > 1 ? ' faits' : ' fait')}
          </b>
          <button onClick={() => window.print()}
            className="bg-bordeaux text-cream rounded-2xl px-4 py-3 text-[15px] font-extrabold">
            Imprimer
          </button>
        </div>
      )}
    </div>
  )
}
