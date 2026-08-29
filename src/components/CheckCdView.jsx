import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import { loadFreezerDoneIds } from '../lib/freezerDone'
import { fmtDayLabel } from '../lib/jourLisible'
import { loadEtatsCheckCd, envoyerEnValidation, loadDejaEnvoyes } from '../lib/checkCd'
import { toast } from '../lib/toast'

// Le double contrôle des sorties de congélateur.
//
// Une personne sort le gâteau (onglet CD Négatif) ; ici une deuxième vérifie,
// sélectionne, puis ENVOIE en validation : l'ordre « N cm cakedesign » est alors
// validé dans Odoo — seulement si son étage « N cm CD* » est en stock.
// Tant qu'on n'a pas envoyé, une sélection s'annule sans laisser de trace.

function jourISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ETIQ = {
  ok: { texte: 'Étage en stock', fond: 'bg-[#EAF3DE]', encre: 'text-[#2F6B25]' },
  manque: { texte: 'Étage manquant', fond: 'bg-[#FDF3D8]', encre: 'text-[#8c6a20]' },
  hors: { texte: 'Hors contrôle', fond: 'bg-cream-deep', encre: 'text-ink-mute' },
  attente: { texte: 'Pas encore sorti du congélateur', fond: 'bg-[#E9F1F6]', encre: 'text-[#3d6f8e]' },
  valide: { texte: 'Validé dans Odoo', fond: 'bg-[#EAF3DE]', encre: 'text-[#2F6B25]' },
}

