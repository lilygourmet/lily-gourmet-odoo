import { useState } from 'react'
import { toast } from '../lib/toast'
import { updateClient } from '../lib/commande'

// Modale « Modifier le client » (nom + téléphone) → écrit dans la fiche Odoo res.partner.
// Fournir soit `partnerId` (depuis une commande), soit `phone` (depuis une conversation) pour
// retrouver la fiche. `onNoPartner` : appelé si aucune fiche Odoo n'existe (ex. conversation
// d'un client qui n'a jamais commandé → on met juste à jour le nom du fil).
export default function ClientEditModal({ partnerId, phone, name: initialName, onClose, onSaved, onNoPartner }) {
  const [name, setName] = useState(initialName || '')
  const [tel, setTel] = useState(phone || '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) { toast.error('Le nom est obligatoire.'); return }
    setBusy(true)
    try {
      const r = await updateClient({ partnerId, phone, name: name.trim(), newPhone: tel.trim() })
      if (r?.ok) {
        toast.success('Client mis à jour.')
        onSaved?.({ name: name.trim(), phone: r.phone || tel.trim() })
        onClose()
      } else if (r?.reason === 'no_partner') {
        if (onNoPartner) { onNoPartner({ name: name.trim(), phone: tel.trim() }); onClose() }
        else toast.error('Aucune fiche client trouvée pour ce numéro.')
      } else {
        toast.error('Modification impossible.')
      }
    } catch (e) { toast.error('Erreur : ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-cream rounded-2xl w-full max-w-sm shadow-2xl border border-line p-5" onClick={e => e.stopPropagation()}>
        <h3 className="font-fraunces italic text-[19px] text-ink mb-1">Modifier le client</h3>
        <p className="text-[12px] text-ink-mute mb-3">Corrige la fiche client — visible sur les devis, commandes et livraisons.</p>
        <label className="block text-[11px] font-semibold text-ink-soft mb-1">Nom</label>
        <input value={name} onChange={e => setName(e.target.value)} autoFocus className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white mb-3" />
        <label className="block text-[11px] font-semibold text-ink-soft mb-1">Téléphone (fiche client)</label>
        <input value={tel} onChange={e => setTel(e.target.value)} placeholder="0612345678" className="w-full px-3 py-2 border border-line rounded-lg text-[13px] bg-white mb-4" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-[12px] border border-line rounded-lg text-ink-soft">Annuler</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 text-[12px] font-medium bg-bordeaux text-cream rounded-lg disabled:opacity-50">{busy ? '…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
