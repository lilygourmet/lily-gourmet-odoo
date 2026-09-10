// src/components/RappelTransferts.jsx
//
// « Quelque chose t'attend au frigo. » Le WhatsApp ne part qu'à la réception,
// donc l'atelier destinataire ne savait pas qu'on l'attendait : délai médian
// 0,6 h, mais 12 transferts ont dormi plus de deux jours, et un pendant 41.
//
// C'était une bande jaune tout en haut — sur une tablette posée au labo,
// personne ne la voyait passer. C'est maintenant un rappel ROUGE au milieu de
// l'écran, et tout s'y traite : recevoir (en corrigeant la quantité si besoin)
// ou refuser. Plus besoin d'aller dans l'onglet Transferts. (Layla, 2026-09-10.)
//
// Il ne bloque rien : on voit l'écran derrière, et « réduire 30 min » le renvoie
// en bande fine en haut — puis il revient au milieu, et on peut le réduire
// encore, en boucle, jusqu'à ce que la caisse soit reçue ou refusée.
//
// ⚠️ Jamais pour les administrateurs : ce n'est pas eux qui vont chercher les
// caisses au frigo. Ils gardent l'onglet Transferts, avec la liste complète.
import { useEffect, useState } from 'react'
import { loadEnAttentePour, confirmTransfert, SENS } from '../lib/transfertsStock'
import { confirmDialog } from '../lib/confirmDialog'
import { toast } from '../lib/toast'

const fmt = n => (Number(n) || 0).toString().replace('.', ',')
const RELECTURE_MS = 120000   // 2 min : assez pour suivre, assez peu pour ne rien coûter
const DEFILE_MS = 6000
// « Réduire » met le rappel de côté une demi-heure, puis il revient au milieu —
// et on peut le réduire encore, en boucle. Le temps qu'une caisse arrive du
// labo, sans qu'on puisse l'enterrer pour la journée. (Layla, 2026-09-10.)
const REDUIT_MS = 30 * 60 * 1000
const CLE_REDUIT = 'lg:rappel-reduit'
// Dans la mémoire de l'onglet : survit au changement d'écran (l'en-tête est
// reconstruit à chaque fois), pas à la fermeture de l'app.
const finReduit = () => {
  try { return Number(sessionStorage.getItem(CLE_REDUIT) || 0) } catch { return 0 }
}

