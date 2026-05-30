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
export default function ClientAvatar({ conv, size = 36, variant = 'dark' }) {
  const [broken, setBroken] = useState(false)
  if (!conv) return null
  const photo = !broken && conv.client_photo_url
  const dim = { width: size, height: size, minWidth: size, minHeight: size }
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
