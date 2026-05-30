-- ============================================================
-- Photo du client sur les conversations (récupérée auto depuis WATI quand dispo)
-- À exécuter AVANT le déploiement du code qui lit cette colonne.
-- ============================================================

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS client_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS client_photo_fetched_at TIMESTAMPTZ;
