// ============================================================
// Liste des onglets de la barre + leur règle de permission.
// Sert à proposer, dans "Mes onglets", uniquement les onglets
// auxquels l'utilisateur (soi-même ou un autre) a droit.
// NB : miroir des règles d'affichage de AppHeader.jsx.
// ============================================================
import {
  isAdmin, isLivreur, canRecaps, canSeeCalendar, canSeeFreezer, canSeeMessages,
  canSeeEtiquettes, canSeeCakeVision, canSeeChecklist, canStockPatissier, canStockCafe,
  canStockAudit, canStockGS, canSeeVitrineSale, canSeeCaisse, canSeeConversations, canSeeDevis, canViewPayments,
  canSeePhotoshop,
} from './auth'

const TAB_DEFS = [
  { view: 'calendar',          emoji: '📅', label: 'Calendrier',        can: u => !isLivreur(u) && canSeeCalendar(u) },
  { view: 'recap',             emoji: '📊', label: 'Récap',             can: u => canRecaps(u) || isLivreur(u) },
  { view: 'tasks',             emoji: '✅', label: 'Tâches',            can: () => true },
  { view: 'checklist',         emoji: '📋', label: 'Checklist',         can: u => !isLivreur(u) && canSeeChecklist(u) },
  { view: 'cake-vision-link',  emoji: '📸', label: 'Galerie CD',        can: u => !isLivreur(u) && canSeeCakeVision(u) },
  { view: 'prod',              emoji: '🥐', label: 'Prod',              can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_prod) },
  { view: 'sales',             emoji: '🥪', label: 'Salés',             can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_sales) },
  { view: 'stock-gs',          emoji: '🥪', label: 'Stock GS-',         can: u => !isLivreur(u) && canStockGS(u) },
  { view: 'patissier',         emoji: '🧁', label: 'Accessoires',       can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_patissier) },
  { view: 'vitrine',           emoji: '🥐', label: 'Vitrine',           can: u => !isLivreur(u) && canStockPatissier(u) },
  { view: 'vitrine-previsions', emoji: '📈', label: 'Prévisions vitrine', can: u => !isLivreur(u) && canStockPatissier(u) },
  { view: 'vitrine-sale',      emoji: '🥟', label: 'Vitrine Salé',      can: u => !isLivreur(u) && canSeeVitrineSale(u) },
  { view: 'reception-vitrine', emoji: '📦', label: 'Réception Vitrine', can: u => !isLivreur(u) && canStockCafe(u) },
  { view: 'fin-journee',       emoji: '🌙', label: 'Fin de journée',    can: u => !isLivreur(u) && canStockCafe(u) },
  { view: 'stock',             emoji: '📊', label: 'Stock',             can: u => !isLivreur(u) && canStockAudit(u) },
  { view: 'etiquettes',        emoji: '🏷', label: 'Étiquettes Café',   can: u => !isLivreur(u) && canSeeEtiquettes(u) },
  { view: 'etiquettes-prix',   emoji: '🏷', label: 'Étiquettes produits', can: u => !isLivreur(u) && canSeeEtiquettes(u) },
  { view: 'messages',          emoji: '💬', label: 'Messages',          can: u => !isLivreur(u) && canSeeMessages(u) },
  { view: 'conversations',     emoji: '📱', label: 'Conversations',     can: u => !isLivreur(u) && canSeeConversations(u) },
  { view: 'devis',             emoji: '📄', label: 'Commandes',         can: u => !isLivreur(u) && canSeeDevis(u) },
  { view: 'ocp-link',          emoji: '🍽️', label: 'Lien OCP',          can: u => isAdmin(u) },
  { view: 'devis-internet',    emoji: '🌐', label: 'Devis internet',    can: u => !isLivreur(u) && canSeeDevis(u) },
  { view: 'paiements',         emoji: '💰', label: 'Paiements',         can: u => !isLivreur(u) && canViewPayments(u) },
  { view: 'freezer',           emoji: '❄️', label: 'CD Négatif',        can: u => !isLivreur(u) && canSeeFreezer(u) },
  { view: 'caisse',            emoji: '💰', label: 'Caisse',            can: u => !isLivreur(u) && canSeeCaisse(u) && (isAdmin(u) || !u?.perm_admin_users) },
  { view: 'hr',                emoji: '🏢', label: 'RH',                can: u => (isAdmin(u) || !!u?.perm_hr) && (isAdmin(u) || !u?.perm_admin_users) },
  { view: 'absences',          emoji: '🌴', label: 'Congés',            can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_hr) },
  { view: 'economat',          emoji: '🧾', label: 'Économat',          can: u => !isLivreur(u) && (isAdmin(u) || !!u?.economat_profil || !!u?.perm_econome) },
  { view: 'photoshop',         emoji: '🎨', label: 'Studio photos',     can: u => !isLivreur(u) && canSeePhotoshop(u) },
]

// Onglets autorisés pour cet utilisateur : [{ view, emoji, label }]
export function navTabsForUser(user) {
  return TAB_DEFS.filter(t => t.can(user)).map(({ view, emoji, label }) => ({ view, emoji, label }))
}
