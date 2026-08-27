import { useState, useEffect, useMemo, Fragment } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { todayISO } from '../lib/dates'
import { ARTICLES, loadFabProd, setFabProd, delFabProd, loadArticlesAjoutes, addArticle, delArticle, loadNoms, loadHistorique } from '../lib/fabricationProd'

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const propre = n => String(n).replace(/^SM[.-]?\s*/i, '').replace(/\s*finition\s*$/i, '').trim()
const jourLisible = j => new Date(j + 'T12:00:00')
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

const FAMILLES = ['Finitions', 'Autres']

export default function FabricationProdView({ user, onLogout, onNavigate, activeView }) {
  const [jour, setJour] = useState(todayISO())
  const [faits, setFaits] = useState(null)
  const [ajoutes, setAjoutes] = useState([])     // articles ajoutés à la main
  const [nouveau, setNouveau] = useState(null)   // { nom, unite, photo } en cours de création
  const [noms, setNoms] = useState({})           // qui a déclaré quoi
  const [histo, setHisto] = useState(null)       // les journées passées
  const [voirHisto, setVoirHisto] = useState(false)
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

  useEffect(() => {
    let vivant = true
    loadArticlesAjoutes().then(l => { if (vivant) setAjoutes(l) }).catch(() => { })
    loadNoms().then(n => { if (vivant) setNoms(n) }).catch(() => { })
    return () => { vivant = false }
  }, [])

  // L'historique n'est lu qu'à l'ouverture, et relu après chaque déclaration
  // pour qu'une journée qui vient d'être remplie y apparaisse.
  const relireHisto = () => loadHistorique(60).then(setHisto).catch(() => setHisto([]))

  // La liste complète : celle du fichier, plus ce que l'équipe a ajouté.
  const tous = useMemo(() => [...ARTICLES, ...ajoutes], [ajoutes])

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
      setFaits(f => ({ ...f, [a.article]: { article: a.article, qty: q, unite, fait_par: user?.id, fait_le: new Date().toISOString() } }))
      setOuvert(null)
      setHisto(null)
    } catch (e) { toast.error('Impossible d\'enregistrer : ' + (e.message || e)) }
  }

  const retirer = async (a, ev) => {
    ev.stopPropagation()
    try {
      await delFabProd(jour, a.article)
      setFaits(f => { const s = { ...f }; delete s[a.article]; return s })
      setHisto(null)
      if (ouvert === a.article) setOuvert(null)
    } catch (e) { toast.error('Impossible de retirer : ' + (e.message || e)) }
  }

  const combien = useMemo(() => Object.keys(faits || {}).length, [faits])

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
                <button key={h.jour} onClick={() => { setFaits(null); setOuvert(null); setJour(h.jour) }}
                  className={'w-full text-left bg-white border rounded-xl px-3.5 py-2.5 mb-1.5 flex items-baseline gap-3 ' +
                    (h.jour === jour ? 'border-bordeaux' : 'border-line')}>
                  <span className="text-[13.5px] font-bold flex-1 min-w-0">{jourLisible(h.jour)}</span>
                  <span className="text-[12.5px] text-ink-soft whitespace-nowrap">
                    {h.lignes.length} article{h.lignes.length > 1 ? 's' : ''}
                  </span>
                  {qui.length > 0 && (
                    <span className="text-[11.5px] text-ink-mute truncate max-w-[45%]">par {qui.join(', ')}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* ce qui sort à l'impression : une feuille propre, sans les cartes */}
        <div className="hidden print:block">
          <h2 className="font-serif italic text-[20px] mb-0.5">Fabrication Prod</h2>
          <p className="text-[12px] text-ink-soft mb-3">{jourLisible(jour)}</p>
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide">Article</th>
                <th className="text-right border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide w-[110px]">Quantité faite</th>
                <th className="text-left border-b-2 border-ink py-1.5 text-[10.5px] uppercase tracking-wide w-[110px]">Par qui</th>
              </tr>
            </thead>
            <tbody>
              {FAMILLES.map(fam => (
                <Fragment key={fam}>
                  <tr><td colSpan={3} className="bg-[#f0f0f0] font-extrabold text-[10.5px] uppercase tracking-wide py-1 px-1">{fam}</td></tr>
                  {tous.filter(a => a.famille === fam).map(a => {
                    const d = faits && faits[a.article]
                    return (
                      <tr key={a.article}>
                        <td className="border-b border-[#ddd] py-1.5 px-1">{propre(a.article)}</td>
                        <td className={'py-1.5 px-1 text-right font-bold ' + (d ? 'border-b border-[#ddd]' : 'border-b border-[#999]')}>
                          {d ? `${nb(d.qty)} ${d.unite}` : ' '}
                        </td>
                        <td className={'py-1.5 px-1 text-[11.5px] ' + (d ? 'border-b border-[#ddd]' : 'border-b border-[#999]')}>
                          {(d && noms[d.fait_par]) || ' '}
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
          const liste = tous.filter(a => a.famille === fam)
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
                            {d
                              ? (noms[d.fait_par] ? `par ${noms[d.fait_par]}` : 'clique pour corriger')
                              : `noter en ${a.unite}`}
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
                            {a.ajoute && !d && (
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
