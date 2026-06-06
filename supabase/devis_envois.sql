-- Suivi des devis envoyés via l'app (pour marquer "déjà envoyé" + relance).
CREATE TABLE IF NOT EXISTS devis_envois (
  id           BIGSERIAL PRIMARY KEY,
  order_num    TEXT,
  client_phone TEXT,
  sent_at      TIMESTAMPTZ DEFAULT now(),
  sent_by      UUID
);
CREATE INDEX IF NOT EXISTS idx_devis_envois_order ON devis_envois(order_num);

ALTER TABLE devis_envois ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devis_envois_all ON devis_envois;
CREATE POLICY devis_envois_all ON devis_envois FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
