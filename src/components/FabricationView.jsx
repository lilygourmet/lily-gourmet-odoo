import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { loadFabrication } from '../lib/fabrication'

// ====== « Ce matin » : ce qu'il y a à fabriquer en cakedesign ======
// Déroulé pensé pour la personne qui arrive le matin (validé avec Layla) :
//   1. les BASES à préparer (crème au beurre nature, craquant, sirop) — si besoin
//   2. les GÂTEAUX à faire, séparés « pour le stock » / « pour une commande »,
//      groupés par parfum ; elle coche ceux qu'elle veut faire
//   3. la RECETTE cumulée pour tous les gâteaux cochés ; ouvrir une ligne montre
//      ses sous-catégories (la recette de la préparation, à la bonne quantité)
// La recette est à droite sur ordinateur, en page séparée sur téléphone.

const BASES = [/cr[eè]me au beurre nature/i, /craquant/i, /sirop/i, /amandes\s*caram/i]
const CASA = { timeZone: 'Africa/Casablanca' }   // Odoo renvoie de l'UTC

const dt = q => new Date(String(q || '').replace(' ', 'T') + 'Z')
const jourFr = q => dt(q).toLocaleDateString('fr-FR', { ...CASA, weekday: 'long', day: 'numeric', month: 'long' })
const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const norm = u => String(u || '').toLowerCase().replace(/^units?$/, 'u')
const enKg = (q, u) => (norm(u) === 'g' ? { q: q / 1000, u: 'kg' } : { q, u: norm(u) })
const estPrepa = n => /^SM\b/i.test(String(n || ''))
// « Crème au beurre Chocolat STK » et « Crème au beurre Chocolat » sont la MÊME
// crème (deux articles Odoo) : on les rassemble, stocks compris.
const sansStk = n => String(n || '').replace(/\s*\bSTK\b/i, '').trim()
// Les recettes sont toujours affichées dans cet ordre, quel que soit le gâteau.
const ORDRE = [/genoise/i, /sirop/i, /cr[eè]me/i, /craquant/i, /amandes/i]
const rang = n => { const i = ORDRE.findIndex(r => r.test(String(n || ''))); return i < 0 ? ORDRE.length : i }
const trierRecette = arr => arr.slice().sort((a, b) => rang(a.produit) - rang(b.produit) || String(a.produit).localeCompare(String(b.produit)))
const estBase = n => BASES.some(r => r.test(String(n || '')))
// nom lisible par l'équipe : on enlève les codes internes
const propre = n => String(n || '')
  .replace(/^SM\s+CD\*\s*/i, '').replace(/^SM\s+/i, '').replace(/^MP-\s*/i, '').replace(/^C-\s*/i, '')
  .replace(/\s*\bKG\b\s*CD\b/i, '').replace(/\s*\bCD\*?\b\s*$/i, '').replace(/\s*\bkg\b\s*$/i, '')
  .replace(/\s*\baccs\b/i, '').replace(/\s*\bSTK\b/i, '').trim()

// ce que produit une tournée de cette préparation (« Tournée (3 kg) » → 3 kg)
function tailleTournee(recettes, n) {
  const r = recettes[n]
  if (!r) return null
  if (norm(r.unite) === 'g') return { q: r.qty / 1000, u: 'kg' }
  const m = String(r.unite).match(/\(([\d.,]+)\s*kg\)/i)
  if (m) return { q: r.qty * parseFloat(m[1].replace(',', '.')), u: 'kg' }
  return { q: r.qty, u: norm(r.unite) }
}

// La recette d'une préparation, calculée pour la quantité demandée.
function SousRecette({ recettes, produit, qty, unite }) {
  const r = recettes[produit]
  if (!r) return null
  const base = norm(r.unite) === 'g' ? r.qty / 1000 : r.qty
  const uBase = norm(r.unite) === 'g' ? 'kg' : r.unite
  const meme = norm(uBase) === norm(unite) && base
  const f = meme ? qty / base : 1
  return (
    <div className="ml-8 mb-2 bg-cream-warm rounded-xl px-3 py-2.5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-soft mb-1">
        {propre(produit)} — {meme ? `pour ${nb(qty)} ${unite}` : `pour ${nb(r.qty)} ${r.unite}`}
      </div>
      {trierRecette(r.lignes).map((l, i) => {
        let q = l.qty * f, u = l.unite
        if (norm(u) === 'g' && q >= 1000) { q = q / 1000; u = 'kg' }
        return (
          <div key={i} className="flex gap-2.5 py-1.5 text-[14px] border-b border-dashed border-[#e6ddcd] last:border-0">
            <b className="min-w-[86px]">{nb(q)} {u}</b><span>{propre(l.produit)}</span>
          </div>
        )
      })}
    </div>
  )
}

