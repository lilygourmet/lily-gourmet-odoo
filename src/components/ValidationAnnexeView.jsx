import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { todayISO } from '../lib/dates'
import { loadFabProd, delFabProd } from '../lib/fabricationProd'
import { loadArbreAnnexe } from '../lib/fabricationAnnexe'
import { loadManques, validerDansOdoo, annulerOrdre, loadSaisies, saveSaisies } from '../lib/fabrication'
import { canValiderAnnexe } from '../lib/auth'
import { AjoutIngredient } from './ValidationView'

// ====== « À valider Annexe » : la page dédiée ======
// Ce que l'annexe a marqué « c'est fait » attend ici sa confirmation dans Odoo.
// On ne force jamais sans une demande explicite. Réservée à perm_valider_annexe.
//
// L'écran est le JUMEAU de « À valider CD- » (ValidationView.jsx) : même mise en
// page, mêmes mots, mêmes gestes — seuls changent le titre, les articles, et
// deux choses propres à l'annexe :
//   - la quantité RÉELLEMENT produite, le reste repartant en reliquat ;
//   - un article déclaré dont l'ordre n'a pas pu être créé, signalé sans être
//     effaçable : ici on valide, on ne lance jamais de fabrication.

// Quantités produites et consommations corrigées : gardées côté serveur, donc
// retrouvées sur un autre appareil, et effacées à la validation.
const CLE_SAISIES = 'valider_annexe_saisies'

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const norm = u => String(u || '').toLowerCase().replace(/^units?$/, 'u')
// A l'atelier on ne pese pas 1 234,56 g : les quantites s'affichent entieres.
const qte = (q, u) => (norm(u) === 'kg'
  ? `${nb(Math.round(q * 1000))} g`
  : `${nb(Math.round(q))} ${norm(u) === 'g' ? 'g' : u}`)
// Les articles de l'annexe portent d'autres préfixes que ceux du cake design.
const propre = n => String(n || '')
  .replace(/^(E-|V-|MI-|N-|SM[.\- ]?|Sm[.\- ]?|SMT?[.\- ]?)\s*/i, '')
  .replace(/\s*(finition|production)\s*$/i, '').replace(/\s{2,}/g, ' ').trim()

const sansLesNoms = (obj, noms) =>
  Object.fromEntries(Object.entries(obj).filter(([n]) => !noms.has(n)))

