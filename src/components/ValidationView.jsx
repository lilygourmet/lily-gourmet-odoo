import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadFabrication, loadFaits, loadManques, validerDansOdoo } from '../lib/fabrication'

// ====== « À valider » : la page dédiée ======
// Tout ce que l'équipe a marqué « fait » (montages, préparations, tournées de
// glaçage) attend ici sa confirmation dans Odoo. On ne force jamais sans une
// demande explicite. Réservée à perm_valider_of.

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const norm = u => String(u || '').toLowerCase().replace(/^units?$/, 'u')
const qte = (q, u) => (norm(u) === 'kg' ? `${nb(q * 1000)} g` : `${nb(q)} ${norm(u) === 'g' ? 'g' : u}`)
const propre = n => String(n || '')
  .replace(/^SM\.?\s*/i, '').replace(/^CD\*\s*/i, '').replace(/^MP-\s*/i, '').replace(/^C-\s*/i, '')
  .replace(/\s*\bCD\*?\b\s*$/i, '').replace(/\s*\baccs\b/i, '').trim()

export default function ValidationView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(null)
  const [sel, setSel] = useState([])
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [resultats, setResultats] = useState(null)
  const [confirmer, setConfirmer] = useState(false)
  const [tour, setTour] = useState(0)

  useEffect(() => {
    let vivant = true
    Promise.all([loadFabrication(60), loadFaits()])
      .then(async ([d, f]) => {
        if (!vivant) return
        // Tout ce qui est marqué fait et existe encore dans Odoo : les ordres
        // nommés directement (montages, tournées de glaçage, et tout ce qu'on
        // ajoutera plus tard) et les préparations, cochées par produit.
        const tous = (d && d.ordres) || []
        const ouverts = new Set(tous.map(o => o.name))
        const noms = new Set()
        for (const c of Object.keys(f)) {
          if (/^WH.*\/MO\//i.test(c)) { if (ouverts.has(c)) noms.add(c); continue }
          if (!c.startsWith('PREP:')) continue
          const produit = c.slice(5, c.lastIndexOf(':'))
          for (const o of tous) if (o.produit === produit && o.etat !== 'done') noms.add(o.name)
        }
        if (!noms.size) { setLignes([]); return }
        const m = await loadManques([...noms])
        if (!vivant) return
        setLignes(m)
        setSel(m.map(x => x.name))
      })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    return () => { vivant = false }
  }, [tour])

  const choisis = useMemo(() => (lignes || []).filter(l => sel.includes(l.name)), [lignes, sel])
  const prets = choisis.filter(l => !l.manques.length)
  const bloques = choisis.filter(l => l.manques.length)
  const manquesCumules = [...new Map(bloques.flatMap(l => l.manques).map(m => [m.produit, m])).values()]

  async function lancer(forcer) {
    const cibles = (forcer ? bloques : prets).map(l => l.name)
    if (!cibles.length) return
    setEnvoi(true)
    try { setResultats(await validerDansOdoo(cibles, forcer, user?.id)) }
    catch (e) { toast.error(e.message || String(e)) }
    setEnvoi(false)
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[660px] mx-auto px-4 py-5">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="font-fraunces italic text-[26px] font-medium">À valider</h1>
          <button onClick={() => { setLignes(null); setResultats(null); setTour(v => v + 1) }}
            className="ml-auto bg-white border border-line rounded-xl px-3 py-2 text-[13px] text-ink-soft">↻ Actualiser</button>
        </div>
        <p className="text-[12.5px] text-ink-mute mb-3">
          Ce qui est marqué « fait » et attend sa confirmation dans Odoo. La génoise et l'eau ne sont pas comptées dans les manques.
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
                  {r.ok ? 'validé dans Odoo' : r.message}
                  {r.glacage > 0 && ` · ${nb(r.glacage)} g de glaçage royal consommés dedans`}
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
            <span className="text-[12.5px]">Ce que l'équipe marque « fait » dans Fabrication CD ou Fabrication Glaçage arrive ici.</span>
          </div>
        )}

        {lignes && !resultats && !envoi && lignes.map(l => {
          const on = sel.includes(l.name)
          return (
            <div key={l.name} className={'border border-line rounded-xl mb-2 overflow-hidden border-l-4 ' +
              (l.manques.length ? 'border-l-[#d9a441]' : 'border-l-[#7ba05b]')}>
              <div className="flex items-center gap-3 px-3.5 py-3 bg-white">
                <input type="checkbox" checked={on} className="w-6 h-6 accent-[#993556] flex-shrink-0"
                  onChange={e => setSel(v => (e.target.checked ? [...v, l.name] : v.filter(x => x !== l.name)))} />
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold">{propre(l.produit)} — {qte(l.qty, l.unite)}</div>
                  <div className="text-[11px] text-ink-mute font-mono">{l.name}{l.lieu ? ' · ' + l.lieu : ''}</div>
                </div>
                <span className={'text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ' +
                  (l.manques.length ? 'bg-[#FFF7E0] text-[#854F0B]' : 'bg-[#EAF3DE] text-ok')}>
                  {l.manques.length ? 'il manque' : 'prêt'}
                </span>
              </div>
              {l.manques.length > 0 && (
                <div className="border-t border-dashed border-line bg-[#fffdf7] px-3.5 py-2 text-[12.5px]">
                  {l.manques.map((m, i) => (
                    <div key={i}>• <b>{qte(m.manque, m.unite)}</b> de {propre(m.produit)}</div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

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
                Forcer la sélection{bloques.length ? ` (${bloques.length})` : ''}
              </button>
            </div>
          </>
        )}
      </div>

      {confirmer && (
        <div className="fixed inset-0 z-[80] bg-ink/50 flex items-center justify-center p-4"
          onPointerDown={e => { if (e.target === e.currentTarget) setConfirmer(false) }}>
          <div className="bg-white rounded-2xl p-4 max-w-[420px]">
            <b className="text-[16px]">Forcer la validation ?</b>
            <p className="text-[13px] text-ink-soft mt-1 mb-2">Odoo enregistrera la fabrication même si le stock ne suit pas. Il manque :</p>
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