// « Ma recette » : les besoins cumulés des gâteaux cochés.
function PanneauRecette({ recettes, choisis, recette, ouvertes, setOuvertes, onEffacer, onRetour }) {
  const cle = p => 'sc:' + p
  return (
    <div className={onRetour ? '' : 'bg-white border border-line rounded-2xl p-4 sticky top-4'}>
      <div className="flex items-center gap-2 mb-2">
        {onRetour && <button onClick={onRetour} className="text-[14px] text-bordeaux font-semibold">← Retour</button>}
        <b className="text-[16px]">Ma recette</b>
        <button onClick={onEffacer} className="ml-auto bg-cream-warm rounded-lg px-3 py-1.5 text-[12.5px]">effacer</button>
      </div>
      <div className="text-[12.5px] text-ink-mute mb-3">
        pour {choisis.map(o => `${o.taille} ${o.parfum || ''} ×${nb(o.qty)}`).join(' + ')}
      </div>
      {recette.map(l => (
        <div key={l.produit}>
          <div className="flex items-center gap-3 py-2.5 text-[16px] border-b border-dashed border-[#f0e8db]">
            <b className="min-w-[96px] text-[17px]">{nb(l.qty)} {l.unite}</b>
            {estPrepa(l.produit) && recettes[l.produit] && !estBase(l.produit) ? (
              <button onClick={() => setOuvertes(o => ({ ...o, [cle(l.produit)]: !o[cle(l.produit)] }))}
                className="flex-1 text-left text-bordeaux font-bold underline underline-offset-4">
                {propre(l.produit)} ▾
              </button>
            ) : (
              <span className="flex-1">
                {propre(l.produit)}
                {estBase(l.produit) && <span className="text-[11.5px] text-ink-mute"> · voir « bases » en haut</span>}
              </span>
            )}
            {l.enStock && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#EAF3DE] text-ok">en stock</span>}
          </div>
          {ouvertes[cle(l.produit)] && <SousRecette recettes={recettes} produit={l.produit} qty={l.qty} unite={l.unite} />}
        </div>
      ))}
    </div>
  )
}

function Gateau({ o, on, onToggle }) {
  const stock = o.stock ? o.stock.dispo : null
  return (
    <div role="button" tabIndex={0} onClick={onToggle}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className={'flex items-center gap-3 bg-white border rounded-xl px-3.5 py-3 mb-1.5 cursor-pointer ' +
        (on ? 'border-bordeaux bg-[#fdf4f7] ring-1 ring-bordeaux' : 'border-line')}>
      <input type="checkbox" checked={on} readOnly tabIndex={-1} className="w-6 h-6 accent-[#993556] pointer-events-none flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[18px] font-extrabold">
          {o.taille} <span className="text-[13px] font-medium text-ink-soft">{o.parfum}</span>
        </div>
        <div className="text-[11.5px] text-ink-mute">
          {stock === null ? 'stock inconnu' : stock > 0 ? `il en reste ${nb(stock)} en stock` : 'plus rien en stock'}
          {o.scode ? ` · ${o.scode}` : ''}
        </div>
      </div>
      {o.recetteVide && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FCEEE8] text-danger">pas de recette dans Odoo</span>}
      {o.enRetard && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FFF7E0] text-[#854F0B]">en retard</span>}
      <span className="text-[18px] font-extrabold text-bordeaux">×{nb(o.qty)}</span>
    </div>
  )
}

function Groupe({ titre, list, sel, onToggle }) {
  if (!list.length) return null
  const parfums = [...new Set(list.map(o => o.parfum || '—'))].sort()
  return (
    <>
      <div className="text-[12.5px] font-bold text-ink-mute mt-4 mb-1.5">{titre}</div>
      {parfums.map(p => (
        <div key={p}>
          <div className="text-[15px] font-extrabold text-ink-soft mt-2.5 mb-1.5">{p}</div>
          {list.filter(o => (o.parfum || '—') === p).map(o => (
            <Gateau key={o.name} o={o} on={sel.includes(o.name)} onToggle={() => onToggle(o.name)} />
          ))}
        </div>
      ))}
    </>
  )
}

function Titre({ n, children }) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-2">
      <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-bordeaux">{n} · {children}</span>
      <span className="flex-1 h-0.5 bg-line" />
    </div>
  )
}

