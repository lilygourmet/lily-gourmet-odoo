-- ============================================================
-- Pointeuse empreinte (ZKTeco SenseFace 2A, mode PUSH/ADMS).
-- L'appareil pousse ses pointages vers /iclock/* → api/pointage-api.js.
-- On les stocke ici (journal durable), puis on les écrit dans Odoo
-- hr.attendance (l'import existant les récupère ensuite, comme les autres).
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

-- Machines : donner un nom lisible à chaque pointeuse (par n° de série).
CREATE TABLE IF NOT EXISTS pointeuse_devices (
  sn          TEXT PRIMARY KEY,          -- n° de série de la pointeuse
  nom         TEXT,                      -- nom lisible : « Boutique », « Annexe »…
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Correspondance PAR MACHINE : (machine + numéro « User ID ») → employé Odoo.
-- Le même numéro 1 peut désigner 2 personnes différentes sur 2 machines → la
-- clé est (sn, pin), pas pin seul. Rempli dans l'app (écran « Pointeuse »).
CREATE TABLE IF NOT EXISTS pointeuse_users (
  sn               TEXT NOT NULL,        -- machine (n° de série)
  pin              TEXT NOT NULL,        -- User ID sur cette machine (1, 2, 3…)
  employe_odoo_id  BIGINT NOT NULL,      -- id hr.employee dans Odoo
  employe_nom      TEXT,                 -- nom (affichage seulement)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sn, pin)
);

-- Migration douce : si une ancienne version existait (clé sur pin seul, sans sn),
-- on ajoute sn et on repasse la clé primaire sur (sn, pin). Idempotent.
ALTER TABLE pointeuse_users ADD COLUMN IF NOT EXISTS sn TEXT;
DO $$
DECLARE pkname TEXT;
BEGIN
  SELECT conname INTO pkname FROM pg_constraint
   WHERE conrelid = 'pointeuse_users'::regclass AND contype = 'p' AND array_length(conkey, 1) = 1;
  IF pkname IS NOT NULL THEN
    DELETE FROM pointeuse_users WHERE sn IS NULL;   -- lignes de test de l'ancien format
    EXECUTE 'ALTER TABLE pointeuse_users DROP CONSTRAINT ' || quote_ident(pkname);
    ALTER TABLE pointeuse_users ADD PRIMARY KEY (sn, pin);
  END IF;
END $$;

-- Journal des pointages reçus de la pointeuse (durable : rien n'est perdu même
-- si Odoo est momentanément indisponible). Écrit par le serveur (clé service).
CREATE TABLE IF NOT EXISTS pointeuse_punches (
  id                  BIGSERIAL PRIMARY KEY,
  sn                  TEXT,                    -- n° de série de la pointeuse
  pin                 TEXT NOT NULL,           -- User ID reçu
  punch_local         TEXT NOT NULL,           -- heure LOCALE brute (Maroc) "YYYY-MM-DD HH:MM:SS"
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | done | unmapped | error
  odoo_attendance_id  BIGINT,                  -- id du hr.attendance créé/fermé
  odoo_action         TEXT,                    -- 'in' (créé) | 'out' (fermé) | 'skip'
  employe_odoo_id     BIGINT,                  -- employé résolu au moment de l'envoi
  err                 TEXT,                    -- message d'erreur si status='error'
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,
  UNIQUE (sn, pin, punch_local)                -- anti-doublon si la pointeuse ré-émet
);

CREATE INDEX IF NOT EXISTS idx_pointeuse_punches_status  ON pointeuse_punches (status);
CREATE INDEX IF NOT EXISTS idx_pointeuse_punches_created ON pointeuse_punches (created_at DESC);

ALTER TABLE pointeuse_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pointeuse_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pointeuse_punches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all pointeuse_devices" ON pointeuse_devices FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all pointeuse_users"   ON pointeuse_users   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "all pointeuse_punches" ON pointeuse_punches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