export default function RappelTransferts({ user, onNavigate }) {
  const [liste, setListe] = useState([])
  const [i, setI] = useState(0)
  const [reduit, setReduit] = useState(() => finReduit() > Date.now())
  const [recu, setRecu] = useState(null)     // la quantité tapée, si on l'a corrigée
  const [busy, setBusy] = useState(false)
  const admin = user?.role === 'admin'

  useEffect(() => {
    if (admin) return undefined
    let vivant = true
    const lire = () => loadEnAttentePour(user)
      .then(l => { if (vivant) setListe(l) })
      .catch(() => { })
    lire()
    const t = setInterval(lire, RELECTURE_MS)
    return () => { vivant = false; clearInterval(t) }
  }, [user, admin])

  // La demi-heure écoulée, le rappel revient tout seul au milieu, sans qu'on
  // ait à changer d'écran.
  useEffect(() => {
    if (!reduit) return undefined
    const t = setTimeout(() => setReduit(false), Math.max(1000, finReduit() - Date.now()))
    return () => clearTimeout(t)
  }, [reduit])

  // Le défilement ne tourne que s'il y a plusieurs lignes, et jamais pendant
  // qu'on corrige une quantité — la ligne changerait sous les doigts.
  useEffect(() => {
    if (liste.length < 2 || recu !== null || busy) return undefined
    const t = setInterval(() => setI(x => (x + 1) % liste.length), DEFILE_MS)
    return () => clearInterval(t)
  }, [liste.length, recu, busy])

  if (admin || !liste.length) return null
  // `i` peut dépasser après une réception : on retombe sur la première ligne
  // sans toucher à l'état pendant le rendu.
  const t = liste[i % liste.length]
  const vue = t.famille === 'sm' ? 'transferts-sm' : 'transferts-mp'

  const traiter = async (refuse) => {
    if (refuse) {
      const ok = await confirmDialog(
        `Refuser ${fmt(t.qty_envoye)} ${t.unite || ''} de ${t.matiere} ?\n\n`
        + "Rien n'entrera en stock, et l'expéditeur en est prévenu tout de suite.",
        { confirmLabel: 'Refuser', danger: true })
      if (!ok) return
    }
    setBusy(true)
    try {
      const qty = refuse ? 0 : Number(String(recu ?? t.qty_envoye).replace(',', '.'))
      const ref = await confirmTransfert(t, qty, user, { refuse })
      toast.success(refuse
        ? 'Refusé — rien dans Odoo, l\'expéditeur est prévenu.'
        : (ref ? `Reçu — transfert Odoo ${ref} créé en brouillon.` : 'Réception confirmée.'))
    } catch (e) {
      toast.error('Enregistré, mais Odoo a refusé : ' + (e.message || e))
    }
    // Dans tous les cas on relit : la ligne traitée doit quitter le rappel.
    setRecu(null)
    setI(0)
    await loadEnAttentePour(user).then(setListe).catch(() => { })
    setBusy(false)
  }

  const reduire = () => {
    try { sessionStorage.setItem(CLE_REDUIT, String(Date.now() + REDUIT_MS)) } catch { /* privé */ }
    setReduit(true)
  }
  const rouvrir = () => {
    try { sessionStorage.removeItem(CLE_REDUIT) } catch { /* privé */ }
    setReduit(false)
  }

  // Réduit : la bande fine d'avant, en haut. Toujours là, mais hors du chemin.
  if (reduit) {
    return (
      <button onClick={rouvrir}
        className="block w-full text-left bg-danger text-cream px-4 py-2 hover:brightness-110"
        title="Revoir le rappel">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <span className="shrink-0 w-6 h-6 rounded-full bg-cream/25 grid place-items-center
                           text-[12px] font-bold tabular-nums">{liste.length}</span>
          <span className="flex-1 min-w-0 text-[12.5px] truncate">
            <b>{fmt(t.qty_envoye)} {t.unite || ''}</b> de {t.matiere} vous attend
          </span>
          <span className="shrink-0 text-[11.5px] font-semibold underline underline-offset-2">
            réceptionner
          </span>
        </div>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-[420px] rounded-2xl bg-danger text-cream
                      shadow-2xl px-5 pt-5 pb-4 text-center">
        <div className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-cream/85">
          {liste.length > 1 && (
            <span className="inline-grid place-items-center min-w-[22px] h-[22px] px-1.5 mr-1.5
                             rounded-full bg-cream/25 text-[12px] align-middle">{liste.length}</span>
          )}
          à réceptionner
        </div>

        <div className="font-serif text-[27px] leading-tight mt-2">
          {fmt(t.qty_envoye)} {t.unite || ''} de {t.matiere}
        </div>
        <div className="text-[13px] text-cream/90 mt-0.5">
          {SENS[t.sens]?.de} → {SENS[t.sens]?.vers}
        </div>
        {t.envoye_par && (
          <div className="text-[12px] text-cream/75">envoyé par {t.envoye_par}</div>
        )}

        {/* La quantité reçue n'est pas toujours celle envoyée : on la corrige
            ici plutôt que d'aller dans l'autre écran. */}
        <label className="flex items-center justify-center gap-2 mt-3.5 text-[12.5px] text-cream/85">
          reçu
          <input inputMode="decimal" aria-label="Quantité reçue"
            value={recu ?? fmt(t.qty_envoye)}
            onChange={e => setRecu(e.target.value.replace(/[^\d.,]/g, ''))}
            className="w-[92px] h-10 rounded-xl bg-cream text-ink text-center
                       font-serif text-[18px] outline-none" />
          {t.unite || ''}
        </label>

        <button disabled={busy} onClick={() => traiter(false)}
          className="w-full mt-3 rounded-xl bg-cream text-danger py-3.5 text-[15px] font-extrabold
                     disabled:opacity-60">
          {busy ? 'en cours…' : 'Réceptionner'}
        </button>

        <div className="flex gap-2 mt-2">
          <button disabled={busy} onClick={() => traiter(true)}
            className="flex-1 rounded-xl border border-cream/50 py-2.5 text-[13px] font-bold
                       disabled:opacity-60">
            refuser
          </button>
          <button onClick={reduire}
            className="flex-1 rounded-xl border border-cream/50 py-2.5 text-[13px] font-bold">
            réduire 30 min
          </button>
        </div>

        {liste.length > 1 && (
          <button onClick={() => onNavigate && onNavigate(vue)}
            className="mt-2.5 text-[12px] text-cream/80 underline underline-offset-2">
            voir les {liste.length} transferts
          </button>
        )}
      </div>
    </div>
  )
}
