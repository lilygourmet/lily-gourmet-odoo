-- ============================================================
-- LILY GOURMET — ÉCONOMAT — Numéro WhatsApp de l'économe
-- À exécuter dans Supabase SQL Editor (1 fois).
-- ============================================================

-- Numéro WhatsApp (format international, ex : 212661114878) éditable dans Utilisateurs.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Numéro de départ pour l'économe Oussama (modifiable ensuite dans Utilisateurs).
UPDATE profiles SET whatsapp = '212661114878' WHERE username = 'oussama';
