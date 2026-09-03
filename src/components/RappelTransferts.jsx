// src/components/RappelTransferts.jsx
//
// Une bande en haut de l'app : « quelque chose t'attend ». Le WhatsApp ne part
// qu'à la réception, donc l'atelier destinataire ne savait pas qu'on l'attendait :
// délai médian 0,6 h, mais 12 transferts ont dormi plus de deux jours, et un
// pendant 41 jours.
//
// Elle ne bloque rien : on continue de travailler par-dessus. Elle ne disparaît
// que lorsque tout est réceptionné. Quand plusieurs transferts attendent, ils
// défilent VERS LE HAUT, un par un.
import { useEffect, useState } from 'react'
import { loadEnAttentePour, SENS } from '../lib/transfertsStock'

const fmt = n => (Number(n) || 0).toString().replace('.', ',')
const RELECTURE_MS = 120000   // 2 min : assez pour suivre, assez peu pour ne rien coûter
const DEFILE_MS = 4000

export default function RappelTransferts({ user, onNavigate }) {
  const [liste, setListe] = useState([])
  const [i, setI] = useState(0)

  useEffect(() => {
    let vivant = true
    const lire = () => loadEnAttentePour(user)
      .then(l => { if (vivant) setListe(l) })
      .catch(() => { })
    lire()
    const t = setInterval(lire, RELECTURE_MS)
    return () => { vivant = false; clearInterval(t) }
  }, [user])

  // Le défilement ne tourne que s'il y a plusieurs lignes.
  useEffect(() => {
    if (liste.length < 2) return undefined
    const t = setInterval(() => setI(x => (x + 1) % liste.length), DEFILE_MS)
    return () => clearInterval(t)
  }, [liste.length])

  if (!liste.length) return null
  // `i` peut dépasser après une réception : on retombe sur la première ligne
  // sans toucher à l'état pendant le rendu.
  const t = liste[i % liste.length]
  const vue = t.famille === 'sm' ? 'transferts-sm' : 'transferts-mp'

  return (
    <button
      onClick={() => onNavigate && onNavigate(vue)}
      className="block w-full text-left bg-[#FBF3DF] border-b border-[#e6d3a3] px-4 py-2 hover:bg-[#f7ecd0]"
      title="Ouvrir les transferts">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-[#b58f3c] text-white grid place-items-center text-[12px] font-bold tabular-nums">
          {liste.length}
        </span>
        {/* une seule ligne visible ; les autres montent à sa place */}
        <span className="flex-1 min-w-0 h-[18px] overflow-hidden relative">
          <span key={t.id}
            className="block text-[12.5px] text-[#854F0B] leading-[18px] truncate"
            style={{ animation: 'lg-monte 420ms ease-out' }}>
            <b>{fmt(t.qty_envoye)} {t.unite || ''}</b> de {t.matiere}
            {' '}vous attend{liste.length > 1 ? '' : ''} — {SENS[t.sens]?.de} → {SENS[t.sens]?.vers}
            {t.envoye_par ? ` · ${t.envoye_par}` : ''}
          </span>
        </span>
        <span className="shrink-0 text-[11.5px] font-semibold text-[#854F0B] underline underline-offset-2">
          réceptionner
        </span>
      </div>
    </button>
  )
}
