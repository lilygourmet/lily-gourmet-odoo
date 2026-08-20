-- ============================================================
-- LILY GOURMET — Libellés des 3 lignes de relevé DÉJÀ LIÉES (mars 2026)
-- Purement cosmétique : ces 3 lignes sont rattachées à une enveloppe, elles
-- n'apparaissent donc pas dans « À lier » mais s'affichent « — » dans « Déjà liés ».
-- On ne touche NI à la clé NI à la date (pour ne rien casser côté enveloppe) :
-- seulement le libellé et le type, relus dans le PDF d'origine.
-- ============================================================

BEGIN;

UPDATE caisse_releve_lignes SET label = 'VERSEMENT ESPECE N 1500870940', type = 'versement'
  WHERE key = '2026-03-11|993000|';
UPDATE caisse_releve_lignes SET label = 'REMISE CHEQUE A ENC 46160271', type = 'cheque_depot'
  WHERE key = '2026-03-05|33000|';
UPDATE caisse_releve_lignes SET label = 'REMISE CHEQUE A ENC 46264556', type = 'cheque_depot'
  WHERE key = '2026-03-17|100900|';

COMMIT;
