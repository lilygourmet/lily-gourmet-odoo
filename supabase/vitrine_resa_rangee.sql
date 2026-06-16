-- Suivi des réservations vitrine déjà « rangées » (mises de côté) dans la checklist.
-- Les réservations viennent d'Odoo ; on mémorise juste celles cochées « fait » du jour.
CREATE TABLE IF NOT EXISTS vitrine_resa_rangee (
  id           BIGSERIAL PRIMARY KEY,
  day          DATE NOT NULL,
  order_id     BIGINT NOT NULL,       -- sale.order Odoo
  order_name   TEXT,
  client_name  TEXT,
  marked_by    UUID,
  marked_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (day, order_id)
);

CREATE INDEX IF NOT EXISTS idx_vitrine_resa_rangee_day ON vitrine_resa_rangee(day);

ALTER TABLE vitrine_resa_rangee ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all vitrine_resa_rangee" ON vitrine_resa_rangee FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
