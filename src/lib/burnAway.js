// Option « Burn away » : photo comestible qui se consume + message à imprimer.
// Le repère est écrit comme un avertissement ⚠️ dans la description de l'article Odoo,
// donc il arrive AUTOMATIQUEMENT à la fois dans product_note (Production) et dans
// order_items.warnings (fiche commande). Ces fonctions servent juste à le RECONNAÎTRE
// pour l'afficher de façon distincte (🔥) là où chaque équipe regarde déjà.

// Texte injecté dans l'avertissement quand la case est cochée.
export function buildBurnAwayWarn(message) {
  const msg = String(message || '').replace(/\s+/g, ' ').trim()
  return msg ? `🔥 Burn away : ${msg}` : '🔥 Burn away'
}

// Vrai si l'un des textes passés mentionne un burn away.
export function isBurnAway(...texts) {
  return texts.some(t => /burn\s*-?\s*away/i.test(String(t || '')))
}
