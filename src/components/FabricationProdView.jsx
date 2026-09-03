import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { todayISO } from '../lib/dates'
import {
  ARTICLES, loadFabProd, addFabProd, delFabProd,
  loadArticlesAjoutes, addArticle, delArticle, loadNoms, loadHistorique, loadRecettes,
  chercherArticlesOdoo,
  photoArticleOdoo,
  loadConsommateurs,
} from '../lib/fabricationProd'
import { loadPrevisions } from '../lib/previsionsVitrine'

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
// A l'atelier on ne pese pas 201,04 g : grammes et pieces en nombres entiers,
// seuls les kg gardent 2 decimales (10 g pres).
const nbQ = (v, u) => (/^kg$/i.test(String(u || '').trim())
  ? nb(Math.round((Number(v) || 0) * 100) / 100)
  : nb(Math.round(Number(v) || 0)))
const propre = n => String(n).replace(/^SM[.-]?\s*/i, '').replace(/\s*finition\s*$/i, '').trim()

// Jumelle de celle de Fabrication Annexe : on tape la quantité d'un ingrédient
// et la recette entière se recalcule autour. Les tailles multiples
// (« 20 / 80 / 120 g ») ne se tapent pas : on ne saurait pas laquelle bouge.
function QteLigne({ l, fois, onFois }) {
  const affiche = l.tailles
    ? l.tailles.map(q => nbQ(q * fois, l.unite)).join(' / ')
    : nbQ(l.qty * fois, l.unite)
  const [txt, setTxt] = useState(affiche)
  const [vu, setVu] = useState(affiche)
  if (affiche !== vu) { setVu(affiche); setTxt(affiche) }

  if (l.tailles || !(l.qty > 0)) {
    return (
      <span className="text-[19px] font-extrabold min-w-[104px] text-right shrink-0">
        {affiche} {l.unite}
      </span>
    )
  }
  const valider = () => {
    const v = Number(String(txt).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'))
    if (!(v > 0)) { setTxt(affiche); return }
    onFois(Math.round((v / l.qty) * 10000) / 10000)
  }
  return (
    <span className="min-w-[104px] shrink-0 flex items-baseline justify-end gap-1">
      <input value={txt} inputMode="decimal"
        onChange={e => setTxt(e.target.value)} onBlur={valider}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        aria-label={'Quantité de ' + propre(l.produit)}
        className="w-[72px] text-right text-[19px] font-extrabold bg-transparent text-ink
                   border-b border-dashed border-bordeaux/45 focus:outline-none focus:border-bordeaux" />
      <span className="text-[13px] font-bold text-ink-mute">{l.unite}</span>
    </span>
  )
}

const jourLisible = j => new Date(j + 'T12:00:00')
  .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
const heure = t => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '')

