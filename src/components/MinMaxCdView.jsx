import { useState, useEffect, useMemo } from 'react'
import AppHeader from './AppHeader'
import Skeleton from './Skeleton'
import { toast } from '../lib/toast'
import { loadMinMax, saveMinMax, loadStockMinMax } from '../lib/fabrication'
import { isAdmin } from '../lib/auth'

// ====== « Mini / maxi CD » : les seuils que l'APP tient, plus Odoo ======
// Le 2026-09-08, les 55 règles de réapprovisionnement CD* d'Odoo ont été
// effacées : elles relançaient les mêmes fabrications chaque matin. Leurs 37
// vraies valeurs sont passées dans la table `cd_minmax`, et c'est l'app qui
// lance désormais ce qui passe sous son mini (cron de 5 h + bouton
// « Actualiser » de Fabrication CD).
//
// Sans cet écran, ces valeurs n'étaient modifiables que dans Supabase. Réservé
// aux admins : changer un mini change ce que l'atelier fabriquera demain.

const nb = v => Number(v || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })
const propre = n => String(n || '').replace(/^\[[^\]]*\]\s*/, '').trim()

export default function MinMaxCdView({ user, onLogout, onNavigate, activeView }) {
  const [lignes, setLignes] = useState(null)
  const [stocks, setStocks] = useState({})
  const [erreur, setErreur] = useState(null)
  const [filtre, setFiltre] = useState('')
  const [enCours, setEnCours] = useState('')      // le produit en train d'être enregistré

  useEffect(() => {
    let vivant = true
    loadMinMax()
      .then(l => { if (vivant) setLignes(l) })
      .catch(e => { if (vivant) setErreur(e.message || String(e)) })
    // le stock vient d'Odoo, plus lentement : l'écran s'affiche sans l'attendre
    loadStockMinMax()
      .then(s => { if (vivant) setStocks(s) })
      .catch(() => { /* régler un seuil reste possible sans voir le stock */ })
    return () => { vivant = false }
  }, [])

  const visibles = useMemo(() => {
    const q = filtre.trim().toLowerCase()
    if (!q) return lignes || []
    return (lignes || []).filter(l => propre(l.produit).toLowerCase().includes(q))
  }, [lignes, filtre])

  // On tape dans les cases sans rien envoyer : l'enregistrement se fait en
  // quittant la case, pour ne pas écrire à chaque touche.
  const changer = (produit, champ, valeur) => {
    setLignes(v => (v || []).map(l => (l.produit === produit ? { ...l, [champ]: valeur } : l)))
  }

  const enregistrer = async ligne => {
    setEnCours(ligne.produit)
    try {
      await saveMinMax(ligne, user?.id)
      toast.success(`${propre(ligne.produit)} : mini ${nb(ligne.mini)} · maxi ${nb(ligne.maxi)}`)
    } catch (e) {
      toast.error('Pas enregistré : ' + (e.message || e))
    }
    setEnCours('')
  }

  if (!isAdmin(user)) {
    return (
      <div className="min-h-screen bg-cream">
        <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
        <p className="max-w-[560px] mx-auto px-4 py-16 text-center text-ink-mute text-[14px]">
          Cet écran est réservé aux administrateurs : changer un mini change ce que
          l'atelier fabriquera demain matin.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream">
      <AppHeader user={user} onLogout={onLogout} onNavigate={onNavigate} activeView={activeView} />
      <div className="max-w-[820px] mx-auto px-4 py-5">
        <h1 className="font-fraunces italic text-[26px] font-medium mb-1">Mini / maxi CD</h1>
        <p className="text-[12.5px] text-ink-mute mb-3">
          C'est l'app qui tient ces seuils, plus Odoo. Chaque matin à 5 h — et à chaque
          « Actualiser » de Fabrication CD — elle relance ce qui est passé sous son mini,
          jusqu'à son maxi. Un article à <b>0 / 0</b> ne sera jamais relancé tout seul.
        </p>

        {erreur && <div className="px-4 py-3 rounded-lg bg-[#FCEEE8] text-danger text-[13px] mb-3">{erreur}</div>}
        {!lignes && !erreur && <Skeleton rows={6} />}

        {lignes && (
          <>
            <input value={filtre} onChange={e => setFiltre(e.target.value)}
              placeholder="chercher un article…"
              className="w-full text-[13.5px] border border-line rounded-xl px-3 py-2 bg-white mb-3" />

            <div className="text-[12px] text-ink-mute mb-1.5">
              {visibles.length} article{visibles.length > 1 ? 's' : ''}
              {filtre ? ` sur ${lignes.length}` : ''}
            </div>

            {visibles.map(l => {
              const st = stocks[l.produit]
              const sousLeMini = st && Number(st.dispo) < Number(l.mini)
              return (
                <div key={l.produit}
                  className={'border rounded-xl px-3 py-2.5 mb-1.5 bg-white ' +
                    (sousLeMini ? 'border-l-4 border-l-bordeaux border-line' : 'border-line')}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="basis-full sm:basis-auto sm:flex-1 min-w-0">
                      <div className="text-[14px] font-bold">{propre(l.produit)}</div>
                      <div className="text-[11.5px] text-ink-mute">
                        {st ? <>il en reste <b>{nb(st.dispo)} {l.unite}</b>{sousLeMini ? ' — sous le mini' : ''}</>
                          : 'stock en cours de lecture…'}
                      </div>
                    </div>
                    <label className="text-[11.5px] text-ink-mute">
                      mini<br />
                      <input type="number" min="0" step="any" inputMode="decimal" value={l.mini ?? ''}
                        onChange={e => changer(l.produit, 'mini', e.target.value)}
                        onBlur={() => enregistrer(l)}
                        className="w-[82px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                    </label>
                    <label className="text-[11.5px] text-ink-mute">
                      maxi<br />
                      <input type="number" min="0" step="any" inputMode="decimal" value={l.maxi ?? ''}
                        onChange={e => changer(l.produit, 'maxi', e.target.value)}
                        onBlur={() => enregistrer(l)}
                        className="w-[82px] text-right text-[14px] font-bold border border-line rounded-lg px-2 py-1.5" />
                    </label>
                    <span className="text-[12px] text-ink-mute w-[28px]">{l.unite}</span>
                    <button onClick={() => { changer(l.produit, 'actif', !(l.actif !== false)); enregistrer({ ...l, actif: !(l.actif !== false) }) }}
                      title={l.actif !== false ? 'Ne plus relancer cet article tout seul' : 'Relancer cet article quand il passe sous son mini'}
                      className={'rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold border ' +
                        (l.actif !== false ? 'bg-[#EAF3DE] text-ok border-[#cfe0b8]' : 'bg-cream-warm text-ink-mute border-line')}>
                      {l.actif !== false ? 'suivi' : 'en pause'}
                    </button>
                    {enCours === l.produit && <span className="text-[11.5px] text-bordeaux">enregistrement…</span>}
                  </div>
                </div>
              )
            })}

            {visibles.length === 0 && (
              <p className="py-10 text-center text-ink-mute text-[14px]">Aucun article de ce nom.</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