export default function FabricationView({ user, onLogout, onNavigate, activeView }) {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [sel, setSel] = useState([])                      // noms d'OF cochés
  const [ouvertes, setOuvertes] = useState({})            // sous-recettes dépliées
  const [pageRecette, setPageRecette] = useState(false)   // téléphone : recette en page à part

  useEffect(() => {
    let vivant = true
    loadFabrication(60)
      .then(d => { if (vivant) setData(d) })
      .catch(e => { if (!vivant) return; setErreur(e.message || String(e)); setData({ ofs: [], recettes: {}, stocks: {} }) })
    return () => { vivant = false }
  }, [])

  const recettes = useMemo(() => (data && data.recettes) || {}, [data])
  const stocks = useMemo(() => (data && data.stocks) || {}, [data])

  const aFaire = useMemo(() => ((data && data.ofs) || []).filter(o => !(o.stock && o.stock.assez)), [data])
  const gateaux = useMemo(() => aFaire.filter(o => o.taille), [aFaire])
  const choisis = useMemo(() => gateaux.filter(o => sel.includes(o.name)), [gateaux, sel])

  // les bases nécessaires : demandées directement, ou par les crèmes qu'il faut faire
  const bases = useMemo(() => {
    const stockDe = n => {
      const cible = sansStk(n)
      let t = 0
      for (const [nomP, s] of Object.entries(stocks)) if (sansStk(nomP) === cible) t += Math.max(0, enKg(s.qty, s.unite).q)
      return t
    }
    const src = choisis.length ? choisis : aFaire
    const besoins = {}
    for (const o of src) for (const r of (o.recette || [])) {
      const k = enKg(r.qty, r.unite)
      const cle = sansStk(r.produit)
      besoins[cle] = (besoins[cle] || 0) + k.q
    }
    const out = {}
    for (const [p, q] of Object.entries(besoins)) {
      if (!estPrepa(p)) continue
      if (estBase(p)) { out[p] = (out[p] || 0) + q; continue }
      const r = recettes[p]
      if (!r) continue
      const base = norm(r.unite) === 'g' ? r.qty / 1000 : r.qty
      const manque = Math.max(0, q - stockDe(p))
      if (!base || !manque) continue
      const f = manque / base
      for (const l of r.lignes) {
        if (!estPrepa(l.produit) || !estBase(l.produit)) continue
        const k = enKg(l.qty * f, l.unite)
        out[l.produit] = (out[l.produit] || 0) + k.q
      }
    }
    return Object.entries(out).map(([p, q]) => {
      const stock = stockDe(p), t = tailleTournee(recettes, p)
      const manque = Math.max(0, q - stock)
      const n = t && t.q ? Math.ceil(manque / t.q) : 0
      return { produit: p, besoin: q, stock, manque, n, qty: n * ((t && t.q) || 0), unite: (t && t.u) || 'kg' }
    }).sort((a, b) => rang(a.produit) - rang(b.produit) || String(a.produit).localeCompare(String(b.produit)))
  }, [choisis, aFaire, recettes, stocks])

  // la recette cumulée des gâteaux cochés
  const recette = useMemo(() => {
    if (!choisis.length) return []
    const stockDe = n => {
      const cible = sansStk(n)
      let t = 0
      for (const [nomP, s] of Object.entries(stocks)) if (sansStk(nomP) === cible) t += Math.max(0, enKg(s.qty, s.unite).q)
      return t
    }
    const besoins = {}
    for (const o of choisis) for (const r of (o.recette || [])) {
      const k = enKg(r.qty, r.unite)
      const cle = sansStk(r.produit)
      besoins[cle] = (besoins[cle] || 0) + k.q
    }
    return trierRecette(Object.entries(besoins)
      .map(([produit, qty]) => ({ produit, qty, unite: 'kg', enStock: estPrepa(produit) && stockDe(produit) >= qty })))
  }, [choisis, stocks])

  const toggle = name => setSel(s => (s.includes(name) ? s.filter(x => x !== name) : [...s, name]))
  const effacer = () => { setSel([]); setPageRecette(false) }

  // téléphone : la recette occupe tout l'écran
  if (pageRecette && choisis.length > 0) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
        <div className="max-w-[620px] mx-auto px-4 py-5">
          <PanneauRecette recettes={recettes} choisis={choisis} recette={recette} ouvertes={ouvertes}
            setOuvertes={setOuvertes} onEffacer={effacer} onRetour={() => setPageRecette(false)} />
        </div>
      </div>
    )
  }

  const cleBase = p => 'sc:' + p
  const deuxColonnes = choisis.length > 0

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className={'mx-auto px-4 py-5 ' + (deuxColonnes
        ? 'max-w-[1100px] grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]'
        : 'max-w-[620px]')}>
        <div className={deuxColonnes ? 'pb-24 lg:pb-0' : ''}>
          <h1 className="font-fraunces italic text-[27px] font-medium">Ce matin</h1>
          <p className="text-[13px] text-ink-mute mb-2">{jourFr(new Date().toISOString())}</p>

          {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] my-3">Impossible de lire Odoo : {erreur}</div>}
          {!data && !erreur && <Skeleton rows={5} />}

          {data && (
            <>
              <Titre n="1">Bases à préparer</Titre>
              {bases.length === 0 && <p className="text-center text-ink-mute text-[14px] py-6">Rien à préparer en base.</p>}
              {bases.map(b => (
                <div key={b.produit}>
                  <div className={'flex items-center gap-3 bg-white border border-line rounded-xl px-3.5 py-3 mb-1.5 border-l-4 ' +
                    (b.manque <= 0.001 ? 'border-l-[#cfe0b8] bg-[#EAF3DE]' : 'border-l-bordeaux')}>
                    <span className="flex-1 text-[17px] font-bold">{propre(b.produit)}</span>
                    {b.manque <= 0.001 ? (
                      <span className="text-[13px] font-bold text-ok">en stock ({nb(b.stock)} {b.unite})</span>
                    ) : (
                      <>
                        <span className="text-[11.5px] text-ink-mute text-right leading-tight">
                          il en reste<br /><b>{nb(b.stock)} {b.unite}</b>
                        </span>
                        <span className="text-[19px] font-extrabold text-bordeaux">{nb(b.qty)} {b.unite}</span>
                        <button onClick={() => setOuvertes(o => ({ ...o, [cleBase(b.produit)]: !o[cleBase(b.produit)] }))}
                          className="bg-cream-warm rounded-lg px-3 py-1.5 text-[12.5px] font-semibold">recette</button>
                      </>
                    )}
                  </div>
                  {ouvertes[cleBase(b.produit)] && (
                    <SousRecette recettes={recettes} produit={b.produit} qty={b.qty} unite={b.unite} />
                  )}
                </div>
              ))}

              <Titre n="2">Gâteaux à faire</Titre>
              {gateaux.length === 0 && <p className="text-center text-ink-mute text-[14px] py-6">Aucun gâteau à faire.</p>}
              <Groupe titre="POUR LE STOCK" list={gateaux.filter(o => !o.scode)} sel={sel} onToggle={toggle} />
              <Groupe titre="POUR UNE COMMANDE" list={gateaux.filter(o => o.scode)} sel={sel} onToggle={toggle} />
            </>
          )}
        </div>

        {/* ordinateur : la recette dans la colonne de droite */}
        {deuxColonnes && (
          <div className="hidden lg:block">
            <PanneauRecette recettes={recettes} choisis={choisis} recette={recette} ouvertes={ouvertes}
              setOuvertes={setOuvertes} onEffacer={effacer} onRetour={null} />
          </div>
        )}
      </div>

      {/* téléphone : barre fixe qui ouvre la recette en page entière */}
      {deuxColonnes && (
        <button onClick={() => setPageRecette(true)}
          className="lg:hidden fixed left-0 right-0 bottom-0 bg-bordeaux text-cream py-4 text-[16px] font-bold shadow-lg">
          Voir ma recette ({choisis.length} gâteau{choisis.length > 1 ? 'x' : ''})
        </button>
      )}
    </div>
  )
}