export default function CheckCdView({ user, onLogout, onNavigate, activeView }) {
  const [items, setItems] = useState([])
  const [etats, setEtats] = useState({})
  const [envoyes, setEnvoyes] = useState({})
  const [sortis, setSortis] = useState({})   // ce que CD Négatif a coché
  const [choisis, setChoisis] = useState(() => new Set())
  const [parProduit, setParProduit] = useState(false)
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [tour, setTour] = useState(0)
  const rafraichir = () => { setChargement(true); setTour(t => t + 1) }

  useEffect(() => {
    let vivant = true
    const j = new Date()
    const dates = []
    // large en arrière : un gâteau sorti il y a dix jours et jamais validé doit
    // rester visible, sinon personne ne peut s'apercevoir qu'il traîne.
    for (let k = -14; k <= 14; k++) { const x = new Date(j); x.setDate(x.getDate() + k); dates.push(jourISO(x)) }

    Promise.all([
      fetch(`/api/freezer-list?dates=${dates.join(',')}`).then(r => r.json()),
      loadFreezerDoneIds(),
      loadDejaEnvoyes(),
    ])
      .then(async ([api, deja2, deja]) => {
        if (!vivant) return
        setEnvoyes(deja)
        setSortis(deja2)
        // On montre TOUT ce qui reste à valider — y compris ce qui n'est pas
        // encore sorti du congélateur, pour voir la semaine venir. Seuls les
        // gâteaux déjà sortis pourront être cochés (voir `basculer`).
        const aVoir = (api.items || []).filter(it => !it.made && !deja[it.mo_id]?.odoo_ok)
        if (!aVoir.length) { setItems([]); return }
        try {
          const e = await loadEtatsCheckCd([...new Set(aVoir.map(it => it.mo_id))])
          if (!vivant) return
          setEtats(e)
          // Déjà validé dans Odoo : il n'y a plus rien à contrôler, on l'enlève.
          setItems(aVoir.filter(it => e[it.mo_id]?.dispo !== 'valide'))
        } catch {
          if (vivant) setItems(aVoir)   // Odoo muet : on montre la liste sans les états
        }
      })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
      .finally(() => { if (vivant) setChargement(false) })
    return () => { vivant = false }
  }, [tour])

  // Cochable seulement si quelqu'un l'a VRAIMENT sorti du congélateur, et si
  // son étage est en stock. Le reste s'affiche, mais ne se coche pas.
  const cochable = it => !!sortis[it.mo_id] && etats[it.mo_id]?.dispo === 'ok'

  const selectionnables = useMemo(
    () => items.filter(cochable),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, etats, sortis])

  function basculer(it) {
    if (!cochable(it)) return
    setChoisis(prev => {
      const s = new Set(prev)
      s.has(it.mo_id) ? s.delete(it.mo_id) : s.add(it.mo_id)
      return s
    })
  }

  function basculerGroupe(lignes) {
    const libres = lignes.filter(cochable)
    if (!libres.length) return
    const tous = libres.every(it => choisis.has(it.mo_id))
    setChoisis(prev => {
      const s = new Set(prev)
      libres.forEach(it => tous ? s.delete(it.mo_id) : s.add(it.mo_id))
      return s
    })
  }

  async function envoyer() {
    if (!choisis.size) return
    setEnvoi(true)
    try {
      const res = await envoyerEnValidation([...choisis], user?.id)
      const ok = res.filter(r => r.ok).length
      const rates = res.filter(r => !r.ok)
      if (ok) toast.success(`${ok} ordre${ok > 1 ? 's' : ''} validé${ok > 1 ? 's' : ''} dans Odoo`)
      if (rates.length) toast.error(`${rates.length} refusé${rates.length > 1 ? 's' : ''} : ${rates[0].message}`)
      setChoisis(new Set())
      rafraichir()
    } catch (e) {
      toast.error('Envoi impossible : ' + (e.message || e))
    }
    setEnvoi(false)
  }

  // On classe d'abord par JOUR de retrait, comme dans CD Négatif : c'est le
  // repère de l'équipe. À l'intérieur, par commande ou par produit.
  const jours = useMemo(() => {
    const parJour = {}
    for (const it of items) (parJour[it.date] ||= []).push(it)
    return Object.keys(parJour).sort().map(date => {
      const g = {}
      for (const it of parJour[date]) {
        const cle = parProduit ? `${it.taille} ${it.parfum}` : (it.scode || '?')
        ;(g[cle] ||= []).push(it)
      }
      return { date, groupes: Object.entries(g).sort() }
    })
  }, [items, parProduit])

  const nb = choisis.size

  return (
    <div className="min-h-[100dvh] bg-cream pb-28">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-3xl mx-auto px-4 pt-4">
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none mb-1">Check CD-</h1>
        <p className="text-[12px] text-ink-mute mb-4">
          Deuxième contrôle des gâteaux sortis. Sélectionne, puis envoie en validation :
          l'ordre est alors validé dans Odoo. Rien ne part avant l'envoi.
        </p>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="inline-flex bg-cream-warm rounded-full p-0.5 border border-line">
            <button onClick={() => setParProduit(false)}
              className={`px-3 py-1 text-[11px] font-medium rounded-full ${!parProduit ? 'bg-bordeaux text-cream' : 'text-ink-mute'}`}>Par commande</button>
            <button onClick={() => setParProduit(true)}
              className={`px-3 py-1 text-[11px] font-medium rounded-full ${parProduit ? 'bg-bordeaux text-cream' : 'text-ink-mute'}`}>Par produit</button>
          </div>
          <button onClick={rafraichir} className="text-[11px] text-ink-mute underline underline-offset-2">rafraîchir</button>
        </div>

        {erreur && <div className="bg-[#fdecec] text-[#8c2020] rounded-xl px-3.5 py-3 text-[13px] mb-3">{erreur}</div>}
        {chargement && <div className="text-center py-10 text-[13px] text-ink-mute">Lecture d'Odoo…</div>}

        {!chargement && !items.length && (
          <div className="text-center py-10 text-[13px] text-ink-mute">
            Rien à contrôler. Les gâteaux apparaissent ici dès qu'ils sont sortis du congélateur.
          </div>
        )}

        <div className="space-y-4">
          {jours.map(({ date, groupes }) => (
            <div key={date}>
              {/* la date reste visible pendant le défilement, comme dans CD Négatif */}
              <div className="sticky top-0 z-20 -mx-1 px-1 pt-2 pb-1.5 mb-1 bg-cream">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="font-fraunces italic text-[17px] text-ink">{fmtDayLabel(date, new Date())}</h2>
                  <span className="px-2.5 py-1 text-[10px] font-mono tracking-wider uppercase rounded-full bg-cream-warm text-ink-soft border border-line">
                    {groupes.reduce((n, [, l]) => n + l.length, 0)} gâteau{groupes.reduce((n, [, l]) => n + l.length, 0) > 1 ? 'x' : ''}
                  </span>
                  <span className="flex-1 h-px bg-line min-w-[20px]" />
                </div>
              </div>
              <div className="space-y-3">
          {groupes.map(([cle, lignes]) => {
            const libres = lignes.filter(cochable)
            const tousChoisis = libres.length > 0 && libres.every(it => choisis.has(it.mo_id))
            return (
              <div key={cle} className="rounded-2xl border border-line bg-cream-warm overflow-hidden">
                <div className="px-3.5 py-2 bg-cream border-b border-line flex items-center gap-2.5">
                  {parProduit && libres.length > 0 && (
                    <button onClick={() => basculerGroupe(lignes)}
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center text-[12px] font-bold ${tousChoisis ? 'bg-bordeaux border-bordeaux text-cream' : 'border-line bg-cream-warm text-transparent'}`}>✓</button>
                  )}
                  <span className="font-bold text-[13.5px] text-ink flex-1">{cle}</span>
                  <span className="text-[11px] text-ink-mute">
                    {parProduit
                      ? `${libres.length} sur ${lignes.length} à contrôler`
                      : `${lignes.length} gâteau${lignes.length > 1 ? 'x' : ''}`}
                  </span>
                </div>
                {lignes.map(it => {
                  const e = etats[it.mo_id] || {}
                  const libre = cochable(it)
                  const on = choisis.has(it.mo_id)
                  // pas encore sorti : on le dit, plutôt que d'annoncer un étage en stock
                  const et = !sortis[it.mo_id]
                    ? ETIQ.attente
                    : (ETIQ[e.dispo] || { texte: 'Lecture…', fond: 'bg-cream-deep', encre: 'text-ink-mute' })
                  const refus = envoyes[it.mo_id] && !envoyes[it.mo_id].odoo_ok ? envoyes[it.mo_id].odoo_msg : null
                  return (
                    <div key={it.mo_id} onClick={() => basculer(it)}
                      className={`flex items-start gap-2.5 px-3.5 py-2.5 border-b border-line last:border-b-0 ${libre ? 'cursor-pointer' : 'opacity-70'} ${on ? 'bg-bordeaux/5' : ''}`}>
                      <span className={`flex-shrink-0 w-6 h-6 mt-0.5 rounded-lg border-2 flex items-center justify-center text-[12px] font-bold ${on ? 'bg-bordeaux border-bordeaux text-cream' : libre ? 'border-line bg-cream text-transparent' : 'border-dashed border-line bg-cream-deep text-transparent'}`}>✓</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold text-ink leading-tight">
                          {it.taille} <span className="font-medium text-ink-soft">{it.parfum}</span>
                        </div>
                        <div className="text-[11.5px] text-ink-soft truncate">{it.client_name || it.scode}</div>
                        <div className="font-mono text-[9.5px] text-ink-mute mt-0.5">{it.scode} · {it.mo_name}</div>
                        <span className={`inline-block mt-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${et.fond} ${et.encre}`}>
                          {et.texte}{sortis[it.mo_id] && e.etage ? ` · ${e.etage}` : ''}{sortis[it.mo_id] && e.dispo === 'manque' ? ` (${e.stock} sur ${e.besoin})` : ''}
                        </span>
                        {refus && <div className="text-[10.5px] text-[#8c2020] mt-1">Odoo a refusé : {refus}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectionnables.length > 0 && (
        <div className="lg-bottom-bar fixed left-0 right-0 bottom-0 z-40 bg-cream-warm border-t border-line px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <span className="text-[12px] text-ink-soft leading-tight">
              <b className="block text-[17px] text-ink">{nb}</b>
              sélectionné{nb > 1 ? 's' : ''}
            </span>
            <button onClick={envoyer} disabled={!nb || envoi}
              className={`flex-1 rounded-xl py-3.5 text-[15px] font-extrabold ${nb && !envoi ? 'bg-bordeaux text-cream' : 'bg-cream-deep text-ink-mute'}`}>
              {envoi ? 'Envoi en cours…' : nb ? `Envoyer en validation (${nb})` : 'Envoyer en validation'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
