// ============================================================
// L'INTERRUPTEUR ET LES PASTILLES DES ÉCRANS MINI / MAXI.
//
// « Rends le mini/maxi CD et annexe user friendly — compliqué, le truc de
// suivi, pause, etc. » (Layla, 2026-09-20).
//
// Le mot « suivi » ne disait pas ce qu'il faisait, et il se confondait avec
// trois autres états voisins : « pas suivi » (jamais réglé), « en pause » (les
// chiffres restent, l'app se tait) et « retirer » (on oublie tout). Quatre
// boutons gris identiques pour quatre sens différents.
//
// Un interrupteur, lui, se comprend sans le lire : allumé, l'app réclame
// l'article quand il passe sous son mini. Et chaque pastille prend sa couleur —
// une par métier — au lieu du même gris pour tout le monde.
//
// ⚠️ La phrase à trous (« en dessous de 600 g, en refaire jusqu'à 2 400 g »)
// lui a été proposée et REFUSÉE le même jour : « les trois cases deviennent une
// phrase non ». Les cases mini / maxi / tournée restent telles quelles.
// ============================================================

/** Allumé = l'app le réclame toute seule. Éteint = elle se tait. */
export function Interrupteur({ on, onClick, titre, children }) {
  return (
    <button
      type="button" onClick={onClick} role="switch" aria-checked={!!on} title={titre}
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5
                  text-[12.5px] font-bold transition
        ${on ? 'bg-success-bg text-success border-success/40'
    : 'bg-cream text-ink-mute border-cream-deep'}`}>
      <span className={`relative w-[30px] h-[17px] rounded-full flex-none transition-colors
        ${on ? 'bg-success' : 'bg-ink-mute/40'}`}>
        <span className={`absolute top-[2px] w-[13px] h-[13px] rounded-full bg-cream-warm transition-all
          ${on ? 'left-[15px]' : 'left-[2px]'}`} />
      </span>
      {children}
    </button>
  )
}

/**
 * Une pastille de réglage : sa couleur dit de quoi elle parle.
 * `ton` : 'or' (les ingrédients figés) ou 'bordeaux' (ce qui revient à finir).
 */
export function Pastille({ on, ton, onClick, titre, children }) {
  const allume = ton === 'or'
    ? 'bg-gold/10 text-gold border-gold/40'
    : 'bg-bordeaux/10 text-bordeaux border-bordeaux/40'
  return (
    <button
      type="button" onClick={onClick} aria-pressed={!!on} title={titre}
      className={`inline-flex items-center gap-1.5 rounded-full border-[1.5px] px-3 py-1.5
                  text-[12.5px] font-bold transition
        ${on ? allume : 'bg-cream text-ink-mute border-cream-deep'}`}>
      {children}
    </button>
  )
}
