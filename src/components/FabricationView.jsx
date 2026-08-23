import { useState, useEffect, useMemo, useCallback } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadFabrication, loadFaits, setFait } from '../lib/fabrication'

// ====== Fabrication : ce qu'il y a à produire (articles CD* d'Odoo) ======
// Les articles « en cm » sont rangés PAR PARFUM (même parfum = même crème).
// Les préparations qui manquent deviennent leurs propres cartes « tournée » :
//  · Craquant et Crème au beurre Nature se font par TOURNÉE ENTIÈRE (il reste du stock)
//  · les autres crèmes se font à la quantité exacte (aucun reste)
//  · les génoises sont mises de côté pour l'instant (demande de Layla, 23/08/2026)
// Décocher un article le retire du calcul (« je ne le fais pas aujourd'hui »).
// La coche « fait » reste dans l'app (table prod_of_faits) : Odoo n'est pas touché.

const PAR_TOURNEE = [/craquant/i, /cr[eè]me au beurre nature/i]
const IGNORER = [/genoise/i]

const CASA = { timeZone: 'Africa/Casablanca' }   // Odoo renvoie de l'UTC
const dt = q => new Date(String(q || '').replace(' ', 'T') + 'Z')
const jourISO = q => dt(q).toLocaleDateString('sv-SE', CASA)
const heure = q => dt(q).toLocaleTimeString('fr-FR', { ...CASA, hour: '2-digit', minute: '2-digit' })
const jourCourt = q => dt(q).toLocaleDateString('fr-FR', { ...CASA, day: '2-digit', month: '2-digit' })
const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const norm = u => String(u || '').toLowerCase().replace(/^units?$/, 'u')
const enKg = (q, u) => (norm(u) === 'g' ? { q: q / 1000, u: 'kg' } : { q, u: norm(u) })
const estPrepa = n => /^SM\b/i.test(String(n || ''))
const aIgnorer = n => IGNORER.some(r => r.test(String(n || '')))
// nom lisible par l'équipe : on enlève les codes internes
const propre = n => String(n || '')
  .replace(/^SM\s+CD\*\s*/i, '').replace(/^SM\s+/i, '').replace(/^MP-\s*/i, '').replace(/^C-\s*/i, '')
  .replace(/\s*\bKG\b\s*CD\b/i, '').replace(/\s*\bCD\*?\b\s*$/i, '').replace(/\s*\bkg\b\s*$/i, '')
  .replace(/\s*\baccs\b/i, '').replace(/\s*\bSTK\b/i, '').trim()

