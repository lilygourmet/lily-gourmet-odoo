import { useRef } from 'react'

/**
 * Carte qu'on fait GLISSER vers la droite pour confirmer.
 *
 * Pourquoi : la case à cocher de 20 px se déclenchait à la moindre touche
 * effleurée — et l'équipe travaille au téléphone, les mains prises. Il faut
 * maintenant pousser la carte au-delà de la moitié de sa largeur : un vrai
 * geste, impossible à faire par accident en faisant défiler la liste.
 *
 * `touch-action: pan-y` laisse le défilement vertical se faire normalement.
 */
export default function GlisserPourSortir({ children, onFait, actif = true, texte = 'Sorti', classe = '' }) {
  const piste = useRef(null)
  const glisse = useRef(null)
  const fond = useRef(null)
  const depart = useRef(null)
  const ecart = useRef(0)

  const SEUIL = 0.55   // il faut dépasser 55 % de la largeur

  function debut(e) {
    if (!actif) return
    depart.current = e.clientX
    ecart.current = 0
    if (glisse.current) glisse.current.style.transition = 'none'
    piste.current?.setPointerCapture(e.pointerId)
  }

  function bouge(e) {
    if (depart.current === null || !piste.current) return
    ecart.current = Math.max(0, e.clientX - depart.current)
    const large = piste.current.offsetWidth
    if (glisse.current) glisse.current.style.transform = `translateX(${Math.min(ecart.current, large * 0.8)}px)`
    if (fond.current) fond.current.style.opacity = String(Math.min(1, ecart.current / (large * SEUIL)))
  }

  function fin() {
    if (depart.current === null || !piste.current) return
    const passe = ecart.current > piste.current.offsetWidth * SEUIL
    if (glisse.current) { glisse.current.style.transition = ''; glisse.current.style.transform = '' }
    if (fond.current) fond.current.style.opacity = '0'
    depart.current = null
    if (passe) onFait()
  }

  return (
    <div ref={piste} onPointerDown={debut} onPointerMove={bouge} onPointerUp={fin} onPointerCancel={fin}
      className={`relative overflow-hidden rounded-xl select-none ${classe}`}
      style={{ touchAction: 'pan-y' }}>
      <div ref={fond} className="absolute inset-0 flex items-center pl-4 bg-[#EAF3DE] text-[#2F6B25] font-bold text-[13px] opacity-0 pointer-events-none">
        {texte} ✓
      </div>
      <div ref={glisse} className="relative transition-transform duration-300 ease-out">
        {children}
      </div>
    </div>
  )
}
