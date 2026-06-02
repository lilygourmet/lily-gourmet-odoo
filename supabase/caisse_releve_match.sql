-- ============================================================
-- LILY GOURMET — Caisse : rapprochement enveloppes Banque ↔ relevé BMCI
-- Statut de rapprochement (couleur de l'étiquette). Relançable sans risque.
-- ============================================================

-- 'trouve' (vert) | 'a_confirmer' (orange) | NULL (gris, pas rapprochée)
ALTER TABLE caisse_enveloppes ADD COLUMN IF NOT EXISTS releve_status TEXT;

-- Lignes possibles du relevé (JSON) pour les « à confirmer » : permet de choisir la bonne.
ALTER TABLE caisse_enveloppes ADD COLUMN IF NOT EXISTS releve_candidates TEXT;
