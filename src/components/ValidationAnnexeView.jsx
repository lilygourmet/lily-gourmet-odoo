import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { todayISO } from '../lib/dates'
import { loadFabProd } from '../lib/fabricationProd'
import { loadArbreAnnexe } from '../lib/fabricationAnnexe'
import { loadManques, validerDansOdoo, creerOfPrepa } from '../lib/fabrication'
import { canValiderAnnexe } from '../lib/auth'

// ====== « À valider Annexe » ======
// Ce que l'équipe a déclaré « c'est fait » dans Fabrication Annexe, rapproché
// de l'ordre de fabrication qu'Odoo tient déjà pour cet article. On confirme
// ici, une fois, en connaissance de cause. Réservé à perm_valider_annexe.
//
// Deux libertés demandées par Layla :
//  - corriger ce qui a VRAIMENT été consommé, ligne par ligne ;
//  - déclarer une production PARTIELLE : le reste repart en reliquat et
//    l'article revient tout seul dans « ce qu'il faut faire ».

const nb = v => Number(Number(v || 0).toFixed(2)).toLocaleString('fr-FR')
const propre = n => String(n || '')
  .replace(/^(E-|V-|MI-|N-|SM[.\- ]?|Sm[.\- ]?|SMT?[.\- ]?)\s*/i, '')
  .replace(/\s*(finition|production)\s*$/i, '').replace(/\s{2,}/g, ' ').trim()

