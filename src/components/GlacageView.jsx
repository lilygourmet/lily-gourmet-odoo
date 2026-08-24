import { useState, useEffect } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadGlacage, lancerGlacage, setFait } from '../lib/fabrication'

// ====== Fabrication Glaçage ======
// Le glaçage cake design n'a ni règle mini/maxi ni ordre dans Odoo : c'est
// l'équipe qui décide combien de tournées elle fait. « C'est fait » crée
// l'ordre de fabrication dans Odoo ; il part ensuite en validation avec les
// autres, dans Fabrication CD (permission perm_valider_of).

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const qte = q => (q < 1 ? `${nb(q * 1000)} g` : `${nb(q)} kg`)
const propre = n => String(n || '').replace(/^MP-\s*/i, '').replace(/^SM\.?\s*/i, '').trim()

function Titre({ num, children }) {
  return (
    <div className="flex items-center gap-2.5 mt-6 mb-2.5">
      <span className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-bordeaux">{num} · {children}</span>
      <span className="flex-1 h-0.5 bg-line" />
    </div>
  )
}

export default function GlacageView({ user, onLogout, onNavigate, activeView }) {
  const [data, setData] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [n, setN] = useState(1)
  const [envoi, setEnvoi] = useState(false)
  const [faits, setFaits] = useState([])

  useEffect(() => {
    let vivant = true
    loadGlacage()
      .then(d => { if (!vivant) return; if (d.erreur) setErreur(d.erreur); else setData(d) })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    return () => { vivant = false }
  }, [])

  const tournee = (data && data.tournee) || 0
  const recette = (data && data.recette) || []
  const manque = recette.filter(r => r.stock !== null && r.stock < r.qty * n - 0.0001)

  async function faire() {
    setEnvoi(true)
    try {
      const of = await lancerGlacage(n, user?.id)
      await setFait({ name: of.name, produit: data.produit, qty: of.qty, quand: new Date().toISOString() }, true, user?.id)
      setFaits(f => [{ ...of, heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }, ...f])
      setN(1)
      toast.success(`Ordre ${of.name} créé — en attente de validation`)
    } catch (e) { toast.error('Impossible de créer l\'ordre : ' + (e.message || e)) }
    setEnvoi(false)
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[600px] mx-auto px-4 py-5">
        <h1 className="font-fraunces italic text-[26px] font-medium">Fabrication Glaçage</h1>
        <p className="text-[13px] text-ink-mute mb-2">
          Glaçage cake design{tournee ? ` · 1 tournée = ${nb(tournee)} kg` : ''}
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
                <span className="text-[13px] text-ink-mute">{n > 1 ? 'tournées' : 'tournée'} · {nb(n * tournee)} kg</span>
              </div>
              <button onClick={() => setN(v => Math.min(50, v + 1))}
                className="w-[52px] h-[52px] rounded-2xl border border-line bg-cream-warm text-[26px] font-bold">+</button>
            </div>

            <Titre num={2}>Il te faut</Titre>
            {recette.map(r => {
              const besoin = r.qty * n
              const ok = r.stock === null || r.stock >= besoin - 0.0001
              return (
                <div key={r.produit} className="flex items-center gap-3 bg-white border border-line rounded-xl px-3.5 py-3 mb-1.5">
                  <b className="text-[18px] min-w-[100px]">{qte(besoin)}</b>
                  <span className="flex-1 text-[15px]">{propre(r.produit)}</span>
                  <span className={'text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ' +
                    (ok ? 'bg-[#EAF3DE] text-ok' : 'bg-[#FCEEE8] text-danger')}>
                    {r.stock === null ? 'stock inconnu' : ok ? `stock ${qte(r.stock)}` : `il manque ${qte(besoin - r.stock)}`}
                  </span>
                </div>
              )
            })}

            <button onClick={faire} disabled={envoi || manque.length > 0}
              className={'w-full rounded-2xl py-4 text-[17px] font-extrabold mt-4 ' +
                (envoi || manque.length ? 'bg-cream-warm text-ink-mute' : 'bg-bordeaux text-cream')}>
              {envoi ? 'Création de l\'ordre…' : manque.length ? 'Ingrédients insuffisants' : `C'est fait — ${nb(n * tournee)} kg`}
            </button>
            <p className="text-[12.5px] text-ink-soft bg-cream-warm rounded-xl px-3.5 py-3 mt-3">
              L'ordre de fabrication est créé dans Odoo et rejoint <b>Fabrication CD</b> pour être validé.
              Le stock de glaçage ne montera qu'à ce moment-là.
            </p>

            {faits.length > 0 && (
              <>
                <Titre num={3}>Fait aujourd'hui</Titre>
                {faits.map(f => (
                  <div key={f.name} className="flex items-center gap-3 bg-[#EAF3DE] border border-[#cfe0b8] rounded-xl px-3.5 py-3 mb-1.5">
                    <span className="flex-1 text-[15px] font-bold">
                      {nb(f.qty)} kg de glaçage
                      <span className="block text-[11.5px] font-medium text-ink-soft font-mono">{f.heure} · {f.name}</span>
                    </span>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FFF7E0] text-[#854F0B] whitespace-nowrap">
                      en attente de validation
                    </span>
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