// Les fournées d'une journée, regroupées par article : le même article peut être
// fait plusieurs fois dans la journée, on additionne. Ordre alphabétique — c'est
// ce qui se relit le mieux quand on cherche un article précis.
function resumeJournee(lignes) {
  const par = new Map()
  for (const l of lignes || []) {
    const cle = `${l.article}|${l.unite || ''}`
    const e = par.get(cle) || { cle, nom: propre(l.article), unite: l.unite || '', qty: 0, fois: 0 }
    e.qty += Number(l.qty) || 0
    e.fois += Number(l.fois) || 0
    par.set(cle, e)
  }
  return [...par.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

const FAMILLES = ['Finitions', 'Autres']

// Une fiche Odoo peut lister le même ingrédient une fois par taille de gâteau.
// On le montre une seule fois, avec toutes ses quantités : « 20 / 80 / 120 g ».
function regrouper(lignes) {
  const out = []
  const vus = new Map()
  for (const l of lignes) {
    const cle = l.produit + '|' + l.unite
    if (vus.has(cle)) {
      const d = vus.get(cle)
      if (!d.tailles) d.tailles = [d.qty]
      if (!d.tailles.includes(l.qty)) d.tailles.push(l.qty)
      continue
    }
    const d = { ...l }
    vus.set(cle, d)
    out.push(d)
  }
  return out
}

export default function FabricationProdView({ user, onLogout, onNavigate, activeView }) {
  const [jour, setJour] = useState(todayISO())
  const [journal, setJournal] = useState(null)    // les fournées notées ce jour-là
  const [erreur, setErreur] = useState(null)
  const [ouvert, setOuvert] = useState(null)      // l'article en cours de saisie
  const [fois, setFois] = useState(1)             // combien de fois la recette
  const [recettes, setRecettes] = useState({})
  const [ajoutes, setAjoutes] = useState([])      // articles ajoutés à la main
  const [nouveau, setNouveau] = useState(null)    // { nom, unite, photo, choisi } en création
  // Ce qu'Odoo a répondu, et pour quelle recherche : garder la question avec la
  // réponse évite d'afficher les propositions d'un mot déjà effacé.
  const [suggestions, setSuggestions] = useState({ q: '', liste: [] })
  const [noms, setNoms] = useState({})
  const [histo, setHisto] = useState(null)
  const [voirHisto, setVoirHisto] = useState(false)
  const [q, setQ] = useState('')            // recherche rapide
  const [calcul, setCalcul] = useState(null)      // l'article dont on calcule la quantité

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

  // Les recettes viennent d'Odoo : si elles y changent, l'écran suit tout seul.
  useEffect(() => {
    let vivant = true
    const noms = [...ARTICLES, ...ajoutes].map(a => a.article)
    loadRecettes(noms).then(r => { if (vivant) setRecettes(r) }).catch(() => { })
    return () => { vivant = false }
  }, [ajoutes])

  // Sur ordinateur : les flèches changent le nombre de fournées, Échap referme.
  useEffect(() => {
    if (!ouvert) return undefined
    const touche = e => {
      if (e.key === 'ArrowUp' || e.key === '+') setFois(f => (f < 1 ? f + 0.5 : f + 1))
      else if (e.key === 'ArrowDown' || e.key === '-') setFois(f => Math.max(0.5, f > 1 ? f - 1 : f - 0.5))
      else if (e.key === 'Escape') setOuvert(null)
      else if (e.key >= '1' && e.key <= '9') setFois(Number(e.key))
      else return
      e.preventDefault()
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [ouvert])

  // La liste complète : celle du fichier, plus ce que l'équipe a ajouté.
  const tous = useMemo(() => [...ARTICLES, ...ajoutes], [ajoutes])

  // Combien de fois chaque article a déjà été noté ce jour-là.
  const combienDe = useMemo(() => {
    const m = {}
    for (const l of journal || []) m[l.article] = (m[l.article] || 0) + 1
    return m
  }, [journal])

  // `besoin` = le grammage demandé par la recette d'où l'on vient : on ouvre l'enfant
  // sur cette quantité-là, au lieu de repartir d'une fournée entière.
  const ouvrir = (a, besoin = null) => {
    if (ouvert === a.article) { setOuvert(null); return }
    setOuvert(a.article)
    const r = recettes[a.article]
    const f = besoin > 0 && r && r.sortQty > 0 ? Math.round((besoin / r.sortQty) * 100) / 100 : 1
    setFois(f > 0 ? f : 1)
  }

  const noter = async a => {
    const r = recettes[a.article]
    // sans recette dans Odoo, on garde au moins la trace de la fournée
    const q = r ? Math.round(r.sortQty * fois * 100) / 100 : fois
    const u = r ? r.sortUnite : a.unite
    try {
      const ligne = await addFabProd(jour, a.article, q, u, user?.id, fois)
      setJournal(l => [...(l || []), ligne])
      setOuvert(null)
      setHisto(null)
      toast.success(propre(a.article) + ' — ' + nb(fois) + (fois > 1 ? ' fois' : ' fois'))
    } catch (e) { toast.error('Impossible d\'enregistrer : ' + (e.message || e)) }
  }

  const retirerLigne = async id => {
    try {
      await delFabProd(id)
      setJournal(l => (l || []).filter(x => x.id !== id))
      setHisto(null)
    } catch (e) { toast.error('Impossible de retirer : ' + (e.message || e)) }
  }

  // Une photo de téléphone fait plusieurs Mo, celle d'Odoo ~175 Ko : dans les
  // deux cas on réduit avant de garder — la photo vit en base, dans la ligne
  // de l'article, et elle est relue à chaque ouverture de l'écran.
  const reduireImage = src => new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const e = Math.min(1, 700 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * e); c.height = Math.round(img.height * e)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.82))
      if (src.startsWith('blob:')) URL.revokeObjectURL(src)
    }
    img.onerror = () => reject(new Error('Image illisible'))
    img.src = src
  })

  const poserPhoto = fichier => {
    if (!fichier || !/^image\//.test(fichier.type)) { toast.error('Ce fichier n\'est pas une image'); return }
    reduireImage(URL.createObjectURL(fichier))
      .then(photo => setNouveau(n => ({ ...n, photo })))
      .catch(e => toast.error(e.message))
  }

  // Choisir un article d'Odoo : on récupère au passage SA photo, s'il en a une
  // et qu'aucune n'a déjà été collée à la main. Plus besoin d'aller en chercher
  // une sur internet pour les articles qu'Odoo illustre déjà.
  const [photoOdoo, setPhotoOdoo] = useState(null)   // null | 'cherche' | 'prise' | 'aucune'
  async function choisirArticle(a) {
    setNouveau(n => ({ ...n, nom: a.nom, unite: a.unite, choisi: true }))
    if (!a.id) return
    setPhotoOdoo('cherche')
    const photo = await photoArticleOdoo(a.id)
    setPhotoOdoo(photo ? 'prise' : 'aucune')
    // `n.photo` est relu ici : si quelqu'un a collé une image pendant l'appel,
    // c'est la sienne qui gagne.
    if (!photo) return
    const legere = await reduireImage(photo).catch(() => photo)
    setNouveau(n => (n && !n.photo ? { ...n, photo: legere } : n))
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

  // On cherche le VRAI article dans Odoo pendant qu'elle tape. Sans ce lien,
  // l'article ajouté n'a aucune recette : l'écran ne sait plus quoi montrer.
  const requete = nouveau && !nouveau.choisi ? (nouveau.nom || '').trim() : ''
  useEffect(() => {
    if (requete.length < 2) return undefined
    const t = setTimeout(() => {
      chercherArticlesOdoo(requete)
        .then(liste => setSuggestions({ q: requete, liste }))
        .catch(() => setSuggestions({ q: requete, liste: [] }))
    }, 300)
    return () => clearTimeout(t)
  }, [requete])
  // déduits au rendu : pas d'état de plus, et jamais un résultat périmé
  const propositions = suggestions.q === requete ? suggestions.liste : []
  const cherchant = requete.length >= 2 && suggestions.q !== requete

  const creer = async () => {
    const nom = (nouveau.nom || '').trim()
    if (!nom) { toast.error('Donne un nom à l\'article'); return }
    if (!nouveau.choisi) {
      toast.error('Choisis l\'article dans la liste d\'Odoo : sans lui, il n\'aurait pas de recette')
      return
    }
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
          Clique un article, dis combien de fois tu as fait la recette. Plusieurs fois par jour si besoin.
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
        <div className="relative mb-4 print:hidden">
          <svg viewBox="0 0 24 24"
            className="w-5 h-5 stroke-ink-mute fill-none absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Chercher un article"
            className="w-full bg-white border border-line rounded-2xl pl-11 pr-11 py-3 text-[15px] outline-none focus:border-bordeaux" />
          {q && (
            <button onClick={() => setQ('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] stroke-ink-mute fill-none" strokeWidth="2.4">
                <path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>

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
                  className={'w-full text-left bg-white border rounded-xl px-3.5 py-2.5 mb-1.5 ' +
                    (h.jour === jour ? 'border-bordeaux' : 'border-line')}>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[13.5px] font-bold flex-1 min-w-0">{jourLisible(h.jour)}</span>
                    {qui.length > 0 && (
                      <span className="text-[11.5px] text-ink-mute truncate max-w-[55%]">par {qui.join(', ')}</span>
                    )}
                  </div>
                  {/* Ce qui a été fabriqué ce jour-là, regroupé par article : une
                      journée peut porter plusieurs fournées du même article. */}
                  <div className="mt-1.5 space-y-0.5">
                    {resumeJournee(h.lignes).map(r => (
                      <div key={r.cle} className="flex items-baseline gap-2 text-[12.5px]">
                        <span className="flex-1 min-w-0 truncate text-ink-soft">{r.nom}</span>
                        <span className="font-bold whitespace-nowrap">{nbQ(r.qty, r.unite)} {r.unite}</span>
                        {r.fois > 0 && (
                          <span className="text-[11px] text-ink-mute whitespace-nowrap w-[62px] text-right">
                            {nb(r.fois)} fois
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
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
                    <td className="border-b border-[#ddd] py-1.5 px-1">
                      {propre(l.article)}{l.fois ? ' — ' + nb(l.fois) + ' fois' : ''}
                    </td>
                    <td className="border-b border-[#ddd] py-1.5 px-1 text-right font-bold">{nbQ(l.qty, l.unite)} {l.unite}</td>
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
          const cherche = q.trim().toLowerCase()
          const liste = tous.filter(a => a.famille === fam)
            .filter(a => !cherche || propre(a.article).toLowerCase().includes(cherche)
              || a.article.toLowerCase().includes(cherche))
          return (
            <div key={fam} className="print:hidden">
              <div className="flex items-center gap-2.5 mt-6 mb-2.5">
                <span className="text-[11px] font-extrabold uppercase tracking-[.1em] text-bordeaux">{fam}</span>
                <span className="flex-1 h-0.5 bg-line" />
              </div>

              <div className="grid gap-1.5 grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
                {liste.map(a => {
                  const actif = ouvert === a.article
                  return (
                    <div key={a.article}
                      className={'bg-white border rounded-2xl overflow-hidden ' +
                        (actif ? 'border-bordeaux' : 'border-line')}>
                      <button onClick={() => ouvrir(a)} className="block w-full text-left">
                        <div className="relative aspect-[4/3] bg-cream-warm">
                          <img src={a.photo} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          {combienDe[a.article] > 0 && (
                            <span className="absolute top-0.5 left-0.5 bg-ok text-cream text-[8.5px] font-extrabold px-1 py-0 rounded-full">
                              {combienDe[a.article]}
                            </span>
                          )}
                        </div>
                        <div className="px-1 py-1">
                          <div className="text-[9px] font-semibold leading-[1.15]">{propre(a.article)}</div>
                          <div className="text-[8px] text-ink-mute leading-[1.15]">
                            {recettes[a.article]
                              ? `${nb(recettes[a.article].sortQty)} ${recettes[a.article].sortUnite}`
                              : 'pas de recette'}
                          </div>
                        </div>
                      </button>

                    </div>
                  )
                })}

                {fam === 'Autres' && !q.trim() && (
                  nouveau ? (
                    <div className="col-span-4 sm:col-span-3 bg-white border border-bordeaux ring-2 ring-bordeaux/15 rounded-2xl overflow-hidden">
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
                          onChange={e => setNouveau(n => ({ ...n, nom: e.target.value, choisi: false }))}
                          placeholder="Chercher l'article dans Odoo"
                          className={'w-full border rounded-xl px-2.5 py-2 text-[13.5px] bg-white outline-none focus:border-bordeaux '
                            + (nouveau.choisi ? 'border-ok' : 'border-line')} />

                        {/* On ne propose que les articles d'Odoo qui ont une
                            nomenclature : c'est elle qui donne la recette. */}
                        {nouveau.choisi ? (
                          <p className="mt-1.5 text-[11.5px] text-ok font-bold">
                            Relié à Odoo · unité {nouveau.unite}
                            {photoOdoo === 'cherche' ? ' · photo…' : photoOdoo === 'prise' ? ' · photo prise dans Odoo' : ''}
                          </p>
                        ) : cherchant ? (
                          <p className="mt-1.5 text-[11.5px] text-ink-mute">Recherche dans Odoo…</p>
                        ) : propositions.length > 0 ? (
                          <div className="mt-1.5 border border-line rounded-xl bg-white max-h-[190px] overflow-y-auto">
                            {propositions.map(a => (
                              <button key={a.nom}
                                onClick={() => choisirArticle(a)}
                                className="w-full text-left px-2.5 py-2 border-b border-[#f4eee2] last:border-0 active:bg-cream-warm">
                                <span className="block text-[12.5px] font-bold leading-tight">{a.nom}</span>
                                <span className="block text-[10.5px] text-ink-mute">
                                  recette : {a.lignes} ingrédient{a.lignes > 1 ? 's' : ''} · en {a.unite}
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (nouveau.nom || '').trim().length >= 2 ? (
                          <p className="mt-1.5 text-[11.5px] text-danger">
                            Aucun article avec une nomenclature ne porte ce nom dans Odoo.
                          </p>
                        ) : null}

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
                    <button onClick={() => { setPhotoOdoo(null); setNouveau({ nom: '', unite: 'g', photo: null }) }}
                      className="bg-white border border-dashed border-line rounded-xl aspect-[4/5] grid place-items-center text-center px-1">
                      <span>
                        <span className="block text-[16px] text-bordeaux leading-none mb-0.5">+</span>
                        <span className="block text-[8.5px] font-bold leading-[1.15]">Autre article</span>
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
                    <span className="text-[14px] flex-1 min-w-0">
                      {propre(l.article)}
                      {l.fois ? <span className="block text-[11.5px] text-ink-mute">{nb(l.fois)} fois la recette</span> : null}
                    </span>
                    <span className="text-[14px] font-extrabold text-ok whitespace-nowrap">{nbQ(l.qty, l.unite)} {l.unite}</span>
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

      {ouvert && (() => {
        const a = tous.find(x => x.article === ouvert)
        if (!a) return null
        const r = recettes[a.article]
        return (
          <div className="fixed inset-0 z-[70] bg-ink/55 flex items-end justify-center print:hidden"
            onPointerDown={e => { if (e.target === e.currentTarget) setOuvert(null) }}>
            <div className="bg-cream w-full max-w-[560px] rounded-t-[24px] p-4 pb-6 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-3">
                <img src={a.photo} alt="" className="w-[62px] h-[62px] rounded-2xl object-cover shrink-0" />
                <b className="text-[19px] leading-tight">{propre(a.article)}</b>
              </div>

              <div className="flex items-center gap-2.5 bg-white border border-line rounded-2xl p-2.5 mb-2.5">
                <button onClick={() => setFois(f => Math.max(0.5, f > 1 ? f - 1 : f - 0.5))}
                  className="w-16 h-16 shrink-0 border-2 border-line rounded-2xl text-[32px] font-extrabold text-bordeaux leading-none">−</button>
                <div className="flex-1 text-center min-w-0">
                  {/* un chiffre qui se TAPE : douze fournées, c'était onze appuis sur + */}
                  <input type="number" step="0.5" min="0.5" value={fois}
                    onChange={e => setFois(Math.max(0.5, Number(e.target.value) || 0.5))}
                    aria-label="Combien de fois la recette"
                    className="sans-fleches w-full bg-transparent border-0 outline-none text-center text-[44px] font-extrabold leading-none text-ink p-0" />
                  <span className="text-[12.5px] text-ink-mute font-bold">fois la recette</span>
                </div>
                <button onClick={() => setFois(f => (f < 1 ? f + 0.5 : f + 1))}
                  className="w-16 h-16 shrink-0 border-2 border-line rounded-2xl text-[32px] font-extrabold text-bordeaux leading-none">+</button>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-3.5">
                {[0.5, 1, 2, 3].map(n => (
                  <button key={n} onClick={() => setFois(n)}
                    className={'py-3 text-[17px] font-extrabold border-2 rounded-2xl ' +
                      (fois === n ? 'bg-bordeaux border-bordeaux text-cream' : 'bg-white border-line text-ink-mute')}>
                    {n === 0.5 ? '½' : n}
                  </button>
                ))}
              </div>

              {r && r.lignes.length > 0 && (
                <div className="bg-white border border-line rounded-2xl overflow-hidden mb-3">
                  <div className="bg-cream-warm px-3.5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft border-b border-line">
                    Ce qu'il faut
                  </div>
                  {regrouper(r.lignes).map((l, i) => {
                    // si l'app connaît la recette de cet ingrédient, on peut
                    // entrer dedans pour la faire à son tour
                    const cible = tous.find(a => a.article === l.produit)
                    const ouvrable = l.fabrique && cible && recettes[l.produit]
                    const contenu = (
                      <>
                        <span className={'text-[15px] flex-1 min-w-0 ' + (l.fabrique ? 'text-bordeaux font-bold' : '')}>
                          {propre(l.produit)}
                        </span>
                        {ouvrable && (
                          <svg viewBox="0 0 24 24" className="w-4 h-4 stroke-bordeaux fill-none shrink-0" strokeWidth="2.6">
                            <path d="M9 5l7 7-7 7" /></svg>
                        )}
                      </>
                    )
                    // la quantité devient un champ : elle sort du bouton qui
                    // ouvre la sous-recette, sinon on taperait en ouvrant
                    return (
                      <div key={i} className="flex items-center gap-3 px-3.5 border-b border-[#f4eee2] last:border-0">
                        <QteLigne l={l} fois={fois} onFois={setFois} />
                        {ouvrable ? (
                          <button onClick={() => ouvrir(cible, l.tailles ? null : l.qty * fois)}
                            className="flex-1 min-w-0 text-left flex items-center gap-3 py-2.5 active:bg-cream-warm">
                            {contenu}
                          </button>
                        ) : (
                          <div className="flex-1 min-w-0 flex items-center gap-3 py-2.5">{contenu}</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {r && (
                <div className="bg-[#EAF3DE] border border-[#cfe0b8] rounded-2xl px-3.5 py-3 flex items-baseline gap-2.5">
                  <b className="text-[26px] font-extrabold text-ok">{nbQ(r.sortQty * fois, r.sortUnite)} {r.sortUnite}</b>
                  <span className="text-[13.5px] text-ok">en sortie</span>
                </div>
              )}
              {!r && (
                <p className="text-[12.5px] text-[#854F0B]">Pas de recette dans Odoo : on note seulement les fournées.</p>
              )}

              {r && (
                <button onClick={() => setCalcul(a)}
                  className="w-full mt-3 py-3.5 rounded-2xl bg-white border-2 border-bordeaux text-bordeaux text-[15px] font-extrabold">
                  Combien en faire ? — depuis les gâteaux du jour
                </button>
              )}

              <button onClick={() => noter(a)}
                className="w-full mt-3 py-4 rounded-2xl bg-ok text-white text-[19px] font-extrabold flex items-center justify-center gap-2.5">
                <svg viewBox="0 0 24 24" className="w-6 h-6 stroke-white fill-none" strokeWidth="3"><path d="M4 13l5 5L20 7" /></svg>
                C'est fait
              </button>
              {a.ajoute && !combienDe[a.article] && (
                <button onClick={ev => supprimer(a, ev)}
                  className="w-full mt-2 py-3 rounded-2xl bg-white border border-line text-danger text-[14px] font-bold">
                  supprimer cet article
                </button>
              )}
              <button onClick={() => setOuvert(null)}
                className="w-full mt-2 py-3.5 rounded-2xl bg-white border border-line text-ink-mute text-[15px] font-bold">
                fermer
              </button>
            </div>
          </div>
        )
      })()}

      {calcul && (
        <CalculFournee
          article={calcul}
          recette={recettes[calcul.article]}
          jour={jour}
          onFermer={() => setCalcul(null)}
          onUtiliser={n => { setFois(n); setCalcul(null) }}
        />
      )}

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

// ============================================================
// « Combien en faire ? » : on part des gâteaux à produire (pré-remplis avec les
// prévisions du jour, sinon les commandes) et on remonte à la quantité de crème.
// ============================================================

// Odoo compte en personnes : « 1 » = individuel, « 10 » = 10 personnes.
const tailleLisible = l => (/^\d+$/.test(String(l)) ? (String(l) === '1' ? 'indiv' : `${l} pers`) : l)

function CalculFournee({ article, recette, jour, onFermer, onUtiliser }) {
  const [produits, setProduits] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [qtes, setQtes] = useState({})          // "tmplId|label" -> nombre de gâteaux

  useEffect(() => {
    let vivant = true
    Promise.all([
      loadConsommateurs(article.article, jour),
      loadPrevisions(jour).catch(() => []),
    ])
      .then(([prods, prev]) => {
        if (!vivant) return
        // La prévision de la journée passe avant les commandes : elle les comprend déjà.
        const parVariante = {}
        for (const p of prev) parVariante[p.variant_id] = Number(p.qty_prevue) || 0
        const depart = {}
        for (const p of prods) {
          for (const d of p.declinaisons) {
            const prevu = d.variantId != null ? parVariante[d.variantId] : undefined
            depart[`${p.tmplId}|${d.label}`] = prevu !== undefined ? prevu : (d.commande || 0)
          }
        }
        setProduits(prods); setQtes(depart)
      })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    return () => { vivant = false }
  }, [article.article, jour])

  const total = useMemo(() => {
    let t = 0
    for (const p of produits || []) {
      for (const d of p.declinaisons) t += (Number(qtes[`${p.tmplId}|${d.label}`]) || 0) * d.qty
    }
    return t
  }, [produits, qtes])

  const unite = produits?.[0]?.declinaisons?.[0]?.unite || article.unite
  // On ne fait jamais moins que nécessaire : on arrondit au demi-tour de recette au-dessus.
  const fois = recette && recette.sortQty ? Math.ceil((total / recette.sortQty) * 2) / 2 : 0

  return (
    <div className="fixed inset-0 z-[80] bg-ink/55 flex items-end justify-center print:hidden"
      onPointerDown={e => { if (e.target === e.currentTarget) onFermer() }}>
      <div className="bg-cream w-full max-w-[640px] rounded-t-[24px] p-4 pb-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-baseline gap-2 mb-1">
          <b className="text-[19px] leading-tight">{propre(article.article)}</b>
          <span className="text-[13px] text-ink-mute">— combien en faire ?</span>
        </div>
        <p className="text-[12px] text-ink-mute mb-3">
          Les gâteaux prévus pour {jourLisible(jour)} sont déjà remplis. Corrige ou ajoute ce que tu veux.
        </p>

        {!produits && !erreur && <Skeleton rows={3} />}
        {erreur && (
          <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px]">
            Impossible de lire les recettes : {erreur}
          </div>
        )}
        {produits && produits.length === 0 && (
          <p className="text-[13.5px] text-ink-mute">Aucun gâteau d'Odoo n'utilise cet article.</p>
        )}

        {(produits || []).map(p => (
          <div key={p.tmplId} className="bg-white border border-line rounded-2xl p-3 mb-2.5">
            <div className="text-[14px] font-semibold mb-2">{propre(p.produit)}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {p.declinaisons.map(d => {
                const cle = `${p.tmplId}|${d.label}`
                return (
                  <label key={cle} className="flex items-center gap-2 bg-cream-warm border border-line rounded-xl px-2.5 py-2">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-bold truncate">{tailleLisible(d.label)}</span>
                      <span className="block text-[11px] text-ink-mute">{nbQ(d.qty, d.unite)} {d.unite} pièce</span>
                    </span>
                    <input type="number" min="0" inputMode="numeric"
                      value={qtes[cle] ?? 0}
                      onChange={e => setQtes(q => ({ ...q, [cle]: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                      className="w-14 text-center text-[17px] font-extrabold border border-line rounded-lg bg-white py-1 outline-none focus:border-bordeaux" />
                  </label>
                )
              })}
            </div>
          </div>
        ))}

        {produits && produits.length > 0 && (
          <>
            <div className="bg-[#EAF3DE] border border-[#cfe0b8] rounded-2xl px-3.5 py-3 flex items-baseline gap-2.5 flex-wrap">
              <b className="text-[26px] font-extrabold text-ok">{nb(Math.round(total))} {unite}</b>
              {unite === 'g' && total >= 1000 && (
                <span className="text-[13.5px] text-ok">soit {nb(Math.round(total / 10) / 100)} kg</span>
              )}
              {recette && recette.sortQty > 0 && (
                <span className="text-[13.5px] text-ok ml-auto">
                  ≈ {nb(fois)} fois la recette
                </span>
              )}
            </div>

            {recette && recette.sortQty > 0 && (
              <button onClick={() => onUtiliser(Math.max(0.5, fois))}
                disabled={total <= 0}
                className={'w-full mt-3 py-4 rounded-2xl text-[17px] font-extrabold ' +
                  (total > 0 ? 'bg-bordeaux text-cream' : 'bg-white border border-line text-ink-mute')}>
                Mettre {nb(Math.max(0.5, fois))} fois dans la fiche
              </button>
            )}
          </>
        )}

        <button onClick={onFermer}
          className="w-full mt-2 py-3.5 rounded-2xl bg-white border border-line text-ink-mute text-[15px] font-bold">
          fermer
        </button>
      </div>
    </div>
  )
}
