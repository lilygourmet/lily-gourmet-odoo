// Liste des permissions (colonne de profiles, libellé, explication), dans l'ordre
// et avec les textes du formulaire de la fiche utilisateur (AdminUsers).
// Sert à l'onglet « Par permission » : une permission → qui l'a.
// ⚠️ Ajouter une permission = l'ajouter AUSSI ici (sinon elle n'y apparaît pas).
export const PERMS = [
  // Production & Calendrier
  { key: 'perm_calendar', group: 'Production & Calendrier', label: 'Calendrier des commandes', desc: 'Voir le calendrier et les commandes du jour.' },
  { key: 'perm_prod', group: 'Production & Calendrier', label: 'Production sucrée', desc: 'Onglet Prod (entremets, mignardises, viennoiserie).' },
  { key: 'perm_sales', group: 'Production & Calendrier', label: 'Production salée', desc: 'Onglet Salés (snacking, plateaux salés).' },
  { key: 'perm_patissier', group: 'Production & Calendrier', label: 'Mode Accessoires', desc: 'Ne voit que les accessoires gâteaux (GM).' },
  { key: 'perm_check', group: 'Production & Calendrier', label: 'Cocher les étapes', desc: 'Marquer Couvert / Fini / Rangé sur une commande.' },
  { key: 'perm_print_batch', group: 'Production & Calendrier', label: 'Imprimer les commandes (lot)', desc: 'Imprimer toutes les commandes d\'un coup.' },
  { key: 'perm_print_single', group: 'Production & Calendrier', label: 'Imprimer une commande', desc: 'Imprimer une seule commande.' },
  { key: 'perm_fabrication_cd', group: 'Production & Calendrier', label: 'Fabrication CD', desc: 'Onglet « Fabrication CD » : voir ce qu\'il y a à fabriquer et cocher « fait ».' },
  { key: 'perm_fabrication_glacage', group: 'Production & Calendrier', label: 'Fabrication Glaçage', desc: 'Onglet « Fabrication Glaçage » : lancer des tournées de glaçage cake design.' },
  { key: 'perm_fabrication_pate_sucre', group: 'Production & Calendrier', label: 'Fabrication Pâte à sucre', desc: 'Onglet « Fabrication Pâte à sucre » : lancer des tournées de pâte à sucre.' },
  { key: 'perm_fabrication_annexe', group: 'Production & Calendrier', label: 'Fabrication Annexe', desc: 'Onglet « Fabrication Annexe » : dire combien de fois une recette a été faite.' },
  { key: 'perm_fabrication_prod', group: 'Production & Calendrier', label: 'Fabrication Prod', desc: 'Onglet « Fabrication Prod » : noter ce que l\'équipe a fabriqué dans la journée.' },
  { key: 'perm_valider_of', group: 'Production & Calendrier', label: 'Valider la fabrication dans Odoo', desc: 'Peut valider les ordres de fabrication : consomme les composants et entre le produit fini en stock. Action irréversible.' },
  { key: 'perm_polys', group: 'Production & Calendrier', label: 'Taille des polys', desc: 'Choisir la taille des boîtes/polys à l\'impression.' },
  { key: 'perm_delete', group: 'Production & Calendrier', label: 'Supprimer une commande', desc: 'Action sensible.' },
  { key: 'perm_sync', group: 'Production & Calendrier', label: 'Synchroniser depuis Odoo', desc: 'Forcer la mise à jour des commandes depuis Odoo.' },
  { key: 'perm_define_gm', group: 'Production & Calendrier', label: 'Définir les détails GM', desc: 'Réglage avancé GM (à clarifier).' },
  { key: 'perm_transfert_annexe', group: 'Production & Calendrier', label: 'Transferts — atelier Prod annexe', desc: 'Travaille à l\'annexe : ENVOIE vers la boutique et RÉCEPTIONNE ce qui vient de la boutique.' },
  { key: 'perm_transfert_boutique', group: 'Production & Calendrier', label: 'Transferts — atelier Prod boutique', desc: 'Travaille à la boutique : ENVOIE vers l\'annexe et RÉCEPTIONNE ce qui vient de l\'annexe.' },
  { key: 'perm_transfert_produits', group: 'Production & Calendrier', label: 'Transferts Produits (SM)', desc: 'Accès à l\'onglet Transferts Produits (semi-finis). Demande aussi un atelier ci-dessus.' },

  // Vitrine & Stock (boutique)
  { key: 'perm_stock_patissier', group: 'Vitrine & Stock (boutique)', label: 'Vitrine — saisie pâtissier', desc: 'Saisir la vitrine sucrée du matin.' },
  { key: 'perm_vitrine_sale', group: 'Vitrine & Stock (boutique)', label: 'Vitrine salée', desc: 'Saisir la vitrine salée.' },
  { key: 'perm_stock_cafe', group: 'Vitrine & Stock (boutique)', label: 'Réception & fin de journée (café)', desc: 'Équipe café : réception vitrine + clôture du soir.' },
  { key: 'perm_stock_audit', group: 'Vitrine & Stock (boutique)', label: 'Stock — audit & historique', desc: 'Voir l\'audit de stock complet.' },
  { key: 'perm_stock_gs', group: 'Vitrine & Stock (boutique)', label: 'Stock Gâteaux secs', desc: 'Sous-vue stock des GS-.' },
  { key: 'perm_stock_prod_vitrine', group: 'Vitrine & Stock (boutique)', label: 'Stock Prod Vitrine', desc: 'Stock de production vitrine (SM-).' },
  { key: 'perm_stock_prod_annexe', group: 'Vitrine & Stock (boutique)', label: 'Stock Prod Annexe', desc: 'Stock de production annexe (SM-).' },
  { key: 'perm_stock_minmax', group: 'Vitrine & Stock (boutique)', label: 'Régler les seuils min/max', desc: 'Définir les alertes de réassort (GS- / Prod).' },
  { key: 'perm_check_cd', group: 'Production', label: 'Check CD-', desc: "Deuxième contrôle des gâteaux sortis du congélateur : sélectionner puis valider l'ordre dans Odoo." },
  { key: 'perm_stock_poly', group: 'Vitrine & Stock (boutique)', label: 'Stock poly', desc: 'Gérer le stock de poly découpé (morceaux 5/2 cm) + alerte WhatsApp.' },
  { key: 'perm_simu_gateaux', group: 'Vitrine & Stock (boutique)', label: 'Simulation gâteaux', desc: 'Voir le simulateur visuel de gâteaux par nombre de personnes et d\'étages.' },
  { key: 'perm_facture_ocp', group: 'Vitrine & Stock (boutique)', label: 'Facture OCP', desc: 'Générer la facture mensuelle OCP à partir des commandes non facturées.' },
  { key: 'perm_freezer', group: 'Vitrine & Stock (boutique)', label: 'Sortie congélateur', desc: 'Voir la liste des sorties de congélateur.' },

  // Étiquettes & visuels
  { key: 'perm_labels', group: 'Étiquettes & visuels', label: 'Étiquettes gâteaux (Zebra)', desc: 'Imprimer les étiquettes cake design sur l\'imprimante Zebra.' },
  { key: 'perm_etiquettes', group: 'Étiquettes & visuels', label: 'Étiquettes café & produits', desc: 'Onglets « Étiquettes Café » et « Étiquettes produits » (prix vitrine).' },
  { key: 'perm_etiquettes_boites', group: 'Étiquettes & visuels', label: 'Étiquettes boîtes (FR + arabe)', desc: 'Onglet « Étiquettes boîtes » : texte FR + arabe en gros, à coller sur les boîtes.' },
  { key: 'perm_cake_vision', group: 'Étiquettes & visuels', label: 'Galerie CD', desc: 'Accès à la galerie des modèles de gâteaux.' },
  { key: 'perm_cake_vision_edit', group: 'Étiquettes & visuels', label: 'Cake Vision', desc: 'Éditeur IA : modifier une photo de gâteau selon la demande client (utilise du crédit).' },
  { key: 'perm_photoshop', group: 'Étiquettes & visuels', label: '🎨 Studio photos', desc: 'Composer/éditer des photos imprimables pour gâteaux (bibliothèque, texte, formes, découpe…).' },
  { key: 'perm_ai_tools', group: 'Étiquettes & visuels', label: '🤖 Outils IA', desc: 'Affiche les liens directs vers Gemini et ChatGPT dans le menu.' },

  // Clients & Ventes
  { key: 'perm_conversations', group: 'Clients & Ventes', label: 'Conversations WhatsApp', desc: 'Répondre aux clients sur WhatsApp.' },
  { key: 'perm_messages', group: 'Clients & Ventes', label: 'Messages (étiquettes messages)', desc: 'Onglet d\'impression des petits mots/messages.' },
  { key: 'perm_devis', group: 'Clients & Ventes', label: 'Devis (relance clients)', desc: 'Voir les devis et relancer les clients.' },
  { key: 'perm_commande', group: 'Clients & Ventes', label: 'Nouvelle commande', desc: 'Créer un devis/commande dans l\'app.' },
  { key: 'perm_notif_modif', group: 'Clients & Ventes', label: '🔧 Notif modifications (WhatsApp)', desc: 'Reçoit un WhatsApp à chaque modification de commande créée.' },
  { key: 'perm_notif_ocp', group: 'Clients & Ventes', label: '📩 Notif devis OCP (WhatsApp)', desc: 'Reçoit un WhatsApp à chaque nouveau devis OCP envoyé.' },
  { key: 'perm_modification', group: 'Clients & Ventes', label: 'Modifications de commande', desc: 'Traiter les demandes de modif/annulation.' },
  { key: 'perm_mark_payment_proof', group: 'Clients & Ventes', label: 'Marquer une preuve de paiement', desc: 'Signaler qu\'un client a envoyé un justificatif.' },
  { key: 'perm_view_payments', group: 'Clients & Ventes', label: 'Voir les paiements à valider', desc: 'Consulter la file des paiements.' },
  { key: 'perm_validate_payments', group: 'Clients & Ventes', label: 'Valider les paiements', desc: 'Confirmer un paiement reçu. Action sensible.' },

  // Livraisons
  { key: 'perm_livraisons_dispatch', group: 'Livraisons', label: 'Dispatch livraisons', desc: 'Voit TOUTES les livraisons et peut les assigner aux livreurs.' },
  { key: 'perm_livreur_defaut', group: 'Livraisons', label: 'Livreur par défaut', desc: 'Reçoit ses livraisons + celles non assignées.' },
  { key: 'perm_livreur_assigne', group: 'Livraisons', label: 'Livreur assigné', desc: 'Ne voit que les livraisons qu\'on lui donne.' },
  { key: 'livreur_defaut', group: 'Livraisons', label: 'Livreur par défaut (ancien réglage)', desc: 'Doublon historique — préférer « Livreur par défaut » ci-dessus.' },

  // Récap & Reporting
  { key: 'perm_recaps', group: 'Récap & Reporting', label: 'Voir les récaps de ventes', desc: 'Tableaux de ventes par jour/produit + bouton Factures.' },

  // Administration (sensible)
  { key: 'perm_caisse', group: 'Administration (sensible)', label: 'Caisse — vue limitée', desc: 'Accès restreint (ex. Meriem).' },
  { key: 'perm_caisse_admin', group: 'Administration (sensible)', label: 'Caisse — accès complet', desc: 'Module Caisse entier.' },
  { key: 'perm_hr', group: 'Administration (sensible)', label: 'RH', desc: 'Employés (sans salaire), pointage, attestations limitées.' },
  { key: 'perm_admin_users', group: 'Administration (sensible)', label: 'Gérer les utilisateurs & permissions', desc: 'Crée/modifie les comptes (sans accès Caisse/RH). Très sensible.' },

  // Achats & Économat
  { key: 'perm_econome', group: 'Achats & Économat', label: '📥 Économe (reçoit les demandes d\'articles)', desc: 'Reçoit les demandes d\'articles (économat).' },
  { key: 'perm_besoins_achat', group: 'Achats & Économat', label: '🛒 Besoins d\'achat (commande cake design)', desc: 'Coche les besoins d\'achat sur une fiche commande CD-.' },
  { key: 'perm_achat', group: 'Achats & Économat', label: '🚚 Responsable d\'achat', desc: 'Reçoit les tâches d\'achat urgentes des commandes.' },
]

export const PERM_KEYS = PERMS.map(p => p.key)

export const PERM_GROUPES = PERMS.reduce((acc, p) => {
  const g = acc.find(x => x.title === p.group)
  if (g) g.perms.push(p); else acc.push({ title: p.group, perms: [p] })
  return acc
}, [])
