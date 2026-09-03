import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import { loadFreezerDoneIds } from '../lib/freezerDone'
import { loadEtagesEnAttente, envoyerEnValidation, loadDejaEnvoyes, loadEnAttente, partiraTouSeul } from '../lib/checkCd'
import { fmtDayLabel } from '../lib/jourLisible'
import { toast } from '../lib/toast'
import { buildZplInfo } from '../lib/etiquettes'
import { sendEtiquettes } from '../lib/printTicket'

// Le dernier contrôle des étages, avant que le gâteau entier soit marqué fait.
//
// On liste les étages (« 30 cm cakedesign (Vanille) ») dont le GÂTEAU attend
// encore — même s'ils sont déjà fabriqués dans Odoo : ce qui compte, c'est que
// leur gâteau n'est pas fini. Layla vérifie, coche, envoie. Ce qui n'est pas
// encore validé dans Odoo l'est à l'envoi ; le gâteau entier, lui, sera marqué
// fait par le rendez-vous de 8h.

const ETIQ = {
  ok: { texte: 'À valider', fond: 'bg-[#EAF3DE]', encre: 'text-[#2F6B25]' },
  fait: { texte: 'Déjà fabriqué dans Odoo', fond: 'bg-cream-deep', encre: 'text-ink-soft' },
  manque: { texte: 'Étage congelé manquant', fond: 'bg-[#FDF3D8]', encre: 'text-[#8c6a20]' },
  hors: { texte: 'Pas encore fabriqué', fond: 'bg-cream-deep', encre: 'text-ink-mute' },
  attente: { texte: 'Pas encore sorti du congélateur', fond: 'bg-[#E9F1F6]', encre: 'text-[#3d6f8e]' },
}

const aujourdhui = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

