import { useState, useEffect, useMemo, Fragment } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { todayISO } from '../lib/dates'
import { ARTICLES, loadFabProd, setFabProd, delFabProd } from '../lib/fabricationProd'

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const propre = n => String(n).replace(/^SM[.-]?\s*/i, '').replace(/\s*finition\s*$/i, '').trim()
const jourLisible = j => new Date(j + 'T12:00:00')
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

const FAMILLES = ['Finitions', 'Autres']

export default function FabricationProdView({ user, onLogout, onNavigate, activeView }) {
  const [jour, setJour] = useState(todayISO())
  const [faits, setFaits] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [ouvert, setOuvert] = useState(null)     // l'article en cours de saisie
  const [valeur, setValeur] = useState('')
  const [unite, setUnite] = useState('g')

  useEffect(() => {
    let vivant = true
    loadFabProd(jour)
      .then(f => { if (vivant) { setFaits(f); setErreur(null) } })
      .catch(e => { if (vivant) { setErreur(e.message || String(e)); setFaits({}) } })
    return () => { vivant = false }
  }, [jour])

  const ouvrir = a => {
    if (ouvert === a.article) { setOuvert(null); return }
    const d = faits && faits[a.article]
    setOuvert(a.article)
    setValeur(d ? String(d.qty) : '')
    setUnite(d ? d.unite : a.unite)
  }

  const enregistrer = async a => {
    const q = Number(String(valeur).replace(',', '.'))
    if (!(q > 0)) { toast.error('Note une quantité'); return }
    try {
      await setFabProd(jour, a.article, q, unite, user?.id)
      setFaits(f => ({ ...f, [a.article]: { article: a.article, qty: q, unite } }))
      setOuvert(null)
    } catch (e) { toast.error('Impossible d\'enregistrer : ' + (e.message || e)) }
  }

  const retirer = async (a, ev) => {
    ev.stopPropagation()
    try {
      await delFabProd(jour, a.article)
      setFaits(f => { const s = { ...f }; delete s[a.article]; return s })
      if (ouvert === a.article) setOuvert(null)
    } catch (e) { toast.error('Impossible de retirer : ' + (e.message || e)) }
  }

  const combien = useMemo(() => Object.keys(faits || {}).length, [faits])

  return (
    <div className="min-h-[100dvh] bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-[1100px] mx-auto px-4 py-5 pb-28 print:p-0 print:max-w-none">
        <h1 className="font-serif italic text-[26px] leading-tight print:hidden">Fabrication Prod</h1>
        <p className="text-[12.5px] text-ink-mute mb-4 print:hidden">
          Ce que l'équipe a fabriqué. Clique sur un article pour noter la quantité.
        </p>

        <div className="flex items-center gap-2 flex-wrap mb-5 print:hidden">
          <div className="flex items-center gap-2 bg-white border border-line rounded-xl px-3 py-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink-mute">Journée</span>
            <input type="date" value={jour}
              onChange={e => { setFaits(null); setOuvert(null); setJour(e.target.value) }}
              className="bg-transparent border-0 outline-none text-[14px] font-bold text-ink" />
          </div>
          <button onClick={() => window.print()}
            className="border border-line bg-white rounded-xl px-4 py-2.5 text-[13px] font-bold text-ink-soft">
            Imprimer
          </button>
        </div>

        {/* ce qui sort à l'impression : une feuille propre, sans les cartes */}
        <div className="hidden print:block">
          <h2 className="font-serif italic text-[20px] mb-0.5">Fabrication Prod</h2>
          <p className="text-[12px] text-ink-soft mb-3">{jourLisible(jour)}</p>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide">Article</th>
                <th className="text-right border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide w-[120px]">Quantité faite</th>
              </tr>
            </thead>
            <tbody>
              {FAMILLES.map(fam => (
                <Fragment key={fam}>
                  <tr><td colSpan={2} className="bg-[#f0f0f0] font-extrabold text-[10.5px] uppercase tracking-wide py-1 px-1">{fam}</td></tr>
                  {ARTICLES.filter(a => a.famille === fam).map(a => {
                    const d = faits && faits[a.article]
                    return (
                      <tr key={a.article}>
                        <td className="border-b border-[#ddd] py-1.5 px-1">{propre(a.article)}</td>
                        <td className={'py-1.5 px-1 text-right font-bold ' + (d ? 'border-b border-[#ddd]' : 'border-b border-[#999]')}>
                          {d ? `${nb(d.qty)} ${d.unite}` : ' '}
                        </td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {erreur && (
          <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3 print:hidden">
            Impossible de lire les déclarations : {erreur}
          </div>
        )}
        {!faits && <Skeleton rows={4} />}

        {faits && FAMILLES.map(fam => {
          const liste = ARTICLES.filter(a => a.famille === fam)
          const n = liste.filter(a => faits[a.article]).length
          return (
            <div key={fam} className="print:hidden">
              <div className="flex items-center gap-2.5 mt-6 mb-2.5">
                <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-bordeaux">{fam}</span>
                <span className="text-[11px] text-ink-mute">{n} sur {liste.length}</span>
                <span className="flex-1 h-0.5 bg-line" />
              </div>

              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {liste.map(a => {
                  const d = faits[a.article]
                  const actif = ouvert === a.article
                  return (
                    <div key={a.article}
                      className={'bg-white border rounded-2xl overflow-hidden ' +
                        (actif ? 'border-bordeaux ring-2 ring-bordeaux/15' : d ? 'border-[#cfe0b8]' : 'border-line')}>
                      <button onClick={() => ouvrir(a)} className="block w-full text-left">
                        <div className="relative aspect-[4/3] bg-cream-warm">
                          <img src={a.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          {d && (
                            <span className="absolute top-2 left-2 bg-ok text-cream text-[12px] font-extrabold px-2.5 py-1 rounded-full">
                              {nb(d.qty)} {d.unite}
                            </span>
                          )}
                        </div>
                        <div className="px-3 py-2.5">
                          <div className={'text-[13.5px] font-semibold leading-tight ' + (d ? 'line-through opacity-60' : '')}>
                            {propre(a.article)}
                          </div>
                          <div className="text-[11px] text-ink-mute mt-0.5">
                            {d ? 'clique pour corriger' : `noter en ${a.unite}`}
                          </div>
                        </div>
                      </button>

                      {actif && (
                        <div className="px-3 pb-3 bg-cream-warm border-t border-line pt-3">
                          <div className="flex gap-2 items-center flex-wrap">
                            <input type="number" min="0" step="any" inputMode="decimal" autoFocus
                              value={valeur} onChange={e => setValeur(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') enregistrer(a) }}
                              placeholder="0"
                              className="w-[92px] border border-line rounded-xl px-2.5 py-2.5 text-[18px] font-extrabold text-right bg-white outline-none focus:border-bordeaux" />
                            <div className="flex border border-line rounded-xl overflow-hidden bg-white">
                              {['g', 'kg', 'u'].map(u => (
                                <button key={u} onClick={() => setUnite(u)}
                                  className={'px-3 py-2.5 text-[13.5px] font-extrabold border-r border-line last:border-r-0 ' +
                                    (unite === u ? 'bg-bordeaux text-cream' : 'text-ink-mute')}>
                                  {u}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-2.5">
                            <button onClick={() => enregistrer(a)}
                              className="flex-1 bg-bordeaux text-cream rounded-xl py-2.5 text-[13px] font-bold">
                              Enregistrer
                            </button>
                            {d && (
                              <button onClick={ev => retirer(a, ev)}
                                className="border border-line bg-white rounded-xl px-3 py-2.5 text-[13px] font-bold text-ink-mute">
                                retirer
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {faits && (
        <div className="lg-bottom-bar z-40 bg-white border-t border-line px-4 py-3 flex items-center justify-between gap-3 print:hidden">
          <div>
            <b className="text-[14.5px] block">
              {combien === 0 ? 'Rien de déclaré' : `${combien} article${combien > 1 ? 's' : ''} déclaré${combien > 1 ? 's' : ''}`}
            </b>
            <span className="text-[12px] text-ink-mute">{jourLisible(jour)}</span>
          </div>
          <button onClick={() => window.print()}
            className="bg-bordeaux text-cream rounded-xl px-4 py-2.5 text-[13px] font-bold">
            Imprimer la feuille
          </button>
        </div>
      )}
    </div>
  )
}