export default function ValidationAnnexeView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(null)
  const [sel, setSel] = useState([])
  const [erreur, setErreur] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [resultats, setResultats] = useState(null)
  const [confirmer, setConfirmer] = useState(false)
  const [tour, setTour] = useState(0)
  const [ouvert, setOuvert] = useState(null)      // l'ordre dont on note les consommations
  const [faites, setFaites] = useState({})        // ordre -> quantité vraiment produite
  const [notes, setNotes] = useState({})          // { ordre: { idLigne: quantité } }
  const [ajouts, setAjouts] = useState({})        // { ordre: [ingrédients ajoutés à la main] }

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const [arbre, journal, gardees] = await Promise.all([
          loadArbreAnnexe(tour > 0),   // après une création : sans le cache
          loadFabProd(todayISO(), 'annexe'),
          loadSaisies(CLE_SAISIES).catch(() => ({})),
        ])
        if (!vivant) return
        const ordres = arbre.ordres || {}
        // un ordre par article déclaré, sans doublon ; et ce qui n'a PAS
        // d'ordre reste visible et signalé — sinon du travail déclaré
        // disparaîtrait sans que personne le sache.
        const parOrdre = new Map()
        const sans = new Map()
        const ouvertsParNom = new Map(Object.values(ordres).map(o => [o.name, o]))
        // ⚠️ Odoo COUPE un ordre en deux dès qu'on valide moins que prévu :
        // WHPDX/MO/21178 devient 21178-001 (ce qui est fait) + 21178-002 (le
        // reste), et le numéro d'origine n'existe plus. L'app le cherchait sous
        // son ancien nom, ne le trouvait pas, en concluait qu'il était validé —
        // et le reliquat disparaissait de l'écran. Vécu le 2026-09-03 :
        // 93 « SM- cadre citron meringuée » perdus de vue.
        const morceauOuvert = new Map()
        for (const o of Object.values(ordres)) {
          const coupe = String(o.name || '').match(/^(.+)-\d+$/)
          if (coupe && !morceauOuvert.has(coupe[1])) morceauOuvert.set(coupe[1], o)
        }
        for (const d of journal || []) {
          // La déclaration sait à quel ordre elle se rattache. S'il n'est plus
          // ouvert, c'est qu'il a été validé (ou annulé) : il n'y a plus rien à
          // faire — sans ça l'écran réclamait d'en créer un deuxième pour du
          // travail déjà validé.
          if (d.ordre) {
            // On accepte le morceau resté ouvert quand Odoo a coupé l'ordre.
            const encoreLa = ouvertsParNom.get(d.ordre) || morceauOuvert.get(d.ordre)
            if (!encoreLa) continue
            // La clé est le nom RÉEL d'aujourd'hui : c'est lui qu'on enverra à
            // Odoo, l'ancien numéro n'existe plus.
            if (!parOrdre.has(encoreLa.name)) {
              parOrdre.set(encoreLa.name, { name: encoreLa.name, article: d.article, demande: encoreLa.qty, etat: encoreLa.state })
            }
            continue
          }
          const o = ordres[d.article]
          if (o) {
            if (!parOrdre.has(o.name)) {
              parOrdre.set(o.name, { name: o.name, article: d.article, demande: o.qty, etat: o.state })
            }
          } else {
            const p = sans.get(d.article) || { article: d.article, qty: 0, unite: d.unite, ids: [] }
            p.qty += Number(d.qty) || 0
            p.ids.push(d.id)
            sans.set(d.article, p)
          }
        }
        const base = [...parOrdre.values()]
        const orphelins = [...sans.values()].map(p => ({
          name: 'sans-ordre:' + p.article, article: p.article, sansOrdre: true, ids: p.ids,
          demande: Math.round(p.qty * 100) / 100, unite: p.unite, manques: [], lignes: [],
        }))
        if (!base.length) { setLignes(orphelins); return }
        const detail = await loadManques(base.map(x => x.name))
        if (!vivant) return
        const parNom = new Map(detail.map(d => [d.name, d]))
        const out = [...base.map(b => ({ ...b, ...(parNom.get(b.name) || { manques: [], lignes: [] }) })), ...orphelins]
        setLignes(out)
        setSel(out.filter(x => !x.sansOrdre).map(x => x.name))
        // On garde ce qui a déjà été tapé (plafonné à la demande, qui a pu
        // baisser dans Odoo) et on ne remplit par la recette que le reste.
        const vivants = new Set(out.map(x => x.name))
        // Ce qui est tapé à l'instant l'emporte sur ce qui vient du serveur.
        setFaites(f => {
          const dep = { ...(gardees.faites || {}), ...f }
          return Object.fromEntries(out.map(x =>
            [x.name, dep[x.name] === undefined ? x.demande : Math.min(x.demande, dep[x.name])]))
        })
        // Les ordres partis de la liste (validés ailleurs, annulés) n'ont plus
        // de saisie à garder : sinon elle ressortirait des mois plus tard.
        setNotes(n => {
          const dep = { ...(gardees.notes || {}), ...n }
          return Object.fromEntries(Object.entries(dep).filter(([nom]) => vivants.has(nom)))
        })
        setAjouts(a => {
          const dep = { ...(gardees.ajouts || {}), ...a }
          return Object.fromEntries(Object.entries(dep).filter(([nom]) => vivants.has(nom)))
        })
      } catch (e) { if (vivant) setErreur(e.message || String(e)) }
    })()
    return () => { vivant = false }
  }, [tour])

  // Enregistrement retardé : pas un appel par touche du clavier, et jamais avant
  // d'avoir la liste (on écraserait avec du vide).
  useEffect(() => {
    if (!lignes) return undefined
    const t = setTimeout(() => { saveSaisies(CLE_SAISIES, { faites, notes, ajouts }).catch(() => {}) }, 900)
    return () => clearTimeout(t)
  }, [lignes, faites, notes, ajouts])

  const choisis = useMemo(() => (lignes || []).filter(l => sel.includes(l.name)), [lignes, sel])
  const prets = choisis.filter(l => !l.manques.length && !l.sansOrdre)
  const bloques = choisis.filter(l => l.manques.length && !l.sansOrdre)
  const manquesCumules = [...new Map(bloques.flatMap(l => l.manques).map(m => [m.produit, m])).values()]

  // Produire 20 sur 31 ne consomme pas la matière de 31 : chaque composant
  // suit la proportion, sauf celui qui a été corrigé à la main.
  const aConsommer = (l, c) => {
    const saisi = (notes[l.name] || {})[c.id]
    if (saisi !== undefined && saisi !== '') return Number(saisi)
    const faite = faites[l.name] ?? l.demande
    const part = l.demande > 0 ? faite / l.demande : 1
    return Math.round(c.besoin * part * 100) / 100
  }

  const poser = (n, v, max) =>
    setFaites(f => ({ ...f, [n]: Math.max(0, Math.min(max, Number(v) || 0)) }))

  // Annuler l'ordre dans Odoo. Demande délibérée : même un ordre lancé par
  // Odoo lui-même part. Il n'est pas effacé, il passe en « annulé ».
  async function annuler(l) {
    const ok = await confirmDialog(
      `Annuler l'ordre ${l.name} — ${propre(l.article)} ?\n\n`
      + "Il passera en « annulé » dans Odoo et sortira de cette liste. Rien ne sera fabriqué.",
      { confirmLabel: "Annuler l'ordre", danger: true })
    if (!ok) return
    try {
      const r = await annulerOrdre([l.name], user?.id)
      if (r && r.annules) {
        setLignes(v => (v || []).filter(x => x.name !== l.name))
        setSel(v => v.filter(n => n !== l.name))
        toast.success(l.name + ' annulé dans Odoo')
      } else toast.error((r && r.refuses && r.refuses[0]) || "Odoo a refusé l'annulation")
    } catch (e) { toast.error(e.message || String(e)) }
  }

  // Une déclaration dont l'ordre n'a jamais pu être créé : elle ne mène nulle
  // part. On la retire, sans rien toucher dans Odoo (il n'y a rien à toucher).
  async function retirerDeclaration(l) {
    const ok = await confirmDialog(
      `Retirer la déclaration « ${propre(l.article)} » (${qte(l.demande, l.unite)}) ?\n\n`
      + "Rien n'existe dans Odoo pour elle. Elle disparaîtra simplement de cette liste.",
      { confirmLabel: 'Retirer', danger: true })
    if (!ok) return
    try {
      for (const id of l.ids || []) await delFabProd(id)
      setLignes(v => (v || []).filter(x => x.name !== l.name))
      toast.success('Déclaration retirée.')
    } catch (e) { toast.error(e.message || String(e)) }
  }

  async function lancer(forcer) {
    const cibles = (forcer ? bloques : prets).map(l => l.name)
    if (!cibles.length || envoi) return
    setEnvoi(true)
    const produits = {}
    const quantites = {}
    for (const n of cibles) {
      produits[n] = faites[n]
      const l = (lignes || []).find(x => x.name === n)
      const conv = {}
      for (const c of (l?.lignes || [])) {
        const q = aConsommer(l, c)
        if (q >= 0) conv[c.id] = q
      }
      if (Object.keys(conv).length) quantites[n] = conv
    }
    // Ce que la recette ne prévoyait pas, et qui a pourtant été utilisé.
    const enPlus = {}
    for (const n of cibles) {
      const liste = (ajouts[n] || []).filter(a => Number(a.qty) > 0)
      if (liste.length) enPlus[n] = liste.map(a => ({ produit: a.produit, uom: a.uom, qty: Number(a.qty) }))
    }
    try {
      const res = await validerDansOdoo(cibles, forcer, user?.id, quantites, enPlus, produits)
      setResultats(res)
      // Ce qui est validé n'a plus rien à faire dans la liste. Ce qui a échoué
      // y reste, avec son message : c'est encore à traiter.
      const faits = new Set(res.filter(r => r.ok).map(r => r.name))
      if (faits.size) {
        setLignes(l => (l || []).filter(x => !faits.has(x.name)))
        setSel(s2 => s2.filter(n => !faits.has(n)))
        setFaites(f => sansLesNoms(f, faits))
        setNotes(n => sansLesNoms(n, faits))
        setAjouts(a => sansLesNoms(a, faits))
        toast.success(faits.size + (faits.size > 1 ? ' ordres validés' : ' ordre validé') + ' dans Odoo')
      }
    } catch (e) { toast.error(e.message || String(e)) }
    setEnvoi(false)
  }

  // Écrire dans Odoo est irréversible : l'écran ne s'ouvre pas sur un simple lien.
  if (!canValiderAnnexe(user)) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
        <p className="max-w-[520px] mx-auto mt-10 px-4 text-center text-[14px] text-ink-mute">
          Cet écran valide des fabrications dans Odoo. Il demande la permission « Valider Annexe ».
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[660px] mx-auto px-4 py-5">
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <h1 className="font-fraunces italic text-[26px] font-medium">À valider Annexe</h1>
          <button onClick={() => { setLignes(null); setResultats(null); setTour(v => v + 1) }}
            className="ml-auto bg-white border border-line rounded-xl px-3 py-2 text-[13px] text-ink-soft">↻ Actualiser</button>
        </div>
        <p className="text-[12.5px] text-ink-mute mb-3">
          Ce que l'annexe a marqué « c'est fait » et qui attend sa confirmation dans Odoo. Ce qui n'a pas été produit repart en reliquat.
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
                  {r.reliquat && ` · reste ${nb(r.reliquat)} en reliquat`}
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
            <span className="text-[12.5px]">Ce que l'équipe marque « c'est fait » dans Fabrication Annexe arrive ici.</span>
          </div>
        )}

        {lignes && !resultats && !envoi && lignes.map(l => {
          // Déclaré, mais aucun ordre ouvert dans Odoo. L'ordre se crée au moment
          // du « c'est fait » dans Fabrication Annexe, jamais ici : cet écran
          // valide, il ne lance pas de fabrication. On le signale quand même —
          // sans ça, du travail déclaré disparaîtrait sans que personne le sache.
          if (l.sansOrdre) {
            return (
              <div key={l.name} className="border border-line rounded-xl mb-2 overflow-hidden border-l-4 border-l-[#d9a441]">
                <div className="flex items-center gap-3 px-3.5 py-3 bg-white">
                  <div className="flex-1 min-w-0">
                    <div className="text-[16px] font-bold">{propre(l.article)} — {qte(l.demande, l.unite)}</div>
                    <div className="text-[11.5px] text-ink-mute">
                      L'ordre n'a pas pu être créé au moment du « c'est fait ». Refais-le dans Fabrication Annexe.
                    </div>
                  </div>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap bg-[#FFF7E0] text-[#854F0B]">
                    sans ordre
                  </span>
                </div>
                <div className="border-t border-line px-3.5 py-2 flex">
                  <button onClick={() => retirerDeclaration(l)}
                    className="ml-auto rounded-lg px-3 py-2 text-[12.5px] font-bold border border-danger bg-white text-danger">
                    retirer cette déclaration
                  </button>
                </div>
              </div>
            )
          }

          const on = sel.includes(l.name)
          const faite = faites[l.name] ?? l.demande
          const reste = Math.max(0, l.demande - faite)
          return (
            <div key={l.name} className={'border border-line rounded-xl mb-2 overflow-hidden border-l-4 ' +
              (l.manques.length ? 'border-l-[#d9a441]' : 'border-l-[#7ba05b]')}>
              <div className="flex items-center gap-3 px-3.5 py-3 bg-white">
                <input type="checkbox" checked={on} className="w-6 h-6 accent-[#993556] flex-shrink-0"
                  onChange={e => setSel(v => (e.target.checked ? [...v, l.name] : v.filter(x => x !== l.name)))} />
                <div className="flex-1 min-w-0">
                  <div className="text-[16px] font-bold">{propre(l.article)} — {qte(l.demande, l.unite)}</div>
                  <div className="text-[11px] text-ink-mute font-mono">{l.name}{l.lieu ? ' · ' + l.lieu : ''}</div>
                  {l.quand && <div className={'text-[11.5px] ' + (String(l.quand).slice(0, 10) > new Date().toISOString().slice(0, 10) ? 'text-[#854F0B] font-bold' : 'text-ink-mute')}>
                    prévu le {new Date(String(l.quand).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                  </div>}
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

              {/* Ce qui a vraiment été produit : le reste repart en reliquat */}
              <div className="border-t border-dashed border-line bg-[#fffdf7] px-3.5 py-2 flex items-center gap-2.5">
                <span className="flex-1 text-[12.5px] text-ink-soft">produit sur {nb(l.demande)}</span>
                <input type="number" min="0" max={l.demande} step="any" inputMode="decimal" value={faite}
                  onChange={e => poser(l.name, e.target.value, l.demande)}
                  className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                {reste > 0 && (
                  <span className="text-[11.5px] font-bold text-[#854F0B] whitespace-nowrap">reliquat {nb(reste)}</span>
                )}
              </div>

              {/* Noter ce qui a vraiment été consommé, avant de valider */}
              {(l.lignes || []).length > 0 && (
                <div className="border-t border-line">
                  <button onClick={() => setOuvert(ouvert === l.name ? null : l.name)}
                    className="w-full text-left px-3.5 py-2 text-[12.5px] text-bordeaux font-semibold">
                    {ouvert === l.name ? '▾' : '▸'} noter ce qui a été consommé
                  </button>
                  {ouvert === l.name && (
                    <div className="px-3.5 pb-3">
                      <p className="text-[12px] text-ink-mute mb-2">
                        Corrige les quantités si tu n'as pas utilisé exactement la recette.
                        Ferme sans rien changer pour garder ce qui est prévu.
                      </p>
                      {l.lignes.map(c => (
                        <div key={c.id} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-[#f0e8db] last:border-0">
                          <span className="flex-1 text-[13.5px] min-w-0">
                            {propre(c.produit)}
                            <span className="block text-[11px] text-ink-mute">
                              recette : {nb(c.besoin)} {c.unite}
                              {faite !== l.demande && (notes[l.name] || {})[c.id] === undefined
                                && ' · ajusté pour ' + nb(faite)}
                            </span>
                          </span>
                          <input type="number" min="0" step="any" inputMode="decimal" value={aConsommer(l, c)}
                            onChange={e => setNotes(n => ({
                              ...n, [l.name]: { ...(n[l.name] || {}), [c.id]: e.target.value },
                            }))}
                            className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                          <span className="text-[12px] text-ink-mute w-[26px]">{c.unite}</span>
                        </div>
                      ))}

                      {(ajouts[l.name] || []).map((a, i) => (
                        <div key={'a' + i} className="flex items-center gap-2.5 py-1.5 border-b border-dashed border-[#f0e8db]">
                          <span className="flex-1 text-[13.5px] min-w-0 text-bordeaux">{propre(a.nom)}</span>
                          <input type="number" min="0" step="any" inputMode="decimal" value={a.qty}
                            onChange={e => setAjouts(m => ({
                              ...m,
                              [l.name]: (m[l.name] || []).map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)),
                            }))}
                            className="w-[92px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                          <span className="text-[12px] text-ink-mute w-[26px]">{a.unite}</span>
                          <button onClick={() => setAjouts(m => ({
                            ...m, [l.name]: (m[l.name] || []).filter((_, j) => j !== i),
                          }))} className="text-ink-mute text-[15px] px-1" title="retirer">✕</button>
                        </div>
                      ))}

                      <AjoutIngredient onChoisir={a => setAjouts(m => ({
                        ...m,
                        [l.name]: [...(m[l.name] || []), { produit: a.id, nom: a.nom, uom: a.uom, unite: a.unite, qty: '' }],
                      }))} />

                      <div className="flex gap-2 mt-2.5 flex-wrap">
                        <button onClick={() => setOuvert(null)}
                          className="rounded-lg px-3 py-2 text-[12.5px] font-bold border border-line bg-white text-ink-soft">
                          fermer sans changer
                        </button>
                        <button onClick={() => annuler(l)}
                          className="ml-auto rounded-lg px-3 py-2 text-[12.5px] font-bold border border-danger bg-white text-danger">
                          annuler l'ordre
                        </button>
                        {(notes[l.name] || ajouts[l.name]) && (
                          <button onClick={() => {
                            setNotes(n => { const s2 = { ...n }; delete s2[l.name]; return s2 })
                            setAjouts(m => { const s2 = { ...m }; delete s2[l.name]; return s2 })
                          }}
                            className="rounded-lg px-3 py-2 text-[12.5px] font-bold border border-line bg-white text-ink-mute">
                            revenir à la recette
                          </button>
                        )}
                      </div>
                    </div>
                  )}
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
            <p className="text-[11.5px] text-ink-mute text-center mt-3">
              Ce qui n'a pas été produit repart en <b className="text-[#854F0B]">reliquat</b> : l'ordre reste ouvert et l'article revient dans « ce qu'il faut faire ».
            </p>
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
