import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { todayISO } from '../lib/dates'
import {
  ARTICLES, loadFabProd, addFabProd, delFabProd,
  loadArticlesAjoutes, addArticle, delArticle, loadNoms, loadHistorique,
} from '../lib/fabricationProd'

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const propre = n => String(n).replace(/^SM[.-]?\s*/i, '').replace(/\s*finition\s*$/i, '').trim()
const jourLisible = j => new Date(j + 'T12:00:00')
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const heure = t => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

const FAMILLES = ['Finitions', 'Autres']

export default function FabricationProdView({ user, onLogout, onNavigate, activeView }) {
  const [jour, setJour] = useState(todayISO())
  const [journal, setJournal] = useState(null)    // les fournées notées ce jour-là
  const [erreur, setErreur] = useState(null)
  const [ouvert, setOuvert] = useState(null)      // l'article en cours de saisie
  const [valeur, setValeur] = useState('')
  const [unite, setUnite] = useState(null)
  const [ajoutes, setAjoutes] = useState([])      // articles ajoutés à la main
  const [nouveau, setNouveau] = useState(null)    // { nom, unite, photo } en cours de création
  const [noms, setNoms] = useState({})
  const [histo, setHisto] = useState(null)
  const [voirHisto, setVoirHisto] = useState(false)

  useEffect(() => {
    let vivant = true
    loadFabProd(jour)
      .then(l => { if (vivant) { setJournal(l); setErreur(null) } })
      .catch(e => { if (vivant) { setErreur(e.message || String(e)); setJournal([]) } })
    return () => { vivant = false }
  }, [jour])

  useEffect(() => {
    let vivant = true
    loadArticlesAjoutes().then(l => { if (vivant) setAjoutes(l) }).catch(() => { })
    loadNoms().then(n => { if (vivant) setNoms(n) }).catch(() => { })
    return () => { vivant = false }
  }, [])

  const relireHisto = () => loadHistorique(60).then(setHisto).catch(() => setHisto([]))

  // La liste complète : celle du fichier, plus ce que l'équipe a ajouté.
  const tous = useMemo(() => [...ARTICLES, ...ajoutes], [ajoutes])

  // Combien de fois chaque article a déjà été noté ce jour-là.
  const combienDe = useMemo(() => {
    const m = {}
    for (const l of journal || []) m[l.article] = (m[l.article] || 0) + 1
    return m
  }, [journal])

  const ouvrir = a => {
    if (ouvert === a.article) { setOuvert(null); return }
    setOuvert(a.article)
    setValeur('')
    setUnite(null)          // à choisir exprès : g, kg ou u
  }

  const noter = async a => {
    const q = Number(String(valeur).replace(',', '.'))
    if (!(q > 0)) { toast.error('Note une quantité'); return }
    if (!unite) { toast.error('Choisis grammes, kilos ou unités'); return }
    try {
      const ligne = await addFabProd(jour, a.article, q, unite, user?.id)
      setJournal(l => [...(l || []), ligne])
      setOuvert(null)
      setHisto(null)
      toast.success(propre(a.article) + ' — ' + nb(q) + ' ' + unite)
    } catch (e) { toast.error('Impossible d\'enregistrer : ' + (e.message || e)) }
  }

  const retirerLigne = async id => {
    try {
      await delFabProd(id)
      setJournal(l => (l || []).filter(x => x.id !== id))
      setHisto(null)
    } catch (e) { toast.error('Impossible de retirer : ' + (e.message || e)) }
  }

  // Une photo de téléphone fait plusieurs Mo : on la réduit avant de la garder.
  const poserPhoto = fichier => {
    if (!fichier || !/^image\//.test(fichier.type)) { toast.error('Ce fichier n\'est pas une image'); return }
    const img = new Image()
    img.onload = () => {
      const e = Math.min(1, 700 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * e); c.height = Math.round(img.height * e)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      setNouveau(n => ({ ...n, photo: c.toDataURL('image/jpeg', 0.82) }))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => toast.error('Image illisible')
    img.src = URL.createObjectURL(fichier)
  }

  // Coller une image copiée sur internet, tant que le formulaire est ouvert.
  useEffect(() => {
    if (!nouveau) return undefined
    const coller = ev => {
      for (const item of (ev.clipboardData && ev.clipboardData.items) || []) {
        if (item.type && item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) { ev.preventDefault(); poserPhoto(f); return }
        }
      }
    }
    document.addEventListener('paste', coller)
    return () => document.removeEventListener('paste', coller)
  }, [nouveau])

  const creer = async () => {
    const nom = (nouveau.nom || '').trim()
    if (!nom) { toast.error('Donne un nom à l\'article'); return }
    if (tous.some(a => a.article.toLowerCase() === nom.toLowerCase())) {
      toast.error('Cet article est déjà dans la liste'); return
    }
    try {
      const id = await addArticle(nom, nouveau.unite, nouveau.photo, user?.id)
      setAjoutes(l => [...l, { article: nom, famille: 'Autres', unite: nouveau.unite, photo: nouveau.photo, ajoute: id }])
      setNouveau(null)
      toast.success('Article ajouté')
    } catch (e) { toast.error('Impossible d\'ajouter : ' + (e.message || e)) }
  }

  const supprimer = async (a, ev) => {
    ev.stopPropagation()
    try {
      await delArticle(a.ajoute)
      setAjoutes(l => l.filter(x => x.ajoute !== a.ajoute))
      if (ouvert === a.article) setOuvert(null)
    } catch (e) { toast.error('Impossible de supprimer : ' + (e.message || e)) }
  }

  return (
    <div className="min-h-[100dvh] bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />

      <div className="max-w-[1100px] mx-auto px-4 py-5 pb-28 print:p-0 print:max-w-none">
        <h1 className="font-serif italic text-[26px] leading-tight print:hidden">Fabrication Prod</h1>
        <p className="text-[12.5px] text-ink-mute mb-4 print:hidden">
          Clique un article et note la quantité. Tu peux le noter plusieurs fois dans la journée.
        </p>

        <div className="flex items-center gap-2 flex-wrap mb-5 print:hidden">
          <div className="flex items-center gap-2 bg-white border border-line rounded-xl px-3 py-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink-mute">Journée</span>
            <input type="date" value={jour}
              onChange={e => { setJournal(null); setOuvert(null); setJour(e.target.value) }}
              className="bg-transparent border-0 outline-none text-[14px] font-bold text-ink" />
          </div>
          <button onClick={() => window.print()}
            className="border border-line bg-white rounded-xl px-4 py-2.5 text-[13px] font-bold text-ink-soft">
            Imprimer
          </button>
          <button onClick={() => { setVoirHisto(v => !v); if (!histo) relireHisto() }}
            className={'rounded-xl px-4 py-2.5 text-[13px] font-bold border ' +
              (voirHisto ? 'bg-bordeaux border-bordeaux text-cream' : 'bg-white border-line text-ink-soft')}>
            Historique
          </button>
        </div>

        {/* Les journées déjà remplies : on en choisit une, on la voit, on l'imprime. */}
        {voirHisto && (
          <div className="mb-5 print:hidden">
            {!histo && <Skeleton rows={2} />}
            {histo && !histo.length && (
              <p className="text-[13.5px] text-ink-mute">Rien n'a encore été déclaré.</p>
            )}
            {histo && histo.map(h => {
              const qui = [...new Set(h.lignes.map(l => noms[l.fait_par]).filter(Boolean))]
              return (
                <button key={h.jour} onClick={() => { setJournal(null); setOuvert(null); setJour(h.jour) }}
                  className={'w-full text-left bg-white border rounded-xl px-3.5 py-2.5 mb-1.5 flex items-baseline gap-3 ' +
                    (h.jour === jour ? 'border-bordeaux' : 'border-line')}>
                  <span className="text-[13.5px] font-bold flex-1 min-w-0">{jourLisible(h.jour)}</span>
                  <span className="text-[12.5px] text-ink-soft whitespace-nowrap">
                    {h.lignes.length} ligne{h.lignes.length > 1 ? 's' : ''}
                  </span>
                  {qui.length > 0 && (
                    <span className="text-[11.5px] text-ink-mute truncate max-w-[45%]">par {qui.join(', ')}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* La feuille imprimée. La classe `print-area` est indispensable :
            index.css masque tout le reste de la page à l'impression. */}
        <div className="hidden print:block print-area">
          <h2 className="font-serif italic text-[20px] mb-0.5">Fabrication Prod</h2>
          <p className="text-[12px] text-ink-soft mb-3">{jourLisible(jour)}</p>
          {(journal || []).length === 0 ? (
            <p className="text-[12.5px]">Rien n'a été noté ce jour-là.</p>
          ) : (
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide w-[60px]">Heure</th>
                  <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide">Article</th>
                  <th className="text-right border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide w-[100px]">Quantité</th>
                  <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide w-[110px]">Par qui</th>
                </tr>
              </thead>
              <tbody>
                {(journal || []).map(l => (
                  <tr key={l.id}>
                    <td className="border-b border-[#ddd] py-1.5 px-1">{heure(l.fait_le)}</td>
                    <td className="border-b border-[#ddd] py-1.5 px-1">{propre(l.article)}</td>
                    <td className="border-b border-[#ddd] py-1.5 px-1 text-right font-bold">{nb(l.qty)} {l.unite}</td>
                    <td className="border-b border-[#ddd] py-1.5 px-1 text-[11.5px]">{noms[l.fait_par] || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {erreur && (
          <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3 print:hidden">
            Impossible de lire les déclarations : {erreur}
          </div>
        )}
        {!journal && <Skeleton rows={4} />}

        {journal && FAMILLES.map(fam => {
          const liste = tous.filter(a => a.famille === fam)
          return (
            <div key={fam} className="print:hidden">
              <div className="flex items-center gap-2.5 mt-6 mb-2.5">
                <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-bordeaux">{fam}</span>
                <span className="flex-1 h-0.5 bg-line" />
              </div>

              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {liste.map(a => {
                  const fois = combienDe[a.article] || 0
                  const actif = ouvert === a.article
                  return (
                    <div key={a.article}
                      className={'bg-white border rounded-2xl overflow-hidden ' +
                        (actif ? 'border-bordeaux ring-2 ring-bordeaux/15' : 'border-line')}>
                      <button onClick={() => ouvrir(a)} className="block w-full text-left">
                        <div className="relative aspect-[4/3] bg-cream-warm">
                          <img src={a.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          {fois > 0 && (
                            <span className="absolute top-2 left-2 bg-ok text-cream text-[12px] font-extrabold px-2.5 py-1 rounded-full">
                              {fois} fois
                            </span>
                          )}
                        </div>
                        <div className="px-3 py-2.5">
                          <div className="text-[13.5px] font-semibold leading-tight">{propre(a.article)}</div>
                          <div className="text-[11px] text-ink-mute mt-0.5">noter en {a.unite}</div>
                        </div>
                      </button>

                      {actif && (
                        <div className="px-3 pb-3 bg-cream-warm border-t border-line pt-3">
                          <div className="flex gap-2 items-center flex-wrap">
                            <input type="number" min="0" step="any" inputMode="decimal" autoFocus
                              value={valeur} onChange={e => setValeur(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') noter(a) }}
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
                          {!unite && (
                            <p className="text-[11.5px] text-[#854F0B] mt-2">
                              Choisis l'unité : grammes, kilos ou unités.
                            </p>
                          )}
                          <div className="flex gap-2 mt-2.5">
                            <button onClick={() => noter(a)}
                              disabled={!unite || !(Number(String(valeur).replace(',', '.')) > 0)}
                              className={'flex-1 rounded-xl py-2.5 text-[13px] font-bold ' +
                                (unite && Number(String(valeur).replace(',', '.')) > 0
                                  ? 'bg-bordeaux text-cream'
                                  : 'bg-white border border-line text-ink-mute')}>
                              Ajouter à la liste
                            </button>
                            {a.ajoute && fois === 0 && (
                              <button onClick={ev => supprimer(a, ev)}
                                className="border border-line bg-white rounded-xl px-3 py-2.5 text-[13px] font-bold text-danger">
                                supprimer
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {fam === 'Autres' && (
                  nouveau ? (
                    <div className="bg-white border border-bordeaux ring-2 ring-bordeaux/15 rounded-2xl overflow-hidden">
                      <label
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); poserPhoto(e.dataTransfer.files[0]) }}
                        className="relative block aspect-[4/3] bg-cream-warm cursor-pointer">
                        {nouveau.photo
                          ? <img src={nouveau.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          : (
                            <span className="absolute inset-0 grid place-items-center text-center px-3">
                              <span className="text-[12px] text-ink-mute leading-relaxed">
                                <b className="block text-ink-soft text-[12.5px] mb-0.5">Colle la photo</b>
                                Cmd+V / Ctrl+V<br />ou clique pour choisir
                              </span>
                            </span>
                          )}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={e => poserPhoto(e.target.files[0])} />
                      </label>
                      <div className="px-3 py-3 bg-cream-warm border-t border-line">
                        <input autoFocus value={nouveau.nom}
                          onChange={e => setNouveau(n => ({ ...n, nom: e.target.value }))}
                          placeholder="Nom de l'article"
                          className="w-full border border-line rounded-xl px-2.5 py-2 text-[13.5px] bg-white outline-none focus:border-bordeaux" />
                        <div className="flex border border-line rounded-xl overflow-hidden bg-white mt-2">
                          {['g', 'kg', 'u'].map(u => (
                            <button key={u} onClick={() => setNouveau(n => ({ ...n, unite: u }))}
                              className={'flex-1 py-2 text-[13px] font-extrabold border-r border-line last:border-r-0 ' +
                                (nouveau.unite === u ? 'bg-bordeaux text-cream' : 'text-ink-mute')}>
                              {u}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2.5">
                          <button onClick={creer}
                            className="flex-1 bg-bordeaux text-cream rounded-xl py-2.5 text-[13px] font-bold">
                            Ajouter
                          </button>
                          <button onClick={() => setNouveau(null)}
                            className="border border-line bg-white rounded-xl px-3 py-2.5 text-[13px] font-bold text-ink-mute">
                            annuler
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setNouveau({ nom: '', unite: 'g', photo: null })}
                      className="bg-white border border-dashed border-line rounded-2xl min-h-[190px] grid place-items-center text-center px-4">
                      <span>
                        <span className="block text-[22px] text-bordeaux leading-none mb-1.5">+</span>
                        <span className="block text-[13.5px] font-bold">Autre article</span>
                        <span className="block text-[11.5px] text-ink-mute mt-0.5">avec sa photo</span>
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>
          )
        })}

        {/* La liste du jour : c'est elle qui s'imprime */}
        {journal && (
          <div className="print:hidden">
            <div className="flex items-center gap-2.5 mt-8 mb-2.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-bordeaux">
                La liste du {jourLisible(jour)}
              </span>
              <span className="flex-1 h-0.5 bg-line" />
            </div>
            {journal.length === 0 ? (
              <p className="text-[13.5px] text-ink-mute py-2">
                Rien de noté pour l'instant. Clique un article plus haut.
              </p>
            ) : (
              <div className="bg-white border border-line rounded-2xl overflow-hidden">
                {journal.map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-3.5 py-2.5 border-b border-[#f2ebdd] last:border-0">
                    <span className="text-[11.5px] text-ink-mute w-[42px] shrink-0">{heure(l.fait_le)}</span>
                    <span className="text-[14px] flex-1 min-w-0">{propre(l.article)}</span>
                    <span className="text-[14px] font-extrabold text-ok whitespace-nowrap">{nb(l.qty)} {l.unite}</span>
                    {noms[l.fait_par] && (
                      <span className="text-[11.5px] text-ink-mute hidden sm:block max-w-[110px] truncate">{noms[l.fait_par]}</span>
                    )}
                    <button onClick={() => retirerLigne(l.id)}
                      className="border border-line bg-white rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-danger shrink-0">
                      annuler
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {journal && (
        <div className="lg-bottom-bar z-40 bg-white border-t border-line px-4 py-3 flex items-center justify-between gap-3 print:hidden">
          <div>
            <b className="text-[14.5px] block">
              {journal.length === 0 ? 'Liste vide' : journal.length + ' ligne' + (journal.length > 1 ? 's' : '')}
            </b>
            <span className="text-[12px] text-ink-mute">{jourLisible(jour)}</span>
          </div>
          <button onClick={() => window.print()}
            className="bg-bordeaux text-cream rounded-xl px-4 py-2.5 text-[13px] font-bold">
            Imprimer la liste
          </button>
        </div>
      )}
    </div>
  )
}
