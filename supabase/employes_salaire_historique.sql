-- ============================================================
-- Journal des changements de salaire net.
-- employes_remuneration écrase l'ancien montant à chaque modification :
-- on note ici l'avant/après pour que la récap mensuelle du pointage
-- affiche « 8 000 → 8 500 dh (15/08) » à côté du nom.
-- Admin-only (même règle que employes_remuneration : le salaire ne doit
-- pas être lisible par les autres comptes).
-- À exécuter dans Supabase (SQL editor) AVANT le déploiement du code.
-- ============================================================

CREATE TABLE IF NOT EXISTS employes_salaire_historique (
  id              BIGSERIAL PRIMARY KEY,
  employe_id      INT NOT NULL,
  ancien_salaire  NUMERIC,
  nouveau_salaire NUMERIC,
  date_changement DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salaire_hist_date ON employes_salaire_historique (date_changement);
CREATE INDEX IF NOT EXISTS idx_salaire_hist_emp  ON employes_salaire_historique (employe_id);

ALTER TABLE employes_salaire_historique ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admin_only" ON employes_salaire_historique
    FOR ALL TO authenticated
    USING ((auth.jwt() ->> 'app_role') = 'admin')
    WITH CHECK ((auth.jwt() ->> 'app_role') = 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
