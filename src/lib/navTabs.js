// ============================================================
// Liste des onglets de la barre + leur règle de permission.
// Sert à proposer, dans "Mes onglets", uniquement les onglets
// auxquels l'utilisateur (soi-même ou un autre) a droit.
// NB : miroir des règles d'affichage de AppHeader.jsx.
// ============================================================
import {
  isAdmin, isLivreur, canRecaps, canSeeCalendar, canSeeFreezer, canCheckCd, canSeeMessages,
  canSeeEtiquettes, canSeeEtiquettesBoites, canSeeCakeVision, canSeeChecklist, canStockPatissier, canStockCafe,
  canStockAudit, canStockGS, canSeeVitrineSale, canSeeCaisse, canSeeConversations, canSeeDevis, canViewPayments,
  canSeePhotoshop, canSeeAiTools, canSeeStockPoly, canSeeSimuGateaux,
  canEditCakeVision, canSeeModifications, canSeeLivraisons, isLivreurDefaut,
  canSeeTransferts, canSeeTransfertsProduits, canSeeFactureOcp,
  canStockProdVitrine, canStockProdAnnexe, canSeeInventaire,
} from './auth'

const TAB_DEFS = [
  { view: 'calendar',          emoji: '📅', label: 'Calendrier',        can: u => !isLivreur(u) && canSeeCalendar(u) },
  { view: 'recap',             emoji: '📊', label: 'Récap',             can: u => canRecaps(u) || isLivreur(u) },
  { view: 'tasks',             emoji: '✅', label: 'Tâches',            can: () => true },
  { view: 'checklist',         emoji: '📋', label: 'Checklist',         can: u => !isLivreur(u) && canSeeChecklist(u) },
  { view: 'cake-vision-link',  emoji: '📸', label: 'Galerie CD',        can: u => !isLivreur(u) && canSeeCakeVision(u) },
  { view: 'cake-vision-edit',  emoji: '🎂', label: 'Cake Vision',       can: u => !isLivreur(u) && canEditCakeVision(u) },
  { view: 'prod',              emoji: '🥐', label: 'Prod',              can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_prod) },
  { view: 'fabrication',       emoji: '🏭', label: 'Fabrication CD',     can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_fabrication_cd) },
  { view: 'fabrication-glacage', emoji: '🍥', label: 'Fabrication Glaçage', can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_fabrication_glacage) },
  { view: 'fabrication-pate-sucre', emoji: '🎂', label: 'Fabrication Pâte à sucre', can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_fabrication_pate_sucre) },
  { view: 'fabrication-annexe', emoji: '🥧', label: 'Fabrication Annexe', can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_fabrication_annexe) },
  { view: 'fabrication-prod', emoji: '🥣', label: 'Fabrication Prod', can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_fabrication_prod) },
  { view: 'valider-annexe',      emoji: '🏭', label: 'À valider Annexe',   can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_valider_annexe) },
  { view: 'fabrication-valider', emoji: '✅', label: 'À valider',           can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_valider_of) },
  { view: 'sales',             emoji: '🥪', label: 'Salés',             can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_sales) },
  { view: 'stock-gs',          emoji: '🥪', label: 'Stock GS-',         can: u => !isLivreur(u) && canStockGS(u) },
  // Ces deux-là n'existaient que dans le menu du haut : invisibles dans la barre
  // latérale, et introuvables sur téléphone depuis que ce menu a été retiré.
  { view: 'stock-prod-vitrine', emoji: '🛍️', label: 'Stock Prod Vitrine', can: u => !isLivreur(u) && canStockProdVitrine(u) },
  { view: 'stock-prod-annexe',  emoji: '🏭', label: 'Stock Prod Annexe',  can: u => !isLivreur(u) && canStockProdAnnexe(u) },
  { view: 'inventaire',        emoji: '📦', label: 'Inventaire annexe',  can: u => !isLivreur(u) && canSeeInventaire(u) },
  { view: 'inventaire-zero',   emoji: '🔍', label: 'Inventaire — à zéro', can: u => !isLivreur(u) && canSeeInventaire(u) },
  { view: 'patissier',         emoji: '🧁', label: 'Accessoires',       can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_patissier) },
  { view: 'vitrine',           emoji: '🥐', label: 'Vitrine',           can: u => !isLivreur(u) && canStockPatissier(u) },
  { view: 'vitrine-previsions', emoji: '📈', label: 'Prévisions vitrine', can: u => !isLivreur(u) && canStockPatissier(u) },
  { view: 'vitrine-sale',      emoji: '🥟', label: 'Vitrine Salé',      can: u => !isLivreur(u) && canSeeVitrineSale(u) },
  { view: 'reception-vitrine', emoji: '📦', label: 'Réception Vitrine', can: u => !isLivreur(u) && canStockCafe(u) },
  { view: 'fin-journee',       emoji: '🌙', label: 'Fin de journée',    can: u => !isLivreur(u) && canStockCafe(u) },
  { view: 'stock',             emoji: '📊', label: 'Stock',             can: u => !isLivreur(u) && canStockAudit(u) },
  { view: 'etiquettes',        emoji: '🏷', label: 'Étiquettes Café',   can: u => !isLivreur(u) && canSeeEtiquettes(u) },
  { view: 'etiquettes-prix',   emoji: '🏷', label: 'Étiquettes produits', can: u => !isLivreur(u) && canSeeEtiquettes(u) },
  { view: 'etiquettes-boites', emoji: '🏷', label: 'Étiquettes boîtes',  can: u => !isLivreur(u) && canSeeEtiquettesBoites(u) },
  { view: 'messages',          emoji: '💬', label: 'Messages',          can: u => !isLivreur(u) && canSeeMessages(u) },
  { view: 'conversations',     emoji: '📱', label: 'Conversations',     can: u => !isLivreur(u) && canSeeConversations(u) },
  { view: 'devis',             emoji: '📄', label: 'Commandes',         can: u => !isLivreur(u) && canSeeDevis(u) },
  { view: 'ocp-link',          emoji: '🍽️', label: 'Lien OCP',          can: u => isAdmin(u) },
  { view: 'facture-ocp',       emoji: '🧾', label: 'Facture OCP',       can: u => !isLivreur(u) && canSeeFactureOcp(u) },
  { view: 'devis-internet',    emoji: '🌐', label: 'Devis internet',    can: u => !isLivreur(u) && canSeeDevis(u) },
  { view: 'modifications',     emoji: '✏️', label: 'Modifications',     can: u => !isLivreur(u) && canSeeModifications(u) },
  { view: 'livraisons',        emoji: '🚚', label: 'Livraisons',        can: u => canSeeLivraisons(u) },
  { view: 'paiements',         emoji: '💰', label: 'Paiements',         can: u => !isLivreur(u) && canViewPayments(u) },
  { view: 'reglements-livraisons', emoji: '💵', label: 'Règlements livr.', can: u => !isLivreur(u) && canStockCafe(u) },
  { view: 'freezer',           emoji: '❄️', label: 'CD Négatif',        can: u => !isLivreur(u) && canSeeFreezer(u) },
  { view: 'check-cd',          emoji: '✅', label: 'Check CD-',         can: u => !isLivreur(u) && canCheckCd(u) },
  { view: 'caisse',            emoji: '💰', label: 'Caisse',            can: u => !isLivreur(u) && canSeeCaisse(u) && (isAdmin(u) || !u?.perm_admin_users) },
  { view: 'caisse-livreur',    emoji: '💰', label: 'Caisse livreur',    can: u => isLivreurDefaut(u) },
  { view: 'hr',                emoji: '🏢', label: 'RH',                can: u => (isAdmin(u) || !!u?.perm_hr) && (isAdmin(u) || !u?.perm_admin_users) },
  { view: 'economat',          emoji: '🧾', label: 'Économat',          can: u => !isLivreur(u) && (isAdmin(u) || !!u?.economat_profil || !!u?.perm_econome) },
  { view: 'supports',          emoji: '🥂', label: 'Supports',          can: u => !isLivreur(u) && (isAdmin(u) || !!u?.perm_supports) },
  { view: 'photoshop',         emoji: '🎨', label: 'Studio photos',     can: u => !isLivreur(u) && canSeePhotoshop(u) },
  { view: 'stock-poly',        emoji: '🧊', label: 'Stock poly',        can: u => !isLivreur(u) && canSeeStockPoly(u) },
  { view: 'simu-gateaux',      emoji: '🍰', label: 'Simulation gâteaux', can: u => !isLivreur(u) && canSeeSimuGateaux(u) },
  { view: 'transferts-mp',     emoji: '🔄', label: 'Transferts MP',      can: u => !isLivreur(u) && canSeeTransferts(u) },
  { view: 'transferts-sm',     emoji: '📦', label: 'Transferts Produits', can: u => !isLivreur(u) && canSeeTransfertsProduits(u) },
  { view: 'decoupe-poly',      emoji: '✂️', label: 'Découpe poly',      can: u => canSeeStockPoly(u) },
  { view: 'ai-gemini',         emoji: '✨', label: 'Gemini',            can: u => !isLivreur(u) && canSeeAiTools(u) },
  { view: 'ai-chatgpt',        emoji: '🤖', label: 'ChatGPT',           can: u => !isLivreur(u) && canSeeAiTools(u) },
]

// Onglets autorisés pour cet utilisateur : [{ view, emoji, label }]
export function navTabsForUser(user) {
  return TAB_DEFS.filter(t => t.can(user)).map(({ view, emoji, label }) => ({ view, emoji, label }))
}
