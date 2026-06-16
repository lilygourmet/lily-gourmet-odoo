-- ============================================================
-- Adresse / localisation de livraison (pour le livreur), par n° de commande.
-- Champ dédié, séparé de la note générale de la commande.
-- Accepte : une adresse écrite, un lien Maps/WhatsApp, ou des coordonnées GPS.
-- À EXÉCUTER AVANT le déploiement du code.
-- ============================================================
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS localisation TEXT;
