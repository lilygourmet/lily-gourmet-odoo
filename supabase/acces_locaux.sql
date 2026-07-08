-- ============================================================
-- LILY GOURMET — Accès locaux : qui a accès à quel local + code
-- 1 ligne par employé, les codes par local en JSONB :
--   codes = { "annex": {"has": true, "code": "1234"}, "boutique": {...}, ... }
-- Les lignes suivent la table employes (ON DELETE CASCADE) ; l'affichage
-- ne montre que les employés actifs → un parti disparaît, un nouveau apparaît.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS acces_locaux (
  employe_id BIGINT PRIMARY KEY REFERENCES employes(id) ON DELETE CASCADE,
  codes      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE acces_locaux ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acces_locaux_authenticated ON acces_locaux;
CREATE POLICY acces_locaux_authenticated ON acces_locaux
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
