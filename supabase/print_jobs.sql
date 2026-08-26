-- ============================================================
-- File d'impression des tickets (Checklist, Récap ventes…).
--
-- Avant : le navigateur appelait directement le PC de la boutique
-- (http://192.168.x.x:9999). Ça ne marchait QUE depuis ce PC ou depuis
-- Chrome avec une autorisation manuelle — Safari, l'iPad et l'iPhone
-- refusent d'appeler du « http » depuis un site « https », sans réglage
-- possible. Et l'adresse du PC change quand la box la redistribue.
--
-- Maintenant : l'app dépose le ticket ICI, le PC vient le chercher tout
-- seul (via /api/print-queue) et imprime. Plus aucun appel direct du
-- navigateur vers le PC : ça marche depuis n'importe quel appareil, même
-- hors du WiFi de la boutique.
--
-- À exécuter dans Supabase (SQL editor). Relançable sans risque.
-- ============================================================

-- Un ticket à imprimer. `text` contient déjà les codes de l'imprimante (ESC/POS).
CREATE TABLE IF NOT EXISTS print_jobs (
  id          BIGSERIAL PRIMARY KEY,
  text        TEXT NOT NULL,
  cut         BOOLEAN NOT NULL DEFAULT TRUE,   -- couper le papier après le ticket
  status      TEXT NOT NULL DEFAULT 'pending', -- pending → printing → done | error
  error       TEXT,
  created_by  TEXT,                            -- qui a demandé (pour comprendre après coup)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  taken_at    TIMESTAMPTZ,                     -- quand le PC l'a pris
  printed_at  TIMESTAMPTZ
);

-- Le PC ne cherche que les tickets en attente, les plus vieux d'abord.
CREATE INDEX IF NOT EXISTS idx_print_jobs_pending ON print_jobs (status, id);

-- Signe de vie du PC d'impression : il se manifeste à chaque passage (~1 s).
-- Sert à afficher « PC d'impression allumé » sans rien lui demander.
CREATE TABLE IF NOT EXISTS print_helper_status (
  id             INT PRIMARY KEY DEFAULT 1,
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  printer_ip     TEXT,
  printer_found  BOOLEAN,
  CONSTRAINT print_helper_status_une_seule_ligne CHECK (id = 1)
);

INSERT INTO print_helper_status (id, last_seen) VALUES (1, NOW())
ON CONFLICT (id) DO NOTHING;

-- L'app (connectée) dépose et suit ses tickets ; le PC, lui, passe par
-- /api/print-queue avec son jeton, donc il n'a pas besoin d'accès direct.
ALTER TABLE print_jobs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "all print_jobs" ON print_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE print_helper_status ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "read print_helper_status" ON print_helper_status FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
