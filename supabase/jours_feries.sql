-- ============================================================
-- Jours fériés du Maroc.
-- Chaque ligne = un jour férié à une date précise.
--   type 'fixe'    : même date chaque année (1er janvier, Fête du Trône…)
--   type 'lunaire' : dépend du calendrier lunaire (Aïd, Mouloud, 1er Moharram)
--                    → dates variables chaque année, à confirmer/ajuster.
-- Utilisé par : congés (jour férié non décompté) et pointage
--   (férié travaillé = récup ; férié ≠ absence).
-- À exécuter AVANT le déploiement du code qui lit cette table.
-- ============================================================

CREATE TABLE IF NOT EXISTS jours_feries (
  id          BIGSERIAL PRIMARY KEY,
  date        DATE NOT NULL UNIQUE,
  nom         TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'fixe' CHECK (type IN ('fixe', 'lunaire')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jours_feries_date_idx ON jours_feries(date);

-- RLS : on autorise anon + authenticated (cohérent avec le reste de l'app).
ALTER TABLE jours_feries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jours_feries_all ON jours_feries;
CREATE POLICY jours_feries_all
  ON jours_feries
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- Pré-remplissage 2026
-- ------------------------------------------------------------
-- Fériés FIXES (dates sûres, identiques chaque année)
INSERT INTO jours_feries (date, nom, type) VALUES
  ('2026-01-01', 'Nouvel An',                       'fixe'),
  ('2026-01-11', 'Manifeste de l''Indépendance',    'fixe'),
  ('2026-05-01', 'Fête du Travail',                 'fixe'),
  ('2026-07-30', 'Fête du Trône',                   'fixe'),
  ('2026-08-14', 'Allégeance Oued Eddahab',         'fixe'),
  ('2026-08-20', 'Révolution du Roi et du Peuple',  'fixe'),
  ('2026-08-21', 'Fête de la Jeunesse',             'fixe'),
  ('2026-11-06', 'Marche Verte',                    'fixe'),
  ('2026-11-18', 'Fête de l''Indépendance',         'fixe')
ON CONFLICT (date) DO NOTHING;

-- Fériés LUNAIRES 2026 (ESTIMÉS — à confirmer/ajuster dans l'app)
INSERT INTO jours_feries (date, nom, type) VALUES
  ('2026-03-20', 'Aïd al-Fitr (1er jour)',          'lunaire'),
  ('2026-03-21', 'Aïd al-Fitr (2e jour)',           'lunaire'),
  ('2026-05-27', 'Aïd al-Adha (1er jour)',          'lunaire'),
  ('2026-05-28', 'Aïd al-Adha (2e jour)',           'lunaire'),
  ('2026-06-16', '1er Moharram (Nouvel An hégirien)','lunaire'),
  ('2026-08-25', 'Aïd al-Mawlid (Mouloud)',         'lunaire')
ON CONFLICT (date) DO NOTHING;
