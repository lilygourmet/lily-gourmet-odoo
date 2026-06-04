-- ============================================================
-- Détail des jours de récupération compris dans un congé.
-- Tableau JSON : [{ "date": "YYYY-MM-DD", "raison": "travaille"|"ferie" }, ...]
-- Les jours de récup sont placés AU DÉBUT du congé ; le reste = congé annuel.
-- Utilisé par la feuille de congé (séparation récup / annuel) — saisi par l'admin.
-- ============================================================
ALTER TABLE conges ADD COLUMN IF NOT EXISTS recup_detail jsonb;
