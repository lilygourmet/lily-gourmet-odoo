-- ============================================================
-- COMMENT LE CLIENT A PAYÉ : virement bancaire, ou carte en ligne.
--
-- Les deux ne demandent pas le même travail. Un VIREMENT, il faut le retrouver
-- sur le relevé de la banque avant de le valider ; une CB EN LIGNE est déjà
-- encaissée. Les mélanger dans une même liste obligeait à sauter de l'un à
-- l'autre — Layla, 2026-09-19 : « ils ne doivent pas les mélanger ».
--
-- La commerciale le dit au moment où elle attache la preuve, dans Conversations,
-- et elle ne peut plus transférer aux paiements sans l'avoir dit.
--
-- ⚠️ RIEN N'EST REMPLI D'AVANCE. Les 571 preuves d'avant restent à NULL —
-- « non précisé ». Elles sont toutes traitées sauf une ; inventer leur moyen de
-- paiement aurait été inventer une information qu'on n'a pas.
--
-- À exécuter dans Supabase. Relançable sans risque.
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Seules deux valeurs ont un sens — plus le vide, pour tout ce qui précède.
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_payment_method_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('virement', 'cb'));

COMMENT ON COLUMN messages.payment_method IS
  'Comment le client a payé : ''virement'' (bancaire) ou ''cb'' (carte en ligne). NULL = preuve d''avant le 19/09/2026, moyen non précisé.';

-- L'écran « Paiements à valider » filtre sur le moyen ET sur l'état.
CREATE INDEX IF NOT EXISTS messages_payment_method_idx
  ON messages (payment_method)
  WHERE is_payment_proof = true;
