-- Rapprochement TPE : liens manuels des cartes CMI non trouvées.
--   kind = 'link'  → reliée à la main à un paiement Odoo (odoo_ref)
--   kind = 'regul' → marquée « à régulariser » (note libre)
-- cmi_key = identifiant stable de la carte CMI (date|heure|montant|STAN). Partagé entre admins.

CREATE TABLE IF NOT EXISTS caisse_rappro_links (
  cmi_key   TEXT PRIMARY KEY,
  kind      TEXT NOT NULL,            -- 'link' | 'regul'
  amount    NUMERIC(10,2),
  txn_date  DATE,
  odoo_ref  TEXT,                     -- réf du paiement Odoo si kind='link'
  note      TEXT,                     -- note libre si kind='regul'
  linked_by UUID,
  linked_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE caisse_rappro_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "all caisse_rappro_links" ON caisse_rappro_links;
CREATE POLICY "all caisse_rappro_links" ON caisse_rappro_links FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