export default function CheckCdView({ user, onLogout, onNavigate, activeView }) {
  const [etages, setEtages] = useState([])
  const [tousEtages, setTousEtages] = useState([])   // y compris les déjà contrôlés : source de la réimpression
  const [sortis, setSortis] = useState({})
  const [envoyes, setEnvoyes] = useState({})
  const [choisis, setChoisis] = useState(() => new Set())
  const [chargement, setChargement] = useState(true)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [tour, setTour] = useState(0)
  const [vue, setVue] = useState('controle')   // 'controle' | 'attente'
  const [enAttente, setEnAttente] = useState([])
  const rafraichir = () => { setChargement(true); setTour(t => t + 1) }

  useEffect(() => {
    let vivant = true
    Promise.all([loadEtagesEnAttente(30), loadFreezerDoneIds(), loadDejaEnvoyes()])
      .then(([list, sort, deja]) => {
        if (!vivant) return
        setSortis(sort)
        setEnvoyes(deja)
        setTousEtages(list)
        // déjà contrôlé ici : il n'y a plus rien à en faire
        setEtages(list.filter(e => !deja[e.mo_id]?.odoo_ok))
      })
    // Les gâteaux déjà récupérés par le client et toujours pas marqués faits :
    // c'est ce qui reste en plan, et que le rendez-vous de 8h n'a pas pu passer.
    loadEnAttente(7).then(r => { if (vivant) setEnAttente(r.gateaux) }).catch(() => { })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
      .finally(() => { if (vivant) setChargement(false) })
    return () => { vivant = false }
  }, [tour])

  // Règle de Layla : rien n'est cochable si le gâteau n'a pas été marqué SORTI
  // dans CD Négatif — même s'il est déjà fabriqué dans Odoo. Ensuite seulement :
  // soit son étage congelé est en stock, soit il est déjà fabriqué (on confirme
  // alors le contrôle). Une taille hors norme pas encore fabriquée reste grisée.
  // Trois façons d'être sûr qu'un étage est sorti du congélateur :
  //  - quelqu'un l'a coché dans CD Négatif ;
  //  - il est DÉJÀ FABRIQUÉ : pour monter un « 20 cm cakedesign » il a bien
  //    fallu consommer l'étage congelé « 20 cm CD* », donc le sortir ;
  //  - sa date de retrait est passée : le client est venu le chercher.
  // On n'attend donc la coche que pour ce qui reste vraiment au congélateur.
  const estSorti = e => !!sortis[e.mo_id] || e.dispo === 'fait' || (!!e.date && e.date < aujourdhui)
  const cochable = e => estSorti(e) && ['ok', 'fait'].includes(e.dispo)
  const nbPieces = l => l.reduce((n, e) => n + (e.qty || 1), 0)
  const prets = useMemo(() => etages.filter(cochable),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [etages, sortis])

  function basculer(e) {
    if (!cochable(e)) return
    setChoisis(prev => {
      const s = new Set(prev)
      s.has(e.mo_id) ? s.delete(e.mo_id) : s.add(e.mo_id)
      return s
    })
  }

  function basculerJour(list) {
    const libres = list.filter(cochable)
    if (!libres.length) return
    const tous = libres.every(e => choisis.has(e.mo_id))
    setChoisis(prev => {
      const s = new Set(prev)
      libres.forEach(e => tous ? s.delete(e.mo_id) : s.add(e.mo_id))
      return s
    })
  }

  // Chaque etage valide sort son etiquette, a coller sur le gateau : le nom avec
  // son parfum, le jour, et le numero de commande — c'est lui qui dit a qui il
  // est. Une etiquette par piece.
  const etiquetteDe = e => buildZplInfo({
    // D'abord POUR QUAND le gateau est attendu (pas quand on l'a sorti),
    // puis la taille et le parfum, puis le numero de commande en bas.
    entete: e.rdv || e.date || null,
    titre: String(e.produit || '').replace(/^\[\d+\]\s*/, '').trim(),
    code: e.scode || null,
    qty: Math.min(20, Math.max(1, Math.round(Number(e.qty) || 1))),
  })

  async function imprimerEtiquettes(liste) {
    const zpl = liste.map(etiquetteDe).join('\n')
    try {
      const [r] = await sendEtiquettes([zpl])
      if (!r?.ok) toast.error(r?.error || 'Étiquettes non imprimées')
    } catch (e) {
      // L'etiquette ne doit jamais faire echouer une validation deja passee.
      toast.error('Étiquettes : ' + (e.message || e))
    }
  }

  async function envoyer() {
    if (!choisis.size) return
    setEnvoi(true)
    try {
      const res = await envoyerEnValidation([...choisis], user?.id)
      const ok = res.filter(r => r.ok).length
      const rates = res.filter(r => !r.ok)
      const valides = res.filter(r => r.ok).map(r => etages.find(e => e.mo_id === r.mo_id)).filter(Boolean)
      if (valides.length) imprimerEtiquettes(valides)
      if (ok) toast.success(`${ok} étage${ok > 1 ? 's' : ''} vérifié${ok > 1 ? 's' : ''}`)
      if (rates.length) toast.error(`${rates.length} refusé${rates.length > 1 ? 's' : ''} : ${rates[0].message}`)
      setChoisis(new Set())
      rafraichir()
    } catch (e) {
      toast.error('Envoi impossible : ' + (e.message || e))
    }
    setEnvoi(false)
  }

  // La dernière fournée contrôlée : l'étiquette part à l'imprimante au moment du
  // contrôle, donc si l'imprimante bugue elle est perdue — et le contrôle, lui,
  // est déjà enregistré, impossible de le refaire pour la ravoir.
  // On repart de `check_cd_done` (pas d'une trace locale) : ça marche depuis
  // n'importe quel appareil, et pour une fournée envoyée avant ce bouton.
  const derniere = useMemo(() => {
    const env = Object.entries(envoyes).filter(([, v]) => v.odoo_ok && v.checked_at)
    if (!env.length) return null
    const fin = Math.max(...env.map(([, v]) => new Date(v.checked_at).getTime()))
    // Une fournée = un seul envoi : toutes ses lignes sont écrites à la suite.
    const ids = new Set(env.filter(([, v]) => fin - new Date(v.checked_at).getTime() < 120000).map(([k]) => Number(k)))
    const liste = tousEtages.filter(e => ids.has(e.mo_id))
    return liste.length ? { liste, quand: new Date(fin), manquants: ids.size - liste.length } : null
  }, [envoyes, tousEtages])

  async function reimprimerDerniere() {
    if (!derniere) return
    await imprimerEtiquettes(derniere.liste)
    const n = nbPieces(derniere.liste)
    toast.success(`${n} étiquette${n > 1 ? 's' : ''} renvoyée${n > 1 ? 's' : ''} à l'imprimante`)
  }

  const jours = useMemo(() => {
    const g = {}
    for (const e of etages) (g[e.date || '—'] ||= []).push(e)
    // Les journées passées EN HAUT : elles traînent, on ne veut pas les oublier
    // au fond de la liste. Puis aujourd'hui et les jours qui viennent, le plus
    // lointain en bas. Dans chaque bloc, la date la plus récente d'abord.
    const passees = Object.entries(g).filter(([d]) => d < aujourdhui).sort((a, b) => b[0].localeCompare(a[0]))
    const aVenir = Object.entries(g).filter(([d]) => d >= aujourdhui).sort((a, b) => a[0].localeCompare(b[0]))
    return [...passees, ...aVenir]
  }, [etages])

  // Ce qui ne partira PAS tout seul demain à 8h : c'est le seul chiffre qui
  // appelle une action, et c'est lui que porte le badge de la barre.
  const bloques = useMemo(() => enAttente.filter(g => !partiraTouSeul(g)), [enAttente])

  const nb = choisis.size

  return (
    <div className="min-h-[100dvh] bg-cream pb-28">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-3xl mx-auto px-4 pt-4">
        <h1 className="font-fraunces italic text-[26px] text-ink leading-none mb-1">Check CD-</h1>
        <p className="text-[12px] text-ink-mute mb-3">
          Les étages dont le gâteau n'est pas encore marqué fait. Vérifie, coche, envoie —
          le gâteau entier sera marqué fait ensuite.
        </p>

        <div className="inline-flex bg-cream-warm rounded-full p-0.5 border border-line mb-3">
          <button onClick={() => setVue('controle')}
            className={`px-3.5 py-1.5 text-[12px] font-bold rounded-full ${vue === 'controle' ? 'bg-bordeaux text-cream' : 'text-ink-mute'}`}>
            À contrôler
          </button>
          <button onClick={() => setVue('attente')}
            className={`px-3.5 py-1.5 text-[12px] font-bold rounded-full ${vue === 'attente' ? 'bg-bordeaux text-cream' : 'text-ink-mute'}`}>
            En attente{bloques.length ? ` (${bloques.length})` : ''}
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-[#EAF3DE] text-[#2F6B25] font-bold">{nbPieces(prets)} à vérifier</span>
          {etages.filter(e => e.dispo !== 'hors' && !estSorti(e)).length > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-[#E9F1F6] text-[#3d6f8e] font-bold">
              {nbPieces(etages.filter(e => e.dispo !== 'hors' && !estSorti(e)))} à marquer sortis dans CD Négatif
            </span>
          )}
          {derniere && (
            <button onClick={reimprimerDerniere}
              title={`Contrôlées le ${derniere.quand.toLocaleString('fr-FR')}${derniere.manquants ? ` · ${derniere.manquants} gâteau(x) déjà clôturé(s), étiquette non retrouvée` : ''}`}
              className="px-2.5 py-1 rounded-full border border-amber-500 text-amber-700 font-bold hover:bg-amber-500 hover:text-cream transition-all">
              ↻ Réimprimer les {nbPieces(derniere.liste)} dernières
            </button>
          )}
          <button onClick={rafraichir} className="text-ink-mute underline underline-offset-2">rafraîchir</button>
        </div>

        {erreur && <div className="bg-[#fdecec] text-[#8c2020] rounded-xl px-3.5 py-3 text-[13px] mb-3">{erreur}</div>}
        {chargement && <div className="text-center py-10 text-[13px] text-ink-mute">Lecture d'Odoo…</div>}
        {!chargement && !etages.length && (
          <div className="text-center py-10 text-[13px] text-ink-mute">
            Rien à contrôler : tous les gâteaux sont marqués faits.
          </div>
        )}

        {vue === 'controle' && <div className="space-y-4">
          {jours.map(([date, list]) => {
            const libres = list.filter(cochable)
            const tous = libres.length > 0 && libres.every(e => choisis.has(e.mo_id))
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
                      {nbPieces(list)} étage{nbPieces(list) > 1 ? 's' : ''}
                    </span>
                    <span className="flex-1 h-px bg-line min-w-[20px]" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  {list.map(e => {
                    const on = choisis.has(e.mo_id)
                    const libre = cochable(e)
                    // On montre CE QUI BLOQUE, pas l'état le plus flatteur : un étage
                    // déjà fabriqué mais jamais sorti du congélateur affichait
                    // « Déjà fabriqué » et restait grisé sans qu'on comprenne pourquoi.
                    const et = e.dispo === 'hors' ? ETIQ.hors
                      : !estSorti(e) ? ETIQ.attente
                        : (ETIQ[e.dispo] || ETIQ.hors)
                    const refus = envoyes[e.mo_id] && !envoyes[e.mo_id].odoo_ok ? envoyes[e.mo_id].odoo_msg : null
                    return (
                      <div key={e.mo_id} onClick={() => basculer(e)}
                        className={`rounded-2xl border px-3.5 py-3 flex items-start gap-2.5 ${libre ? 'cursor-pointer' : 'opacity-80'} ${on ? 'border-bordeaux bg-bordeaux/5' : 'border-line bg-cream-warm'}`}>
                        <span className={`flex-shrink-0 w-6 h-6 mt-0.5 rounded-lg border-2 flex items-center justify-center text-[12px] font-bold ${on ? 'bg-bordeaux border-bordeaux text-cream' : libre ? 'border-line bg-cream text-transparent' : 'border-dashed border-line bg-cream-deep text-transparent'}`}>✓</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[14px] font-bold text-ink leading-tight">
                            {e.produit}{e.qty > 1 ? ` ×${e.qty}` : ''}
                          </div>
                          {/* le gâteau qui attend : c'est lui qu'on débloque */}
                          <div className="text-[11.5px] text-ink-soft mt-0.5 truncate">
                            pour {e.parent_produit || e.parent}
                          </div>
                          <div className="font-mono text-[9.5px] text-ink-mute mt-0.5">
                            {e.scode || '—'} · {e.mo_name} → {e.parent}
                          </div>
                          <span className={`inline-block mt-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${et.fond} ${et.encre}`}>
                            {et.texte}
                            {e.congele ? ` · ${e.congele}` : ''}
                            {e.dispo === 'manque' ? ` (${e.stock} pour ${e.besoin})` : ''}
                          </span>
                          {refus && <div className="text-[10.5px] text-[#8c2020] mt-1">Odoo a refusé : {refus}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>}

        {/* Ce qui est parti chez le client sans être marqué fait dans Odoo. */}
        {vue === 'attente' && (
          <div className="space-y-1.5">
            {!enAttente.length && (
              <div className="text-center py-10 text-[13px] text-ink-mute">
                Rien en attente : tous les gâteaux récupérés sont marqués faits dans Odoo.
              </div>
            )}
            {enAttente.map(g => {
              const pret = partiraTouSeul(g)
              return (
                <div key={g.mo_id} className={`rounded-2xl border px-3.5 py-3 ${pret ? 'border-[#cfe0b8] bg-[#EAF3DE]' : 'border-line bg-cream-warm'}`}>
                  <div className="text-[14px] font-bold text-ink leading-tight">{g.produit}</div>
                  <div className="font-mono text-[9.5px] text-ink-mute mt-0.5">{g.scode || '—'} · {g.mo_name}</div>
                  <span className={`inline-block mt-1.5 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${pret ? 'bg-[#2F6B25] text-cream' : 'bg-[#FDF3D8] text-[#8c6a20]'}`}>
                    {pret ? 'partira au prochain passage de 8h' : g.message}
                  </span>
                  {g.etage && <div className="text-[11px] text-ink-soft mt-1">étage : {g.etage}</div>}
                </div>
              )
            })}
            <p className="text-[11.5px] text-ink-mute pt-2 leading-relaxed">
              Le client est venu chercher ces gâteaux, mais leur ordre n'est pas encore marqué
              fait dans Odoo. Ceux qui sont prêts partiront demain à 8h ; les autres attendent
              qu'on règle ce qui est indiqué.
            </p>
          </div>
        )}
      </div>

      {vue === 'controle' && prets.length > 0 && (
        <div className="lg-bottom-bar fixed left-0 right-0 bottom-0 z-40 bg-cream-warm border-t border-line px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <span className="text-[12px] text-ink-soft leading-tight">
              <b className="block text-[17px] text-ink">{nb}</b>
              sélectionné{nb > 1 ? 's' : ''}
            </span>
            <button onClick={envoyer} disabled={!nb || envoi}
              className={`flex-1 rounded-xl py-3.5 text-[15px] font-extrabold ${nb && !envoi ? 'bg-bordeaux text-cream' : 'bg-cream-deep text-ink-mute'}`}>
              {envoi ? 'Envoi en cours…' : nb ? `Marquer comme vérifié (${nb})` : 'Marquer comme vérifié'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
