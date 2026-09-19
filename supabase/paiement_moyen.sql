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
-- ⚠️ LES 570 PREUVES D'AVANT ONT ÉTÉ PASSÉES EN « VIREMENT » le 2026-09-19,
-- sur décision de Layla : avant cette date, la boutique n'encaissait pas de
-- carte en ligne — c'étaient donc tous des virements. Le tri est en bas.
-- (Liste des lignes concernées : scripts/paiements-sans-moyen-avant.json.)
--
-- Tant qu'il reste des preuves sans moyen, l'écran leur garde une famille
-- « Non précisé » — qui disparaît d'elle-même une fois qu'il n'y en a plus.
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


-- ============================================================
-- LE RATTRAPAGE DU 2026-09-19 (déjà appliqué — gardé ici pour la mémoire).
--
-- « Non précisé (0) … ceux-là rentrent dans virements » (Layla). Avant le
-- 19/09, la boutique n'encaissait pas de carte en ligne : ces 570 preuves sont
-- donc toutes des virements. Une fois vides, la famille « Non précisé »
-- disparaît toute seule de l'écran — aucun code à changer.
--
-- Relançable : après le premier passage, il ne reste plus rien à mettre à jour.
-- ============================================================

UPDATE messages
   SET payment_method = 'virement'
 WHERE is_payment_proof = true
   AND payment_method IS NULL;