export default function FabricationView({ user, onLogout, onNavigate, activeView }) {
  const [jours, setJours] = useState(60)          // 1 = aujourd'hui · 7 = la semaine · 60 = tout
  const [data, setData] = useState(null)          // { ofs, recettes, stocks }
  const [faits, setFaits] = useState({})
  const [choisi, setChoisi] = useState({})        // { [nom d'OF]: false } = je ne le fais pas
  const [erreur, setErreur] = useState(null)
  const [voirStock, setVoirStock] = useState(false)

  const charger = useCallback(async () => {
    setData(null); setErreur(null)
    try {
      const [d, f] = await Promise.all([loadFabrication(60), loadFaits()])
      setData(d); setFaits(f)
    } catch (e) { setErreur(e.message || String(e)); setData({ ofs: [], recettes: {}, stocks: {} }) }
  }, [])
  useEffect(() => { charger() }, [charger])

  async function toggleFait(cle, produit, qty, on) {
    setFaits(f => { const n = { ...f }; if (on) n[cle] = { fait_le: new Date().toISOString() }; else delete n[cle]; return n })
    try { await setFait({ name: cle, produit, qty, quand: new Date().toISOString() }, on, user?.id) }
    catch (e) {
      setFaits(f => { const n = { ...f }; if (on) delete n[cle]; else n[cle] = { fait_le: new Date().toISOString() }; return n })
      toast.error('Erreur : ' + (e.message || e))
    }
  }

  // ---- ce qui est visible selon la période (un ordre en retard reste toujours visible)
  const { articles, tourneesOdoo, enStock } = useMemo(() => {
    const ofs = (data && data.ofs) || []
    const auj = new Date().toLocaleDateString('sv-SE', CASA)
    const lim = new Date(Date.now() + (jours - 1) * 86400000).toLocaleDateString('sv-SE', CASA)
    const dans = ofs.filter(o => o.enRetard || (jourISO(o.quand) >= auj && jourISO(o.quand) <= lim))
    const dispo = dans.filter(o => o.stock && o.stock.assez)
    const liste = voirStock ? dans : dans.filter(o => !(o.stock && o.stock.assez))
    return {
      articles: liste.filter(o => o.taille),
      tourneesOdoo: liste.filter(o => !o.taille),
      enStock: dispo,
    }
  }, [data, jours, voirStock])

  // ---- les tournées à relancer : besoins cumulés des articles COCHÉS, stock déduit
  const tournees = useMemo(() => {
    if (!data) return []
    const { recettes, stocks } = data
    const tailleTournee = nomP => {
      const r = recettes[nomP]
      if (!r) return null
      if (norm(r.unite) === 'g') return { q: r.qty / 1000, u: 'kg' }
      const m = String(r.unite).match(/\(([\d.,]+)\s*kg\)/i)          // « Tournée (3 kg) »
      if (m) return { q: r.qty * parseFloat(m[1].replace(',', '.')), u: 'kg' }
      return { q: r.qty, u: norm(r.unite) }
    }
    const parTournee = nomP => PAR_TOURNEE.some(r => r.test(nomP)) || /tourn/i.test(String((recettes[nomP] || {}).unite || ''))
    const besoins = {}, pourQui = {}
    const ajoute = (p, q, qui) => { besoins[p] = (besoins[p] || 0) + q; (pourQui[p] = pourQui[p] || new Set()).add(qui) }

    for (const o of [...articles, ...tourneesOdoo]) {
      if (choisi[o.name] === false) continue
      for (const r of (o.recette || [])) {
        if (!estPrepa(r.produit) || aIgnorer(r.produit)) continue
        const k = enKg(r.qty, r.unite)
        ajoute(r.produit, k.q, o.taille ? `${o.taille} ${o.parfum || ''}`.trim() : propre(o.produit))
      }
    }
    // ce qu'Odoo a déjà lancé compte comme disponible (pas de doublon)
    const dejaLance = {}
    for (const o of tourneesOdoo) { const k = enKg(o.qty, o.unite); dejaLance[o.produit] = (dejaLance[o.produit] || 0) + k.q }

    const out = [], file = Object.keys(besoins), vus = new Set()
    while (file.length) {
      const p = file.shift()
      if (vus.has(p)) continue
      vus.add(p)
      const t = tailleTournee(p)
      if (!t || !t.q) continue
      const st = stocks[p]
      const stock = Math.max(0, st ? enKg(st.qty, st.unite).q : 0) + (dejaLance[p] || 0)
      const manque = besoins[p] - stock
      if (manque <= 0.001) continue
      const entiere = parTournee(p)
      const n = entiere ? Math.ceil(manque / t.q) : manque / t.q
      const qty = entiere ? n * t.q : manque
      out.push({
        produit: p, entiere, n, qty, unite: t.u, besoin: besoins[p], stock,
        reste: entiere ? (stock + qty) - besoins[p] : 0,
        pour: [...(pourQui[p] || [])],
        recette: (recettes[p].lignes || []).map(l => {
          let q = l.qty * n, u = l.unite
          if (norm(u) === 'g' && q >= 1000) { q = q / 1000; u = 'kg' }
          return { produit: l.produit, qty: q, unite: u }
        }),
      })
      for (const l of (recettes[p].lignes || [])) {
        if (!estPrepa(l.produit) || aIgnorer(l.produit)) continue
        const k = enKg(l.qty * n, l.unite)
        ajoute(l.produit, k.q, propre(p))
        if (!vus.has(l.produit)) file.push(l.produit)
      }
    }
    return out
  }, [data, articles, tourneesOdoo, choisi])

  const parfums = useMemo(() => [...new Set(articles.map(o => o.parfum || 'Sans parfum'))].sort(), [articles])

  // ---- une carte d'article / de tournée Odoo
  const Carte = ({ o }) => {
    const off = choisi[o.name] === false
    const titre = o.taille || propre(o.produit)
    return (
      <div className={'bg-white border border-line rounded-2xl mb-2.5 overflow-hidden shadow-sm ' + (off ? 'opacity-40' : '')}>
        <div className="flex items-center gap-3 px-3.5 py-3">
          <input type="checkbox" checked={!off} title="Je le fais" className="w-[26px] h-[26px] accent-[#993556] flex-shrink-0"
            onChange={e => setChoisi(c => ({ ...c, [o.name]: e.target.checked }))} />
          <div className="flex-1 min-w-0">
            <div className={'text-[23px] font-extrabold leading-tight ' + (off ? 'line-through' : '')}>
              {titre}{o.parfum && o.taille && <span className="text-[17px] font-medium text-ink-soft"> {o.parfum}</span>}
            </div>
            <div className="text-[11.5px] text-ink-mute mt-0.5">
              {o.enRetard && <b className="text-[#854F0B]">EN RETARD ({jourCourt(o.quand)}) · </b>}
              {o.scode ? `commande ${o.scode} · ` : ''}{heure(o.quand)} · <span className="opacity-70">{o.name}</span>
            </div>
          </div>
          <div className={'text-[24px] font-extrabold text-bordeaux whitespace-nowrap ' + (off ? 'line-through' : '')}>
            ×{nb(o.qty)}{o.unite !== 'u' && <span className="text-[13px]"> {o.unite}</span>}
          </div>
        </div>
        {(o.recette || []).filter(r => !aIgnorer(r.produit)).length > 0 && (
          <div className="border-t border-dashed border-line bg-[#fdfcfa] px-3.5 pt-2 pb-3">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-soft mb-1">Il te faut</div>
            {o.recette.filter(r => !aIgnorer(r.produit)).map((r, i) => {
              const dispo = r.stock && r.stock.assez
              return (
                <div key={i} className="flex items-center gap-3 py-2 text-[15px] border-b border-dashed border-[#f0e8db] last:border-0">
                  <b className="min-w-[88px]">{nb(r.qty)} {r.unite}</b>
                  <span className="flex-1 min-w-0">{propre(r.produit)}</span>
                  {estPrepa(r.produit) && (
                    <span className={'text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ' +
                      (dispo ? 'bg-[#EAF3DE] text-ok' : 'bg-[#FFF7E0] text-[#854F0B]')}>
                      {dispo ? 'en stock' : 'à faire'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ---- une tournée calculée (avec sa recette : c'est ici qu'on la lit)
  const CarteTournee = ({ t }) => {
    const cle = 'PREP:' + t.produit
    const done = !!faits[cle]
    return (
      <div className={'bg-white border border-line rounded-2xl mb-2.5 overflow-hidden shadow-sm ' + (done ? 'bg-[#EAF3DE] opacity-70' : '')}>
        <div className="flex items-center gap-3 px-3.5 py-3">
          <input type="checkbox" checked={done} title="C'est fait" className="w-[26px] h-[26px] accent-[#993556] flex-shrink-0"
            onChange={e => toggleFait(cle, t.produit, t.qty, e.target.checked)} />
          <div className="flex-1 min-w-0">
            <div className={'text-[20px] font-extrabold leading-tight ' + (done ? 'line-through' : '')}>{propre(t.produit)}</div>
            <div className="text-[11.5px] text-ink-mute mt-0.5">
              {t.entiere ? `${t.n} tournée${t.n > 1 ? 's' : ''} de ${nb(t.qty / t.n)} ${t.unite}` : 'juste ce qu\'il faut'}
              {' · il en faut '}<b>{nb(t.besoin)} {t.unite}</b>
              {t.stock > 0 ? ` (en stock ${nb(t.stock)})` : ' (plus rien en stock)'}
              {' · pour '}{t.pour.join(' + ')}
              {t.reste > 0.01 && <b className="text-ok"> · reste {nb(t.reste)} {t.unite} pour après</b>}
            </div>
          </div>
          <div className={'text-[22px] font-extrabold text-bordeaux whitespace-nowrap ' + (done ? 'line-through' : '')}>
            {nb(t.qty)} {t.unite}
          </div>
        </div>
        <div className="border-t border-dashed border-line bg-[#fdfcfa] px-3.5 pt-2 pb-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-ink-soft mb-1">
            Recette pour {nb(t.qty)} {t.unite}{t.entiere ? ` (${t.n} tournée${t.n > 1 ? 's' : ''})` : ''}
          </div>
          {t.recette.map((l, i) => (
            <div key={i} className="flex items-center gap-3 py-2 text-[15px] border-b border-dashed border-[#f0e8db] last:border-0">
              <b className="min-w-[88px]">{nb(l.qty)} {l.unite}</b>
              <span>{propre(l.produit)}{estPrepa(l.produit) && !aIgnorer(l.produit) && <i className="not-italic text-ink-mute text-[12px]"> (tournée ci-dessous)</i>}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const Seg = ({ v, l }) => (
    <button onClick={() => setJours(v)}
      className={'flex-1 py-3 text-[15px] font-semibold rounded-lg ' + (jours === v ? 'bg-bordeaux text-cream' : 'text-ink-soft')}>{l}</button>
  )

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[660px] mx-auto px-4 py-5">
        <h1 className="font-fraunces italic text-[26px] font-medium mb-3">À fabriquer</h1>

        <div className="flex gap-1 p-1 bg-cream-warm rounded-xl mb-3">
          <Seg v={1} l="Aujourd'hui" /><Seg v={7} l="La semaine" /><Seg v={60} l="Tout ce qui est à faire" />
        </div>

        <div className="flex items-center gap-2 text-[13px] text-ink-soft mb-3">
          <span>Décoche ce que tu ne fais pas :</span>
          <button onClick={() => setChoisi({})} className="text-bordeaux underline">tout</button>
          <button onClick={() => setChoisi(Object.fromEntries([...articles, ...tourneesOdoo].map(o => [o.name, false])))} className="text-bordeaux underline">rien</button>
          <button onClick={charger} className="ml-auto px-3 py-1.5 rounded-lg border border-line bg-white text-[12px]">↻ Rafraîchir</button>
        </div>

        {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3">Impossible de lire Odoo : {erreur}</div>}
        {!data && !erreur && <Skeleton rows={5} />}

        {data && parfums.map(p => {
          const l = articles.filter(o => (o.parfum || 'Sans parfum') === p)
          return (
            <div key={p}>
              <div className="flex items-center gap-2.5 mt-5 mb-2">
                <span className="text-[20px] font-extrabold">{p}</span>
                <span className="text-[12px] text-ink-mute">{l.length} taille{l.length > 1 ? 's' : ''} · même crème</span>
                <span className="flex-1 h-0.5 bg-line" />
              </div>
              {l.map(o => <Carte key={o.name} o={o} />)}
            </div>
          )
        })}

        {data && tourneesOdoo.length > 0 && (
          <>
            <div className="flex items-center gap-2.5 mt-5 mb-2">
              <span className="text-[17px] font-extrabold">Tournées</span>
              <span className="text-[12px] text-ink-mute">lancées par le stock mini</span>
              <span className="flex-1 h-0.5 bg-line" />
            </div>
            {tourneesOdoo.map(o => <Carte key={o.name} o={o} />)}
          </>
        )}

        {tournees.length > 0 && (
          <>
            <div className="flex items-center gap-2.5 mt-5 mb-2">
              <span className="text-[17px] font-extrabold">Tournées à relancer</span>
              <span className="text-[12px] text-ink-mute">il n'y en a plus assez en stock</span>
              <span className="flex-1 h-0.5 bg-line" />
            </div>
            {tournees.map(t => <CarteTournee key={t.produit} t={t} />)}
          </>
        )}

        {data && !articles.length && !tourneesOdoo.length && !erreur && (
          <div className="py-12 text-center text-ink-mute text-[14px] bg-cream-warm rounded-xl">
            Rien à fabriquer sur cette période.
          </div>
        )}

        {data && enStock.length > 0 && (
          <button onClick={() => setVoirStock(v => !v)} className="w-full mt-3 border border-dashed border-line rounded-xl py-3 text-[13px] text-ink-mute">
            {voirStock ? 'Masquer ce qui est déjà en stock' : `Voir les ${enStock.length} déjà en stock (pas à refaire)`}
          </button>
        )}
      </div>
    </div>
  )
}
