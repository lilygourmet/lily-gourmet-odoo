-- ============================================================
-- Workflow congés dans l'app (remplace Odoo pour les saisies).
-- À exécuter AVANT le déploiement du code qui lit ces colonnes.
-- ============================================================

-- 1) Solde reporté de l'année N-1, saisi une fois en début d'année.
ALTER TABLE employes
  ADD COLUMN IF NOT EXISTS solde_conges_initial_n     NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS solde_conges_initial_year  INT;

-- 2) Workflow demande / validation / rejet / annulation sur les congés.
--    Les congés déjà importés d'Odoo sont par défaut « valide ».
ALTER TABLE conges
  ADD COLUMN IF NOT EXISTS statut TEXT NOT NULL DEFAULT 'valide'
    CHECK (statut IN ('demande', 'valide', 'rejete', 'annule')),
  ADD COLUMN IF NOT EXISTS demande_par   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS demande_le    TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS valide_par    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valide_le     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motif         TEXT,

  -- Anti-doublons sur les notifications WhatsApp.
  ADD COLUMN IF NOT EXISTS wati_notif_validation_sent_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wati_notif_rejet_sent_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wati_notif_rappel_retour_sent_at    TIMESTAMPTZ,

  -- Pour distinguer les imports Odoo des saisies app, si on veut.
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'app';

CREATE INDEX IF NOT EXISTS conges_statut_idx     ON conges(statut);
CREATE INDEX IF NOT EXISTS conges_employe_id_idx ON conges(employe_id);
CREATE INDEX IF NOT EXISTS conges_date_debut_idx ON conges(date_debut);
