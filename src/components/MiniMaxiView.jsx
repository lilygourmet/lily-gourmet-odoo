import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { loadMiniMaxi, STATUTS, nbFr } from '../lib/miniMaxi'

const LIB = Object.fromEntries(STATUTS)
const COULEUR = {
  creer: 'bg-[#F7ECEE] text-bordeaux',
  nulle: 'bg-[#FBEFE7] text-[#9A4218]',
  revoir: 'bg-[#EFF5E8] text-ok',
  demande: 'bg-cream-warm text-ink-mute',
  archive: 'bg-cream-warm text-ink-mute',
}

/**
 * Ce que devraient être les mini/maxi d'Odoo, atelier par atelier.
 * Écran de lecture : on ne touche à rien dans Odoo, on montre le calcul et on
 * laisse Layla décider. Les valeurs viennent de la consommation réelle sur
 * 90 jours (voir mode=minmax dans api/freezer-list.js).
 */
export default function MiniMaxiView({ user, onLogout, onNavigate, activeView }) {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [filtre, setFiltre] = useState('tout')
  const [q, setQ] = useState('')
  const [lieu, setLieu] = useState(0)

  useEffect(() => {
    let vivant = true
    loadMiniMaxi()
      .then(d => { if (vivant) { setData(d); setErreur(null) } })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    return () => { vivant = false }
  }, [])

  const lieux = useMemo(() => (data && data.lieux) || [], [data])
  const articles = useMemo(() => (lieux[lieu] && lieux[lieu].articles) || [], [lieux, lieu])
  const tous = useMemo(() => lieux.flatMap(l => l.articles), [lieux])
  const combien = s => articles.filter(a => a.statut === s).length

  const liste = useMemo(() => {
    const cherche = q.trim().toLowerCase()
    return articles.filter(a => (filtre === 'tout' || a.statut === filtre)
      && (!cherche || a.nom.toLowerCase().includes(cherche)))
  }, [articles, filtre, q])

  return (
    <div className="min-h-[100dvh] bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-[1100px] mx-auto px-3 py-4 pb-28">
        <h1 className="text-[22px] font-extrabold leading-tight">Mini-maxi des préparations</h1>
        <p className="text-[13px] text-ink-mute mt-1 mb-3 max-w-[62ch]">
          Ce que devraient être les règles de réapprovisionnement d'Odoo pour chaque préparation
          SM, d'après <b>90 jours de consommation réelle</b> — ce qui est vraiment sorti du stock
          pour être transformé.
        </p>

        <div className="bg-white border border-line rounded-2xl px-3.5 py-3 mb-3 text-[12.5px] text-ink-mute leading-relaxed">
          <b className="text-ink-soft">Le calcul :</b> le <b>mini</b> est ce qui part en une journée
          où l'on s'en sert. Le <b>maxi</b> est le mini plus une fournée habituelle (mesurée sur les
          ordres terminés des 180 derniers jours), et au moins deux journées. Les articles sortis
          3 jours ou moins sur 90 sont marqués « à la demande » : leur poser une règle créerait du
          stock pour rien.
        </div>

        {erreur && (
          <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3">
            Impossible de lire Odoo : {erreur}
          </div>
        )}
        {!data && !erreur && <Skeleton rows={6} />}

        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[['creer', 'à créer'], ['nulle', 'règles à 0/0'], ['revoir', 'à comparer'], ['demande', 'à la demande']]
                .map(([s, t]) => (
                  <div key={s} className="bg-white border border-line rounded-2xl px-3 py-2.5">
                    <div className="text-[24px] font-extrabold leading-none tabular-nums">
                      {tous.filter(a => a.statut === s).length}
                    </div>
                    <div className="text-[11.5px] text-ink-mute mt-1 leading-tight">{t}</div>
                  </div>
                ))}
            </div>

            <div className="flex gap-2 mb-3">
              {lieux.map((l, i) => (
                <button key={l.id} onClick={() => { setLieu(i); setFiltre('tout') }}
                  className={'flex-1 py-2.5 rounded-2xl text-[13.5px] font-extrabold border-2 ' +
                    (lieu === i ? 'bg-bordeaux border-bordeaux text-cream' : 'bg-white border-line text-ink-mute')}>
                  {l.nom}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 items-center mb-3">
              <button onClick={() => setFiltre('tout')}
                className={'px-3 py-1.5 rounded-full text-[12.5px] font-bold border ' +
                  (filtre === 'tout' ? 'bg-bordeaux border-bordeaux text-cream' : 'bg-white border-line text-ink-mute')}>
                Tout <span className="opacity-70">{articles.length}</span>
              </button>
              {STATUTS.filter(([s]) => combien(s)).map(([s, t]) => (
                <button key={s} onClick={() => setFiltre(s)}
                  className={'px-3 py-1.5 rounded-full text-[12.5px] font-bold border ' +
                    (filtre === s ? 'bg-bordeaux border-bordeaux text-cream' : 'bg-white border-line text-ink-mute')}>
                  {t} <span className="opacity-70">{combien(s)}</span>
                </button>
              ))}
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Chercher une préparation"
                className="flex-1 min-w-[160px] border border-line rounded-full px-3.5 py-1.5 text-[13px] bg-white outline-none focus:border-bordeaux" />
            </div>

            <div className="bg-white border border-line rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead>
                    <tr className="bg-cream-warm">
                      {['Préparation', 'Consommé 90 j', 'Jours utilisés', 'Par journée', 'Fournée', 'Stock', 'Règle actuelle', 'Mini', 'Maxi']
                        .map((t, i) => (
                          <th key={t} className={'text-[10.5px] uppercase tracking-wide font-extrabold text-ink-mute px-2.5 py-2.5 border-b border-line whitespace-nowrap '
                            + (i ? 'text-right' : 'text-left')}>{t}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {liste.map(a => {
                      const propose = a.statut !== 'demande' && a.statut !== 'archive'
                      return (
                        <tr key={a.nom} className="border-b border-[#f4eee2] last:border-0">
                          <td className="px-2.5 py-2 min-w-[200px]">
                            <div className="text-[13px] font-bold leading-tight">{a.nom}</div>
                            <span className={'inline-block text-[9.5px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full mt-1 ' + COULEUR[a.statut]}>
                              {LIB[a.statut]}
                            </span>
                          </td>
                          <td className="px-2.5 py-2 text-right text-[13px] tabular-nums whitespace-nowrap">
                            {nbFr(a.total)} <span className="text-ink-mute">{a.unite}</span>
                          </td>
                          <td className="px-2.5 py-2 text-right text-[13px] tabular-nums whitespace-nowrap">
                            {a.joursActifs} <span className="text-ink-mute">/ 90</span>
                          </td>
                          <td className="px-2.5 py-2 text-right text-[13px] tabular-nums">{nbFr(a.parUtil)}</td>
                          <td className="px-2.5 py-2 text-right text-[13px] tabular-nums">
                            {a.fournee ? nbFr(a.fournee) : <span className="text-ink-mute">—</span>}
                          </td>
                          <td className={'px-2.5 py-2 text-right text-[13px] tabular-nums ' + (a.stock < 0 ? 'text-danger font-bold' : '')}>
                            {nbFr(a.stock)}
                          </td>
                          <td className="px-2.5 py-2 text-right text-[13px] tabular-nums whitespace-nowrap border-l border-line">
                            {!a.regle ? <span className="text-ink-mute">aucune</span>
                              : (!a.regle.min && !a.regle.max) ? <span className="text-ink-mute">0 / 0</span>
                                : `${nbFr(a.regle.min)} / ${nbFr(a.regle.max)}`}
                          </td>
                          <td className={'px-2.5 py-2 text-right text-[14px] font-extrabold tabular-nums border-l border-line '
                            + (propose ? 'text-[#8A6A21]' : 'text-ink-mute')}>
                            {propose ? nbFr(a.mini) : '—'}
                          </td>
                          <td className={'px-2.5 py-2 text-right text-[14px] font-extrabold tabular-nums '
                            + (propose ? 'text-[#8A6A21]' : 'text-ink-mute')}>
                            {propose ? nbFr(a.maxi) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                    {!liste.length && (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-ink-mute text-[13px]">
                        Aucune préparation ne correspond.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-[11.5px] text-ink-mute mt-3 leading-relaxed max-w-[70ch]">
              Source : mouvements de stock terminés vers la production sur 90 jours ; ordres de
              fabrication terminés sur 180 jours pour la taille des fournées, convertis dans
              l'unité de l'article (une « Tournée (3 kg) » vaut 3 000 g). Cet écran ne modifie
              rien dans Odoo.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
