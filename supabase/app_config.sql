-- ============================================================
-- LILY GOURMET — Réglages d'application (clé/valeur)
-- Utilisé pour le VERROU à code des onglets Caisse / RH.
-- Le code est stocké HACHÉ (jamais en clair) et n'est lu/écrit que
-- par le serveur (clé service) → RLS activée SANS policy = aucun accès
-- direct pour les utilisateurs (tout passe par l'endpoint /api).
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_config (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
-- Pas de policy volontairement : seul le rôle service (endpoints serveur) y accède.
