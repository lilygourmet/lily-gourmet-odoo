import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import { loadParentsAValider, validerParents, loadDejaEnvoyes } from '../lib/checkCd'
import { fmtDayLabel } from '../lib/jourLisible'
import { toast } from '../lib/toast'

// Le dernier contrôle avant de marquer un gâteau entier comme fait dans Odoo.
//
// On liste les gâteaux « CD- … » encore ouverts (toutes les formes) avec leurs
// étages : Layla vérifie que l'étage est bien là, coche, puis envoie. La
// validation ne part que sur ce qui est coché, et les étages sont revérifiés
// juste avant l'envoi — quelqu'un a pu consommer le stock entre-temps.

export default function CheckCdView({ user, onLogout, onNavigate, activeView }) {
  const [parents, setParents] = useState([])
  const [envoyes, setEnvoyes] = useState({})
  const [choisis, setChoisis] = useState(() => new Set())
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [tour, setTour] = useState(0)
  const rafraichir = () => { setChargement(true); setTour(t => t + 1) }

  useEffect(() => {
    let vivant = true
    Promise.all([loadParentsAValider(30), loadDejaEnvoyes()])
      .then(([list, deja]) => {
        if (!vivant) return
        setParents(list)
        setEnvoyes(deja)
      })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
      .finally(() => { if (vivant) setChargement(false) })
    return () => { vivant = false }
  }, [tour])

  const prets = useMemo(() => parents.filter(p => p.pret), [parents])

  function basculer(p) {
    if (!p.pret) return
    setChoisis(prev => {
      const s = new Set(prev)
      s.has(p.mo_id) ? s.delete(p.mo_id) : s.add(p.mo_id)
      return s
    })
  }

  function basculerJour(list) {
    const libres = list.filter(p => p.pret)
    if (!libres.length) return
    const tous = libres.every(p => choisis.has(p.mo_id))
    setChoisis(prev => {
      const s = new Set(prev)
      libres.forEach(p => tous ? s.delete(p.mo_id) : s.add(p.mo_id))
      return s
    })
  }

  async function envoyer() {
    if (!choisis.size) return
    setEnvoi(true)
    try {
      const res = await validerParents([...choisis], user?.id)
      const ok = res.filter(r => r.ok).length
      const rates = res.filter(r => !r.ok)
      if (ok) toast.success(`${ok} gâteau${ok > 1 ? 'x' : ''} marqué${ok > 1 ? 's' : ''} comme fait${ok > 1 ? 's' : ''} dans Odoo`)
      if (rates.length) toast.error(`${rates.length} refusé${rates.length > 1 ? 's' : ''} : ${rates[0].message}`)
      setChoisis(new Set())
      rafraichir()
    } catch (e) {
      toast.error('Envoi impossible : ' + (e.message || e))
    }
    setEnvoi(false)
  }

  // par jour de retrait, du plus récent au plus ancien
  const jours = useMemo(() => {
    const g = {}
    for (const p of parents) (g[p.date || '—'] ||= []).push(p)
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]))
  }, [parents])

  const nb = choisis.size

  return (
    <div className="min-h-[100dvh] bg-cream pb-28">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-3xl mx-auto px-4 pt-4">
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none mb-1">Check CD-</h1>
        <p className="text-[12px] text-ink-mute mb-3">
          Le dernier contrôle avant de marquer le gâteau comme fait dans Odoo.
          Vérifie ses étages, coche, puis envoie. Rien ne part avant l'envoi.
        </p>

        <div className="flex items-center gap-3 mb-4 flex-wrap text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-[#EAF3DE] text-[#2F6B25] font-bold">{prets.length} prêt{prets.length > 1 ? 's' : ''}</span>
          {parents.length - prets.length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-[#FDF3D8] text-[#8c6a20] font-bold">
              {parents.length - prets.length} en attente d'un étage
            </span>
          )}
          <button onClick={rafraichir} className="text-ink-mute underline underline-offset-2">rafraîchir</button>
        </div>

        {erreur && <div className="bg-[#fdecec] text-[#8c2020] rounded-xl px-3.5 py-3 text-[13px] mb-3">{erreur}</div>}
        {chargement && <div className="text-center py-10 text-[13px] text-ink-mute">Lecture d'Odoo…</div>}
        {!chargement && !parents.length && (
          <div className="text-center py-10 text-[13px] text-ink-mute">
            Aucun gâteau en attente. Tout est marqué fait dans Odoo.
          </div>
        )}

        <div className="space-y-4">
          {jours.map(([date, list]) => {
            const libres = list.filter(p => p.pret)
            const tous = libres.length > 0 && libres.every(p => choisis.has(p.mo_id))
            return (
              <div key={date}>
                <div className="sticky top-0 z-20 -mx-1 px-1 pt-2 pb-1.5 mb-1 bg-cream">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {libres.length > 0 && (
                      <button onClick={() => basculerJour(list)}
                        className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center text-[12px] font-bold ${tous ? 'bg-bordeaux border-bordeaux text-cream' : 'border-line bg-cream-warm text-transparent'}`}>✓</button>
                    )}
                    <h2 className="font-fraunces italic text-[17px] text-ink">
                      {date === '—' ? 'sans date' : fmtDayLabel(date, new Date())}
                    </h2>
                    <span className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full bg-cream-warm text-ink-soft border border-line">
                      {list.length} gâteau{list.length > 1 ? 'x' : ''}
                    </span>
                    <span className="flex-1 h-px bg-line min-w-[20px]" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  {list.map(p => {
                    const on = choisis.has(p.mo_id)
                    const refus = envoyes[p.mo_id] && !envoyes[p.mo_id].odoo_ok ? envoyes[p.mo_id].odoo_msg : null
                    return (
                      <div key={p.mo_id} onClick={() => basculer(p)}
                        className={`rounded-2xl border px-3.5 py-3 flex items-start gap-2.5 ${p.pret ? 'cursor-pointer' : 'opacity-80'} ${on ? 'border-bordeaux bg-bordeaux/5' : 'border-line bg-cream-warm'}`}>
                        <span className={`flex-shrink-0 w-6 h-6 mt-0.5 rounded-lg border-2 flex items-center justify-center text-[12px] font-bold ${on ? 'bg-bordeaux border-bordeaux text-cream' : p.pret ? 'border-line bg-cream text-transparent' : 'border-dashed border-line bg-cream-deep text-transparent'}`}>✓</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-bold text-ink leading-tight">
                            {p.produit}{p.qty > 1 ? ` ×${p.qty}` : ''}
                          </div>
                          <div className="font-mono text-[9.5px] text-ink-mute mt-0.5">{p.scode || '—'} · {p.mo_name}</div>

                          {/* ses étages : c'est là-dessus que porte le contrôle */}
                          <div className="mt-1.5 space-y-0.5">
                            {p.etages.map((e, i) => (
                              <div key={i} className={`text-[11.5px] flex items-center gap-1.5 ${e.ok ? 'text-[#2F6B25]' : 'text-[#8c6a20]'}`}>
                                <span className="font-bold">{e.ok ? '✓' : '✗'}</span>
                                <span className="truncate">{e.nom}</span>
                                <span className="text-ink-mute whitespace-nowrap">
                                  {e.besoin > 1 ? `${e.besoin} demandés · ` : ''}{e.stock} en stock
                                </span>
                              </div>
                            ))}
                            {!p.etages.length && <div className="text-[11.5px] text-ink-mute">{p.raison}</div>}
                          </div>

                          {refus && <div className="text-[10.5px] text-[#8c2020] mt-1">Odoo a refusé : {refus}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {prets.length > 0 && (
        <div className="lg-bottom-bar fixed left-0 right-0 bottom-0 z-40 bg-cream-warm border-t border-line px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <span className="text-[12px] text-ink-soft leading-tight">
              <b className="block text-[17px] text-ink">{nb}</b>
              sélectionné{nb > 1 ? 's' : ''}
            </span>
            <button onClick={envoyer} disabled={!nb || envoi}
              className={`flex-1 rounded-xl py-3.5 text-[15px] font-extrabold ${nb && !envoi ? 'bg-bordeaux text-cream' : 'bg-cream-deep text-ink-mute'}`}>
              {envoi ? 'Envoi en cours…' : nb ? `Marquer comme fait (${nb})` : 'Marquer comme fait'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
