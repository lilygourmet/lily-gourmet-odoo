import { useState, useEffect } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadPrepa, lancerPrepa, setFait } from '../lib/fabrication'

// ====== Fabrication d'une préparation (glaçage royal, pâte à sucre) ======
// Ces articles n'ont ni règle mini/maxi ni ordre dans Odoo : c'est l'équipe qui
// décide combien de tournées elle fait. « C'est fait » crée l'ordre de
// fabrication dans Odoo ; il part ensuite dans la page « À valider ».
// Tout est affiché en grammes.

const nb = v => Math.round(Number(v || 0)).toLocaleString('fr-FR')
const propre = n => String(n || '').replace(/^MP-\s*/i, '').replace(/^SM\.?\s*/i, '').trim()

function Titre({ num, children }) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-2.5">
      <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-bordeaux">{num} · {children}</span>
      <span className="flex-1 h-0.5 bg-line" />
    </div>
  )
}

// Ce qui restait au moment de la remise à zéro. La toute première fois, ce n'est
// pas de la consommation mesurée : c'est du stock accumulé depuis toujours.
function motRemise(r) {
  if (r.premiere) return `${nb(r.consomme)} g d'ancien stock nettoyé — on repart de zéro`
  return r.jours
    ? `${nb(r.consomme)} g consommés en ${r.jours} jour${r.jours > 1 ? 's' : ''} — stock remis à zéro`
    : `${nb(r.consomme)} g consommés — stock remis à zéro`
}

