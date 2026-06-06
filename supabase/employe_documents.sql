-- ============================================================
-- LILY GOURMET - Documents par employé (CIN, contrat, diplôme…)
-- Fichiers stockés dans le bucket existant 'justificatifs'.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS employe_documents (
  id                BIGSERIAL PRIMARY KEY,
  employe_id        BIGINT NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
  type              TEXT NOT NULL DEFAULT 'Autre',
  storage_path      TEXT NOT NULL,
  original_filename TEXT,
  file_size         BIGINT,
  uploaded_by       UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employe_documents_emp ON employe_documents(employe_id);

ALTER TABLE employe_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employe_documents_all ON employe_documents;
CREATE POLICY employe_documents_all ON employe_documents
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