export default function ValidationAnnexeView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(null)
  const [sel, setSel] = useState([])
  const [faites, setFaites] = useState({})     // ordre -> quantité vraiment produite
  const [notes, setNotes] = useState({})       // ordre -> { idLigne: consommé }
  const [ouvert, setOuvert] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [resultats, setResultats] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [creation, setCreation] = useState(null)
  const [tour, setTour] = useState(0)

  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const [arbre, journal] = await Promise.all([
          loadArbreAnnexe(),
          loadFabProd(todayISO(), 'annexe'),
        ])
        if (!vivant) return
        const ordres = arbre.ordres || {}
        // un ordre par article déclaré, sans doublon ; et ce qui n'a PAS
        // d'ordre reste visible, avec de quoi le créer sur place — sinon la
        // déclaration disparaissait et rien ne pouvait être validé.
        const parOrdre = new Map()
        const sans = new Map()
        for (const d of journal || []) {
          const o = ordres[d.article]
          if (o) {
            if (!parOrdre.has(o.name)) {
              parOrdre.set(o.name, { name: o.name, article: d.article, demande: o.qty, etat: o.state })
            }
          } else {
            const p = sans.get(d.article) || { article: d.article, qty: 0, unite: d.unite }
            p.qty += Number(d.qty) || 0
            sans.set(d.article, p)
          }
        }
        const base = [...parOrdre.values()]
        const orphelins = [...sans.values()].map(p => ({
          name: 'sans-ordre:' + p.article, article: p.article, sansOrdre: true,
          demande: Math.round(p.qty * 100) / 100, unite: p.unite, manques: [], lignes: [],
        }))
        if (!base.length) { setLignes(orphelins); return }
        const detail = await loadManques(base.map(x => x.name))
        if (!vivant) return
        const parNom = new Map(detail.map(d => [d.name, d]))
        const out = [...base.map(b => ({ ...b, ...(parNom.get(b.name) || { manques: [], lignes: [] }) })), ...orphelins]
        setLignes(out)
        setSel(out.filter(x => !x.sansOrdre).map(x => x.name))
        setFaites(Object.fromEntries(out.map(x => [x.name, x.demande])))
      } catch (e) { if (vivant) setErreur(e.message || String(e)) }
    })()
    return () => { vivant = false }
  }, [tour])

  const choisis = useMemo(() => (lignes || []).filter(l => sel.includes(l.name)), [lignes, sel])
  const prets = choisis.filter(l => !l.manques.length && !l.sansOrdre)
  const bloques = choisis.filter(l => l.manques.length && !l.sansOrdre)
  const manquesCumules = [...new Map(bloques.flatMap(l => l.manques)
    .map(m => [m.produit, m])).values()]

  // Produire 20 sur 31 ne consomme pas la matière de 31 : chaque composant
  // suit la proportion, sauf celui que l'utilisateur a corrigé à la main.
  const aConsommer = (l, c) => {
    const saisi = (notes[l.name] || {})[c.id]
    if (saisi !== undefined && saisi !== '') return Number(saisi)
    const faite = faites[l.name] ?? l.demande
    const part = l.demande > 0 ? faite / l.demande : 1
    return Math.round(c.besoin * part * 100) / 100
  }

  const basculer = n => setSel(s => (s.includes(n) ? s.filter(x => x !== n) : [...s, n]))
  const poser = (n, v, max) =>
    setFaites(f => ({ ...f, [n]: Math.max(0, Math.min(max, Number(v) || 0)) }))

  async function creer(l) {
    if (creation) return
    setCreation(l.name)
    try {
      const r = await creerOfPrepa(l.article, faites[l.name] ?? l.demande, user?.id, [], l.unite, 'annexe')
      if (r && r.error) toast.error(r.error)
      else if (r && r.test) toast.success('Mode test : aucun ordre créé dans Odoo')
      else if (r && r.name) { toast.success('Ordre ' + r.name + ' créé'); setTour(t => t + 1) }
    } catch (e) { toast.error(e.message || String(e)) }
    setCreation(null)
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
    try {
      setResultats(await validerDansOdoo(cibles, forcer, user?.id, quantites, null, produits))
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
      <div className="max-w-[720px] mx-auto px-4 py-5 pb-28">

        <h1 className="font-fraunces italic text-[26px] font-medium">À valider — Annexe</h1>
        <p className="text-[13px] text-ink-mute mb-4 leading-snug">
          Ce que l'annexe a marqué « c'est fait » aujourd'hui et qui attend sa confirmation dans
          Odoo. Ce qui n'a pas été produit repart en reliquat.
        </p>

        {erreur && (
          <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3">
            Impossible de lire Odoo : {erreur}
          </div>
        )}
        {!lignes && !erreur && <Skeleton rows={4} />}

        {lignes && !lignes.length && (
          <div className="bg-white border border-dashed border-line rounded-2xl py-8 text-center text-ink-mute text-[14px]">
            Rien à valider pour le moment.<br />
            <span className="text-[12.5px]">L'équipe n'a rien déclaré aujourd'hui, ou aucun article déclaré n'a d'ordre ouvert dans Odoo.</span>
          </div>
        )}

        {lignes && lignes.length > 0 && (
          <>
            <div className="flex items-center gap-3 text-[12.5px] mb-3">
              <span><b>{choisis.length}</b> sélectionnés sur <b>{lignes.length}</b></span>
              <button onClick={() => setSel(lignes.map(l => l.name))}
                className="text-bordeaux font-bold underline">tout cocher</button>
              <button onClick={() => setSel([])}
                className="text-bordeaux font-bold underline">tout décocher</button>
              <span className="ml-auto text-ink-mute">
                {prets.length} prêts · {bloques.length} bloqués
                {lignes.filter(l => l.sansOrdre).length > 0 && ' · ' + lignes.filter(l => l.sansOrdre).length + ' sans ordre'}
              </span>
            </div>

            {lignes.map(l => {
              if (l.sansOrdre) {
                return (
                  <div key={l.name}
                    className="bg-white border border-line rounded-2xl mb-2.5 border-l-4 border-l-[#b58f3c] px-3.5 py-3">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <b className="text-[15px]">{propre(l.article)}</b>
                      <span className="text-[10px] font-extrabold uppercase tracking-wide rounded-full px-2 py-0.5 bg-[#FBF3DF] text-[#854F0B]">
                        aucun ordre
                      </span>
                    </div>
                    <p className="text-[11.5px] text-ink-mute mt-1 leading-snug">
                      Déclaré {nb(l.demande)} {l.unite} — Odoo n'a pas d'ordre ouvert pour cet article
                      à l'annexe. Sans ordre, rien à valider.
                    </p>
                    <button onClick={() => creer(l)} disabled={!!creation}
                      className={'w-full mt-2 rounded-xl px-3 py-2.5 text-[13px] font-extrabold border '
                        + (creation === l.name
                          ? 'border-line bg-cream-warm text-ink-mute'
                          : 'border-[#b58f3c] text-[#854F0B] bg-[#FBF3DF]')}>
                      {creation === l.name ? 'Création en cours…'
                        : `Créer l'ordre de ${nb(l.demande)} ${l.unite || ''}`}
                    </button>
                  </div>
                )
              }
              const bloque = l.manques.length > 0
              const faite = faites[l.name] ?? l.demande
              const reste = Math.max(0, l.demande - faite)
              return (
                <div key={l.name}
                  className={'bg-white border border-line rounded-2xl mb-2.5 border-l-4 '
                    + (bloque ? 'border-l-[#d9a441]' : 'border-l-[#7ba05b]')}>
                  <div className="flex items-start gap-3 px-3.5 py-3">
                    <input type="checkbox" checked={sel.includes(l.name)}
                      onChange={() => basculer(l.name)}
                      className="w-[22px] h-[22px] shrink-0 mt-0.5 accent-bordeaux" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <b className="text-[15px]">{propre(l.article)}</b>
                        <span className="text-[11px] font-mono text-ink-mute bg-cream-warm rounded px-1.5">{l.name}</span>
                        <span className={'text-[10px] font-extrabold uppercase tracking-wide rounded-full px-2 py-0.5 '
                          + (bloque ? 'bg-[#FFF7E0] text-[#854F0B]' : 'bg-[#EAF3DE] text-ok')}>
                          {bloque ? 'il manque' : 'prêt'}
                        </span>
                      </div>
                      {bloque && (
                        <p className="text-[11.5px] text-danger mt-1 leading-snug">
                          {l.manques.map(m => propre(m.produit) + ' — ' + nb(m.manque) + ' ' + m.unite).join(' · ')}
                        </p>
                      )}
                      <button onClick={() => setOuvert(o => (o === l.name ? null : l.name))}
                        className="text-[11.5px] text-bordeaux font-bold underline mt-1">
                        {ouvert === l.name ? 'masquer' : 'corriger'} ce qui a été consommé
                      </button>
                    </div>
                    <div className="text-right shrink-0">
                      <input type="number" min="0" max={l.demande} value={faite}
                        onChange={e => poser(l.name, e.target.value, l.demande)}
                        className="sans-fleches w-[72px] border-2 border-line rounded-[10px] py-1 text-center text-[19px] font-extrabold bg-white outline-none focus:border-bordeaux" />
                      <span className="block text-[10.5px] text-ink-mute font-bold mt-0.5">
                        produits sur {nb(l.demande)}
                      </span>
                      {reste > 0 && (
                        <>
                          <span className="block text-[10.5px] font-extrabold text-[#854F0B]">
                            reliquat : {nb(reste)}
                          </span>
                          <span className="block text-[10px] text-ink-mute leading-tight mt-0.5">
                            matière ajustée
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {ouvert === l.name && (
                    <div className="border-t border-[#f4eee2] px-3.5 py-2">
                      {!(l.lignes || []).length && (
                        <p className="text-[12px] text-ink-mute py-1">Odoo ne donne aucun composant pour cet ordre.</p>
                      )}
                      {(l.lignes || []).map(c => (
                        <div key={c.id} className="flex items-center gap-2.5 py-1.5 border-b border-[#f7f2e8] last:border-0">
                          <span className="flex-1 min-w-0 text-[13px]">
                            {propre(c.produit)}
                            <span className="block text-[10.5px] text-ink-mute">
                              recette : {nb(c.besoin)} {c.unite}
                              {c.dispo !== null && ' · en stock ' + nb(c.dispo)}
                              {faite !== l.demande && (notes[l.name] || {})[c.id] === undefined
                                && ' · ajusté pour ' + nb(faite)}
                            </span>
                          </span>
                          <input type="number" min="0"
                            value={aConsommer(l, c)}
                            onChange={e => setNotes(n => ({
                              ...n, [l.name]: { ...(n[l.name] || {}), [c.id]: e.target.value },
                            }))}
                            className="sans-fleches w-[82px] border border-line rounded-lg py-1 text-center text-[14px] font-bold bg-white outline-none focus:border-bordeaux" />
                          <span className="text-[11px] text-ink-mute w-[26px]">{c.unite}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {manquesCumules.length > 0 && (
              <div className="bg-[#FFF7E0] border border-[#e6d3a3] rounded-2xl px-3.5 py-3 mb-3 text-[12.5px] text-[#854F0B]">
                <b className="block text-[10.5px] uppercase tracking-wide mb-1">Ce qui manque en tout</b>
                {manquesCumules.map(m => propre(m.produit) + ' — ' + nb(m.manque) + ' ' + m.unite).join(' · ')}
              </div>
            )}

            <button onClick={() => lancer(false)} disabled={envoi || !prets.length}
              className={'w-full py-4 rounded-2xl text-[16px] font-extrabold text-white mb-2 '
                + (envoi || !prets.length ? 'bg-[#b9c7ae]' : 'bg-ok')}>
              {envoi ? 'Envoi…' : `✓ Valider dans Odoo — ${prets.length} ordre${prets.length > 1 ? 's' : ''} prêt${prets.length > 1 ? 's' : ''}`}
            </button>
            <p className="text-[11.5px] text-ink-mute text-center mb-3 leading-snug">
              Ce qui n'a pas été produit repart en <b className="text-[#854F0B]">reliquat</b> :
              l'ordre reste ouvert et l'article revient dans « ce qu'il faut faire ».
            </p>

            {bloques.length > 0 && (
              <button onClick={() => lancer(true)} disabled={envoi}
                className="w-full py-3 rounded-2xl border-2 border-[#e6d3a3] bg-white text-[#854F0B] text-[14px] font-extrabold">
                Forcer les {bloques.length} bloqués malgré les manques
              </button>
            )}
          </>
        )}

        {resultats && (
          <div className="mt-4 bg-white border border-line rounded-2xl overflow-hidden">
            <div className="bg-cream-warm px-3.5 py-2 text-[10.5px] font-extrabold uppercase tracking-wide text-ink-soft border-b border-line">
              Résultat
            </div>
            {resultats.map(r => (
              <div key={r.name} className="flex items-baseline gap-2 px-3.5 py-2 border-b border-[#f4eee2] last:border-0 text-[13px]">
                <span className={'font-extrabold ' + (r.ok ? 'text-ok' : 'text-danger')}>{r.ok ? '✓' : '✕'}</span>
                <span className="font-mono text-[11.5px]">{r.name}</span>
                <span className="text-ink-mute">{r.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
