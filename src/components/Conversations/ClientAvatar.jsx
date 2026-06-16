import { useState } from 'react'

/**
 * Avatar du client (conversation WhatsApp) :
 *  - photo récupérée auto via WATI si disponible,
 *  - sinon initiales du nom ou du téléphone.
 *
 * Props :
 *  - conv : la conversation ({ client_photo_url, client_name, client_phone, ... })
 *  - size : taille en px (par défaut 36). Adapte aussi la police des initiales.
 *  - variant : 'dark' (en-tête bordeaux) | 'light' (liste) — change les couleurs.
 */
export default function ClientAvatar({ conv, size = 36, variant = 'dark', fidele = false }) {
  const [broken, setBroken] = useState(false)
  if (!conv) return null
  const dim = { width: size, height: size, minWidth: size, minHeight: size }
  // Client fidèle : une étoile à la place de la photo / des initiales.
  if (fidele) {
    return (
      <div
        title="Client fidèle (peut commander sans acompte)"
        style={{ ...dim, fontSize: Math.round(size * 0.5) }}
        className={`rounded-full flex items-center justify-center flex-shrink-0 ${variant === 'dark' ? 'border border-amber-200/50 bg-amber-300/25 text-amber-100' : 'border border-amber-300 bg-amber-50 text-amber-500'}`}
      >★</div>
    )
  }
  const photo = !broken && conv.client_photo_url
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        onError={() => setBroken(true)}
        style={dim}
        className={`rounded-full object-cover flex-shrink-0 ${variant === 'dark' ? 'border border-cream/40 bg-cream/15' : 'border border-line bg-cream-warm'}`}
      />
    )
  }
  const label = conv.client_name || conv.client_phone || '?'
  const initials = label.replace(/[^A-Za-zÀ-ÿ ]/g, '').trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
  const fs = Math.max(10, Math.round(size * 0.36))
  return (
    <div
      style={{ ...dim, fontSize: fs }}
      className={`rounded-full flex items-center justify-center font-medium flex-shrink-0 ${variant === 'dark' ? 'border border-cream/40 bg-cream/15 text-cream' : 'border border-line bg-cream-warm text-bordeaux'}`}
    >
      {initials}
    </div>
  )
}
