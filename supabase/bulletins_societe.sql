-- ============================================================
-- BULLETINS DE PAIE — retenir la SOCIÉTÉ de chaque bulletin
--
-- Le comptable envoie un PDF par société (L&N Gourmet et LG Traiteur).
-- Avant : un bulletin n'était reconnu que par son MATRICULE. Si les deux
-- sociétés utilisent des matricules qui se ressemblent, importer le 2e PDF
-- effacerait des bulletins du 1er (l'anti-doublon supprime l'ancien).
--
-- Après : la société fait partie de la clé. Chaque société a ses bulletins.
--
-- Codes utilisés : 'LN' = L&N Gourmet SARL, 'LG' = LG Traiteur SARL
-- (les mêmes que la colonne `code` de la table societes).
--
-- À LANCER DANS SUPABASE AVANT LE DÉPLOIEMENT.
-- ============================================================

ALTER TABLE bulletins_paie ADD COLUMN IF NOT EXISTS societe TEXT;

-- Tout ce qui est déjà en mémoire vient de L&N Gourmet : les bulletins de
-- LG Traiteur n'ont jamais été importés (vérifié le 07/09/2026 — 37 bulletins
-- en août pour 39 employés L&N actifs, 0 pour LG Traiteur).
UPDATE bulletins_paie SET societe = 'LN' WHERE societe IS NULL;

-- Vérification : combien de bulletins par société et par mois.
SELECT period, coalesce(societe, '⚠️ non identifiée') AS societe, count(*) AS bulletins
FROM bulletins_paie
GROUP BY period, societe
ORDER BY period DESC, societe;
