-- ============================================================
-- Transferts de matières premières : prod ANNEXE → prod BOUTIQUE.
-- L'annexe enregistre un envoi (statut « en_attente »), la boutique
-- confirme la quantité reçue (statut « recu »). Tout en kg.
-- À exécuter dans Supabase (SQL editor) AVANT de déployer. Relançable sans risque.
-- ============================================================

-- 2 permissions distinctes : envoyer (annexe) et confirmer (boutique).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_transfert_annexe   boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS perm_transfert_boutique boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS transferts_mp (
  id             BIGSERIAL PRIMARY KEY,
  matiere        TEXT NOT NULL,
  qty_envoye     NUMERIC NOT NULL,
  qty_recu       NUMERIC,                                 -- NULL tant que non confirmé
  statut         TEXT NOT NULL DEFAULT 'en_attente',      -- 'en_attente' | 'recu'
  transfer_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  envoye_par     TEXT,
  envoye_par_id  UUID REFERENCES profiles(id),
  recu_par       TEXT,
  recu_par_id    UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transferts_mp_statut ON transferts_mp (statut);
CREATE INDEX IF NOT EXISTS idx_transferts_mp_date   ON transferts_mp (transfer_date DESC);

ALTER TABLE transferts_mp ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all transferts_mp" ON transferts_mp FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