export default function PrepaView({ quoi, user, onLogout, onNavigate, activeView }) {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [n, setN] = useState(1)
  const [envoi, setEnvoi] = useState(false)
  const [faits, setFaits] = useState([])
  // couleurs retenues pour cette tournée : { id de l'article : grammes }
  const [couleurs, setCouleurs] = useState({})
  // « Rien » = pâte blanche : un choix explicite, pour qu'on ne lance pas une
  // tournée en ayant simplement oublié de cocher une couleur
  const [blanche, setBlanche] = useState(false)

  useEffect(() => {
    let vivant = true
    loadPrepa(quoi)
      .then(d => { if (!vivant) return; if (d.erreur) setErreur(d.erreur); else setData(d) })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    return () => { vivant = false }
  }, [quoi])

  const tournee = (data && data.tournee) || 0
  const recette = (data && data.recette) || []
  const colorants = recette.filter(r => r.colorant)
  const base = recette.filter(r => !r.colorant)
  // ce qu'il faut vraiment : la base au prorata des tournées, et seulement les
  // couleurs retenues, à la quantité saisie
  const besoins = [
    ...base.map(r => ({ ...r, besoin: r.qty * n })),
    ...colorants.filter(r => couleurs[r.id] > 0).map(r => ({ ...r, besoin: couleurs[r.id] })),
  ]
  const manque = besoins.filter(r => r.stock !== null && r.stock < r.besoin - 0.001)
  // rien ne part tant que la couleur n'est pas choisie (ou « Rien » cochée)
  const choixFait = colorants.length === 0 || blanche || Object.values(couleurs).some(v => v > 0)

  async function faire() {
    setEnvoi(true)
    try {
      const of = await lancerPrepa(quoi, n, couleurs, user?.id)
      await setFait({ name: of.name, produit: of.produit, qty: of.qty, quand: new Date().toISOString() }, true, user?.id)
      setFaits(f => [{ ...of, heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }, ...f])
      setN(1); setCouleurs({}); setBlanche(false)
      if (of.remise) toast.success(motRemise(of.remise))
      toast.success(`Ordre ${of.name} créé — en attente de validation`)
    } catch (e) { toast.error('Impossible de créer l\'ordre : ' + (e.message || e)) }
    setEnvoi(false)
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[600px] mx-auto px-4 py-5">
        <h1 className="font-fraunces italic text-[26px] font-medium">Fabrication {data ? data.titre : ''}</h1>
        <p className="text-[13px] text-ink-mute mb-2">
          {data ? data.produit : ''}{tournee ? ` · 1 tournée = ${nb(tournee)} g` : ''}
        </p>

        {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] my-3">{erreur}</div>}
        {!data && !erreur && <Skeleton rows={4} />}

        {data && (
          <>
            <Titre num={1}>Combien j'en fais</Titre>
            <div className="flex items-center gap-3.5 bg-white border border-line rounded-2xl p-4 mb-2">
              <button onClick={() => setN(v => Math.max(1, v - 1))}
                className="w-[52px] h-[52px] rounded-2xl border border-line bg-cream-warm text-[26px] font-bold">−</button>
              <div className="flex-1 text-center">
                <b className="block text-[30px] font-extrabold leading-tight">{n}</b>
                <span className="text-[13px] text-ink-mute">{n > 1 ? 'tournées' : 'tournée'} · {nb(n * tournee)} g</span>
              </div>
              <button onClick={() => setN(v => Math.min(50, v + 1))}
                className="w-[52px] h-[52px] rounded-2xl border border-line bg-cream-warm text-[26px] font-bold">+</button>
            </div>

            <Titre num={2}>Il te faut</Titre>
            {base.map(r => {
              const besoin = r.qty * n
              const ok = r.stock === null || r.stock >= besoin - 0.001
              return (
                <div key={r.produit} className="flex items-center gap-3 bg-white border border-line rounded-xl px-3.5 py-3 mb-1.5">
                  <b className="text-[18px] min-w-[92px]">{nb(besoin)} g</b>
                  <span className="flex-1 text-[15px]">{propre(r.produit)}</span>
                  <span className={'text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ' +
                    (ok ? 'bg-[#EAF3DE] text-ok' : 'bg-[#FCEEE8] text-danger')}>
                    {r.stock === null ? 'stock inconnu' : ok ? `stock ${nb(r.stock)} g` : `il manque ${nb(besoin - r.stock)} g`}
                  </span>
                </div>
              )
            })}

            {colorants.length > 0 && (
              <>
                <Titre num={3}>Quelles couleurs</Titre>
                <p className="text-[12.5px] text-ink-mute -mt-1 mb-2">
                  Coche seulement les colorants de cette tournée : les autres ne seront pas mis dans l'ordre de fabrication.
                  La quantité proposée est celle de la recette, tu peux la corriger.
                </p>
                <div className={'flex items-center gap-3 border rounded-xl px-3.5 py-2.5 mb-1.5 ' +
                  (blanche ? 'bg-[#EAF3DE] border-[#cfe0b8]' : 'bg-white border-line')}>
                  <input type="checkbox" checked={blanche} className="w-6 h-6 accent-[#993556] flex-shrink-0"
                    onChange={e => { setBlanche(e.target.checked); if (e.target.checked) setCouleurs({}) }} />
                  <span className="flex-1 text-[15px] font-bold">Rien — pâte blanche</span>
                </div>
                {colorants.map(r => {
                  const on = couleurs[r.id] > 0
                  const val = couleurs[r.id] ?? ''
                  const trop = on && r.stock !== null && r.stock < couleurs[r.id] - 0.001
                  return (
                    <div key={r.id} className={'flex items-center gap-3 border rounded-xl px-3.5 py-2.5 mb-1.5 ' +
                      (on ? 'bg-[#FFF7E0] border-[#e6d3a3]' : 'bg-white border-line')}>
                      <input type="checkbox" checked={on} className="w-6 h-6 accent-[#993556] flex-shrink-0"
                        onChange={e => {
                          if (e.target.checked) setBlanche(false)
                          setCouleurs(c => {
                            const suite = { ...c }
                            if (e.target.checked) suite[r.id] = Math.round(r.qty * n)
                            else delete suite[r.id]
                            return suite
                          })
                        }} />
                      <span className="flex-1 text-[15px]">{propre(r.produit)}</span>
                      {on && (
                        <>
                          <input type="number" min="0" inputMode="numeric" value={val}
                            onChange={e => setCouleurs(c => ({ ...c, [r.id]: Math.max(0, Number(e.target.value) || 0) }))}
                            className={'w-[86px] text-right text-[16px] font-bold border rounded-lg px-2 py-1.5 ' +
                              (trop ? 'border-danger text-danger' : 'border-line')} />
                          <span className="text-[13px] text-ink-mute">g</span>
                        </>
                      )}
                      {!on && <span className="text-[12px] text-ink-mute">{nb(r.qty * n)} g dans la recette</span>}
                    </div>
                  )
                })}
              </>
            )}

            <button onClick={faire} disabled={envoi || manque.length > 0 || !choixFait}
              className={'w-full rounded-2xl py-4 text-[17px] font-extrabold mt-4 ' +
                (envoi || manque.length || !choixFait ? 'bg-cream-warm text-ink-mute' : 'bg-bordeaux text-cream')}>
              {envoi ? 'Création de l\'ordre…'
                : manque.length ? 'Ingrédients insuffisants'
                  : !choixFait ? 'Choisis la couleur' : `C'est fait — ${nb(n * tournee)} g`}
            </button>
            <p className="text-[12.5px] text-ink-soft bg-cream-warm rounded-xl px-3.5 py-3 mt-3">
              L'ordre de fabrication est créé dans Odoo et rejoint la page <b>À valider</b>.
              Le stock ne montera qu'à ce moment-là.
            </p>

            {faits.length > 0 && (
              <>
                <Titre num={4}>Fait aujourd'hui</Titre>
                {faits.map(f => (
                  <div key={f.name} className="flex items-center gap-3 flex-wrap bg-[#EAF3DE] border border-[#cfe0b8] rounded-xl px-3.5 py-3 mb-1.5">
                    <span className="flex-1 text-[15px] font-bold">
                      {nb(f.qty)} g
                      <span className="block text-[11.5px] font-medium text-ink-soft font-mono">{f.heure} · {f.name}</span>
                    </span>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FFF7E0] text-[#854F0B] whitespace-nowrap">
                      en attente de validation
                    </span>
                    {f.remise && <span className="basis-full text-[12px] text-ink-soft">avant : {motRemise(f.remise)}</span>}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
