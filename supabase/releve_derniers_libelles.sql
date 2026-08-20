-- ============================================================
-- LILY GOURMET — Les 4 derniers libellés vides des relevés
-- Libellés relus dans les PDF d'origine (+ type et date d'opération corrigés).
-- Le 29/07, le relevé contient DEUX virements de 200 dh : ils avaient la même clé
-- (libellé vide) donc un seul avait été gardé → le second est recréé.
-- À exécuter dans Supabase SQL Editor. Relançable sans risque.
-- ============================================================

BEGIN;

UPDATE caisse_releve_lignes SET key = '2026-03-10|993000|VERSEMENT ESPECE N 1500870940', ligne_date = '2026-03-10', label = 'VERSEMENT ESPECE N 1500870940', type = 'versement'
  WHERE key = '2026-03-11|993000|' AND used_by IS NULL;
UPDATE caisse_releve_lignes SET key = '2026-03-05|33000|REMISE CHEQUE A ENC 46160271', ligne_date = '2026-03-05', label = 'REMISE CHEQUE A ENC 46160271', type = 'cheque_depot'
  WHERE key = '2026-03-05|33000|' AND used_by IS NULL;
UPDATE caisse_releve_lignes SET key = '2026-03-17|100900|REMISE CHEQUE A ENC 46264556', ligne_date = '2026-03-17', label = 'REMISE CHEQUE A ENC 46264556', type = 'cheque_depot'
  WHERE key = '2026-03-17|100900|' AND used_by IS NULL;
UPDATE caisse_releve_lignes SET key = '2026-07-29|20000|VIR INST RECU 2378161 682183838646 007202607296821', ligne_date = '2026-07-29', label = 'VIR INST RECU 2378161 682183838646 00720260729682183838646 BADRY FATIN', type = 'virement_recu'
  WHERE key = '2026-07-29|20000|' AND used_by IS NULL;

-- virement perdu par la collision de clé
INSERT INTO caisse_releve_lignes (key, ligne_date, amount, label, type, releve_url, banque)
  VALUES ('2026-07-29|20000|VIR INST RECU EL 2376336 260729341169 230202607292', '2026-07-29', 200.0, 'VIR INST RECU EL 2376336 260729341169 23020260729260729341169 MOUMMY C', 'virement_recu', 'releves/1786103452588.pdf', 'BMCI (relevé)')
  ON CONFLICT (key) DO NOTHING;

COMMIT;
